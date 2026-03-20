import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout, theme } from 'antd';
import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Instances from './pages/Instances';
import Backups from './pages/Backups';
import Users from './pages/Users';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { useAuthStore } from './store/authStore';

const { Content } = Layout;

function App() {
  const { token } = theme.useToken();
  const { isAuthenticated } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sidebar collapsed={collapsed} />
      <Layout>
        <Header collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <Content
          style={{
            margin: token.marginLG,
            padding: token.paddingLG,
            minHeight: 280,
            background: token.colorBgContainer,
            borderRadius: token.borderRadiusLG
          }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/instances" element={<Instances />} />
            <Route path="/backups" element={<Backups />} />
            <Route path="/users" element={<Users />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
