import subprocess
import time

# 使用 Firefox 截图
urls = [
    ("http://localhost:3000", "admin-panel.png"),
    ("http://localhost:18790", "instance-web-ui.png"),
]

for url, output in urls:
    print(f"截图：{url} -> {output}")
    # Firefox 截图命令
    cmd = f"""
    firefox -screenshot --window-size=1920,1080 "{output}" "{url}" &
    """
    print(f"  需要手动截图，请访问：{url}")

print("\n请使用系统截图工具手动截图:")
print("1. 管理面板：http://localhost:3000")
print("2. 实例 Web UI: http://localhost:18790")
