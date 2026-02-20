// 主应用组件
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import CreateStream from './pages/CreateStream';
import WatchStream from './pages/WatchStream';
import StreamerPage from './pages/StreamerPage';
import Follows from './pages/Follows';
import './styles/App.css';

const App = () => {
  return (
    <Router>
      <div className="app-container">
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
    </Router>
  );
};

export default App;
