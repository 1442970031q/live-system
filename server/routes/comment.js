// 弹幕路由
const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { broadcastToStream } = require("../webSocketServer");
const { checkSensitive } = require("../sensitiveWords");

// 发送弹幕
router.post("/:streamId", authenticateToken, async (req, res) => {
  try {
    const streamId = parseInt(req.params.streamId, 10);
    const { content } = req.body;
    const userId = req.user.id;
    if (isNaN(streamId) || streamId <= 0 || !content || typeof content !== "string") {
      return res.status(400).json({ message: "Invalid streamId or content" });
    }
    // 违禁词检测：命中则拒绝并返回命中的词，便于前端弹窗提示
    const { containsSensitive, matchedWords } = checkSensitive(content);
    if (containsSensitive && matchedWords.length) {
      return res.status(400).json({
        message: "内容含有违禁词，请修改后再发送",
        matchedWords,
      });
    }
    // 检查直播是否存在且正在直播
    const [streams] = await db.query(
      "SELECT * FROM live_streams WHERE id = ? AND is_live = ?",
      [streamId, true]
    );

    if (streams.length === 0) {
      return res
        .status(404)
        .json({ message: "Live stream not found or not live" });
    }
    const [insertResult] = await db.query(
      "INSERT INTO comments (stream_id, user_id, content, created_at) VALUES (?, ?, ?, NOW())",
      [streamId, userId, content]
    );
    const [rows] = await db.query(
      "SELECT c.*, u.username FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?",
      [insertResult.insertId]
    );
    const newComment = rows[0];
    broadcastToStream(streamId, { type: "comment", data: newComment });
    res.status(201).json(newComment);
  } catch (error) {
    console.error("Send comment error:", error);
    res.status(500).json({ message: "Failed to send comment" });
  }
});

// 获取直播的弹幕
router.get("/:streamId", async (req, res) => {
  try {
    const streamId = parseInt(req.params.streamId, 10);
    if (isNaN(streamId) || streamId <= 0) {
      return res.status(400).json({ message: "无效的直播间ID" });
    }

    const [streams] = await db.query(
      "SELECT started_at FROM live_streams WHERE id = ?",
      [streamId]
    );
    if (streams.length === 0) {
      return res.status(404).json({ message: "直播间不存在" });
    }
    const [comments] = await db.query(
      `SELECT c.*, u.username
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.stream_id = ?
       ORDER BY c.created_at ASC`,
      [streamId]
    );
    const startedAt = streams[0].started_at;
    const commentList = startedAt
      ? comments.filter((c) => new Date(c.created_at) > new Date(startedAt))
      : comments;
    res.json(commentList);
  } catch (error) {
    console.error("Get comments error:", error);
    res.status(500).json({ message: "Failed to get comments" });
  }
});

module.exports = router;
