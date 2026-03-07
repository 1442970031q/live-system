// 主播页：直播视频预览、弹幕、主播语音敏感词检测
import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { authAPI, liveAPI, voiceAPI, getPushStreamWsUrl } from "../services/api";
import Danmaku from "./Danmaku";

const VOICE_CHUNK_MS = 8000;
// 过小的片段多为不完整 WebM，不上传（与后端 MIN_WEBM_BYTES 一致）
const VOICE_MIN_BYTES = 32 * 1024;

function getSupportedMimeType() {
  const types = [
    "video/webm; codecs=vp8,opus",
    "video/webm; codecs=vp9,opus",
    "video/mp4; codecs=avc1,aac",
    "video/webm",
    "video/mp4",
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

const StreamerPage = () => {
  const { streamId } = useParams();
  const [stream, setStream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEnding, setIsEnding] = useState(false);
  const [pushStatus, setPushStatus] = useState("未连接");
  const [pushConnected, setPushConnected] = useState(false);
  const [voiceCheckOn] = useState(true);
  const [voiceCheckError, setVoiceCheckError] = useState("");
  const [sensitivePopup, setSensitivePopup] = useState({ show: false, matchedWords: [], segment: "" });

  const pushStreamRef = useRef(null);
  const pushRecorderRef = useRef(null);
  const pushWsRef = useRef(null);
  const videoRef = useRef(null);
  const voiceRecorderRef = useRef(null);
  const voiceStreamRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const voicePrevTextRef = useRef("");

  const navigate = useNavigate();
  const currentUser = authAPI.getCurrentUser();

  // 加载直播信息
  useEffect(() => {
    if (!authAPI.isAuthenticated()) {
      navigate("/login");
      return;
    }
    const fetchStream = async () => {
      try {
        const data = await liveAPI.getStream(streamId);
        if (data.user_id !== currentUser?.id) {
          throw new Error("你没有权限访问此页面");
        }
        setStream(data);
      } catch (err) {
        setError(err.message);
        navigate("/");
      } finally {
        setLoading(false);
      }
    };
    fetchStream();
  }, [streamId, currentUser?.id, navigate]);

  // 直播预览 + 推流：拉取摄像头/麦克风并推送到 WebSocket
  useEffect(() => {
    if (!stream?.id || !streamId) return;

    let mediaStream = null;
    let ws = null;
    let recorder = null;

    const startPush = async () => {
      setPushStatus("正在获取摄像头...");
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        pushStreamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(() => {});
        }

        const mimeType = getSupportedMimeType();
        if (!mimeType) {
          setPushStatus("您的浏览器不支持媒体录制");
          return;
        }

        const wsUrl = getPushStreamWsUrl(streamId);
        setPushStatus("正在连接服务器...");
        ws = new WebSocket(wsUrl);
        ws.binaryType = "blob";
        pushWsRef.current = ws;

        ws.onopen = () => {
          setPushConnected(true);
          setPushStatus("已连接，正在推流");
          recorder = new MediaRecorder(mediaStream, {
            mimeType,
            videoBitsPerSecond: 2500000,
            audioBitsPerSecond: 128000,
            bitsPerSecond: 2628000,
          });
          pushRecorderRef.current = recorder;
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0 && ws?.readyState === WebSocket.OPEN) {
              ws.send(e.data);
            }
          };
          recorder.start(500);
        };

        ws.onclose = () => {
          setPushConnected(false);
          setPushStatus("与服务器的连接已关闭");
        };
        ws.onerror = () => {
          setPushStatus("连接错误，请重试");
        };
      } catch (err) {
        if (err.name === "NotAllowedError") {
          setPushStatus("请允许摄像头和麦克风权限");
        } else {
          setPushStatus("无法获取设备: " + (err.message || "未知错误"));
        }
      }
    };

    startPush();
    return () => {
      if (recorder?.state !== "inactive") recorder?.stop();
      pushRecorderRef.current = null;
      ws?.close();
      pushWsRef.current = null;
      mediaStream?.getTracks?.().forEach((t) => t.stop());
      pushStreamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [stream?.id, streamId]);

  // 主播语音敏感词检测（独立麦克风）
  useEffect(() => {
    if (!voiceCheckOn) return;
    let recorder = null;
    let audioStream = null;

    const startVoiceCheck = async () => {
      setVoiceCheckError("");
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceStreamRef.current = audioStream;
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        recorder = new MediaRecorder(audioStream);
        voiceRecorderRef.current = recorder;
        voiceChunksRef.current = [];
        voicePrevTextRef.current = "";

        recorder.ondataavailable = async (e) => {
          if (!e.data?.size) return;
          if (e.data.type && !e.data.type.toLowerCase().includes("audio")) return;
          voiceChunksRef.current.push(e.data);
          const chunks = voiceChunksRef.current;
          const blob = chunks.length === 1 ? chunks[0] : new Blob(chunks, { type: chunks[0].type || "audio/webm" });
          if (blob.size < VOICE_MIN_BYTES) return;
          try {
            const result = await voiceAPI.checkAudio(blob);
            const fullText = (result.text || "").trim();
            const prevText = voicePrevTextRef.current || "";
            voicePrevTextRef.current = fullText;
            let newText;
            if (fullText.startsWith(prevText)) {
              newText = fullText.slice(prevText.length).trim();
            } else {
              let len = 0;
              for (let i = 1; i <= prevText.length; i++) {
                if (fullText.startsWith(prevText.slice(0, i))) len = i;
              }
              newText = fullText.slice(len).trim();
            }
            if (!newText) return;
            const fullMatched = result.matchedWords || [];
            const matchedInNew = fullMatched.filter((w) => newText.includes(w));
            if (matchedInNew.length > 0) {
              setSensitivePopup({ show: true, matchedWords: matchedInNew, segment: newText });
            }
          } catch (err) {
            if (err.matchedWords?.length) {
              setSensitivePopup({ show: true, matchedWords: err.matchedWords, segment: "" });
            } else {
              setVoiceCheckError(err.message || "语音检测异常");
            }
          }
        };
        recorder.start(VOICE_CHUNK_MS);
      } catch (err) {
        setVoiceCheckError(err.message || "无法获取麦克风权限");
      }
    };

    startVoiceCheck();
    return () => {
      if (recorder?.state !== "inactive") recorder?.stop();
      voiceRecorderRef.current = null;
      audioStream?.getTracks?.().forEach((t) => t.stop());
      voiceStreamRef.current = null;
    };
  }, [voiceCheckOn]);

  const handleEndStream = async () => {
    if (!window.confirm("确定要结束直播吗？")) return;
    setIsEnding(true);
    try {
      await liveAPI.endStream(streamId);
      navigate("/");
    } catch (err) {
      setError(err.message);
      setIsEnding(false);
    }
  };

  const handleSensitiveConfirm = async () => {
    setSensitivePopup({ show: false, matchedWords: [], segment: "" });
    setIsEnding(true);
    try {
      await liveAPI.endStream(streamId);
      navigate("/");
    } catch (err) {
      setError(err?.message || "结束直播失败");
      setIsEnding(false);
    }
  };

  if (loading) return <div className="loading">加载中...</div>;
  if (error) return <div className="error-message">{error}</div>;
  if (!stream) return <div className="error-message">直播不存在</div>;

  return (
    <div className="streamer-container">
      <div className="streamer-header">
        <h1>你的直播</h1>
        <button
          className="end-stream-btn"
          onClick={handleEndStream}
          disabled={isEnding}
        >
          {isEnding ? "结束中..." : "结束直播"}
        </button>
      </div>

      <div className="streamer-info">
        <h2>{stream.title}</h2>
        <p>{stream.description}</p>
        <p>直播ID: {stream.id}</p>
        <p>开始时间: {new Date(stream.started_at).toLocaleString()}</p>
        <p className="streamer-push-status">{pushStatus}</p>
      </div>

      <div className="streamer-preview">
        <h3>直播预览</h3>
        <div className="streamer-keyword-banner">
          已开启关键词检测
        </div>
        <div className="streamer-preview-inner">
          <div className="streamer-video-wrap">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="streamer-preview-video"
            />
            {streamId && <Danmaku streamId={streamId} />}
          </div>
        </div>
      </div>

      <div className="streamer-voice-check streamer-voice-check-always">
        <p className="streamer-voice-desc">
          正在对您麦克风说话内容进行实时关键词检测，命中敏感词将弹窗提示并可结束直播。
        </p>
        {voiceCheckError && (
          <p className="streamer-voice-error">{voiceCheckError}</p>
        )}
      </div>

      {sensitivePopup.show && (
        <div
          className="sensitive-popup-overlay"
          onClick={() => setSensitivePopup({ show: false, matchedWords: [], segment: "" })}
        >
          <div
            className="sensitive-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sensitive-popup-title">最新检测到敏感词</div>
            <p className="sensitive-popup-desc">
              您刚才的发言中包含敏感词，点击下方按钮将结束直播并返回。
            </p>
            {sensitivePopup.segment && (
              <p className="sensitive-popup-segment">
                本次检测内容：{sensitivePopup.segment}
              </p>
            )}
            <div className="sensitive-popup-words">
              <span>最新命中：</span>
              {sensitivePopup.matchedWords.map((w) => (
                <span key={w} className="sensitive-word-tag">
                  {w}
                </span>
              ))}
            </div>
            <button
              type="button"
              className="sensitive-popup-btn"
              onClick={handleSensitiveConfirm}
              disabled={isEnding}
            >
              {isEnding ? "结束中..." : "知道了"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StreamerPage;
