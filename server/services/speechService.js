/**
 * 调用 Python 语音识别微服务，将音频转为文字。
 */
const config = require("../config");

const SPEECH_URL = config.speechServiceUrl || "http://localhost:5000";

async function transcribe(audioBuffer, contentType) {
  const url = `${SPEECH_URL.replace(/\/$/, "")}/transcribe`;
  const headers = {};
  if (contentType) headers["Content-Type"] = contentType;

  const timeout = config.speechServiceTimeout || 30000;
  const res = await fetch(url, {
    method: "POST",
    headers: contentType ? { "Content-Type": contentType } : {},
    body: audioBuffer,
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
