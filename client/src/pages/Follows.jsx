// 关注页面
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI, userAPI, liveAPI } from '../services/api';

const Follows = () => {
  const [follows, setFollows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liveStreams, setLiveStreams] = useState({});
  const navigate = useNavigate();
  
  useEffect(() => {
    // 检查用户是否已登录
    if (!authAPI.isAuthenticated()) {
      navigate('/login');
      return;
    }
    
    const fetchFollows = async () => {
      try {
        const data = await userAPI.getFollows();
        setFollows(data);
        
        // 获取所有正在直播的流
        const streams = await liveAPI.getLiveStreams();
        
        // 创建一个映射：用户ID -> 直播信息
        const streamsMap = {};
        streams.forEach(stream => {
          streamsMap[stream.user_id] = stream;
        });
        
        setLiveStreams(streamsMap);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchFollows();
  }, [navigate]);
  
  const handleUnfollow = async (userId) => {
    if (window.confirm('确定要取消关注吗？')) {
      try {
        await userAPI.unfollowUser(userId);
        setFollows(follows.filter(follow => follow.id !== userId));
      } catch (err) {
        setError(err.message);
      }
    }
  };
  
  if (loading) {
    return <div className="loading">加载中...</div>;
  }
  
  if (error) {
    return <div className="error-message">{error}</div>;
  }
  
  return (
    <div className="follows-container">
      <h1>我的关注</h1>
      
      {follows.length === 0 ? (
        <div className="no-follows">
          <p>你还没有关注任何人</p>
          <Link to="/" className="browse-link">浏览直播</Link>
        </div>
      ) : (
        <div className="follows-list">
          {follows.map(user => (
            <div key={user.id} className="follow-item">
              <img 
                src={user.avatar || 'https://picsum.photos/64/64?random=4'} 
                alt={user.username}
                className="follow-avatar"
              />
              <div className="follow-info">
                <h3 className="follow-username">{user.username}</h3>
                {liveStreams[user.id] ? (
                  <Link 
                    to={`/watch/${liveStreams[user.id].id}`} 
                    className="watching-link"
                  >
                    正在直播：{liveStreams[user.id].title}
                  </Link>
                ) : (
                  <span className="not-live">当前未直播</span>
                )}
              </div>
              <button 
                className="unfollow-btn"
                onClick={() => handleUnfollow(user.id)}
              >
                取消关注
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Follows;
