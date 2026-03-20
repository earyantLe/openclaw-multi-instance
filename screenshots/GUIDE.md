# 管理面板截图指南

## 自动截图（推荐）

使用以下在线工具或浏览器扩展获取截图：

### 方法 1：Chrome/Edge 开发者工具
1. 打开管理面板 http://localhost:3000
2. 按 `F12` 打开开发者工具
3. 按 `Ctrl+Shift+P` (或 `Cmd+Shift+P` on Mac)
4. 输入 `screenshot` 并选择 "Capture full size screenshot"
5. 保存为 `admin-panel.png`

### 方法 2：Firefox 截图
1. 访问 http://localhost:3000
2. 右键点击页面 -> "截取截图"
3. 选择"保存整个页面"
4. 保存为 `admin-panel.png`

### 方法 3：使用 ShareX (Linux/Windows)
```bash
# 安装 ShareX
# 设置延迟截图，然后打开管理面板
```

## 需要截取的画面

### 1. 管理面板主页 (admin-panel.png)
- URL: http://localhost:3000
- 显示：实例列表、创建实例表单、统计信息
- 尺寸建议：1920x1080

### 2. 资源监控 (resources-monitor.png)
- 点击导航栏"资源监控"
- 显示：CPU/内存/磁盘使用统计
- 尺寸建议：1920x1080

### 3. 实例 Web UI (instance-web-ui.png)
- URL: http://localhost:18790
- 显示：OpenClaw 控制界面
- 尺寸建议：1920x1080

### 4. 配置编辑 (config-editor.png)
- 点击任意实例的"配置"按钮
- 显示：配置编辑模态框
- 尺寸建议：800x600

### 5. 备份管理 (backup-management.png)
- 点击导航栏"备份管理"
- 显示：备份列表和操作按钮
- 尺寸建议：1920x1080

### 6. 实时日志 (live-logs.png)
- 点击任意实例的"日志"按钮
- 打开"实时日志"开关
- 显示：日志实时滚动
- 尺寸建议：1920x1080

## 放置截图

将截取的图片放置到 `screenshots/` 目录：

```
screenshots/
├── admin-panel.png
├── resources-monitor.png
├── instance-web-ui.png
├── config-editor.png
├── backup-management.png
└── live-logs.png
```

## 快速截图命令（如果有 wkhtmltoimage）

```bash
# 安装
sudo apt-get install wkhtmltopdf

# 截图
wkhtmltoimage --width 1920 --height 1080 http://localhost:3000 screenshots/admin-panel.png
wkhtmltoimage --width 1920 --height 1080 http://localhost:18790 screenshots/instance-web-ui.png
```

## 使用 Puppeteer（如果有 Node.js 环境）

```bash
cd admin-panel
npm install puppeteer-core
node ../scripts/take-screenshots.js
```
