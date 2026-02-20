// 导航栏组件
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';

const Navbar = () => {
  const navigate = useNavigate();
  const currentUser = authAPI.getCurrentUser();
  const isAuthenticated = authAPI.isAuthenticated();
  
  const handleLogout = () => {
    authAPI.logout();
    navigate('/login');
    window.location.reload();
  };
  
  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <Link to="/">LiveStream</Link>
      </div>
      
      <div className="navbar-links">
        <Link to="/" className="nav-link">首页</Link>
        
        {isAuthenticated ? (
          <>
            <Link to="/create" className="nav-link">开播</Link>
            <Link to="/follows" className="nav-link">关注</Link>
            <div className="user-menu">
              <span>{currentUser?.username}</span>
              <button onClick={handleLogout} className="logout-btn">退出登录</button>
            </div>
          </>
        ) : (
          <>
            <Link to="/login" className="nav-link">登录</Link>
            <Link to="/register" className="nav-link">注册</Link>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
