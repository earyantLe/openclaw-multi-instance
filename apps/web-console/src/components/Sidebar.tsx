import React from 'react';
import { Layout, Menu, theme } from 'antd';
import {
  DashboardOutlined,
  CloudServerOutlined,
  BackupOutlined,
  TeamOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

const { Sider } = Layout;

interface SidebarProps {
  collapsed: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken();

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '仪表盘'
    },
    {
      key: '/instances',
      icon: <CloudServerOutlined />,
      label: '实例管理'
    },
    {
      key: '/backups',
      icon: <BackupOutlined />,
      label: '备份管理'
    },
    {
      key: '/users',
      icon: <TeamOutlined />,
      label: '用户管理'
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置'
    }
  ];

  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      breakpoint="lg"
      collapsedWidth="80"
      onBreakpoint={(broken) => {
        console.log(broken);
      }}
      onCollapse={(collapsed, type) => {
        console.log(collapsed, type);
      }}
      style={{
        background: colorBgContainer,
        borderRadius: borderRadiusLG
      }}
    >
      <div
        style={{
          height: 32,
          margin: 16,
          background: 'rgba(255, 255, 255, 0.2)',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 'bold',
          fontSize: collapsed ? 12 : 16
        }}
      >
        {collapsed ? 'OC' : 'OpenClaw'}
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
      />
    </Sider>
  );
};

export default Sidebar;
