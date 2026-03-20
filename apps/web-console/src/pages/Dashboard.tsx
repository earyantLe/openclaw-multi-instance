import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Progress, Table, Tag, Space, Button, Typography } from 'antd';
import {
  CloudServerOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  BackupOutlined,
  UserOutlined
} from '@ant-design/icons';
import { useInstanceStore, Instance } from '../store/instanceStore';
import { useAuthStore } from '../store/authStore';
import dayjs from 'dayjs';

const { Title } = Typography;

const Dashboard: React.FC = () => {
  const { instances, fetchInstances } = useInstanceStore();
  const { user } = useAuthStore();
  const [stats, setStats] = useState({
    total: 0,
    running: 0,
    stopped: 0,
    error: 0
  });

  useEffect(() => {
    fetchInstances();
  }, []);

  useEffect(() => {
    setStats({
      total: instances.length,
      running: instances.filter((i) => i.status === 'running').length,
      stopped: instances.filter((i) => i.status === 'stopped').length,
      error: instances.filter((i) => i.status === 'error').length
    });
  }, [instances]);

  const instanceColumns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: Instance['status']) => {
        const colorMap: Record<string, string> = {
          running: 'success',
          stopped: 'default',
          error: 'error',
          starting: 'processing',
          stopping: 'processing'
        };
        return <Tag color={colorMap[status]}>{status}</Tag>;
      }
    },
    {
      title: '端口',
      dataIndex: 'port',
      key: 'port',
      render: (port: number) => `:${port}`
    },
    {
      title: 'Profile',
      dataIndex: 'profile',
      key: 'profile'
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (createdAt: string) => dayjs(createdAt).format('YYYY-MM-DD HH:mm:ss')
    }
  ];

  return (
    <div>
      <Title level={2}>仪表盘</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总实例数"
              value={stats.total}
              prefix={<CloudServerOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="运行中"
              value={stats.running}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="已停止"
              value={stats.stopped}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="异常"
              value={stats.error}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="资源使用">
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>CPU 使用率</div>
              <Progress percent={35} status="active" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>内存使用率</div>
              <Progress percent={58} status="active" />
            </div>
            <div>
              <div style={{ marginBottom: 8 }}>磁盘使用率</div>
              <Progress percent={42} status="active" />
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="租户信息">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <strong>租户 ID:</strong> {user?.tenantId || 'N/A'}
              </div>
              <div>
                <strong>用户名:</strong> {user?.name || 'N/A'}
              </div>
              <div>
                <strong>邮箱:</strong> {user?.email || 'N/A'}
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card title="最近实例">
        <Table
          columns={instanceColumns}
          dataSource={instances.slice(0, 5)}
          rowKey="id"
          pagination={false}
        />
      </Card>
    </div>
  );
};

export default Dashboard;
