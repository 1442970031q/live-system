// 主服务器文件
const express = require("express");
const http = require("http");
const cors = require("cors");
const config = require("./config");
const db = require("./db");
const { initWebSocketServer } = require("./webSocketServer");
const { initMediaServer } = require("./mediaServer");
const { getIPAddress } = require("./tools");

global.version = "v1.0.0";

const authRoutes = require("./routes/auth");
const liveRoutes = require("./routes/live");
const commentRoutes = require("./routes/comment");
const userRoutes = require("./routes/user");
const voiceRoutes = require("./routes/voice");

const app = express();
const server = http.createServer(app);

// 跨域：允许无 origin、localhost/127.0.0.1/本机 IP 任意端口，以及 config 中配置的域名
const allowedOriginPatterns = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^http:\/\/[\d.]+(:\d+)?$/, // 本机 IP 任意端口
];
const extraOrigins = config.corsAllowedOrigins || [];
function isOriginAllowed(origin) {
  if (!origin) return true;
  if (extraOrigins.includes(origin)) return true;
  return allowedOriginPatterns.some((p) => p.test(origin));
}
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true); // 反射请求的 origin，浏览器会放行
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
// 同时解析 application/json 与 text/plain（部分浏览器/环境会发 text/plain）
app.use(
  express.json({
    type: (req) => {
      const ct = (req.headers["content-type"] || "").toLowerCase();
      return ct.includes("application/json") || ct.includes("text/plain");
    },
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/live", liveRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/voice", voiceRoutes);

async function startServer() {
  try {
    await db.initDB();
    initMediaServer();
    const host = config.host === "0.0.0.0" ? getIPAddress() : config.host;
    server.listen(config.port, config.host, () => {
      console.log(`Server: http://${host}:${config.port}`);
      initWebSocketServer(server);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
}

startServer();
