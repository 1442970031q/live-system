const WebSocket = require("ws");
const { spawn } = require("child_process");
const { nmsConfig } = require("./mediaServer");
const { closeLiveStream } = require("./tools");

// RTMP推流地址 (node-media-server)
const RTMP_STREAM_BASE_URL = "rtmp://localhost:1935/live/";

const webMediaPush = ({ ws, streamId }) => {
  console.log("开始推流");
  // 启动FFmpeg进程，将WebM流转为RTMP
  const ffmpeg = spawn(nmsConfig.trans.ffmpeg, [
    "-f",
    "webm",
    "-i",
    "-",
    "-vcodec",
    "libx264", // 转码视频为H.264
    "-acodec",
    "aac", // 转码音频为AAC
    "-f",
    "flv",
    // `${RTMP_STREAM_BASE_URL}mystream`
    `${RTMP_STREAM_BASE_URL}${streamId}`,
  ]);
  // 处理FFmpeg输出
  ffmpeg.stdout.on("data", (data) => {
    console.log(`FFmpeg输出: ${data}`);
  });

  // // 处理FFmpeg错误
  // ffmpeg.stderr.on("data", (data) => {
  //   console.error(`FFmpeg错误: ${data}`);
  // });

  // 处理FFmpeg退出
  ffmpeg.on("exit", (code, signal) => {
    console.log(`FFmpeg进程退出，代码: ${code}, 信号: ${signal}`);
  });
  // 接收WebSocket数据并转发给FFmpeg
  ws.on("message", (data) => {
    if (ffmpeg.stdin.writable) {
      ffmpeg.stdin.write(data);
    }
  });
  // 客户端断开连接时清理
  ws.on("close", () => {
    if (ffmpeg.stdin.writable) {
      ffmpeg.stdin.end();
    }
    ffmpeg.kill("SIGINT");
    closeLiveStream(streamId);
    console.log("客户端断开连接");
  });
};
 
const webCommentPush = ({ ws, streamId }) => {
  console.log("开始弹幕");
  ws.on("message", (message) => {
    try {
      // 解析消息
      const data = JSON.parse(message);

      // 验证消息格式
      if (data.type === "message" && data.content) {
        console.log(`收到弹幕: ${data.content}`);

        // 广播消息给所有连接的客户端
        const broadcastData = JSON.stringify({
          type: "danmaku",
          content: data.content,
          timestamp: new Date().toISOString(),
          streamId
        });

        if (client.readyState === WebSocket.OPEN) {
          client.send(broadcastData);
        }
      }
    } catch (error) {
      console.error("消息处理错误:", error);
    }
  });
};
const initWebSocketServer = (server) => {
  // 创建WebSocket服务器，用于接收前端的摄像头流
  const wss = new WebSocket.Server({
    server,
    verifyClient: (info, done) => {
      // info.origin 是前端域名，可根据需求限制（如只允许特定域名）
      console.log("客户端来源：", info.origin);
      done(true); // 允许所有跨域请求（生产环境需限制）
    },
  });

  wss.on("connection", (ws, request) => {
    const wsPath = request.url;
    console.log("websocket 新的客户端连接", wsPath);
    const streamId = wsPath.split("/")[3];
    switch (wsPath) {
      case `/push/stream/${streamId}`:
        {
          webMediaPush({ ws, streamId });
        }
        break;

      // 处理弹幕
      case `/push/comments/${streamId}`:
        {
          webCommentPush({ ws, streamId });
        }
        break;
      default:
        break;
    }

    // 客户端断开连接时清理
    ws.on("close", () => {
      console.log("客户端断开连接");
    });

    // 处理WebSocket错误
    ws.on("error", (error) => {
      console.error("WebSocket错误:", error);
    });
  });
};

module.exports = {
  initWebSocketServer,
};

// wss.on('connection', (ws) => {
//   let currentStreamId = null;

//   ws.on('message', (message) => {
//     try {
//       const data = JSON.parse(message);

//       // 处理加入直播间
//       if (data.type === 'joinStream') {
//         currentStreamId = data.streamId;

//         if (!clients.has(currentStreamId)) {
//           clients.set(currentStreamId, new Set());
//         }

//         clients.get(currentStreamId).add(ws);
//         console.log(`Client joined stream ${currentStreamId}`);
//       }

//       // 处理发送弹幕
//       if (data.type === 'newComment' && currentStreamId) {
//         // 广播弹幕到同一直播间的所有客户端
//         const comment = data.comment;
//         const streamClients = clients.get(currentStreamId);

//         if (streamClients) {
//           streamClients.forEach(client => {
//             if (client.readyState === WebSocket.OPEN) {
//               client.send(JSON.stringify({
//                 type: 'comment',
//                 data: comment
//               }));
//             }
//           });
//         }
//       }

//       // 处理直播流
//       if(data.type === 'stream'){
//         console.log('----正在处理流---')
//       }
//     } catch (error) {
//       console.error('WebSocket message error:', error);
//     }
//   });

//   ws.on('close', () => {
//     if (currentStreamId && clients.has(currentStreamId)) {
//       clients.get(currentStreamId).delete(ws);

//       // 如果直播间没有客户端了，删除该直播间的记录
//       if (clients.get(currentStreamId).size === 0) {
//         clients.delete(currentStreamId);
//       }

//       console.log(`Client left stream ${currentStreamId}`);
//     }
//   });
// });
