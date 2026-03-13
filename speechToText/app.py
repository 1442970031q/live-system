# -*- coding: utf-8 -*-
"""
语音转文字微服务：使用 faster-whisper 模型识别（默认 small 平衡精度与速度）。
接口：POST /transcribe，请求体为音频文件（multipart/form-data 或 raw binary）。
WebM/Opus 等格式统一经 FFmpeg 转为 PCM；支持音频预处理（降噪、归一化）与智能分段转写。
"""
import os
import subprocess
import sys
import tempfile
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS

# 环境变量控制（默认：3 秒切片 + 1 秒重叠；关预处理、small、beam=1）
ENABLE_PREPROCESS = os.environ.get("ENABLE_PREPROCESS", "0") == "1"
ENABLE_SEGMENT = os.environ.get("ENABLE_SEGMENT", "1") == "1"
SEGMENT_LENGTH_SEC = float(os.environ.get("SEGMENT_LENGTH_SEC", "3"))
SEGMENT_OVERLAP_SEC = float(os.environ.get("SEGMENT_OVERLAP_SEC", "1"))

# 延迟加载模型，避免启动时卡住
_model = None

# 统一用 FFmpeg 解码的格式（浏览器 webm/opus 等 PyAV 易报错）
FFMPEG_SUFFIXES = (".webm", ".opus", ".ogg", ".mp3", ".m4a")

# 直播场景常用敏感词：帮助 Whisper 正确识别同音字（赌→堵、博→搏 等）
# 注意：prompt 过长易被混入输出，尽量简短、仅列关键词
INITIAL_PROMPT = "赌博 色情 加微信 保健品 违规 私下交易 废物 垃圾 赌博平台 色情服务 百分百赚钱 刷礼物返现 白痴"

def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        device = os.environ.get("WHISPER_DEVICE", "cpu")
        # small 默认：速度快；medium 更准但更慢
        model_name = os.environ.get("WHISPER_MODEL", "small")
        compute_type = "float16" if device == "cuda" else "int8"
        _model = WhisperModel(model_name, device=device, compute_type=compute_type)
    return _model


def _transcribe_kwargs(initial_prompt=None):
    """统一的转写参数：束搜索、强制中文、禁用时间戳"""
    beam_size = int(os.environ.get("WHISPER_BEAM_SIZE", "1"))
    return {
        "language": "zh",
        "beam_size": max(1, min(5, beam_size)),
        "patience": float(os.environ.get("WHISPER_PATIENCE", "1.0")),
        "temperature": 0.0,
        "word_timestamps": False,
        "vad_filter": True,
        "initial_prompt": initial_prompt or INITIAL_PROMPT,
        "condition_on_previous_text": False,
        "repetition_penalty": float(os.environ.get("WHISPER_REPETITION_PENALTY", "1.2")),
        "no_speech_threshold": float(os.environ.get("WHISPER_NO_SPEECH_THRESHOLD", "0.3")),
        "no_repeat_ngram_size": int(os.environ.get("WHISPER_NO_REPEAT_NGRAM", "0")),
    }

# WebM 至少约 32KB 才可能有完整 EBML 头，过小多为不完整片段
MIN_WEBM_BYTES = 32 * 1024

def ffmpeg_to_pcm(audio_data, suffix=".webm"):
    """用 FFmpeg 将任意音频转为 16kHz 单声道 s16le。返回 (pcm_bytes, None) 或 (None, error_msg)。"""
    suffix = (suffix or ".webm").lower()
    if suffix == ".webm" and len(audio_data) < MIN_WEBM_BYTES:
        return None, "音频数据过短或格式不完整，请至少连续录制 2～3 秒后再试"
    if not suffix.startswith("."):
        suffix = "." + suffix
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        try:
            os.write(fd, audio_data)
        finally:
            os.close(fd)
        out = subprocess.run(
            [
                "ffmpeg", "-nostdin", "-y", "-err_detect", "ignore_err",
                "-fflags", "+genpts+igndts", "-analyzeduration", "5000000", "-probesize", "5000000",
                "-i", tmp_path,
                "-map", "0:a?", "-vn", "-f", "s16le", "-acodec", "pcm_s16le", "-ac", "1", "-ar", "16000",
                "-",
            ],
            capture_output=True,
            timeout=30,
            check=False,
        )
        if out.returncode != 0:
            stderr = (out.stderr or b"").decode("utf-8", errors="replace").strip()
            err_snippet = stderr[-500:] if len(stderr) > 500 else stderr
            if "EBML header" in stderr or "Error opening input" in stderr or "Invalid data found" in stderr:
                return None, "录音片段不完整或格式无效，请至少连续录制 2～3 秒后再试"
            if "does not contain any stream" in stderr or "Stream map" in stderr or "0:a" in stderr:
                return None, "未检测到音频流（当前片段可能为纯视频），请确保使用麦克风录制后再试"
            return None, f"FFmpeg 解码失败: {err_snippet or '未知错误'}"
        if not out.stdout or len(out.stdout) < 16000:
            return None, "音频过短或无效，请至少录制约 1 秒后重试"
        return out.stdout, None
    except FileNotFoundError:
        return None, "未找到 FFmpeg，请安装: brew install ffmpeg"
    except subprocess.TimeoutExpired:
        return None, "音频解码超时"
    except Exception as e:
        return None, str(e)
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


def preprocess_audio(audio_f32, sr=16000):
    """
    音频预处理：降噪 + 音量归一化。
    使用前 0.5 秒作为噪声样本估计（若有静音/环境音），提升降噪效果。
    """
    import numpy as np
    if not ENABLE_PREPROCESS or audio_f32 is None or audio_f32.size == 0:
        return audio_f32
    try:
        import noisereduce as nr
        n_noise = min(int(sr * 0.5), len(audio_f32) // 3)
        if n_noise > 800:
            y_noise = audio_f32[:n_noise]
            reduced = nr.reduce_noise(y=audio_f32, sr=sr, y_noise=y_noise, prop_decrease=0.8, stationary=False)
        else:
            reduced = nr.reduce_noise(y=audio_f32, sr=sr, prop_decrease=0.5, stationary=True)
        rms = np.sqrt(np.mean(reduced ** 2))
        if rms > 1e-6:
            target_rms = 0.05
            reduced = reduced * (target_rms / min(rms, 1.0))
        return reduced.astype(np.float32)
    except ImportError:
        return audio_f32
    except Exception:
        return audio_f32


def segment_audio(audio_f32, sr=16000):
    """
    智能分段：3 秒固定切片 + 1 秒重叠，保留上下文连贯性。
    返回 [(start, end, chunk_f32), ...]
    """
    import numpy as np
    if not ENABLE_SEGMENT or audio_f32 is None:
        return [(0, len(audio_f32), audio_f32)] if audio_f32 is not None else []
    total_samples = len(audio_f32)
    if total_samples < sr * 3:
        return [(0, total_samples, audio_f32)]
    chunk_len = int(SEGMENT_LENGTH_SEC * sr)
    overlap_len = int(SEGMENT_OVERLAP_SEC * sr)
    step = max(chunk_len - overlap_len, sr)
    chunks = []
    pos = 0
    while pos < total_samples:
        end = min(pos + chunk_len, total_samples)
        chunk = audio_f32[pos:end]
        if len(chunk) >= sr * 2:
            chunks.append((pos, end, chunk))
        pos += step
        if end >= total_samples:
            break
    return chunks if chunks else [(0, total_samples, audio_f32)]


def _pcm_to_f32_and_preprocess(pcm_bytes, sr=16000):
    """PCM 转 float32，并做预处理（降噪、归一化）。"""
    import numpy as np
    audio_f32 = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    audio_f32 = preprocess_audio(audio_f32, sr)
    return audio_f32


# Whisper 有时会把 prompt 片段混入输出，需后处理剔除
PROMPT_LEAKAGE_PATTERNS = [
    "上一句结尾：", "一句结尾：", "上句结尾：",
    "请准确转写每一个字", "请准确转写", "注意区分同音字",
    "这是一段中文直播音频", "主播和观众正在聊天", "可能包含违规内容",
]


def _strip_prompt_leakage(text):
    """移除转写结果中混入的 prompt 片段。"""
    if not text:
        return text
    result = text
    for p in PROMPT_LEAKAGE_PATTERNS:
        result = result.replace(p, "")
    return result.strip()


def _transcribe_chunks(chunks, base_prompt=None):
    """对多个音频片段分别转写并合并结果。上一段结尾作为下一段 initial_prompt 提升连贯性。
    base_prompt: 可选，由 Node 传入的敏感词等，覆盖默认 INITIAL_PROMPT"""
    model = get_model()
    texts = []
    prev_tail = ""
    ctx_len = int(os.environ.get("WHISPER_CONTEXT_CHARS", "60"))
    default_prompt = (base_prompt or "").strip() or INITIAL_PROMPT
    for _start, _end, chunk in chunks:
        prompt = default_prompt
        if prev_tail:
            # 仅用上一段结尾作上下文，避免「上一句结尾：」等被模型复述
            prompt = f"{default_prompt} {prev_tail}"
        segs, _ = model.transcribe(chunk, **_transcribe_kwargs(initial_prompt=prompt))
        t = "".join(s.text for s in segs).strip()
        t = _strip_prompt_leakage(t)
        if t:
            texts.append(t)
            prev_tail = t[-ctx_len:] if len(t) > ctx_len else t
    return "".join(texts).strip()


def transcribe_audio_bytes(audio_data, content_type_hint="", prompt_hint=None):
    """
    统一入口：FFmpeg 转 PCM(16kHz 单声道) -> 预处理 -> 智能分段 -> 转写。
    content_type_hint 如 "audio/webm" 用于推断后缀。
    prompt_hint: 可选，由 Node 传入的敏感词等，作为 Whisper initial_prompt。
    """
    suffix = ".wav"
    if "webm" in (content_type_hint or "").lower():
        suffix = ".webm"
    elif "opus" in (content_type_hint or "").lower():
        suffix = ".opus"
    elif "mpeg" in (content_type_hint or "").lower() or "mp3" in (content_type_hint or "").lower():
        suffix = ".mp3"

    pcm_bytes, err = ffmpeg_to_pcm(audio_data, suffix)
    if err:
        return None, err
    if not pcm_bytes:
        return None, "音频过短或无效，请至少录制约 1 秒后重试"

    audio_f32 = _pcm_to_f32_and_preprocess(pcm_bytes)
    if audio_f32.size < 16000:
        return None, "音频过短，请至少录制约 1 秒后重试"

    try:
        chunks = segment_audio(audio_f32)
        text = _transcribe_chunks(chunks, base_prompt=prompt_hint)
        return text, None
    except Exception as e:
        return None, str(e)

app = Flask(__name__)
CORS(app, origins="*")

@app.errorhandler(500)
def handle_500(e):
    return jsonify({"error": "服务器内部错误", "hint": "请查看服务端日志"}), 500

@app.errorhandler(Exception)
def handle_exception(e):
    tb = traceback.format_exc()
    print(tb, file=sys.stderr)
    return jsonify({"error": str(e), "hint": "请查看服务端日志"}), 500

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "speechToText"})

@app.route("/transcribe", methods=["POST"])
def transcribe():
    if request.method == "OPTIONS":
        return "", 204

    try:
        audio_data = None
        content_type = (request.content_type or "").lower()
        suffix = ".wav"

        if request.files:
            f = request.files.get("audio") or request.files.get("file")
            if f:
                audio_data = f.read()
                fn = (f.filename or "").lower()
                if fn.endswith(".webm"):
                    suffix = ".webm"
                elif fn.endswith(".opus") or fn.endswith(".ogg"):
                    suffix = ".opus"
                elif fn.endswith(".mp3"):
                    suffix = ".mp3"
                elif "." in fn:
                    suffix = "." + fn.rsplit(".", 1)[-1]
        if not audio_data and request.data:
            audio_data = request.get_data(cache=True)
            if "audio" in content_type or "octet-stream" in content_type or not request.content_type:
                if "webm" in content_type:
                    suffix = ".webm"
                elif "opus" in content_type:
                    suffix = ".opus"
                elif "mpeg" in content_type or "mp3" in content_type:
                    suffix = ".mp3"

        if not audio_data or len(audio_data) == 0:
            return jsonify({"error": "no audio data", "hint": "POST multipart 'audio' or raw body"}), 400
        ct = (request.content_type or "").lower()
        if len(audio_data) < MIN_WEBM_BYTES and ("webm" in ct or "audio" in ct or not ct):
            return jsonify({"error": "音频数据过短或格式不完整，请至少连续录制 2～3 秒后再试"}), 400

        # multipart 时可传 prompt 字段（Node 从 DB 取的敏感词等）
        prompt_hint = None
        if request.form:
            prompt_hint = (request.form.get("prompt") or "").strip() or None

        try:
            import numpy as np
        except ImportError:
            return jsonify({"error": "numpy 未安装", "hint": "pip install numpy"}), 500

        text, err = transcribe_audio_bytes(audio_data, content_type or suffix, prompt_hint=prompt_hint)
        if err:
            is_short = "过短" in err or "无效" in err
            return jsonify({"error": err}), 400 if is_short else 500
        return jsonify({"text": text or "", "language": "zh"})
    except Exception as e:
        tb = traceback.format_exc()
        print(tb, file=sys.stderr)
        return jsonify({"error": str(e), "hint": "请查看服务端日志"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)
