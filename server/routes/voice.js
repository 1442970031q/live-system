/**
 * 语音敏感词感知：上传音频 -> Python 转文字 -> 敏感词检测
 */
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { transcribe } = require("../services/speechService");
const { checkSensitive } = require("../sensitiveWords");
const config = require("../config");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    const ok =
      !file.mimetype ||
      /audio\//.test(file.mimetype) ||
      /video\//.test(file.mimetype) ||
      file.mimetype === "application/octet-stream";
    if (ok) cb(null, true);
    else cb(new Error("只允许上传音频/视频文件"), false);
  },
});

/**
 * POST /api/voice/check
 * 请求：multipart/form-data，字段名 audio 或 file，值为音频文件（如 wav/webm/mp3）
 * 响应：{ text, containsSensitive, matchedWords }
 */
const uploadAudio = upload.fields([
  { name: "audio", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

router.post("/check", uploadAudio, async (req, res) => {
  try {
    const file =
      req.files?.audio?.[0] || req.files?.file?.[0] || req.file;
    if (!file || !file.buffer || file.buffer.length === 0) {
      return res.status(400).json({
        error: "缺少音频",
        hint: "使用 multipart 字段 'audio' 或 'file' 上传音频文件",
      });
    }

    if (!config.speechServiceUrl) {
      return res.status(503).json({
        error: "语音服务未配置",
        hint: "请启动 speechToText 微服务并设置 SPEECH_SERVICE_URL",
      });
    }

    const contentType = file.mimetype || "application/octet-stream";
    const text = await transcribe(file.buffer, contentType);
    const { containsSensitive, matchedWords } = checkSensitive(text);

    res.json({
      text,
      containsSensitive,
      matchedWords,
    });
  } catch (err) {
    console.error("Voice check error:", err);
    const status = err.message?.includes("Speech service") ? 502 : 500;
    res.status(status).json({
      error: err.message || "语音检测失败",
    });
  }
});

/**
 * POST /api/voice/check-text
 * 仅对文本做敏感词检测（不经过语音识别）
 * Body: { text: "..." }
 */
router.post("/check-text", (req, res) => {
  try {
    const text = req.body?.text != null ? String(req.body.text) : "";
    const { containsSensitive, matchedWords } = checkSensitive(text);
    res.json({ text, containsSensitive, matchedWords });
  } catch (err) {
    console.error("Check text error:", err);
    res.status(500).json({ error: err.message || "检测失败" });
  }
});

module.exports = router;
