import React, { useRef, useEffect, useState, useCallback ,memo} from "react";
import mpegts from "mpegts.js";

const FlvPlayer = ({
  url,
  width = "100%",
  height = "auto",
  autoplay = false,
  muted = true,
  lowLatency = true, // 低延迟模式开关
  onError = (err) => console.error("FLV播放错误:", err),
}) => {
  // 核心引用
  const videoRef = useRef(null);
  const playerRef = useRef(null); // mpegts播放器实例
  const mediaSourceRef = useRef(null); // 媒体源引用

  // 状态管理
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [error, setError] = useState(null);
  const [bufferProgress, setBufferProgress] = useState(0);
  const [volume, setVolume] = useState(0.7); // 默认音量

  // 初始化播放器
  const initPlayer = useCallback(() => {
    // 清理旧实例
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    if (mediaSourceRef.current) {
      mediaSourceRef.current = null;
    }

    // 前置检查
    if (!videoRef.current || !url) return;
    if (!mpegts.isSupported()) {
      const err = new Error("当前浏览器不支持mpegts.js（推荐Chrome 80+）");
      setError(err);
      onError(err);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 配置媒体源
      const mediaDataSource = {
        type: "flv", // 明确指定FLV格式
        url,
        isLive: true, // 直播模式
        cors: true,
        withCredentials: false,
        // 低延迟优化（关键配置）
        ...(lowLatency && {
          lazyLoad: false,
          lazyLoadMaxDuration: 0,
          lazyLoadRecoverDuration: 0,
          deferLoadAfterSourceOpen: false,
        }),
      };

      // 播放器配置
      const config = {
        enableWorker: true, // 启用WebWorker解析（避免主线程阻塞）
        enableStashBuffer: !lowLatency, // 低延迟模式关闭缓冲池
        stashInitialSize: 1024 * 1024, // 初始缓冲区大小(1MB)
        // 时间戳容错
        maxDrift: 1000,
        fixAudioTimestampGap: true,
        // 解码优化
        enableSoftwareRender: false, // 优先硬件解码
      };

      // 创建播放器实例
      playerRef.current = mpegts.createPlayer(mediaDataSource, config);
      
      // 绑定视频元素
      playerRef.current.attachMediaElement(videoRef.current);
      
      // 加载流
      playerRef.current.load();

      // 监听播放器事件
      playerRef.current.on(mpegts.Events.MEDIA_INFO, (info) => {
        console.log("媒体信息:", {
          videoCodec: info.videoCodec,
          audioCodec: info.audioCodec,
          width: info.width,
          height: info.height,
        });
      });

      // 播放开始
      playerRef.current.on(mpegts.Events.PLAYING, () => {
        setIsPlaying(true);
        setIsLoading(false);
      });

      // 暂停
      playerRef.current.on(mpegts.Events.PAUSED, () => {
        setIsPlaying(false);
      });

      // 缓冲更新
      playerRef.current.on(mpegts.Events.BUFFER_UPDATE, (bufferInfo) => {
        const { video, audio } = bufferInfo;
        const totalBuffer = (video || 0) + (audio || 0);
        // 直播模式下缓冲进度估算
        setBufferProgress(Math.min(100, Math.round(totalBuffer * 10)));
      });

      // 缓冲不足
      playerRef.current.on(mpegts.Events.BUFFER_EMPTY, () => {
        setIsLoading("缓冲不足...");
      });

      // 缓冲恢复
      playerRef.current.on(mpegts.Events.BUFFER_FULL, () => {
        if (typeof isLoading === "string") setIsLoading(false);
      });

      // 错误处理
      playerRef.current.on(mpegts.Events.ERROR, (errType, errDetail) => {
        const errorMap = {
          [mpegts.ErrorTypes.NETWORK_ERROR]: "网络错误",
          [mpegts.ErrorTypes.MEDIA_ERROR]: "媒体解码错误",
          [mpegts.ErrorTypes.OTHER_ERROR]: "其他错误",
        };
        const err = new Error(`${errorMap[errType]}: ${errDetail}`);
        
        // 网络错误自动重试
        if (errType === mpegts.ErrorTypes.NETWORK_ERROR) {
          err.message += "（尝试重新连接...）";
          setTimeout(initPlayer, 3000);
        }
        
        setError(err);
        onError(err);
        setIsLoading(false);
      });

      // 自动播放（需符合浏览器策略）
      if (autoplay) {
        setTimeout(() => {
          if (playerRef.current) playerRef.current.play();
        }, 500);
      }

    } catch (err) {
      setError(err);
      onError(err);
      setIsLoading(false);
    }
  }, [url, autoplay, lowLatency, onError]);

  // 组件挂载/参数变化时初始化
  useEffect(() => {
    initPlayer();

    // 组件卸载时清理
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [url, initPlayer]);

  // 播放/暂停切换
  const togglePlay = useCallback(() => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pause();
    } else {
      playerRef.current.play().catch(err => {
        const playErr = new Error(`播放失败: ${err.message}（请检查浏览器自动播放策略）`);
        setError(playErr);
        onError(playErr);
      });
    }
  }, [isPlaying, onError]);

  // 静音切换
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
    }
  }, []);

  // 音量调节
  const handleVolumeChange = useCallback((e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
    }
  }, []);

  // 错误状态渲染
  if (error) {
    return (
      <div
        style={{
          width,
          height: height === "auto" ? "300px" : height,
          backgroundColor: "#f8d7da",
          color: "#721c24",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          borderRadius: "4px",
          border: "1px solid #f5c6cb",
        }}
      >
        <p>播放错误: {error.message}</p>
        <button
          onClick={initPlayer}
          style={{
            marginTop: "10px",
            padding: "6px 12px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          重新连接
        </button>
      </div>
    );
  }

  // 主渲染
  return (
    <div
      style={{
        position: "relative",
        width,
        height:'100%',
        backgroundColor: "#000",
        borderRadius: "4px",
        overflow: "hidden",
        aspectRatio: height === "auto" ? "16/9" : undefined,
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      {/* 视频元素 */}
      <video
        ref={videoRef}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        muted={muted}
        volume={volume}
        playsInline
        onClick={togglePlay}
        tabIndex={0}
        aria-label="FLV直播流"
      />


      {/* 自定义控制栏 - 主流直播风格 */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "8px 12px",
          background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        {/* 播放/暂停按钮 */}
        <button
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          style={{
            background: "none",
            border: "none",
            color: "#fff",
            cursor: "pointer",
            fontSize: "18px",
            padding: "0",
          }}
          aria-label={isPlaying ? "暂停" : "播放"}
        >
          {isPlaying ? "⏸️" : "▶️"}
        </button>

        {/* 静音按钮 */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleMute(); }}
          style={{
            background: "none",
            border: "none",
            color: "#fff",
            cursor: "pointer",
            fontSize: "18px",
            padding: "0",
          }}
          aria-label={videoRef.current?.muted ? "取消静音" : "静音"}
        >
          {videoRef.current?.muted ? "🔇" : "🔊"}
        </button>

        {/* 音量滑块 */}
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={handleVolumeChange}
          style={{
            width: "80px",
            cursor: "pointer",
          }}
          aria-label="调整音量"
        />

        {/* 缓冲进度条 */}
        <div
          style={{
            flexGrow: 1,
            height: "4px",
            backgroundColor: "rgba(255,255,255,0.3)",
            borderRadius: "2px",
            cursor: "pointer",
          }}
          onClick={(e) => {
            // 简单的进度条点击跳转（直播场景慎用）
            if (!lowLatency && playerRef.current) {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              const duration = videoRef.current.duration || 0;
              if (duration) playerRef.current.seek(ratio * duration);
            }
          }}
        >
          <div
            style={{
              width: `${bufferProgress}%`,
              height: "100%",
              backgroundColor: "#4CAF50",
              borderRadius: "2px",
            }}
          />
        </div>

        {/* 直播状态标签 */}
        <span style={{
          fontSize: "11px",
          padding: "3px 8px",
          backgroundColor: "rgba(255, 59, 48, 0.9)",
          borderRadius: "4px",
          marginLeft: "4px",
          fontWeight: 600,
        }}>
          直播
        </span>

        {/* 低延迟模式标签 */}
        {lowLatency && (
          <span style={{
            fontSize: "10px",
            padding: "2px 6px",
            backgroundColor: "rgba(0, 122, 255, 0.8)",
            borderRadius: "4px",
          }}>
            低延迟
          </span>
        )}
      </div>
    </div>
  );
};

export default memo(FlvPlayer);
