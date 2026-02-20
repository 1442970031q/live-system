// 观看直播页面
import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  authAPI,
  liveAPI,
  commentAPI,
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
  const [isLoading, setIsLoading] = useState(false);
  const commentsEndRef = useRef(null);
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

  // 自动滚动到最新弹幕
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  // 发送弹幕
  const handleSendComment = async (e) => {
    e.preventDefault();

    if (!currentUser) {
      setError("请先登录才能发送弹幕");
      return;
    }

    if (!newComment.trim()) return;

    setSending(true);

    try {
      const comment = await commentAPI.sendComment(streamId, newComment);
      // 通过WebSocket发送，由服务器广播，不需要自己添加到列表
      socketRef.current.sendComment(comment);
      setNewComment("");
    } catch (err) {
      setError(err.message);
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
      <div className="stream-player">
        {/* 视频播放器 */}
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

          <div className="live-indicator">直播中</div>
        </div>

        <div className="stream-details">
          <h1 className="stream-title">{stream.title}</h1>

          <div className="stream-author">
            <img
              src={stream.avatar || "https://picsum.photos/64/64?random=3"}
              alt={stream.username}
              className="author-avatar"
            />
            <div className="author-info">
              <span className="author-name">{stream.username}</span>
            </div>

            {currentUser && currentUser.id !== stream.user_id && (
              <button
                className={`follow-btn ${isFollowing ? "following" : ""}`}
                onClick={handleFollowToggle}
                disabled={isLoadingFollow}
              >
                {isLoadingFollow ? "处理中..." : isFollowing ? "取消" : "关注"}
              </button>
            )}
          </div>

          <div className="stream-description">
            <p>{stream.description}</p>
          </div>
        </div>
      </div>

      <div className="comments-section">
        <h2>弹幕区</h2>

        <div className="comments-container">
          {comments.length === 0 ? (
            <div className="no-comments">还没有弹幕，发送第一条弹幕吧！</div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="comment">
                <div className="comment-username">{comment.username}</div>
                <div className="comment-content">{comment.content}</div>
              </div>
            ))
          )}
          <div ref={commentsEndRef} />
        </div>

        {currentUser ? (
          <form onSubmit={handleSendComment} className="comment-form">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="发送弹幕..."
              className="comment-input"
              disabled={sending}
            />
            <button
              type="submit"
              className="send-comment-btn"
              disabled={sending || !newComment.trim()}
            >
              发送
            </button>
          </form>
        ) : (
          <div className="login-prompt">
            <Link to="/login" className="login-link">
              登录
            </Link>{" "}
            后可以发送弹幕
          </div>
        )}
      </div>
    </div>
  );
};

export default WatchStream;
