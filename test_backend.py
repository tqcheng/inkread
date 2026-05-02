#!/usr/bin/env python3
"""简单的后端启动和测试脚本"""

import asyncio
import subprocess
import time
import httpx


async def test_backend():
    # 启动后端
    print("正在启动后端...")
    proc = subprocess.Popen(
        [
            "python",
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            "32206",
        ],
        cwd="/home/kim/aihome/inkread/backend",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # 等待后端启动
    await asyncio.sleep(3)

    try:
        # 测试 API
        print("测试 API...")
        async with httpx.AsyncClient() as client:
            # 测试获取书籍列表
            response = await client.get("http://localhost:32206/api/v1/books")
            print(f"书籍列表 API 状态码: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"成功获取 {len(data.get('items', []))} 本书")

            # 测试获取单本书
            response = await client.get("http://localhost:32206/api/v1/books/1")
            print(f"书籍详情 API 状态码: {response.status_code}")

            if response.status_code == 200:
                book = response.json()
                print(f"书名: {book.get('title')}")

    finally:
        # 停止后端
        print("\n停止后端...")
        proc.terminate()
        proc.wait()


if __name__ == "__main__":
    asyncio.run(test_backend())
