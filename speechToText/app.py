# -*- coding: utf-8 -*-
"""
语音转文字微服务：使用 faster-whisper tiny 模型极速识别。
接口：POST /transcribe，请求体为音频文件（multipart/form-data 或 raw binary）。
WebM/Opus 等格式统一经 FFmpeg 转为 PCM，避免 PyAV 报错；所有异常统一返回 JSON。
"""
import os
import subprocess
import sys
import tempfile
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS

# 延迟加载模型，避免启动时卡住
_model = None

# 统一用 FFmpeg 解码的格式（浏览器 webm/opus 等 PyAV 易报错）
FFMPEG_SUFFIXES = (".webm", ".opus", ".ogg", ".mp3", ".m4a")

def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        device = os.environ.get("WHISPER_DEVICE", "cpu")
        compute_type = "float16" if device == "cuda" else "int8"
        _model = WhisperModel("tiny", device=device, compute_type=compute_type)
    return _model

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

def transcribe_audio_bytes(audio_data, content_type_hint=""):
    """
    统一入口：先尝试 FFmpeg 转 PCM 再转写；失败则返回 (None, error_msg)。
    content_type_hint 如 "audio/webm" 用于推断后缀。
    """
    import numpy as np
    suffix = ".wav"
    if "webm" in (content_type_hint or "").lower():
        suffix = ".webm"
    elif "opus" in (content_type_hint or "").lower():
        suffix = ".opus"
    elif "mpeg" in (content_type_hint or "").lower() or "mp3" in (content_type_hint or "").lower():
        suffix = ".mp3"

    # 非 .wav 一律走 FFmpeg，避免 PyAV 对 webm/opus 等报错
    suffix_lower = suffix.lower()
    use_ffmpeg = suffix_lower not in (".wav", ".wave")
    if use_ffmpeg:
        pcm_bytes, err = ffmpeg_to_pcm(audio_data, suffix)
        if err:
            return None, err
        if not pcm_bytes:
            return None, "音频过短或无效，请至少录制约 1 秒后重试"
        audio_f32 = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        if audio_f32.size < 16000:
            return None, "音频过短，请至少录制约 1 秒后重试"
        try:
            model = get_model()
            segments, info = model.transcribe(
                audio_f32, language="zh", beam_size=1, vad_filter=True
            )
            text = "".join(s.text for s in segments).strip()
            return text, None
        except Exception as e:
            return None, str(e)

    # 仅 .wav 走文件路径（PyAV 对 wav 稳定）
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        try:
            os.write(fd, audio_data)
        finally:
            os.close(fd)
        model = get_model()
        segments, info = model.transcribe(tmp_path, language="zh", beam_size=1, vad_filter=True)
        text = "".join(s.text for s in segments).strip()
        return text, None
    except Exception as e:
        err_msg = str(e)
        if "Invalid data found" in err_msg or "Errno 1094995529" in err_msg:
            pcm_bytes, _ = ffmpeg_to_pcm(audio_data, ".wav")
            if pcm_bytes:
                import numpy as np
                audio_f32 = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
                if audio_f32.size >= 16000:
                    segments, info = get_model().transcribe(
                        audio_f32, language="zh", beam_size=1, vad_filter=True
                    )
                    return "".join(s.text for s in segments).strip(), None
        return None, err_msg
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

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

        try:
            import numpy as np
        except ImportError:
            return jsonify({"error": "numpy 未安装", "hint": "pip install numpy"}), 500

        text, err = transcribe_audio_bytes(audio_data, content_type or suffix)
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
