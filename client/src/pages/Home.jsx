// 首页
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { liveAPI, authAPI } from '../services/api';

const Home = () => {
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const currentUser = authAPI.getCurrentUser();
  
  useEffect(() => {
    const fetchStreams = async () => {
      try {
        const data = await liveAPI.getLiveStreams();
        setStreams(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchStreams();
    
    // 定时刷新直播列表
    const interval = setInterval(fetchStreams, 30000);
    
    return () => clearInterval(interval);
  }, []);
  
  if (loading) {
    return <div className="loading">加载中...</div>;
  }
  
  if (error) {
    return <div className="error-message">{error}</div>;
  }
  
  return (
    <div className="home-container">
      {/* Hero 区域 */}
      <div className="home-hero">
        <h2 className="home-hero-title">发现精彩直播</h2>
        <p className="home-hero-desc">与主播实时互动，分享精彩瞬间</p>
        <div className="home-quick-links">
          <Link to="/create" className="home-quick-link">📺 开播</Link>
          <Link to="/follows" className="home-quick-link">❤️ 我的关注</Link>
        </div>
      </div>

      {/* 直播列表 */}
      <div className="home-section-title">
        <h1>正在直播</h1>
        <span className="home-section-badge">
          {streams.length > 0 ? `${streams.length} 个直播间` : '暂无直播'}
        </span>
      </div>
      
      {streams.length === 0 ? (
        <div className="no-streams">
          <div className="no-streams-icon">📡</div>
          <p>当前没有正在进行的直播</p>
          <p>快来成为第一个开播的主播吧～</p>
          <Link to="/create" className="create-stream-btn">✨ 立即开播</Link>
        </div>
      ) : (
        <div className="streams-grid">
          {streams.map(stream => (
            <div key={stream.id} className="stream-card">
              <Link to={`/watch/${stream.id}`}>
                <div className="stream-thumbnail">
                  <img 
                    src={stream.thumbnail || 'https://picsum.photos/400/225?random=1'} 
                    alt={stream.title}
                  />
                  <div className="live-badge">直播中</div>
                </div>
                <div className="stream-info">
                  <h3 className="stream-title">{stream.title}</h3>
                  <div className="stream-author">
                    <img 
                      src={stream.avatar || 'https://picsum.photos/32/32?random=2'} 
                      alt={stream.username}
                      className="author-avatar"
                    />
                    <span>{stream.username}</span>
                  </div>
                </div>
              </Link>
              {currentUser && stream.user_id === currentUser.id && (
                <Link to={`/streamer/${stream.id}`} className="stream-manage-link">管理直播</Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Home;
