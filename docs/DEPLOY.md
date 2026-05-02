# TXT 阅读器部署指南

## 快速启动

### 1. 基础服务（不含 AI）

```bash
docker-compose up -d
```

访问 http://localhost:31206

### 2. 启用 AI 功能

```bash
docker-compose --profile ai up -d
```

## 配置

### 环境变量

复制 `.env.example` 为 `.env` 并根据需要修改:

```env
# 必需
ADMIN_KEY=your_secure_admin_key_here

# AI 配置（可选）
AI_PROVIDER=disabled  # enabled: ollama, openai
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_HOST=http://ollama:11434
# OPENAI_API_KEY=sk-your-api-key-here
```

### 端口

| 服务 | 端口 | 说明 |
|------|------|------|
| 前端 | 31206 | Web 界面 |
| 后端 | 32206 | API 服务 |
| Ollama | 30114:11434 | AI 模型 (仅 --profile ai) |

## 数据持久化

- 书籍文件: `./books` 目录（挂载到容器 `/books`）
- 数据库: Docker volume `backend_data`（容器内 `/data`）
- Ollama 模型: Docker volume `ollama_data`（容器内 `/root/.ollama`）

## 备份

```bash
# 备份书籍
tar -czf books_backup.tar.gz books/

# 备份数据库
docker cp txt-reader-backend-1:/data/txt_reader.db ./backup.db

# 备份 Ollama 模型（如果使用）
docker cp txt-reader-ollama-1:/root/.ollama/models ./ollama_models_backup
```

## 更新

```bash
docker-compose pull
docker-compose up -d
```
