const WebSocket = require("ws");
const { spawn } = require("child_process");
const { nmsConfig } = require("./mediaServer");
const { closeLiveStream } = require("./tools");

const RTMP_STREAM_BASE_URL = "rtmp://localhost:1935/live/";

// 弹幕房间：streamId -> Set<ws>
const commentClients = new Map();

const webMediaPush = ({ ws, streamId }) => {
  const ffmpeg = spawn(nmsConfig.trans.ffmpeg, [
    "-fflags", "nobuffer", "-flags", "low_delay", // 减少输入缓冲
    "-f", "webm", "-i", "-",
    "-vcodec", "libx264",
    "-preset", "ultrafast", // 极快编码，降低编码延迟
    "-tune", "zerolatency", // 零延迟调优
    "-acodec", "aac",
    "-max_delay", "0", // 最小化输出延迟
    "-f", "flv",
    `${RTMP_STREAM_BASE_URL}${streamId}`,
  ]);
  ffmpeg.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) console.error("FFmpeg exit", code, signal);
  });

  ws.on("message", (data) => {
    if (ffmpeg.stdin.writable) {
      ffmpeg.stdin.write(data);
    }
  });
  ws.on("close", () => {
    if (ffmpeg.stdin?.writable) ffmpeg.stdin.end();
    ffmpeg.kill("SIGINT");
    closeLiveStream(streamId);
  });
};

function addCommentClient(streamId, ws) {
  const id = String(streamId);
  if (!commentClients.has(id)) commentClients.set(id, new Set());
  commentClients.get(id).add(ws);
}

function removeCommentClient(streamId, ws) {
  const set = commentClients.get(String(streamId));
  if (set) {
    set.delete(ws);
    if (set.size === 0) commentClients.delete(String(streamId));
  }
}

function broadcastToStream(streamId, data) {
  const set = commentClients.get(String(streamId));
  if (!set) return;
  const payload = JSON.stringify(data);
  set.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

const webCommentPush = (ws) => {
  let currentStreamId = null;

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === "joinStream" && data.streamId != null) {
        currentStreamId = String(data.streamId);
        addCommentClient(currentStreamId, ws);
        return;
      }
      if (data.type === "newComment" && data.comment && currentStreamId) {
        broadcastToStream(currentStreamId, { type: "comment", data: data.comment });
      }
    } catch (err) {
      console.error("WebSocket message error:", err);
    }
  });

  ws.on("close", () => {
    if (currentStreamId) removeCommentClient(currentStreamId, ws);
  });
};

const initWebSocketServer = (server) => {
  const wss = new WebSocket.Server({
    server,
    verifyClient: (_info, done) => done(true),
  });

  wss.on("connection", (ws, request) => {
    const path = request.url?.split("?")[0] || "";
    const segments = path.split("/").filter(Boolean);

    if (segments[0] === "push" && segments[1] === "stream" && segments[2]) {
      webMediaPush({ ws, streamId: segments[2] });
      return;
    }
    if (segments[0] === "push" && segments[1] === "comments") {
      webCommentPush(ws);
      return;
    }

    ws.on("error", (err) => console.error("WebSocket error:", err));
  });
};

module.exports = {
  initWebSocketServer,
  broadcastToStream,
};
