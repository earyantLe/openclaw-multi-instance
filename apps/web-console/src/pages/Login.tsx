import React, { useState } from 'react';
import { Form, Input, Button, Card, message, Typography } from 'antd';
import { UserOutlined, LockOutlined, CloudServerOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const { Title, Text } = Typography;

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      await login(values.email, values.password, values.tenantId);
      message.success('登录成功！');
      navigate('/dashboard');
    } catch (error: any) {
      message.error(error.response?.data?.error || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}
    >
      <Card
        style={{
          width: 400,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <CloudServerOutlined style={{ fontSize: 48, color: '#1890ff' }} />
          <Title level={2} style={{ marginTop: 16 }}>
            OpenClaw Enterprise
          </Title>
          <Text type="secondary">多实例管理系统</Text>
        </div>

        <Form onFinish={onFinish} size="large">
          <Form.Item
            name="tenantId"
            rules={[{ required: true, message: '请输入租户 ID' }]}
          >
            <Input
              prefix={<CloudServerOutlined />}
              placeholder="租户 ID"
              disabled={loading}
            />
          </Form.Item>

          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="邮箱"
              disabled={loading}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              disabled={loading}
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            还没有账号？联系管理员创建
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default Login;
