# 📚 InkRead - TXT阅读器

一款跨平台的 TXT 小说阅读系统，支持 Web 管理和 Android 客户端，提供自适应阅读体验。

![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)
![React](https://img.shields.io/badge/React-18-green.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

## ✨ 核心特性

### 📖 阅读体验
- **自适应排版** - 无论窗口大小或字号如何变化，文字始终铺满屏幕
- **双阅读模式** - 支持翻页模式和滚动模式，任意切换
- **四种主题** - 白天/夜间/护眼/羊皮纸，一键切换
- **进度同步** - 自动保存阅读进度，跨设备同步
- **段落保真** - 严格保留 TXT 原文的空行和分段

### 🤖 AI 智能分类
- **本地优先** - 使用 Ollama 本地模型，保护隐私
- **自动标签** - AI 自动分析内容，生成分类和标签
- **智能缓存** - 基于文件内容 MD5，避免重复分析

### 🛠 开发者友好
- **RESTful API** - 完整的后端 API，支持 Android/iOS/网页任何客户端
- **编码自动转换** - 自动检测并转换 GBK/Big5 等编码为 UTF-8
- **Docker 部署** - 一键启动，无需复杂配置

## 🚀 快速开始

### 前置要求
- Python 3.11+
- Node.js 18+
- npm 或 yarn

### 1. 克隆项目

```bash
git clone https://github.com/yourusername/inkread.git
cd inkread
```

### 2. 启动后端

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 32206 --reload
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

### 4. 访问应用

- **Web 管理端**: http://localhost:5173
- **后端 API**: http://localhost:32206/api/v1

## 🐳 Docker 部署

```bash
# 一键启动所有服务
docker-compose up -d
```

服务地址：
- 前端: http://localhost:31206
- 后端: http://localhost:32206
- Ollama: http://localhost:30114

## 📱 项目结构

```
inkread/
├── backend/                 # FastAPI 后端
│   ├── app/
│   │   ├── main.py        # 应用入口
│   │   ├── models.py      # SQLAlchemy 模型
│   │   ├── schemas.py     # Pydantic 模型
│   │   ├── routers/       # API 路由
│   │   │   ├── books.py   # 书籍 CRUD
│   │   │   ├── chapters.py
│   │   │   ├── scan.py    # 文件扫描
│   │   │   └── ai.py      # AI 分类
│   │   └── services/       # 业务逻辑
│   │       ├── scanner.py  # 文件扫描服务
│   │       └── encoding.py # 编码转换
│   └── requirements.txt
│
├── frontend/               # React 前端
│   ├── src/
│   │   ├── components/    # React 组件
│   │   │   └── Reader/    # 阅读器组件
│   │   ├── hooks/         # 自定义 Hooks
│   │   │   ├── useReaderSettings.ts
│   │   │   ├── useTextPagination.ts
│   │   │   └── useVirtualList.ts
│   │   ├── pages/         # 页面组件
│   │   │   ├── Home.tsx
│   │   │   └── Reader.tsx
│   │   ├── api/           # API 客户端
│   │   └── store/         # Zustand 状态管理
│   └── package.json
│
├── android/                # Android 客户端（开发中）
│   └── app/
│
└── docker-compose.yml     # Docker 编排
```

## � API 文档

### 书籍管理

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/v1/books` | GET | 获取书籍列表（支持分页、筛选、搜索） |
| `/api/v1/books/{id}` | GET | 获取书籍详情（含章节） |
| `/api/v1/books/{id}/content` | GET | 获取书籍内容（分页加载） |
| `/api/v1/books/{id}/favorite` | POST/DELETE | 收藏/取消收藏 |
| `/api/v1/books/{id}/progress` | PUT | 同步阅读进度 |
| `/api/v1/books/{id}/metadata` | PUT | 更新分类/标签 |
| `/api/v1/scan` | POST | 触发库扫描 |

### 请求示例

```bash
# 获取书籍列表
curl http://localhost:32206/api/v1/books

# 获取书籍内容
curl http://localhost:32206/api/v1/books/1/content?offset=0&limit=10000

# 更新阅读进度
curl -X PUT http://localhost:32206/api/v1/books/1/progress \
  -H "Content-Type: application/json" \
  -d '{"position": 12345, "chapter": "第一章"}'
```

## 🎨 阅读器功能

### 核心组件

| 组件 | 功能 |
|------|------|
| `useReaderSettings` | 阅读设置状态管理（字号/行高/主题/模式） |
| `useTextPagination` | 自适应分页算法 |
| `useVirtualList` | 虚拟列表（滚动模式优化） |
| `ThemeProvider` | 主题系统 |
| `TextContent` | 文本渲染（保留原文格式） |

### 主题配置

```typescript
const themes = {
  day: { bg: '#fff', text: '#333', name: '白天' },
  night: { bg: '#1a1a1a', text: '#ccc', name: '夜间' },
  eye: { bg: '#c7edcc', text: '#333', name: '护眼' },
  parchment: { bg: '#f4ecd8', text: '#333', name: '羊皮纸' }
};
```

## 🧪 测试

```bash
# 运行前端测试
cd frontend
npm run test

# 运行后端测试
cd backend
pytest
```

## 🔧 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LIBRARY_PATH` | `./books` | 书籍存储路径 |
| `AI_PROVIDER` | `disabled` | AI 提供者（ollama/openai） |
| `OLLAMA_MODEL` | `qwen2.5:7b` | Ollama 模型 |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama 地址 |

## 📝 License

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

---

如果你觉得这个项目有帮助，请给一个 ⭐️！
