/**
 * 语音敏感词感知：上传音频 -> Python 转文字 -> DFA 工作线程池敏感词检测
 * 优化：并发限制、请求超时，避免 pending 堆积
 */
const express = require("express");
const router = express.Router();
const multer = require("multer");
const db = require("../db");
const { transcribe } = require("../services/speechService");
const sensitiveService = require("../services/sensitiveService");
const config = require("../config");

const MAX_CONCURRENT_VOICE = 3;
const VOICE_REQUEST_TIMEOUT_MS = 45000;
let voiceConcurrent = 0;

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
  if (voiceConcurrent >= MAX_CONCURRENT_VOICE) {
    return res.status(503).json({
      error: "语音检测服务繁忙，请稍后再试",
      hint: "当前请求过多，请减少发送频率",
    });
  }
  voiceConcurrent += 1;

  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      voiceConcurrent = Math.max(0, voiceConcurrent - 1);
      res.status(504).json({
        error: "语音检测超时",
        hint: "请稍后重试",
      });
    }
  }, VOICE_REQUEST_TIMEOUT_MS);

  try {
    const file =
      req.files?.audio?.[0] || req.files?.file?.[0] || req.file;
    if (!file || !file.buffer || file.buffer.length === 0) {
      clearTimeout(timeoutId);
      voiceConcurrent = Math.max(0, voiceConcurrent - 1);
      return res.status(400).json({
        error: "缺少音频",
        hint: "使用 multipart 字段 'audio' 或 'file' 上传音频文件",
      });
    }

    if (!config.speechServiceUrl) {
      clearTimeout(timeoutId);
      voiceConcurrent = Math.max(0, voiceConcurrent - 1);
      return res.status(503).json({
        error: "语音服务未配置",
        hint: "请启动 speechToText 微服务并设置 SPEECH_SERVICE_URL",
      });
    }

    const contentType = file.mimetype || "application/octet-stream";
    // 不再注入内置敏感词 prompt，只走语音识别原始文本 + 数据库词库检测
    const text = await transcribe(file.buffer, contentType);
    clearTimeout(timeoutId);
    if (res.headersSent) {
      voiceConcurrent = Math.max(0, voiceConcurrent - 1);
      return;
    }
    const result = await sensitiveService.check(text);
    // 严格要求词条带有数据库主键（wordId），确保只命中数据库中的敏感词
    const matchedWords = (result.matchedWords || []).filter(
      (m) => m?.word && m.wordId != null
    );
    const hit = matchedWords.length > 0;
    const highestLevel = hit
      ? matchedWords.reduce((max, m) => Math.max(max, Number(m.level) || 0), 0)
      : 0;
    const handleStrategy = hit ? sensitiveService.getHandleStrategy(highestLevel) : null;

    // 获取主播 userId：从 streamId 查 live_streams（主播语音检测场景）
    let streamerUserId = null;
    const streamId = req.body?.streamId ? parseInt(req.body.streamId, 10) : null;
    if (streamId && !isNaN(streamId)) {
      const [rows] = await db.query("SELECT user_id FROM live_streams WHERE id = ? AND is_live = 1", [streamId]);
      if (rows.length > 0) streamerUserId = rows[0].user_id;
    }

    // 命中一级违禁词：将主播加入黑名单
    if (hit && highestLevel === 1 && streamerUserId) {
      const reason = `一级违禁词：${matchedWords[0]?.word || "违规"}（voice）`;
      await sensitiveService.addToBlacklist(streamerUserId, reason).catch((err) =>
        console.error("[Voice] addToBlacklist error:", err)
      );
    }

    // 可选：命中一级违禁词时记录日志（无 userId/streamId 时仅检测不写库）
    let hitLogId = null;
    if (hit && matchedWords[0]) {
      hitLogId = await sensitiveService.logHit({
        userId: streamerUserId,
        streamId: streamId || null,
        sensitiveWordId: matchedWords[0].wordId || 0,
        originalContent: text,
        matchedWord: matchedWords[0].word,
        hitLevel: highestLevel,
        hitScene: "voice",
        handleResult: handleStrategy,
      });
    }

    voiceConcurrent = Math.max(0, voiceConcurrent - 1);
    if (res.headersSent) return;
    res.json({
      text,
      containsSensitive: hit,
      matchedWords: matchedWords.map((m) => m.word),
      highestLevel: hit ? highestLevel : 0,
      handleStrategy,
      hitLogId: hitLogId || undefined,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    voiceConcurrent = Math.max(0, voiceConcurrent - 1);
    console.error("Voice check error:", err);
    const status = err.message?.includes("Speech service") ? 502 : 500;
    if (!res.headersSent) {
      res.status(status).json({
        error: err.message || "语音检测失败",
      });
    }
  }
});

/**
 * POST /api/voice/check-text
 * 仅对文本做敏感词检测（不经过语音识别），使用 DFA 工作线程池
 * Body: { text: "..." }
 */
router.post("/check-text", async (req, res) => {
  try {
    const text = req.body?.text != null ? String(req.body.text) : "";
    const result = await sensitiveService.check(text);
    const { hit, highestLevel, matchedWords } = result;
    res.json({
      text,
      containsSensitive: hit,
      matchedWords: matchedWords.map((m) => m.word),
      highestLevel: hit ? highestLevel : 0,
      handleStrategy: hit ? sensitiveService.getHandleStrategy(highestLevel) : null,
    });
  } catch (err) {
    console.error("Check text error:", err);
    res.status(500).json({ error: err.message || "检测失败" });
  }
});

module.exports = router;
