import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Space,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Typography,
  Popconfirm
} from 'antd';
import {
  PlusOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  DeleteOutlined,
  CopyOutlined
} from '@ant-design/icons';
import { useInstanceStore, Instance } from '../store/instanceStore';
import dayjs from 'dayjs';

const { Title } = Typography;

const Instances: React.FC = () => {
  const {
    instances,
    loading,
    fetchInstances,
    createInstance,
    startInstance,
    stopInstance,
    restartInstance,
    deleteInstance
  } = useInstanceStore();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchInstances();
  }, []);

  const handleCreate = async (values: any) => {
    try {
      await createInstance(values);
      message.success('实例创建成功！');
      setIsCreateModalOpen(false);
      form.resetFields();
      fetchInstances();
    } catch (error: any) {
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const handleCopyProfileCommand = (profile: string) => {
    const command = `openclaw --profile ${profile} agent -m "你好"`;
    navigator.clipboard.writeText(command);
    message.success('命令已复制到剪贴板');
  };

  const columns = [
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
      render: (port: number) => (
        <a href={`http://localhost:${port}`} target="_blank" rel="noreferrer">
          :{port}
        </a>
      )
    },
    {
      title: 'Profile',
      dataIndex: 'profile',
      key: 'profile',
      render: (profile: string) => (
        <Space>
          <code>{profile}</code>
          <Button
            type="text"
            icon={<CopyOutlined />}
            onClick={() => handleCopyProfileCommand(profile)}
          />
        </Space>
      )
    },
    {
      title: '工作空间',
      dataIndex: 'workspace',
      key: 'workspace',
      ellipsis: true
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (createdAt: string) => dayjs(createdAt).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Instance) => (
        <Space>
          {record.status !== 'running' ? (
            <Button
              type="link"
              icon={<PlayCircleOutlined />}
              onClick={() => startInstance(record.id)}
            >
              启动
            </Button>
          ) : (
            <Button
              type="link"
              icon={<StopOutlined />}
              danger
              onClick={() => stopInstance(record.id)}
            >
              停止
            </Button>
          )}
          <Button
            type="link"
            icon={<ReloadOutlined />}
            onClick={() => restartInstance(record.id)}
          >
            重启
          </Button>
          <Popconfirm
            title="确定删除此实例吗？"
            onConfirm={() => deleteInstance(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24
        }}
      >
        <Title level={2}>实例管理</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setIsCreateModalOpen(true)}
        >
          创建实例
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={instances}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="创建实例"
        open={isCreateModalOpen}
        onCancel={() => {
          setIsCreateModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="name"
            label="实例名称"
            rules={[{ required: true, message: '请输入实例名称' }]}
          >
            <Input placeholder="例如：instance-api" />
          </Form.Item>
          <Form.Item name="port" label="端口号">
            <InputNumber
              style={{ width: '100%' }}
              placeholder="默认自动分配"
              min={1024}
              max={65535}
            />
          </Form.Item>
          <Form.Item name="workspace" label="工作空间">
            <Input placeholder="例如：~/projects/my-api" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Instances;
