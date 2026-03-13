/**
 * 语音敏感词感知：上传音频 -> Python 转文字 -> DFA 工作线程池敏感词检测
 * 优化：并发限制、请求超时，避免 pending 堆积
 */
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { transcribe } = require("../services/speechService");
const sensitiveService = require("../services/sensitiveService");
const config = require("../config");

const MAX_CONCURRENT_VOICE = 3;
const VOICE_REQUEST_TIMEOUT_MS = 28000;
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
    // 常用敏感词作为 base，帮助 Whisper 正确识别同音字；DB 词库合并后去重
    const COMMON_SENSITIVE_WORDS = [
      "赌博", "色情", "加微信", "保健品", "违规", "私下交易", "废物", "垃圾",
      "赌博平台", "色情服务", "百分百赚钱", "刷礼物返现", "白痴",
    ];
    let prompt;
    try {
      const words = await sensitiveService.loadWords();
      const dbWords = words.map((w) => w.word);
      const allWords = [...new Set([...COMMON_SENSITIVE_WORDS, ...dbWords])];
      prompt = allWords.join(" ");
    } catch (e) {
      console.warn("[Voice] loadWords failed, using common sensitive words:", e?.message);
      prompt = COMMON_SENSITIVE_WORDS.join(" ");
    }
    const text = await transcribe(file.buffer, contentType, { prompt });
    clearTimeout(timeoutId);
    if (res.headersSent) {
      voiceConcurrent = Math.max(0, voiceConcurrent - 1);
      return;
    }
    const result = await sensitiveService.check(text);
    const { hit, highestLevel, matchedWords } = result;
    const handleStrategy = sensitiveService.getHandleStrategy(highestLevel);

    // 可选：命中一级违禁词时记录日志（无 userId/streamId 时仅检测不写库）
    let hitLogId = null;
    if (hit && matchedWords[0]) {
      hitLogId = await sensitiveService.logHit({
        userId: null,
        streamId: null,
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
      handleStrategy: hit ? handleStrategy : null,
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
