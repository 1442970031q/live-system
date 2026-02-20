// 弹幕路由
const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");

// 发送弹幕
router.post("/:streamId", authenticateToken, async (req, res) => {
  try {
    const { streamId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;
    console.log("userId=====", userId, content);
    console.log("streamId=====", streamId, content);
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
    await db.query(
      "INSERT INTO comments (stream_id, user_id, content, created_at) VALUES (?, ?, ?, NOW())",
      [streamId, userId, content]
    );
    // 获取完整的弹幕信息（包含用户名）
    const [comments] = await db.query(
      `
      SELECT c.*, u.username 
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.stream_id = ?
    `,
      [streamId]
    );

    res.status(201).json(comments[0]);
  } catch (error) {
    console.error("Send comment error:", error);
    res.status(500).json({ message: "Failed to send comment" });
  }
});

// 获取直播的弹幕
router.get("/:streamId", async (req, res) => {
  try {
    // 从路径参数获取直播间ID，并确保是整数
    const streamId = parseInt(req.params.streamId, 10);
    // 检查直播是否存在且正在直播
    const [streams] = await db.query(
      "SELECT * FROM live_streams WHERE id = ?",
      [streamId]
    );
    // 验证streamId有效性
    if (isNaN(streamId) || streamId <= 0) {
      return res.status(400).json({ message: "无效的直播间ID" });
    }

    // 执行查询，使用参数数组传递
    const [comments] = await db.query(
      `SELECT c.*, u.username
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.stream_id = ?
       ORDER BY c.created_at ASC`,
      [streamId]
    );
    const startedAt = streams[0].started_at
    const commentList = comments.filter((item) => {
      return Date.parse(item.created_at) > Date.parse(startedAt)
    })
    res.json(commentList);
  } catch (error) {
    console.error("Get comments error:", error);
    res.status(500).json({ message: "Failed to get comments" });
  }
});

module.exports = router;
