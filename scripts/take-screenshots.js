const puppeteer = require('puppeteer-core');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 查找 Firefox 路径
function findFirefox() {
    try {
        return execSync('which firefox', { encoding: 'utf8' }).trim();
    } catch (e) {
        return '/usr/bin/firefox';
    }
}

async function takeScreenshot(url, outputPath, waitTime = 3000) {
    console.log(`截图：${url} -> ${outputPath}`);

    const browser = await puppeteer.launch({
        headless: true,
        executablePath: findFirefox(),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // 等待内容加载
        await page.waitForTimeout(waitTime);

        // 截图
        await page.screenshot({ path: outputPath, fullPage: true, type: 'png' });
        console.log(`✓ 保存：${outputPath}`);
    } catch (error) {
        console.error(`截图失败：${error.message}`);
    } finally {
        await browser.close();
    }
}

async function main() {
    const screenshotsDir = path.join(__dirname, 'screenshots');

    // 确保目录存在
    if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    console.log('开始截取管理面板截图...\n');

    // 1. 管理面板主页（实例列表）
    await takeScreenshot(
        'http://localhost:3000',
        path.join(screenshotsDir, 'admin-panel.png'),
        3000
    );

    // 2. 资源监控页面
    await takeScreenshot(
        'http://localhost:3000',
        path.join(screenshotsDir, 'resources-monitor.png'),
        3000
    );

    // 3. 实例 Web UI
    await takeScreenshot(
        'http://localhost:18790',
        path.join(screenshotsDir, 'instance-web-ui.png'),
        3000
    );

    console.log('\n所有截图完成！');
}

main().catch(console.error);
