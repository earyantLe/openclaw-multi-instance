import React from 'react';
import { Layout, Button, Space, Dropdown, Avatar, theme } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, BellOutlined, LogoutOutlined } from '@ant-design/icons';
import { useAuthStore } from '../store/authStore';

const { Header } = Layout;

interface HeaderProps {
  collapsed: boolean;
  onToggle: () => void;
}

const AppHeader: React.FC<HeaderProps> = ({ collapsed, onToggle }) => {
  const { token } = theme.useToken();
  const { user, logout } = useAuthStore();

  const menuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: logout
    }
  ];

  return (
    <Header
      style={{
        padding: `0 ${token.paddingLG}px`,
        background: token.colorBgContainer,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
    >
      <Button
        type="text"
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={onToggle}
        style={{
          fontSize: 16,
          width: 64,
          height: 64
        }}
      />
      <Space size="large">
        <Button type="text" icon={<BellOutlined />} />
        <Dropdown menu={{ items: menuItems }} placement="bottomRight" arrow>
          <Space style={{ cursor: 'pointer' }}>
            <Avatar style={{ backgroundColor: '#1890ff' }}>
              {user?.name?.charAt(0) || 'U'}
            </Avatar>
            {user?.name || 'User'}
          </Space>
        </Dropdown>
      </Space>
    </Header>
  );
};

export default AppHeader;
