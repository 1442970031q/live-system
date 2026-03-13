/**
 * 后台布局：侧边栏 + 顶栏
 */
import React from 'react';
import { Layout as AntLayout, Menu, Button, Dropdown } from 'antd';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, SafetyCertificateOutlined, FileTextOutlined, TeamOutlined } from '@ant-design/icons';
import { authAPI } from '../services/api';

const { Header, Sider, Content } = AntLayout;

const Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = React.useState(false);

  const handleLogout = () => {
    authAPI.logout();
    navigate('/login');
    window.location.reload();
  };

  const menuItems = [
    {
      key: '/sensitive/list',
      icon: <SafetyCertificateOutlined />,
      label: <Link to="/sensitive/list">敏感词列表</Link>,
    },
    {
      key: '/sensitive/log',
      icon: <FileTextOutlined />,
      label: <Link to="/sensitive/log">违规日志</Link>,
    },
    {
      key: '/sensitive/whitelist',
      icon: <TeamOutlined />,
      label: <Link to="/sensitive/whitelist">黑白名单</Link>,
    },
  ];

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed} theme="dark">
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          {collapsed ? '管理' : '直播系统后台'}
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={menuItems} />
      </Sider>
      <AntLayout>
        <Header style={{ padding: '0 24px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)} />
          <Dropdown
            menu={{
              items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout }],
            }}
          >
            <Button type="text">{authAPI.getCurrentUser()?.username || '管理员'}</Button>
          </Dropdown>
        </Header>
        <Content style={{ margin: 24, background: '#fff', padding: 24, minHeight: 280 }}>{children}</Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;
