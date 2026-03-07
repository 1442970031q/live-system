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
      <h1>正在直播</h1>
      
      {streams.length === 0 ? (
        <div className="no-streams">
          <p>当前没有正在进行的直播</p>
          <Link to="/create" className="create-stream-btn">创建直播</Link>
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
