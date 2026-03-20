# 截图目录

请将管理面板和实例的截图放置在此目录。

## 获取截图的方法

### 方法 1：使用浏览器截图

1. 启动管理面板：`./scripts/start-admin.sh`
2. 访问 http://localhost:3000
3. 使用浏览器开发者工具或截图工具截图
4. 保存为 `admin-panel.png`

### 方法 2：使用 Puppeteer

```bash
cd admin-panel
npm install puppeteer

# 创建截图脚本
cat > screenshot.js << 'EOF'
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: '../screenshots/admin-panel.png', fullPage: true });
  await browser.close();
  console.log('Screenshot saved to screenshots/admin-panel.png');
})();
EOF

node screenshot.js
```

### 方法 3：使用 wkhtmltoimage

```bash
# 安装
sudo apt-get install wkhtmltopdf

# 截取管理面板
wkhtmltoimage --width 1920 --height 1080 http://localhost:3000 screenshots/admin-panel.png

# 截取实例 1 UI
wkhtmltoimage --width 1920 --height 1080 http://localhost:18790 screenshots/instance-web-ui.png
```

## 需要的截图

| 文件名 | 描述 | URL |
|--------|------|-----|
| `admin-panel.png` | 管理面板主界面 | http://localhost:3000 |
| `instances-list.png` | 实例列表页面 | http://localhost:3000#instances |
| `instance-web-ui.png` | 实例 Web UI | http://localhost:18790 |
| `terminal-tui.png` | 终端 TUI 界面 | 运行 `openclaw tui` |
