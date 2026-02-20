const NodeMediaServer = require("node-media-server");
// 配置node-media-server
const nmsConfig = {
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true, // 保留GOP缓存（确保首帧快速加载）
    ping: 60, // 心跳检测间隔（避免误判连接超时）
    ping_timeout: 120, // 超时时间延长到120秒（适配直播流）
    application: {
      live: {
        // 应用名“live”需与FLV拉流地址“/live/mystream.flv”匹配
        live: true, // 【必须开启】明确标记为直播流（否则NMS按点播处理）
        allow_origin: "*", // 允许跨域推流（WebSocket推流需此配置）
        publish: true, // 允许推流到该应用（默认true，但显式配置更稳妥）
        play: true, // 允许从该应用拉流
      },
    },
  },
  http: {
    port: 8000,
    allow_origin: "*",
    mediaroot: "./media",
    // 【新增】延长HTTP长连接超时（适配FLV分块传输）
    headers: {
      "Keep-Alive": "timeout=60, max=200", // 连接保持60秒，支持200个分块请求
      Connection: "keep-alive",
      "Cache-Control": "no-cache", // 禁止缓存FLV流（避免旧数据干扰）
    },
    api: true, // 【启用API】便于查询流状态（如http://192.168.1.26:8000/api/streams）
    player: true, // 【启用自带播放器】快速验证流是否可用（访问http://192.168.1.26:8000/player.html）
  },
  trans: {
    ffmpeg: "/usr/local/bin/ffmpeg",
    tasks: [
      {
        app: "live",
        hls: false, // 【暂时关闭HLS】减少资源占用，专注排查FLV问题（后续可开启）
        dash: false, // 【暂时关闭DASH】同理
        // 若后续需要FLV转码优化，可添加FLV参数（当前用默认转发即可）
      },
    ],
  },
};
const initMediaServer = () => {
  // 启动node-media-server
  const nms = new NodeMediaServer(nmsConfig);
  nms.run();
  console.log("Node Media Server启动成功");
  console.log(`RTMP服务: rtmp://localhost:1935`);
  console.log(`HTTP-FLV服务: http://localhost:8000`);
};

module.exports = {
  initMediaServer,
  nmsConfig,
};
