// 创建直播页面
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useRef } from "react";
import { authAPI, liveAPI } from "../services/api";
import Danmaku from "./Danmaku";
import "./CreateStream.css";

const CreateStream = () => {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [streamId, setStreamId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState("未连接");
  const navigate = useNavigate();

  const mediaRecorderRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const websocketRef = useRef(null);
  // 检查用户是否已登录
  useEffect(() => {
    if (!authAPI.isAuthenticated()) {
      navigate("/login");
    }
  }, [navigate]);

  const initLiveVideo = async () => {
    // 摄像头配置参数
    const constraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    };
    if (navigator?.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => {
          streamRef.current = stream;
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((err) => {
            console.warn("自动播放失败，可能需要用户交互:", err);
          });
        })
        .catch((error) => {
          console.error("摄像头访问失败:", error.name, error.message);
          if (error.name === "NotAllowedError") {
            alert("请在浏览器权限设置中允许摄像头访问");
          }
        });
    } else {
      console.log("摄像头权限获取失败");
      // 如果是通过非https 访问 获取不到权限
      // 进行配置 chrome://flags
    }
  };

  useEffect(() => {
    if (videoRef.current) {
      initLiveVideo();
    }
  }, [videoRef.current]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };
  // 获取支持的媒体格式
  const getSupportedMimeType = () => {
    const possibleTypes = [
      "video/webm; codecs=vp8,opus",
      "video/webm; codecs=vp9,opus",
      "video/mp4; codecs=avc1,aac",
      "video/webm",
      "video/mp4",
    ];

    for (const type of possibleTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return ""; // 不支持MediaRecorder
  };
  // 开始推流
  const startStreaming = async (wsUrl) => {
    if (!wsUrl) {
      setError("请先创建直播");
      return;
    }
    try {
      setStatus("正在连接服务器...");
      websocketRef.current = new WebSocket(wsUrl);
      websocketRef.current.binaryType = "blob";
      const mimeType = getSupportedMimeType();
      if (!mimeType) {
        setStatus("您的浏览器不支持媒体录制");
        return;
      }
      websocketRef.current.onopen = () => {
        setIsConnected(true);
        setStatus("已连接到服务器，开始推流");
        // 开始录制媒体流
        mediaRecorderRef.current = new MediaRecorder(streamRef.current, {
          mimeType,
          videoBitsPerSecond: 2500000, // 2.5 Mbps
          audioBitsPerSecond: 128000, // 128 kbps
          bitsPerSecond: 2628000, // 总比特率
        });
        // 每100ms发送一次数据
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (
            event.data.size > 0 &&
            websocketRef.current?.readyState === WebSocket.OPEN
          ) {
            websocketRef.current.send(event.data);
          }
        };
        mediaRecorderRef.current.start(500);
      };

      websocketRef.current.onclose = () => {
        setIsConnected(false);
        setStatus("与服务器的连接已关闭");
      };

      websocketRef.current.onerror = (error) => {
        console.error("WebSocket错误:", error);
        setStatus("连接错误，请重试");
      };
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStartStream = async (e) => {
    e.preventDefault();
    // createStreamSocket()
    setError("");
    setLoading(true);

    try {
      const data = await liveAPI.createStream(formData);
      const { streamId, wsUrl } = data;

      setStreamId(streamId);
      startStreaming(wsUrl);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="create-stream-container">
      {!isConnected && (
        <div className="create-stream-container-info">
          <h2>
            创建直播
            <span style={{ fontSize: 12, color: "red", marginLeft: 12 }}>
              {status}
            </span>
          </h2>
          {error && <div className="error-message">{error}</div>}
          <form onSubmit={handleStartStream} className="create-stream-form">
            <div className="form-group">
              <label htmlFor="title">直播标题</label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                placeholder="请输入直播标题"
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">直播描述</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows="4"
                placeholder="请输入直播描述（可选）"
              ></textarea>
            </div>

            <button
              type="submit"
              className="start-stream-btn"
              disabled={loading}
            >
              {loading ? "创建中..." : "开始直播"}
            </button>
          </form>
        </div>
      )}

      <div className="create-stream-container-video">
        {isConnected && (
          <div className="create-stream-container-video-info">
            <div>标题: {formData.title}</div>
            <div>直播状态: {status}</div>
          </div>
        )}

        <div className="stream-preview">
          {streamId && <Danmaku streamId={streamId} />}
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: "100%",
              height: 900,
              background: "#000",
            }}
            className="preview-video"
          />
        </div>
      </div>
    </div>
  );
};

export default CreateStream;
