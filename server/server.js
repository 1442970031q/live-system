// 主服务器文件
const express = require("express");
const http = require("http");
const cors = require("cors");
const config = require("./config");
const db = require("./db");
const { initWebSocketServer } = require("./webSocketServer");
const { initMediaServer } = require("./mediaServer");
const { getIPAdress } = require("./tools");
global.version = "v1.0.0";
// 导入路由
const authRoutes = require("./routes/auth");
const liveRoutes = require("./routes/live");
const commentRoutes = require("./routes/comment");
const userRoutes = require("./routes/user");

// 初始化应用
const app = express();
const server = http.createServer(app);

// 中间件
app.use(
  cors({
    origin: "http://192.168.1.26:3000", // 前端地址
    credentials: true, // 若需要携带 Cookie，开启此选项
  })
);
app.use(express.json());

// 路由
app.use("/api/auth", authRoutes);
app.use("/api/live", liveRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/users", userRoutes);

// 启动服务器
async function startServer() {
  try {
    await db.initDB();
    initMediaServer();
    const IP = getIPAdress();
    console.log(`服务器:  ${IP}:${config.port}`);
    server.listen(config.port, config.host, () => {
      console.log(`Server running on port ${config.port}`);
      initWebSocketServer(server);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
}

startServer();
