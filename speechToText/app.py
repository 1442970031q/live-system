# -*- coding: utf-8 -*-
"""
语音转文字微服务：使用 faster-whisper tiny 模型极速识别。
接口：POST /transcribe，请求体为音频文件（multipart/form-data 或 raw binary）。
"""
import os
import tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS

# 延迟加载模型，避免启动时卡住
_model = None

def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        # tiny 模型体积小、速度最快，适合实时/近实时场景
        _model = WhisperModel("tiny", device="cpu", compute_type="int8")
    return _model

app = Flask(__name__)
CORS(app, origins="*")

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "speechToText"})

@app.route("/transcribe", methods=["POST"])
def transcribe():
    if request.method == "OPTIONS":
        return "", 204

    audio_data = None
    suffix = ".wav"

    # 1. multipart 上传字段名 audio 或 file
    if request.files:
        f = request.files.get("audio") or request.files.get("file")
        if f:
            suffix = os.path.splitext(f.filename or "")[1] or ".wav"
            audio_data = f.read()

    # 2. raw body 作为音频二进制
    if audio_data is None and request.data:
        ct = (request.content_type or "").lower()
        if "audio" in ct or "octet-stream" in ct or not request.content_type:
            audio_data = request.data
        if audio_data and "webm" in ct:
            suffix = ".webm"

    if not audio_data or len(audio_data) == 0:
        return jsonify({"error": "no audio data", "hint": "POST multipart 'audio' or raw body"}), 400

    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_data)
            tmp_path = tmp.name
        try:
            model = get_model()
            segments, info = model.transcribe(tmp_path, language="zh", beam_size=1, vad_filter=True)
            text = "".join(s.text for s in segments).strip()
            return jsonify({"text": text, "language": info.language or "zh"})
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # 默认 5001，避免 macOS 上 5000 被 AirPlay Receiver 占用
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)
