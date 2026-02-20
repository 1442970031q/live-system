// 主播页面
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authAPI, liveAPI } from '../services/api';

const StreamerPage = () => {
  const { streamId } = useParams();
  const [stream, setStream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEnding, setIsEnding] = useState(false);
  const navigate = useNavigate();
  const currentUser = authAPI.getCurrentUser();
  
  useEffect(() => {
    // 检查用户是否已登录
    if (!authAPI.isAuthenticated()) {
      navigate('/login');
      return;
    }
    
    const fetchStream = async () => {
      try {
        const data = await liveAPI.getStream(streamId);
        
        // 检查当前用户是否是直播的创建者
        if (data.user_id !== currentUser.id) {
          throw new Error('你没有权限访问此页面');
        }
        
        setStream(data);
      } catch (err) {
        setError(err.message);
        navigate('/');
      } finally {
        setLoading(false);
      }
    };
    
    fetchStream();
  }, [streamId, currentUser, navigate]);
  
  const handleEndStream = async () => {
    if (window.confirm('确定要结束直播吗？')) {
      setIsEnding(true);
      
      try {
        await liveAPI.endStream(streamId);
        navigate('/');
      } catch (err) {
        setError(err.message);
        setIsEnding(false);
      }
    }
  };
  
  if (loading) {
    return <div className="loading">加载中...</div>;
  }
  
  if (error) {
    return <div className="error-message">{error}</div>;
  }
  
  if (!stream) {
    return <div className="error-message">直播不存在</div>;
  }
  
  return (
    <div className="streamer-container">
      <div className="streamer-header">
        <h1>你的直播</h1>
        <button 
          className="end-stream-btn"
          onClick={handleEndStream}
          disabled={isEnding}
        >
          {isEnding ? '结束中...' : '结束直播'}
        </button>
      </div>
      
      <div className="streamer-info">
        <h2>{stream.title}</h2>
        <p>{stream.description}</p>
        <p>直播ID: {stream.id}</p>
        <p>开始时间: {new Date(stream.started_at).toLocaleString()}</p>
      </div>
      
      <div className="streamer-preview">
        <h3>直播预览</h3>
        <div className="stream-preview-placeholder">
          {/* 这里应该是主播的视频预览 */}
          <p>请在直播软件中设置推流地址</p>
          <p>示例推流地址: rtmp://your-server-ip/live/{streamId}</p>
        </div>
      </div>
    </div>
  );
};

export default StreamerPage;
