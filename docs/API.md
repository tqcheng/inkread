# InkRead API 文档

## 概述

本项目使用 FastAPI 作为后端，提供完整的 RESTful API。

**Base URL**: `http://localhost:32206/api/v1`

---

## 书籍管理

### 获取书籍列表

**接口**: `GET /books`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `category` | string | 否 | 按分类筛选 |
| `search` | string | 否 | 搜索关键词（FTS5 全文搜索） |
| `sort` | string | 否 | 排序字段（created_at/title/file_size/category_confidence），默认 created_at |
| `order` | string | 否 | 排序顺序（asc/desc），默认 desc |
| `page` | number | 否 | 页码，默认 1 |
| `page_size` | number | 否 | 每页数量，默认 20 |
| `confidence_min` | number | 否 | AI 分类置信度最小值（0-1） |

**响应**:
```json
{
  "items": [
    {
      "id": 1,
      "title": "测试小说",
      "filename": "test_novel.txt",
      "file_path": "/books/test_novel.txt",
      "file_size": 1048576,
      "category": "wuxia",
      "category_confidence": 0.85,
      "tags": ["武侠", "江湖", "武功"],
      "tags_source": "ai",
      "encoding_original": "GBK",
      "is_utf8_converted": true,
      "created_at": "2024-04-17T10:00:00Z",
      "updated_at": "2024-04-17T10:00:00Z",
      "is_favorite": false,
      "is_deleted": false,
      "last_read_position": 0,
      "last_read_chapter": null,
      "ai_analyzed_at": "2024-04-17T10:00:00Z",
      "chapters": [...]
    }
  ],
  "total": 20,
  "page": 1,
  "page_size": 20,
  "pages": 1
}
```

---

### 获取书籍详情

**接口**: `GET /books/{book_id}`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | number | 是 | 书籍 ID |

**响应**: 同书籍列表中的单本书籍对象

---

### 获取书籍内容

**接口**: `GET /books/{book_id}/content`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | number | 是 | 书籍 ID |
| `offset` | number | 否 | 字节偏移量，默认 0 |
| `limit` | number | 否 | 最大字符数（1-50000），默认 10000 |

**响应**:
```json
{
  "book_id": 1,
  "content": "第一章 测试章节...",
  "next_offset": 10000,
  "is_end": false
}
```

---

### 收藏书籍

**接口**: `POST /books/{book_id}/favorite`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | number | 是 | 书籍 ID |

**响应**:
```json
{
  "is_favorite": true
}
```

---

### 取消收藏

**接口**: `DELETE /books/{book_id}/favorite`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | number | 是 | 书籍 ID |

**响应**:
```json
{
  "is_favorite": false
}
```

---

### 更新书籍元数据

**接口**: `PUT /books/{book_id}/metadata`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | number | 是 | 书籍 ID |

**请求体**:
```json
{
  "category": "wuxia",
  "tags": ["武侠", "江湖"],
  "tags_source": "manual"
}
```

**响应**: 同书籍列表中的单本书籍对象

---

### 更新阅读进度

**接口**: `PUT /books/{book_id}/progress`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `book_id` | number | 是 | 书籍 ID |

**请求体**:
```json
{
  "current_position": 12345,
  "current_chapter": "第一章",
  "reading_settings": {
    "font_size": 18,
    "line_height": 1.7,
    "theme": "day"
  }
}
```

**响应**: 无内容（204 No Content）

---

### 批量删除书籍

**接口**: `POST /books/batch-delete`

**请求体**:
```json
{
  "ids": [1, 2, 3],
  "permanent": false
}
```

**参数说明**:
- `ids`: 要删除的书籍 ID 数组
- `permanent`: 是否永久删除，默认 false（软删除）

**响应**:
```json
{
  "deleted": 3
}
```

---

### 获取低置信度书籍

**接口**: `GET /books/uncategorized`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | number | 否 | 页码，默认 1 |
| `page_size` | number | 否 | 每页数量，默认 20 |

**响应**: 同书籍列表

---

## 扫描服务

### 触发文件夹扫描

**接口**: `POST /scan`

**请求体**:
```json
{
  "path": "/books",
  "force_rescan": false
}
```

**响应**:
```json
{
  "task_id": "scan-12345",
  "status": "started",
  "message": "Scan started"
}
```

---

## 章节管理

章节接口在 `/chapters` 路径下，详见后端代码。

---

## 设置管理

设置接口在 `/settings` 路径下，详见后端代码。

---

## AI 分类

AI 分类接口在 `/ai` 路径下，详见后端代码。

---

## 错误响应

所有错误统一使用以下格式：

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable message",
  "details": null
}
```

常见错误码:
- `NOT_FOUND` - 资源不存在
- `FORBIDDEN` - 无权限
- `BAD_REQUEST` - 请求参数错误

---

## 分类体系

**主分类**:
| 值 | 说明 |
|----|------|
| `classical` | 古典/历史/名著 |
| `modern` | 现代文学/当代小说 |
| `wuxia` | 武侠/江湖/武功 |
| `fantasy` | 玄幻/修仙/奇幻/魔法 |
| `scifi` | 科幻/未来/太空/科技 |
| `anime` | 动漫/轻小说/二次元 |
| `urban` | 都市/职场/言情/现实 |

---

## 前端 API 客户端

前端使用 Axios 调用 API，详见 `frontend/src/api/books.ts`。

**示例**:
```typescript
import { booksApi } from './api/books';

// 获取书籍列表
const books = await booksApi.getBooks({ category: 'wuxia' });

// 获取书籍内容
const content = await booksApi.getBookContent(1, 0, 10000);

// 更新阅读进度
await booksApi.updateProgress(1, { position: 12345 });
```
