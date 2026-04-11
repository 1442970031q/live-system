// 主播页：直播视频预览、弹幕、主播语音敏感词检测
import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { authAPI, liveAPI, voiceAPI, commentAPI, createCommentSocket, getPushStreamWsUrl } from "../services/api";
import Danmaku from "./Danmaku";

// 语音片段时长：5 秒
const VOICE_CHUNK_MS = 5000;
// 过小的片段多为不完整 WebM，不上传（需 ≥32KB，与后端一致）
const VOICE_MIN_BYTES = 32 * 1024;
// 两次检测最少间隔，与片段时长一致
const MIN_CHECK_INTERVAL_MS = 5000;

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
  // 一级违禁词：全屏强警告弹窗（不可关闭，需点击按钮）
  const [level1Popup, setLevel1Popup] = useState({ show: false, matchedWords: [], segment: "" });
  // 二级违规词：顶部橙色浮动条（5秒消失）
  const [level2Toast, setLevel2Toast] = useState(false);
  // 三级违规词：右下角黄色通知（3秒消失）
  const [level3Toast, setLevel3Toast] = useState(false);
  // 四级预警词：右下角蓝色通知（2秒消失）
  const [level4Toast, setLevel4Toast] = useState(false);
  const [commentList, setCommentList] = useState([]);

  const pushStreamRef = useRef(null);
  const pushRecorderRef = useRef(null);
  const pushWsRef = useRef(null);
  const videoRef = useRef(null);
  const voiceRecorderRef = useRef(null);
  const voiceStreamRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const voicePrevTextRef = useRef("");
  const voiceLastCheckTimeRef = useRef(0);
  const voiceCheckingRef = useRef(false);
  const level1TriggerCountRef = useRef(0);
  const voiceCheckActiveRef = useRef(true); // 推出直播间后置 false，不再处理检测结果
  const voiceAbortRef = useRef(null); // 用于取消进行中的语音检测请求

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

  // 历史弹幕：初始拉取 + WebSocket 实时
  useEffect(() => {
    if (!streamId) return;
    const fetchComments = async () => {
      try {
        const data = await commentAPI.getComments(streamId);
        setCommentList(data);
      } catch (err) {
        console.error("Fetch comments error:", err);
      }
    };
    fetchComments();
    const { close } = createCommentSocket(streamId, (comment) => {
      setCommentList((prev) => {
        if (prev.some((c) => c.id === comment.id)) return prev;
        return [...prev, comment];
      });
    });
    return () => close();
  }, [streamId]);

  // 主播语音敏感词检测（独立麦克风）；推出直播间后不再检查
  useEffect(() => {
    if (!voiceCheckOn) return;
    voiceCheckActiveRef.current = true;
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
          if (!voiceCheckActiveRef.current) return; // 已推出直播间，不再检查
          voiceChunksRef.current.push(e.data);
          const chunks = voiceChunksRef.current;
          const blob = chunks.length === 1 ? chunks[0] : new Blob(chunks, { type: chunks[0].type || "audio/webm" });
          if (blob.size < VOICE_MIN_BYTES) return;
          if (!voiceCheckActiveRef.current) return;
          // 节流：距上次检测不足间隔则跳过
          const now = Date.now();
          if (now - voiceLastCheckTimeRef.current < MIN_CHECK_INTERVAL_MS) return;
          // 串行：已有请求进行中则跳过，避免堆积
          if (voiceCheckingRef.current) return;
          voiceCheckingRef.current = true;
          voiceLastCheckTimeRef.current = now;
          voiceAbortRef.current = new AbortController();
          try {
            const result = await voiceAPI.checkAudio(blob, {
              signal: voiceAbortRef.current.signal,
              // CPU 场景下转写偶发超过 25s，适当放宽避免前端频繁主动取消
              timeoutMs: 60000,
              streamId,
            });
            if (!voiceCheckActiveRef.current) return; // 推出直播间后忽略检测结果
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
            if (!newText) {
              // 必须保留首帧（WebM init 段），否则后续 blob 格式无效
              voiceChunksRef.current = chunks.length > 0
                ? (chunks.length >= 2 ? [chunks[0], ...chunks.slice(-2)] : chunks)
                : [];
              return;
            }
            const fullMatched = result.matchedWords || [];
            const hit = result.containsSensitive && fullMatched.length > 0;
            if (hit) {
              const level = result.highestLevel || 1;
              if (level === 1) {
                level1TriggerCountRef.current += 1;
                if (level1TriggerCountRef.current >= 2) {
                  setIsEnding(true);
                  try {
                    await liveAPI.endStream(streamId);
                    navigate("/");
                  } catch (e) {
                    setIsEnding(false);
                  }
                  return;
                }
                setLevel1Popup({ show: true, matchedWords: fullMatched, segment: newText });
              } else if (level === 2) {
                setLevel2Toast(true);
                setTimeout(() => setLevel2Toast(false), 5000);
              } else if (level === 3) {
                setLevel3Toast(true);
                setTimeout(() => setLevel3Toast(false), 3000);
              } else if (level === 4) {
                setLevel4Toast(true);
                setTimeout(() => setLevel4Toast(false), 2000);
              }
            }
            // 必须保留首帧（WebM init 段），否则后续 blob 格式无效
            voiceChunksRef.current = chunks.length > 0
              ? (chunks.length >= 2 ? [chunks[0], ...chunks.slice(-2)] : chunks)
              : [];
          } catch (err) {
            if (!voiceCheckActiveRef.current) return;
            if (err.name === "AbortError") return; // 已取消，不提示
            if (err.matchedWords?.length) {
              level1TriggerCountRef.current += 1;
              setLevel1Popup({ show: true, matchedWords: err.matchedWords, segment: "" });
              if (level1TriggerCountRef.current >= 2) {
                setIsEnding(true);
                try {
                  await liveAPI.endStream(streamId);
                  navigate("/");
                } catch (e) {
                  setIsEnding(false);
                }
              }
            } else {
              setVoiceCheckError(err.message || "语音检测异常");
            }
            // 失败时保留 init + 最近帧，下次重试（不能只留最后一帧，否则无 init 段格式无效）
            voiceChunksRef.current = chunks.length > 0
              ? (chunks.length >= 2 ? [chunks[0], ...chunks.slice(-2)] : chunks)
              : [];
          } finally {
            voiceCheckingRef.current = false;
          }
        };
        recorder.start(VOICE_CHUNK_MS);
      } catch (err) {
        setVoiceCheckError(err.message || "无法获取麦克风权限");
      }
    };

    startVoiceCheck();
    return () => {
      voiceCheckActiveRef.current = false;
      voiceAbortRef.current?.abort(); // 取消进行中的请求，避免 pending 堆积
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

  const handleLevel1Confirm = async () => {
    setLevel1Popup({ show: false, matchedWords: [], segment: "" });
    setIsEnding(true);
    try {
      await liveAPI.endStream(streamId);
      navigate("/");
    } catch (err) {
      setError(err?.message || "结束直播失败");
      setIsEnding(false);
    }
  };

  if (loading) {
    return (
      <div className="streamer-container streamer-loading">
        <div className="streamer-loading-spinner" />
        <p className="streamer-loading-text">加载中...</p>
      </div>
    );
  }
  if (error || !stream) {
    return (
      <div className="streamer-container streamer-error">
        <p className="streamer-error-text">{error || "直播不存在"}</p>
        <button className="streamer-back-btn" onClick={() => navigate("/")}>
          返回首页
        </button>
      </div>
    );
  }

  return (
    <div className="streamer-container">
      {/* 顶部悬浮栏 */}
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

      {/* 主内容区：视频 + 右侧历史弹幕 */}
      <div className="streamer-main">
        <div className="streamer-preview">
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
              <div className="streamer-keyword-banner">已开启关键词检测</div>
            </div>
          </div>
        </div>

        {/* 右侧历史弹幕 */}
        <aside className="streamer-comment-sidebar">
          <h3 className="streamer-comment-title">历史弹幕</h3>
          <div className="streamer-comment-list">
            {commentList.length === 0 ? (
              <p className="streamer-comment-empty">暂无弹幕</p>
            ) : (
              [...commentList].reverse().map((c) => (
                <div key={c.id} className="streamer-comment-item">
                  <span className="streamer-comment-user">{c.username}</span>
                  <span className="streamer-comment-content">{c.content}</span>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      {/* 底部状态栏 */}
      <div className="streamer-info">
        <div className="streamer-info-left">
          <div className="streamer-info-main">
            <h2>{stream.title}</h2>
            <p className="streamer-info-meta">
              ID {stream.id} · {new Date(stream.started_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <p className="streamer-voice-desc">麦克风实时敏感词检测中</p>
          {voiceCheckError && (
            <p className="streamer-voice-error">{voiceCheckError}</p>
          )}
        </div>
        <p className="streamer-push-status">{pushStatus}</p>
      </div>

      {/* 一级违禁词：全屏半透明黑色背景红色强警告弹窗，不可关闭，需点击按钮 */}
      {level1Popup.show && (
        <div className="sensitive-level1-overlay">
          <div className="sensitive-level1-popup">
            <div className="sensitive-level1-title">严重违规警告</div>
            <p className="sensitive-level1-desc">
              您的直播内容检测到一级违禁词，请立即停止违规内容。
            </p>
            {level1Popup.segment && (
              <p className="sensitive-level1-segment">
                本次检测内容：{level1Popup.segment}
              </p>
            )}
            <div className="sensitive-level1-words">
              <span>命中违禁词：</span>
              {level1Popup.matchedWords.map((w) => (
                <span key={w} className="sensitive-level1-word-tag">
                  {w}
                </span>
              ))}
            </div>
            <button
              type="button"
              className="sensitive-level1-btn"
              onClick={handleLevel1Confirm}
              disabled={isEnding}
            >
              {isEnding ? "结束中..." : "我立即停止违规内容"}
            </button>
          </div>
        </div>
      )}

      {/* 二级违规词：顶部橙色固定浮动条，5秒消失 */}
      {level2Toast && (
        <div className="sensitive-level2-bar">
          您的直播内容可能包含违规信息，请规范发言
        </div>
      )}

      {/* 三级违规词：右下角黄色固定浮动通知，3秒消失 */}
      {level3Toast && (
        <div className="sensitive-level3-toast">
          直播音频中检测到不文明用语，请规范发言
        </div>
      )}

      {/* 四级预警词：右下角蓝色固定浮动通知，2秒消失 */}
      {level4Toast && (
        <div className="sensitive-level4-toast">
          直播音频中检测到高风险内容，请谨慎发言
        </div>
      )}
    </div>
  );
};

export default StreamerPage;
