# OpenClaw 监控与告警系统

## 概述

监控服务提供实时的资源使用监控、告警规则管理和 Prometheus 指标导出功能。

## 核心功能

### 1. 资源监控

监控每个实例的：
- **CPU 使用率** - 进程 CPU 占用百分比
- **内存使用率** - 进程内存占用百分比
- **磁盘使用量** - 工作空间磁盘占用（字节）
- **网络 I/O** - 接收/发送字节数

### 2. 告警系统

#### 告警规则
- 支持多种资源类型：`cpu`, `memory`, `disk`, `instance_status`
- 支持多种条件类型：`greater_than`, `less_than`, `equals`, `greater_than_or_equal`, `less_than_or_equal`
- 持续时间阈值：避免瞬时波动触发告警
- 严重级别：`info`, `warning`, `critical`

#### 默认告警规则
| 规则名称 | 资源类型 | 条件 | 阈值 | 持续时间 | 严重级别 |
|---------|---------|------|------|---------|---------|
| 高 CPU 使用率 | cpu | > | 80% | 5 分钟 | warning |
| 严重高 CPU 使用率 | cpu | > | 95% | 2 分钟 | critical |
| 高内存使用率 | memory | > | 80% | 5 分钟 | warning |
| 高磁盘使用率 | disk | > | 5GB | 10 分钟 | warning |
| 实例异常停止 | instance_status | = | error | 0 | critical |

#### 告警生命周期
```
firing → acknowledged → resolved
```

### 3. Prometheus 集成

#### 指标端点
```
GET /api/metrics
Content-Type: text/plain
```

#### 指标示例
```prometheus
# HELP openclaw_instance_cpu CPU usage percentage
# TYPE openclaw_instance_cpu gauge
openclaw_instance_cpu{instance_id="xxx",instance_name="my-instance"} 45.2 1679529600000

# HELP openclaw_instance_memory Memory usage percentage
# TYPE openclaw_instance_memory gauge
openclaw_instance_memory{instance_id="xxx",instance_name="my-instance"} 62.5 1679529600000

# HELP openclaw_instance_disk Disk usage in bytes
# TYPE openclaw_instance_disk gauge
openclaw_instance_disk{instance_id="xxx",instance_name="my-instance"} 2147483648 1679529600000

# HELP openclaw_service_memory_rss Service memory RSS
# TYPE openclaw_service_memory_rss gauge
openclaw_service_memory_rss 52428800 1679529600000
```

## API 端点

### 资源监控

#### 获取实例资源使用
```bash
GET /api/instances/:id/resources
Authorization: Bearer <token>

Response:
{
  "instanceId": "inst_xxx",
  "cpu": 45.2,
  "memory": 62.5,
  "disk": 2147483648,
  "network": {
    "rx": 1024000,
    "tx": 512000
  },
  "timestamp": "2026-03-23T10:00:00.000Z"
}
```

#### 获取资源历史
```bash
GET /api/instances/:id/resources/history
Authorization: Bearer <token>

Response: ResourceUsage[]
```

#### 获取租户资源统计
```bash
GET /api/resources/stats
Authorization: Bearer <token>

Response:
{
  "summary": {
    "totalInstances": 5,
    "runningInstances": 3,
    "totalCPU": 125.6,
    "totalMemory": 180.2,
    "totalDisk": 10737418240,
    "avgCPU": 25.12,
    "avgMemory": 36.04
  },
  "instances": [...]
}
```

#### 获取资源配额
```bash
GET /api/resources/limits
Authorization: Bearer <token>

Response:
{
  "plan": "professional",
  "limits": {
    "maxInstances": 10,
    "maxCPU": 400,
    "maxMemory": 50,
    "maxDisk": 200
  },
  "usage": {
    "instances": 3,
    "cpu": 75.5,
    "memory": 18.2,
    "disk": 45.8
  },
  "quota": {
    "instancesUsed": 3,
    "instancesRemaining": 7
  }
}
```

### 告警规则管理

#### 获取告警规则列表
```bash
GET /api/alert-rules
Authorization: Bearer <token>

Response: AlertRule[]
```

#### 创建告警规则
```bash
POST /api/alert-rules
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "自定义 CPU 告警",
  "description": "CPU 超过 90% 持续 3 分钟",
  "resourceType": "cpu",
  "conditionType": "greater_than",
  "threshold": 90,
  "durationSeconds": 180,
  "severity": "warning",
  "webhookUrl": "https://hooks.slack.com/xxx"
}
```

#### 删除告警规则
```bash
DELETE /api/alert-rules/:id
Authorization: Bearer <token>
```

### 告警管理

#### 获取告警列表
```bash
GET /api/alerts?status=firing&severity=critical&limit=50
Authorization: Bearer <token>

Response: Alert[]
```

#### 确认告警
```bash
POST /api/alerts/:id/acknowledge
Authorization: Bearer <token>

Response: { "status": "success" }
```

#### 解决告警
```bash
POST /api/alerts/:id/resolve
Authorization: Bearer <token>

Response: { "status": "success" }
```

### Prometheus 指标

#### 获取指标
```bash
GET /api/metrics

Response: text/plain
```

## 配置

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `MONITOR_PORT` | 3003 | 监控服务端口 |
| `ALERT_EVALUATION_INTERVAL` | 60 | 告警评估间隔（秒） |
| `DB_HOST` | localhost | 数据库主机 |
| `DB_PORT` | 5432 | 数据库端口 |
| `DB_NAME` | openclaw | 数据库名称 |
| `DB_USER` | postgres | 数据库用户 |
| `DB_PASSWORD` | postgres | 数据库密码 |

## 数据库迁移

执行迁移脚本创建监控和告警表：

```bash
psql -U postgres -d openclaw -f packages/db/migrations/003_add_monitoring_and_alerting.sql
```

### 创建的表

1. **resource_metrics** - 历史资源使用数据
2. **alert_rules** - 告警规则定义
3. **alerts** - 触发的告警实例

## 告警通知

### 支持的通知渠道

- **Webhook** - HTTP POST 到指定 URL
- **Email** - 待实现
- **Slack** - 通过 Webhook 支持
- **Discord** - 通过 Webhook 支持

### Webhook 负载示例

```json
{
  "alert": {
    "id": "alert_xxx",
    "ruleId": "rule_xxx",
    "instanceId": "inst_xxx",
    "severity": "warning",
    "title": "高 CPU 使用率 - my-instance",
    "message": "实例 \"my-instance\" 触发告警：高 CPU 使用率。当前值：85.5, 阈值：80",
    "metricValue": 85.5,
    "thresholdValue": 80,
    "createdAt": "2026-03-23T10:00:00.000Z"
  },
  "instance": {
    "id": "inst_xxx",
    "name": "my-instance"
  },
  "timestamp": "2026-03-23T10:00:00.000Z"
}
```

## Grafana 集成

### Prometheus 配置

```yaml
scrape_configs:
  - job_name: 'openclaw-monitor'
    static_configs:
      - targets: ['localhost:3003']
    metrics_path: '/api/metrics'
```

### 推荐仪表盘

1. **实例资源概览** - 显示所有实例的 CPU、内存、磁盘使用
2. **告警状态面板** - 显示当前 firing/acknowledged/resolved 告警
3. **资源趋势图** - 显示资源使用的历史趋势

## 最佳实践

### 1. 告警规则设置

- **避免告警疲劳**：设置合理的持续时间阈值
- **分级告警**：warning 和 critical 两级告警
- **可操作告警**：每条告警都应该有明确的响应流程

### 2. 资源监控

- **历史数据保留**：默认保留 100 条记录
- **评估间隔**：生产环境建议 30-60 秒
- **存储优化**：定期清理 resource_metrics 历史数据

### 3. 告警响应

```
1. 收到告警 → 2. 确认告警 → 3. 调查原因 → 4. 解决问题 → 5. 解决告警
```

## 故障排查

### 告警未触发

1. 检查告警规则是否激活 (`is_active = true`)
2. 检查阈值设置是否合理
3. 检查持续时间是否已过
4. 查看监控服务日志

### 指标数据缺失

1. 检查实例是否运行 (`status = 'running'`)
2. 检查进程 PID 是否正确
3. 检查数据库连接
4. 查看 `/api/metrics` 端点响应

## 未来计划

- [ ] 实时 WebSocket 推送
- [ ] 告警规则模板
- [ ] 多租户告警隔离
- [ ] 告警统计报表
- [ ] 自动扩容建议
- [ ] 异常检测（机器学习）
