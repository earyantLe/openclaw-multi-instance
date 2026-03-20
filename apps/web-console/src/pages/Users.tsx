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
  Select,
  message,
  Typography,
  Popconfirm
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title } = Typography;

interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Date;
}

const Users: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchUsers = async () => {
    setLoading(true);
    // TODO: Implement API call
    // const response = await axios.get('/api/users');
    // setUsers(response.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (values: any) => {
    try {
      // TODO: Implement API call
      // await axios.post('/api/users', values);
      message.success('用户创建成功！');
      setIsCreateModalOpen(false);
      form.resetFields();
      fetchUsers();
    } catch (error: any) {
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      // TODO: Implement API call
      // await axios.delete(`/api/users/${id}`);
      message.success('用户已删除');
      fetchUsers();
    } catch (error: any) {
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email'
    },
    {
      title: '角色',
      dataIndex: 'roles',
      key: 'roles',
      render: (roles: string[]) => (
        <Space>
          {roles.map((role) => (
            <Tag key={role} color="blue">
              {role}
            </Tag>
          ))}
        </Space>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: User['status']) => {
        const colorMap: Record<string, string> = {
          active: 'success',
          inactive: 'default',
          suspended: 'error'
        };
        return <Tag color={colorMap[status]}>{status}</Tag>;
      }
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
      render: (_: any, record: User) => (
        <Space>
          <Button type="link" icon={<EditOutlined />}>
            编辑
          </Button>
          <Popconfirm
            title="确定删除此用户吗？"
            onConfirm={() => handleDeleteUser(record.id)}
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
        <Title level={2}>用户管理</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setIsCreateModalOpen(true)}
        >
          创建用户
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title="创建用户"
        open={isCreateModalOpen}
        onCancel={() => {
          setIsCreateModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreateUser}>
          <Form.Item
            name="name"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="用户名" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input placeholder="邮箱" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="密码" />
          </Form.Item>
          <Form.Item name="roles" label="角色">
            <Select mode="multiple" placeholder="选择角色">
              <Select.Option value="admin">管理员</Select.Option>
              <Select.Option value="member">成员</Select.Option>
              <Select.Option value="viewer">观察者</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Users;
