import React from 'react';
import { Card, Form, Input, Button, Select, Switch, Divider, Typography, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const Settings: React.FC = () => {
  const [form] = Form.useForm();

  const handleSave = async (values: any) => {
    // TODO: Implement API call
    // await axios.put('/api/settings', values);
    message.success('设置保存成功！');
  };

  return (
    <div>
      <Title level={2}>系统设置</Title>

      <Card title="租户设置" style={{ marginBottom: 24 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{
            tenantName: 'My Organization',
            plan: 'professional',
            maxInstances: 50
          }}
        >
          <Form.Item name="tenantName" label="组织名称">
            <Input />
          </Form.Item>
          <Form.Item name="plan" label="套餐计划">
            <Select>
              <Select.Option value="community">Community (免费)</Select.Option>
              <Select.Option value="professional">Professional ($99/月)</Select.Option>
              <Select.Option value="enterprise">Enterprise (定制)</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="maxInstances" label="最大实例数">
            <Input disabled />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
              保存设置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="实例默认配置" style={{ marginBottom: 24 }}>
        <Form
          initialValues={{
            defaultPort: 18789,
            autoStart: true,
            autoBackup: false
          }}
        >
          <Form.Item name="defaultPort" label="默认起始端口">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="autoStart" label="自动启动实例" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="autoBackup" label="自动备份" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<SaveOutlined />}>
              保存配置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="告警设置">
        <Form
          initialValues={{
            emailAlerts: true,
            slackWebhook: '',
            cpuThreshold: 90,
            memoryThreshold: 90
          }}
        >
          <Form.Item name="emailAlerts" label="邮件告警" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="slackWebhook" label="Slack Webhook">
            <Input placeholder="https://hooks.slack.com/..." />
          </Form.Item>
          <Form.Item name="cpuThreshold" label="CPU 告警阈值 (%)">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="memoryThreshold" label="内存告警阈值 (%)">
            <Input type="number" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<SaveOutlined />}>
              保存告警设置
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Settings;
