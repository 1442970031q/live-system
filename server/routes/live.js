// 直播路由
const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { getIPAdress } = require("../tools");
const IP = getIPAdress();

// 创建直播
router.post("/create", authenticateToken, async (req, res) => {
  try {
    const { title, description } = req.body;
    const userId = req.user.id;
    const [nowUserState = []] = await db.query(
      "SELECT * FROM live_streams WHERE user_id = ?",
      [userId]
    );
    console.log("nowUserState[0].is_live", nowUserState[0]?.is_live);
    // if (nowUserState.length > 0 && nowUserState[0].is_live) {
    //   return res
    //     .status(400)
    //     .json({ code: 400, message: "User is already live" });
    // }
    if (nowUserState.length > 0) {
      await db.query(
        "UPDATE live_streams SET is_live = ?, title = ?, description = ?, started_at = NOW() WHERE user_id = ?",
        [true, title, description, userId]
      );
      const streamId = nowUserState[0].id;
      console.log("streamId", nowUserState[0], streamId);
      return res.status(200).json({
        code: 200,
        message: "Live stream updated successfully",
        isLive: true,
        streamId,
        wsUrl: `ws://${IP}:3001/push/stream/${streamId}`,
      });
    }
    const [result] = await db.query(
      "INSERT INTO live_streams (user_id, title, description, is_live, started_at) VALUES (?, ?, ?, ?, NOW())",
      [userId, title, description, true]
    );
    const [liveStreams] = await db.query(
      "SELECT * FROM live_streams WHERE user_id = ?",
      [userId]
    );
    const streamId = liveStreams[0].id;
    res.status(200).json({
      code: 200,
      message: "Live stream created successfully",
      streamId: result.insertId,
      isLive: true,
      wsUrl: `ws://${IP}:3001/push/stream/${streamId}`,
    });
  } catch (error) {
    console.error("Create stream error:", error);
    res.status(500).json({ message: "Failed to create live stream" });
  }
});

// 结束直播
router.post("/end/:streamId", authenticateToken, async (req, res) => {
  try {
    const { streamId } = req.params;
    const userId = req.user.id;

    // 检查直播是否存在且属于当前用户
    const [streams] = await db.query(
      "SELECT * FROM live_streams WHERE id = ? AND user_id = ?",
      [streamId, userId]
    );

    if (streams.length === 0) {
      return res
        .status(404)
        .json({ message: "Live stream not found or not owned by user" });
    }

    await db.query(
      "UPDATE live_streams SET is_live = ?, ended_at = NOW() WHERE id = ?",
      [false, streamId]
    );

    res.json({ message: "Live stream ended successfully" });
  } catch (error) {
    console.error("End stream error:", error);
    res.status(500).json({ message: "Failed to end live stream" });
  }
});

// 获取直播列表
router.get("/list", async (req, res) => {
  try {
    const [streams] = await db.query(
      `
      SELECT ls.*, u.username, u.avatar 
      FROM live_streams ls
      JOIN users u ON ls.user_id = u.id
      WHERE ls.is_live = ?
      ORDER BY ls.started_at DESC
    `,
      [true]
    );

    res.json(streams);
  } catch (error) {
    console.error("Get streams error:", error);
    res.status(500).json({ message: "Failed to get live streams" });
  }
});

// 获取单个直播详情
router.get("/:streamId", async (req, res) => {
  try {
    const { streamId } = req.params;

    const [streams] = await db.query(
      `
      SELECT ls.*, u.username, u.avatar 
      FROM live_streams ls
      JOIN users u ON ls.user_id = u.id
      WHERE ls.id = ?
    `,
      [streamId]
    );
    if (streams.length === 0) {
      return res.status(404).json({ message: "Live stream not found" });
    }
    const streamItem = streams[0];
    res.json({
      ...streamItem,
      // liveUrl: `http://${IP}:8000/live/mystream.flv`,
      liveUrl: `http://${IP}:8000/live/${streamId}.flv`,
    });
  } catch (error) {
    console.error("Get stream error:", error);
    res.status(500).json({ message: "Failed to get live stream" });
  }
});

// 路由 - 创建直播记录
router.post("/record", authenticateToken, async (req, res) => {
  try {
    const { title, description } = req.body;
    const userId = req.user.id;

    // 生成唯一的stream key
    const streamKey = `${userId}-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // 创建直播记录
    const [result] = await db.execute(
      "INSERT INTO streams (user_id, title, description, status, stream_key) VALUES (?, ?, ?, ?, ?)",
      [userId, title, description, "live", streamKey]
    );

    const streamId = result.insertId;

    // 更新直播开始时间
    await db.execute("UPDATE streams SET start_time = NOW() WHERE id = ?", [
      streamId,
    ]);

    res.json({
      message: "直播创建成功",
      streamId,
      streamKey,
      rtmpUrl: `rtmp://localhost:1935/live/${streamKey}`,
    });
  } catch (error) {
    console.error("Create stream error:", error);
    res.status(500).json({ message: "创建直播失败" });
  }
});

module.exports = router;
