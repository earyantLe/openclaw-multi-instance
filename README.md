# OpenClaw 多实例部署管理系统

> 🚀 在一台服务器上部署和管理多个 OpenClaw 实例，实例之间完全隔离（独立端口、配置、数据）

![License](https://img.shields.io/badge/license-MIT-blue)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.x-green)
![Bash](https://img.shields.io/badge/Bash-5.2-lightgrey)

## ✨ 功能特性

- **实例管理** - 创建/启动/停止/重启/删除，支持批量操作
- **配置编辑** - 在线修改实例配置（名称、端口、工作空间）
- **资源监控** - 实时监控 CPU、内存、磁盘使用
- **备份还原** - 完整的备份管理，支持创建/删除/还原
- **实时日志** - SSE 技术实时推送日志，支持开关控制
- **快捷对话** - 一键打开 Web UI 或复制 profile 命令
- **健康检查** - 自动检测实例状态和资源
- **分组管理** - 创建实例分组，批量操作组内实例

## 快速开始

### 一键部署

```bash
# 运行安装脚本
./scripts/setup.sh
```

### 启动管理面板

```bash
# 方式 1：使用启动脚本
./scripts/start-admin.sh

# 方式 2：手动启动
cd admin-panel
npm install
npm start
```

### 访问管理面板

安装完成后，访问：http://localhost:3000

## 目录结构

```
openclaw-multi-instace/
├── deploy-core/
│   └── instance-manager.sh    # 实例管理脚本（核心）
├── admin-panel/
│   ├── package.json
│   ├── server.js              # Express 后端 API
│   └── public/                # 管理页面 UI
│       ├── index.html
│       ├── css/style.css
│       └── js/app.js
├── config/
│   ├── port-allocator.js      # 端口分配器
│   ├── instance-registry.js   # 注册表管理
│   └── template-manager.js    # 配置模板管理
├── scripts/
│   ├── setup.sh               # 一键部署脚本
│   ├── health-check.sh        # 健康检查脚本
│   ├── start-admin.sh         # 启动管理面板
│   ├── backup.sh              # 备份还原工具
│   └── process-monitor.js     # 进程监控器
└── README.md
```

## 使用方法

### 方式一：Web 管理面板（推荐）

1. 启动管理面板：
```bash
./scripts/start-admin.sh
```

2. 访问 http://localhost:3000

3. 在面板中可以：
   - 创建新实例
   - 启动/停止/重启实例
   - 批量操作（全部启动/停止/重启）
   - 查看实例日志
   - 查看/编辑实例配置
   - 查看实例详情
   - 查看系统信息

### 方式二：命令行管理

```bash
# 设置别名（可选）
alias openclaw="./deploy-core/instance-manager.sh"

# 或创建全局软链接
sudo ln -s $(pwd)/deploy-core/instance-manager.sh /usr/local/bin/openclaw

# 创建实例
openclaw create instance-1

# 指定端口创建
openclaw create instance-2 18790

# 启动实例
openclaw start 1

# 停止实例
openclaw stop 1

# 重启实例
openclaw restart 1

# 列出所有实例
openclaw list

# 查看实例状态
openclaw status 1

# 查看实例日志
openclaw logs 1 100

# 删除实例
openclaw delete 1

# 强制删除运行中的实例
openclaw delete 1 --force

# 查看帮助
openclaw help

# 查看版本
openclaw version
```

### 方式三：管理面板 API

```bash
# 获取所有实例
curl http://localhost:3000/api/instances

# 创建实例
curl -X POST http://localhost:3000/api/instances \
  -H "Content-Type: application/json" \
  -d '{"name":"instance-1"}'

# 启动实例
curl -X POST http://localhost:3000/api/instances/1/start

# 批量启动所有实例
curl -X POST http://localhost:3000/api/batch/start-all

# 查看系统信息
curl http://localhost:3000/api/system
```

### 方式四：与实例对话（重要）

可以通过以下方式与不同的实例分别对话：

#### 1. 使用 profile 选项（推荐）

每个实例使用独立的 profile，状态完全隔离：

```bash
# 与实例 1 对话
openclaw --profile instance_1 agent -m "你好，实例 1"

# 与实例 2 对话
openclaw --profile instance_2 agent -m "你好，实例 2"

# 交互式对话
openclaw --profile instance_1
```

#### 2. 使用 TUI 终端界面

```bash
# 连接到实例 1 (端口 18790)
openclaw tui --url ws://127.0.0.1:18790

# 连接到实例 2 (端口 18795)
openclaw tui --url ws://127.0.0.1:18795
```

#### 3. 直接访问 Web UI

每个实例都有独立的 Web 界面：

- **实例 1**: http://localhost:18790
- **实例 2**: http://localhost:18795

#### 4. 使用 Dashboard

```bash
# 打开实例 1 的 dashboard
openclaw --profile instance_1 dashboard

# 打开实例 2 的 dashboard
openclaw --profile instance_2 dashboard
```

## 高级功能

### 1. 备份与还原

```bash
# 备份实例
./scripts/backup.sh backup 1

# 备份实例并命名
./scripts/backup.sh backup 1 my-backup-20240101

# 列出所有备份
./scripts/backup.sh list

# 还原备份
./scripts/backup.sh restore my-backup-20240101

# 删除备份
./scripts/backup.sh delete my-backup-20240101
```

### 2. 配置模板管理

```bash
# 初始化默认模板
node config/template-manager.js init

# 列出所有模板
node config/template-manager.js list

# 查看模板详情
node config/template-manager.js show production

# 应用模板到实例
node config/template-manager.js apply 1 production
```

**内置模板:**
- `default` - 默认配置
- `production` - 生产环境配置
- `development` - 开发调试配置
- `low-memory` - 低内存模式配置

### 3. 进程监控

```bash
# 后台启动进程监控
node scripts/process-monitor.js start &

# 查看监控状态
node scripts/process-monitor.js status

# 查看监控配置
node scripts/process-monitor.js config
```

**监控功能:**
- 自动检测实例进程状态
- 异常崩溃自动重启
- 重启冷却保护
- 最大重启次数限制
- 详细日志记录

### 4. 健康检查

```bash
# 运行健康检查脚本
./scripts/health-check.sh

# 或通过 API 检查
curl http://localhost:3000/api/health

# 持续监控模式
./scripts/health-check.sh watch

# 输出 JSON 格式
./scripts/health-check.sh json

# 配置告警
./scripts/health-check.sh check --alert-webhook="https://hooks.slack.com/xxx"
```

**健康检查功能:**
- 实例进程状态检查
- 端口监听检查
- 系统资源检查（CPU、内存、磁盘）
- 告警通知（Webhook、邮件）
- JSON 格式输出支持

### 5. 资源监控

```bash
# 查看资源使用情况
node scripts/resource-monitor.js status

# 后台启动资源监控
node scripts/resource-monitor.js start &

# 查看历史趋势
node scripts/resource-monitor.js history

# 导出数据
node scripts/resource-monitor.js export resources.json
```

**监控配置:**
```javascript
const CONFIG = {
    checkInterval: 60000,        // 检查间隔（毫秒）
    logResources: true,          // 记录资源日志
    alertOnHighCPU: 90,          // CPU 告警阈值（%）
    alertOnHighMemory: 90,       // 内存告警阈值（%）
    alertOnHighDisk: 1000,       // 磁盘告警阈值（MB）
    historySize: 100             // 历史记录条数
};
```

### 6. 实例分组管理

```bash
# 创建分组
node scripts/group-manager.js create production "生产环境实例"

# 添加实例到分组
node scripts/group-manager.js add production 1
node scripts/group-manager.js add production 2

# 查看分组
node scripts/group-manager.js show production

# 批量操作分组
node scripts/group-manager.js start production
node scripts/group-manager.js stop production
node scripts/group-manager.js restart production

# 列出所有分组
node scripts/group-manager.js list

# 清理无效分组
node scripts/group-manager.js cleanup
```

**分组管理功能:**
- 创建/删除分组
- 添加/移除实例
- 批量启动/停止/重启
- 自动清理无效实例

## 实例数据位置

所有实例数据存储在 `~/.openclaw/` 目录下：

```
~/.openclaw/
├── instances/
│   ├── registry.json              # 实例注册表
│   ├── 1/                         # 实例 1
│   │   ├── .env                   # 环境变量
│   │   ├── config/
│   │   │   └── config.json        # 实例配置
│   │   ├── logs/
│   │   │   └── openclaw.log       # 日志文件
│   │   ├── data/                  # 数据目录
│   │   └── workspace/             # 工作空间
│   └── 2/                         # 实例 2
│       └── ...
└── backups/                       # 备份目录
    ├── instance-1_20240101_120000.tar.gz
    └── ...
```

## API 接口

管理面板提供以下 REST API：

### 实例管理
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/system | 系统信息 |
| GET | /api/instances | 获取所有实例 |
| GET | /api/instances/:id | 获取单个实例 |
| POST | /api/instances | 创建实例 |
| POST | /api/instances/:id/start | 启动实例 |
| POST | /api/instances/:id/stop | 停止实例 |
| POST | /api/instances/:id/restart | 重启实例 |
| DELETE | /api/instances/:id | 删除实例 |

### 批量操作
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/batch/start-all | 启动所有实例 |
| POST | /api/batch/stop-all | 停止所有实例 |
| POST | /api/batch/restart-all | 重启所有实例 |

### 配置与日志
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/instances/:id/config | 获取实例配置 |
| POST | /api/instances/:id/config | 更新实例配置 |
| GET | /api/instances/:id/logs | 查看日志 |
| GET | /api/instances/:id/logs/stream | 实时日志 (SSE) |
| POST | /api/instances/:id/logs/clear | 清空日志 |
| GET | /api/instances/:id/status | 实例状态（实时检查） |

### 资源监控
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/instances/:id/resources | 获取实例资源使用情况 |
| GET | /api/resources/stats | 获取所有实例资源统计 |
| POST | /api/logs/cleanup | 日志自动清理 |

## 环境要求

- Node.js >= 22.x
- Python3 或 jq（用于 JSON 处理）
- Bash

## 配置选项

### 管理面板
编辑 `admin-panel/server.js` 或设置环境变量：
```bash
export OPENCLAW_ADMIN_PORT=3000
```

### 进程监控
编辑 `scripts/process-monitor.js` 中的 `CONFIG` 对象：
```javascript
const CONFIG = {
    checkInterval: 30000,        // 检查间隔（毫秒）
    autoRestart: true,           // 自动重启
    maxRestarts: 3,              // 最大重启次数
    restartCooldown: 60000,      // 重启冷却时间（毫秒）
    logMaxSize: 1024 * 1024,     // 日志最大大小（1MB）
    alertOnCrash: true           // 崩溃时告警
};
```

### 实例管理器
编辑 `deploy-core/instance-manager.sh` 修改默认配置：
```bash
DEFAULT_PORT=18789       # 默认起始端口
NODE_MIN_VERSION=22      # 最低 Node.js 版本
```

## 管理面板功能

### 核心功能
- **实例管理**：创建、启动、停止、重启、删除实例
- **批量操作**：一键启动/停止/重启所有实例
- **实时监控**：查看实例运行状态和 PID
- **日志查看**：在线查看实例日志，支持下载和实时推送
- **配置管理**：查看和编辑实例配置（名称、端口、工作空间）
- **系统信息**：查看系统资源和实例统计
- **响应式设计**：支持手机和平板访问
- **自动刷新**：每 30 秒自动刷新实例状态

### 新增功能 (v1.4.0)
- **备份还原**：完整的备份管理，支持创建/删除/还原
- **资源监控**：CPU、内存、磁盘使用实时监控
- **快捷对话**：一键打开实例 Web UI 或复制 profile 命令
- **实时日志**：使用 SSE 技术实时推送日志输出

## 截图

> **提示**: 截图位于 `screenshots/` 目录。如图片未显示，请查看 [screenshots/GUIDE.md](screenshots/GUIDE.md) 了解如何获取截图。

### 1. 管理面板主页

访问 http://localhost:3000 查看管理面板：

![管理面板](screenshots/admin-panel.png)

*管理面板主页显示所有实例、创建实例表单和统计信息*

### 2. 资源监控

点击导航栏"资源监控"标签：

![资源监控](screenshots/resources-monitor.png)

*实时监控所有实例的 CPU、内存和磁盘使用情况*

### 3. 实例 Web UI

每个实例都有独立的 Web 界面：

- 实例 1: http://localhost:18790
- 实例 2: http://localhost:18795

![实例 Web UI](screenshots/instance-web-ui.png)

*OpenClaw 原生 Web 控制界面*

### 4. 配置编辑

点击实例卡片的"配置"按钮：

![配置编辑](screenshots/config-editor.png)

*支持修改实例名称、端口和工作空间*

### 5. 备份管理

点击导航栏"备份管理"标签：

![备份管理](screenshots/backup-management.png)

*完整的备份管理功能：创建、删除、还原*

### 6. 实时日志

点击实例卡片的"日志"按钮，打开实时日志开关：

![实时日志](screenshots/live-logs.png)

*使用 SSE 技术实时推送日志输出*

### 7. 终端 TUI

使用 `openclaw tui` 命令连接实例：

![Terminal TUI](screenshots/terminal-tui.png)

*终端用户界面，直接与实例对话*

---

## 获取截图

运行以下命令查看截图指南：

```bash
cat screenshots/GUIDE.md
```

或使用浏览器开发者工具自行截图。

## 命令行功能

```
OpenClaw 多实例管理器 v1.1.0

用法：./instance-manager.sh <command> [arguments]

命令:
  create <name> [port] [workspace]  创建新实例
  start <id>                        启动实例
  stop <id>                         停止实例
  restart <id>                      重启实例
  delete <id> [--force]             删除实例
  list                              列出所有实例
  status <id>                       查看实例详情
  logs <id> [lines]                 查看实例日志
  check                             检查环境
  version                           显示版本
  help                              显示帮助
```

## 故障排除

### 管理面板无法启动

```bash
# 检查端口是否被占用
netstat -tlnp | grep 3000

# 查看日志
cat admin-panel/.log

# 重新安装依赖
cd admin-panel && rm -rf node_modules && npm install
```

### 实例无法启动

```bash
# 检查端口占用
netstat -tlnp | grep 18789

# 查看实例日志
openclaw logs <instance-id>

# 检查实例状态
openclaw status <instance-id>
```

### 重置所有实例

```bash
# 删除注册表（谨慎操作！）
rm -rf ~/.openclaw/instances/registry.json

# 重启管理面板
kill $(cat admin-panel/.pid)
./scripts/start-admin.sh
```

### 启用调试模式

```bash
# 实例管理器调试模式
DEBUG=1 ./deploy-core/instance-manager.sh list
```

## 安全建议

1. 管理面板默认只监听 localhost，如需外网访问请修改 server.js
2. 建议配置防火墙规则
3. 生产环境建议添加认证机制
4. 定期备份实例配置和数据
5. 启用进程监控防止服务中断

## 更新日志

### v1.3.0 (当前版本)
- 新增资源监控器 (`scripts/resource-monitor.js`)
  - CPU、内存、磁盘使用监控
  - 资源历史记录和趋势分析
  - 自动告警（CPU/内存/磁盘阈值）
  - JSON 数据导出
- 新增实例分组管理 (`scripts/group-manager.js`)
  - 创建/删除分组
  - 添加/移除实例到分组
  - 批量操作分组内实例
  - 自动清理无效实例
- 增强健康检查脚本
  - 系统资源检查（CPU、内存、磁盘）
  - 实例健康状态分级（healthy/degraded/unhealthy）
  - 告警通知支持（Webhook、邮件）
  - 持续监控模式（watch 命令）
  - JSON 格式输出
- 新增管理面板 API
  - `/api/instances/:id/resources` - 获取实例资源使用
  - `/api/resources/stats` - 获取所有实例资源统计
  - `/api/logs/cleanup` - 日志自动清理（轮转/删除旧日志）
- 优化日志管理
  - 自动日志轮转（超过阈值时）
  - 定时清理旧日志备份

### v1.2.0
- 新增批量操作功能（全部启动/停止/重启）
- 新增配置管理 API 和 UI
- 新增日志清空功能
- 新增实时日志推送（SSE）
- 新增配置模板管理工具
- 新增备份还原工具
- 新增进程监控器
- 优化实例状态检测（增加端口检测）
- 优化前端 UI 和交互

### v1.1.0
- 优化 instance-manager.sh，支持 jq 和 python3 双模式
- 改进错误处理和日志输出
- 增强前端 UI，添加系统信息面板
- 添加日志下载功能
- 添加快捷操作面板
- 优化 CSS 样式和动画效果

### v1.0.0
- 初始版本
- 基础的实例管理功能
- Web 管理面板

## License

MIT
