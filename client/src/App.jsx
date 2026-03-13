// 主应用组件
import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import CreateStream from './pages/CreateStream';
import WatchStream from './pages/WatchStream';
import StreamerPage from './pages/StreamerPage';
import Follows from './pages/Follows';
import './styles/App.css';

const AppContent = () => {
  const location = useLocation();
  const isStreamerPage = location.pathname.startsWith('/streamer/');

  return (
    <div className={`app-container ${isStreamerPage ? 'app-streamer-mode' : ''}`}>
      <Navbar />
      <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/create" element={<CreateStream />} />
            <Route path="/watch/:streamId" element={<WatchStream />} />
            <Route path="/streamer/:streamId" element={<StreamerPage />} />
            <Route path="/follows" element={<Follows />} />
          </Routes>
        </main>
      </div>
  );
};

const App = () => (
  <Router>
    <AppContent />
  </Router>
);

export default App;
