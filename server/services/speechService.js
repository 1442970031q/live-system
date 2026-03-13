/**
 * 调用 Python 语音识别微服务，将音频转为文字。
 * @param {Buffer} audioBuffer 音频二进制
 * @param {string} contentType 如 audio/webm
 * @param {{ prompt?: string }} options 可选，prompt 为敏感词等，作为 Whisper initial_prompt
 */
const config = require("../config");

const SPEECH_URL = config.speechServiceUrl || "http://localhost:5000";

function getExtFromContentType(ct) {
  if (!ct) return ".webm";
  const c = ct.toLowerCase();
  if (c.includes("webm")) return ".webm";
  if (c.includes("opus") || c.includes("ogg")) return ".opus";
  if (c.includes("mp3") || c.includes("mpeg")) return ".mp3";
  if (c.includes("wav")) return ".wav";
  return ".webm";
}

async function transcribe(audioBuffer, contentType, options = {}) {
  const url = `${SPEECH_URL.replace(/\/$/, "")}/transcribe`;
  const timeout = config.speechServiceTimeout || 30000;
  const { prompt } = options;

  let body;
  let headers = {};

  if (prompt && typeof prompt === "string" && prompt.trim()) {
    const form = new FormData();
    const ext = getExtFromContentType(contentType);
    const blob = new Blob([audioBuffer], { type: contentType || "audio/webm" });
    form.append("audio", blob, `audio${ext}`);
    form.append("prompt", prompt.trim());
    body = form;
    // FormData 不手动设置 Content-Type，fetch 会自动加 boundary
  } else {
    body = audioBuffer;
    if (contentType) headers["Content-Type"] = contentType;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(timeout),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Speech service error: ${res.status} ${err}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text || "";
}

module.exports = {
  transcribe,
  isAvailable: () => Boolean(config.speechServiceUrl),
};
