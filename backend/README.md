# TXT Reader Backend API

FastAPI 后端服务，提供 TXT 小说管理、阅读进度同步和 AI 分类功能。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | FastAPI + Pydantic v2 |
| 数据库 | SQLite + SQLAlchemy 2.0 (异步 aiosqlite) |
| 认证 | CORS（全通配） |
| 部署 | Docker，端口 **32206** |

## 项目结构

```
backend/
├── app/
│   ├── main.py              # FastAPI 入口
│   ├── models.py            # SQLAlchemy ORM 模型
│   ├── schemas.py           # Pydantic 请求/响应模型
│   ├── routers/             # API 路由
│   │   ├── books.py         # 书籍 CRUD
│   │   ├── chapters.py      # 章节
│   │   ├── scan.py          # 库扫描
│   │   ├── settings.py      # 系统设置
│   │   └── ai.py            # AI 分类
│   ├── services/            # 业务逻辑
│   │   ├── scanner.py       # 文件扫描
│   │   └── encoding.py      # 编码检测/转换
│   └── core/
│       ├── config.py        # 配置管理
│       └── database.py      # 数据库连接
├── tests/                   # pytest 测试套件
└── requirements.txt         # 依赖
```

## 数据库模型

### Book（书籍）
- `id`, `title`, `filename`（唯一）, `file_path`, `file_size`
- AI 分类：`category`, `category_confidence`, `tags`（JSON）, `tags_source`
- 编码信息：`encoding_original`, `is_utf8_converted`
- 阅读状态：`is_favorite`, `last_read_position`, `last_read_chapter`
- 时间戳：`created_at`, `updated_at`, `ai_analyzed_at`

### Chapter（章节）
- `id`, `book_id`（外键）, `title`
- 位置信息：`position_start`, `position_end`（字节偏移）, `chapter_index`

### ReadingProgress（阅读进度）
- `id`, `book_id`（外键）, `device_id`
- 进度：`current_position`, `current_chapter`, `reading_settings`（JSON）
- 唯一约束：`(book_id, device_id)`

### AiCache（AI 缓存）
- `file_hash`（MD5，主键）
- 缓存结果：`category`, `tags`, `confidence`

## API 端点

### 书籍 `/api/v1/books`

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/` | 列出书籍（支持 category、search、sort、page、confidence_min 过滤） |
| GET | `/uncategorized` | 获取低置信度书籍（待人工审核） |
| GET | `/{book_id}` | 获取书籍详情 |
| GET | `/{book_id}/content` | 获取内容（offset, limit 参数） |
| POST | `/{book_id}/favorite` | 收藏 |
| DELETE | `/{book_id}/favorite` | 取消收藏 |
| PUT | `/{book_id}/progress` | 更新阅读进度 |
| PUT | `/{book_id}/metadata` | 更新元数据 |
| POST | `/batch-delete` | 批量删除 |

### 章节 `/api/v1/chapters`

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/{book_id}/chapters` | 列出书籍章节 |
| GET | `/{chapter_id}` | 获取章节详情 |

### 扫描 `/api/v1/scan`

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/` | 触发扫描（返回 task_id） |
| GET | `/{task_id}` | 获取扫描状态 |
| GET | `/` | 获取扫描摘要 |

### 设置 `/api/v1/settings`

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/` | 获取设置 |
| PUT | `/` | 更新设置 |

### AI `/api/v1/ai`

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/reanalyze/{book_id}` | 重新分析书籍 |
| GET | `/cache/stats` | AI 缓存统计 |
| POST | `/cache/clear` | 清除 AI 缓存 |

## 配置

通过环境变量或 `.env` 文件配置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LIBRARY_PATH` | `/books` | 库文件夹路径 |
| `DATABASE_URL` | `sqlite+aiosqlite:///./app.db` | 数据库连接 |
| `AI_PROVIDER` | `disabled` | `ollama` / `openai` / `disabled` |
| `OLLAMA_MODEL` | `qwen2.5:7b` | 本地模型 |
| `OLLAMA_HOST` | `http://ollama:11434` | Ollama 服务地址 |
| `OPENAI_API_KEY` | - | OpenAI API 密钥 |

## 服务详解

### 文件扫描（scanner.py）

- 递归扫描 `LIBRARY_PATH` 下的 `.txt` 文件
- 编码检测（chardet，置信度 > 0.8 自动转换）
- 非 UTF-8 文件转换为 UTF-8，原始文件备份为 `.txt.bak`
- 章节提取（正则匹配第X章、Chapter X 等格式）
- 并发限制：`MAX_CONCURRENT_SCANS = 3`

### 编码转换（encoding.py）

- 检测文件前 10KB 的编码
- 置信度阈值：`CONFIDENCE_THRESHOLD = 0.8`
- 转换后的文件写入 `.txt`，原文件备份为 `.txt.bak`

## 启动

### 本地开发

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 32206
```

### Docker

```bash
docker-compose up -d
# 访问 http://localhost:32206/docs 查看 API 文档
```

## 测试

```bash
cd /home/kim/aihome/inkread
pytest backend/tests/ -v
```

**79 个测试全部通过** ✓

## 端口

| 服务 | 端口 |
|------|------|
| 后端 API | **32206** |
| 前端 | 31206 |
| Ollama | 30114（外部）/ 11434（容器内） |
