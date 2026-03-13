/**
 * 直播系统 - 后台管理
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Login from './pages/Login';
import Layout from './components/Layout';
import List from './pages/Sensitive/List';
import Log from './pages/Sensitive/Log';
import WhiteList from './pages/Sensitive/WhiteList';
import { authAPI } from './services/api';

const PrivateRoute = ({ children }) => {
  if (!authAPI.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <Layout>{children}</Layout>;
};

const App = () => (
  <ConfigProvider locale={zhCN}>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/sensitive/list"
          element={
            <PrivateRoute>
              <List />
            </PrivateRoute>
          }
        />
        <Route
          path="/sensitive/log"
          element={
            <PrivateRoute>
              <Log />
            </PrivateRoute>
          }
        />
        <Route
          path="/sensitive/whitelist"
          element={
            <PrivateRoute>
              <WhiteList />
            </PrivateRoute>
          }
        />
        <Route path="/" element={<Navigate to="/sensitive/list" replace />} />
        <Route path="*" element={<Navigate to="/sensitive/list" replace />} />
      </Routes>
    </BrowserRouter>
  </ConfigProvider>
);

export default App;
