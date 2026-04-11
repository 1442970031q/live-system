// 观看直播页面
import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  authAPI,
  liveAPI,
  commentAPI,
  voiceAPI,
  createCommentSocket,
  userAPI,
} from "../services/api";
import PlayLiveVideo from "./PlayLiveVideo";

const WatchStream = () => {
  const { streamId } = useParams();
  const [stream, setStream] = useState({});
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);
  const [sensitivePopup, setSensitivePopup] = useState({ show: false, matchedWords: [] });
  const [sensitiveToast, setSensitiveToast] = useState({ show: false, level: 0, matchedWords: [] });
  const chatMessagesRef = useRef(null);
  const toastTimerRef = useRef(null);
  const socketRef = useRef(null);
  // 当前用户
  const currentUser = authAPI.getCurrentUser();
  const intervalIdRef = useRef(null);
  useLayoutEffect(() => {
    return () => clearInterval(intervalIdRef.current);
  }, []);
  // 加载直播信息
  useEffect(() => {
    const fetchStream = async () => {
      try {
        const data = await liveAPI.getStream(streamId);
        // 检查直播是否正在进行
        if (!data.is_live) {
          throw new Error("该直播已结束");
        }

        setStream(data);

        // 检查当前用户是否关注了主播
        if (currentUser) {
          checkIfFollowing(data.user_id);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStream();
  }, [streamId]);

  const fetchComments = async (streamId) => {
    try {
      const data = await commentAPI.getComments(streamId);
      setComments(data);
    } catch (err) {
      console.error("Failed to fetch comments:", err);
    }
  };

  // 加载弹幕
  useEffect(() => {
    if (!streamId) return;
    intervalIdRef.current = setInterval(() => {
      fetchComments(streamId);
    }, 1000);
    return () => clearInterval(intervalIdRef.current);
  }, [streamId]);

  // 建立WebSocket连接接收实时弹幕
  useEffect(() => {
    if (!streamId) return;

    socketRef.current = createCommentSocket(streamId, (comment) => {
      setComments((prev) => [...prev, comment]);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [streamId]);

  // 自动滚动到最新弹幕（仅滚动弹幕容器，避免整页滑到底部）
  useEffect(() => {
    const el = chatMessagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments]);

  // 检查是否关注了主播
  const checkIfFollowing = async (userId) => {
    try {
      const follows = await userAPI.getFollows();
      const isFollowing = follows.some((follow) => follow.id === userId);
      setIsFollowing(isFollowing);
    } catch (err) {
      console.error("Failed to check follow status:", err);
    }
  };

  // 关注/取消关注主播
  const handleFollowToggle = async () => {
    if (!currentUser) return;

    setIsLoadingFollow(true);

    try {
      if (isFollowing) {
        await userAPI.unfollowUser(stream.user_id);
        setIsFollowing(false);
      } else {
        await userAPI.followUser(stream.user_id);
        setIsFollowing(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoadingFollow(false);
    }
  };

  const showSensitiveToast = (level, matchedWords) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setSensitiveToast({ show: true, level, matchedWords });
    const duration = level <= 3 ? 3000 : 2000;
    toastTimerRef.current = setTimeout(() => {
      setSensitiveToast({ show: false, level: 0, matchedWords: [] });
    }, duration);
  };

  // 发送弹幕（先做违禁词检测，一二级弹窗拦截，三四级轻提示后仍发送）
  const handleSendComment = async (e) => {
    e.preventDefault();

    if (!currentUser) {
      setError("请先登录才能发送弹幕");
      return;
    }

    if (!newComment.trim()) return;

    setSending(true);
    setError("");

    try {
      const check = await voiceAPI.checkText(newComment);
      if (check.containsSensitive && check.matchedWords?.length) {
        const level = check.highestLevel || 1;
        if (level <= 2) {
          setSensitivePopup({ show: true, matchedWords: check.matchedWords });
          setSending(false);
          return;
        }
        showSensitiveToast(level, check.matchedWords);
      }

      const comment = await commentAPI.sendComment(streamId, newComment);
      socketRef.current.sendComment(comment);
      setNewComment("");
    } catch (err) {
      const msg = err.message || "";
      const matched = err.matchedWords;
      if (matched && matched.length) {
        setSensitivePopup({ show: true, matchedWords: matched });
      } else {
        setError(msg);
      }
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-message">{error}</div>
        <Link to="/" className="back-link">
          返回首页
        </Link>
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="error-container">
        <div className="error-message">直播不存在</div>
        <Link to="/" className="back-link">
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="watch-stream-container">
      <div className="watch-main">
        {/* 视频播放器区域 */}
        <div className="video-wrapper">
          <div className="video-container">
            {stream.liveUrl ? (
              <PlayLiveVideo url={stream.liveUrl} width="100%" height="100%" />
            ) : (
              <img
                src={`https://picsum.photos/1280/720?random=${streamId}`}
                alt={stream.title}
                className="stream-placeholder"
              />
            )}

            {/* 视频上方悬浮信息 */}
            <div className="video-overlay-top">
              <span className="live-badge">
                <span className="live-dot" />
                直播中
              </span>
            </div>
          </div>

          {/* 直播信息栏（视频下方） */}
          <div className="stream-info-bar">
            <div className="stream-info-left">
              <img
                src={stream.avatar || "https://picsum.photos/64/64?random=3"}
                alt={stream.username}
                className="streamer-avatar"
              />
              <div className="stream-info-text">
                <h1 className="stream-title">{stream.title}</h1>
                <div className="streamer-name">{stream.username}</div>
              </div>
              {currentUser && currentUser.id !== stream.user_id && (
                <button
                  className={`follow-btn ${isFollowing ? "following" : ""}`}
                  onClick={handleFollowToggle}
                  disabled={isLoadingFollow}
                >
                  {isLoadingFollow ? "..." : isFollowing ? "已关注" : "+ 关注"}
                </button>
              )}
            </div>
            {stream.description && (
              <div className="stream-description">
                <p>{stream.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* 右侧弹幕区 */}
        <aside className="chat-sidebar">
          <div className="chat-header">
            <span className="chat-title">弹幕</span>
            <span className="chat-count">{comments.length}</span>
          </div>

          <div ref={chatMessagesRef} className="chat-messages">
            {comments.length === 0 ? (
              <div className="no-comments">
                <p>还没有弹幕</p>
                <p className="no-comments-hint">发送第一条弹幕吧～</p>
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="chat-message">
                  <img
                    src={`https://picsum.photos/32/32?random=${comment.user_id || comment.id}`}
                    alt=""
                    className="chat-avatar"
                  />
                  <div className="chat-content">
                    <span className="chat-username">{comment.username}</span>
                    <span className="chat-text">{comment.content}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {currentUser ? (
            <form onSubmit={handleSendComment} className="chat-input-wrap">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="说点什么..."
                className="chat-input"
                disabled={sending}
              />
              <button
                type="submit"
                className="chat-send-btn"
                disabled={sending || !newComment.trim()}
              >
                发送
              </button>
            </form>
          ) : (
            <div className="chat-login-prompt">
              <Link to="/login" className="chat-login-link">登录</Link>
              <span>后可以发送弹幕</span>
            </div>
          )}
        </aside>
      </div>

      {/* 一二级违禁词弹窗（阻止发送） */}
      {sensitivePopup.show && (
        <div className="sensitive-popup-overlay" onClick={() => setSensitivePopup({ show: false, matchedWords: [] })}>
          <div className="sensitive-popup" onClick={(e) => e.stopPropagation()}>
            <div className="sensitive-popup-title">内容含有违禁词</div>
            <p className="sensitive-popup-desc">您的弹幕包含违规内容，请修改后再发送。</p>
            <div className="sensitive-popup-words">
              <span>命中词：</span>
              {sensitivePopup.matchedWords.map((w) => (
                <span key={w} className="sensitive-word-tag">{w}</span>
              ))}
            </div>
            <button type="button" className="sensitive-popup-btn" onClick={() => setSensitivePopup({ show: false, matchedWords: [] })}>
              知道了
            </button>
          </div>
        </div>
      )}

      {/* 三四级敏感词轻提示（不阻止发送） */}
      {sensitiveToast.show && (
        <div className={sensitiveToast.level <= 3 ? "sensitive-level3-toast" : "sensitive-level4-toast"}>
          {sensitiveToast.level <= 3
            ? "⚠ 弹幕含有敏感词，请注意用词规范"
            : "ℹ 弹幕含有预警词，建议注意用词"}
          {sensitiveToast.matchedWords?.length > 0 && (
            <span style={{ marginLeft: 8, opacity: 0.85 }}>
              （{sensitiveToast.matchedWords.join("、")}）
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default WatchStream;
