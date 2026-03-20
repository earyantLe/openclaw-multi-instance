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
  message,
  Typography,
  Popconfirm,
  Progress
} from 'antd';
import {
  PlusOutlined,
  DownloadOutlined,
  DeleteOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title } = Typography;

interface Backup {
  id: string;
  tenantId: string;
  instanceId: string;
  name: string;
  path: string;
  size: number;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
}

const Backups: React.FC = () => {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchBackups = async () => {
    setLoading(true);
    // TODO: Implement API call
    // const response = await axios.get('/api/backups');
    // setBackups(response.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateBackup = async (values: any) => {
    try {
      // TODO: Implement API call
      // await axios.post(`/api/instances/${values.instanceId}/backup`, { name: values.name });
      message.success('备份创建成功！');
      setIsCreateModalOpen(false);
      form.resetFields();
      fetchBackups();
    } catch (error: any) {
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const handleDeleteBackup = async (name: string) => {
    try {
      // TODO: Implement API call
      // await axios.delete(`/api/backups/${name}`);
      message.success('备份已删除');
      fetchBackups();
    } catch (error: any) {
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleRestoreBackup = async (name: string) => {
    try {
      // TODO: Implement API call
      // await axios.post(`/api/backups/${name}/restore`);
      message.success('备份还原成功！');
      fetchBackups();
    } catch (error: any) {
      message.error(error.response?.data?.error || '还原失败');
    }
  };

  const columns = [
    {
      title: '备份名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '实例 ID',
      dataIndex: 'instanceId',
      key: 'instanceId'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: Backup['status']) => {
        const colorMap: Record<string, string> = {
          completed: 'success',
          pending: 'processing',
          failed: 'error'
        };
        return <Tag color={colorMap[status]}>{status}</Tag>;
      }
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      render: (size: number) => `${(size / 1024 / 1024).toFixed(2)} MB`
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
      render: (_: any, record: Backup) => (
        <Space>
          <Button
            type="link"
            icon={<ReloadOutlined />}
            onClick={() => handleRestoreBackup(record.name)}
          >
            还原
          </Button>
          <Button type="link" icon={<DownloadOutlined />}>
            下载
          </Button>
          <Popconfirm
            title="确定删除此备份吗？"
            onConfirm={() => handleDeleteBackup(record.name)}
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
        <Title level={2}>备份管理</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setIsCreateModalOpen(true)}
        >
          创建备份
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={backups}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="创建备份"
        open={isCreateModalOpen}
        onCancel={() => {
          setIsCreateModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreateBackup}>
          <Form.Item
            name="instanceId"
            label="实例 ID"
            rules={[{ required: true, message: '请选择实例' }]}
          >
            <Input placeholder="实例 ID" />
          </Form.Item>
          <Form.Item name="name" label="备份名称">
            <Input placeholder="可选，默认自动生成" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Backups;
