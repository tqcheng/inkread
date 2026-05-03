# 管理界面增强设计文档

**日期**: 2026-05-03
**主题**: Admin UI 布局调整 + 启动密码保护
**状态**: 待实现

---

## 1. 背景与目标

本项目是一个本地 TXT 阅读器（InkRead）。用户希望在管理界面做以下改进：

1. **UI 布局调整**：将"最近扫描任务"区块从页面底部移到"统计信息"区块之后。
2. **启动密码保护**：在管理界面增加"安全"设置，支持开启/关闭密码保护。开启后，访问首页 `/` 和阅读页 `/reader/*` 时需要输入密码才能使用。

## 2. 设计原则

- **最小改动**：复用现有 Settings key-value 表、X-Admin-Key 认证机制。
- **向后兼容**：不破坏现有的 admin API 和测试。
- **用户体验**：本地个人工具级别，不过度设计安全机制。

## 3. UI 布局调整

### 3.1 Admin.tsx 页面区块顺序调整

调整前顺序：
1. 扫描文件夹
2. 统计信息
3. 数据库维护
4. **最近扫描任务**

调整后顺序：
1. 扫描文件夹
2. 统计信息
3. **最近扫描任务**（← 上移）
4. **安全设置**（← 新增）
5. 数据库维护

### 3.2 安全设置区块设计

位置：在"最近扫描任务"之后，"数据库维护"之前。

内容：
- 标题：🔒 安全设置
- 当前状态文本："启动密码保护：已开启 / 已关闭"
- 开关（Toggle）：启用启动密码保护
  - 从**关闭→开启**：展开"设置密码"表单（新密码 + 确认密码）
  - 从**开启→关闭**：展开"验证密码"表单（当前密码），验证成功后关闭保护
- 修改密码区域（仅在开启状态下显示）：
  - 输入框：当前密码
  - 输入框：新密码
  - 输入框：确认新密码
  - 按钮：修改密码
- 提示文本："开启后，访问首页和阅读页需要输入密码"

## 4. 后端设计

### 4.1 数据模型

复用已有的 `Settings` 表（key-value 存储）：

| Key | Value | 说明 |
|-----|-------|------|
| `app_password_hash` | bcrypt hash string | 启动密码哈希 |
| `app_password_enabled` | `"true"` / `"false"` | 密码保护开关 |
| `app_auth_token` | random token string | 当前有效的登录 token |

### 4.2 新增 API

#### 4.2.1 `GET /api/v1/auth/status`

- **访问权限**：Public（无需认证）
- **用途**：前端页面加载时查询密码保护状态
- **响应**：
  ```json
  {
    "enabled": true,
    "has_password": true
  }
  ```

#### 4.2.2 `POST /api/v1/auth/login`

- **访问权限**：Public（无需认证）
- **用途**：用户输入启动密码后验证
- **请求体**：
  ```json
  {
    "password": "用户输入的密码"
  }
  ```
- **成功响应**：
  ```json
  {
    "token": "随机生成的 token"
  }
  ```
- **失败响应**：401 Unauthorized
- **逻辑**：
  1. 读取 Settings 表中 `app_password_hash`
  2. 用 bcrypt 验证密码
  3. 验证通过后生成随机 token（`secrets.token_urlsafe(32)`）
  4. 将 token 写入 Settings 表 `app_auth_token`
  5. 返回 token

#### 4.2.3 `POST /api/v1/admin/settings/security`

- **访问权限**：Admin（需要 `X-Admin-Key`）
- **用途**：在管理界面修改安全设置
- **请求体**：
  ```json
  {
    "enabled": true,
    "current_password": "当前密码（关闭保护或修改密码时需要）",
    "new_password": "新密码（开启保护或修改密码时需要）"
  }
  ```
- **逻辑**：
  - **开启保护**（`enabled: true`，且之前没有密码）：
    - 要求 `new_password`
    - bcrypt 哈希后存入 `app_password_hash`
    - 设置 `app_password_enabled = "true"`
  - **关闭保护**（`enabled: false`）：
    - 要求 `current_password`
    - bcrypt 验证当前密码
    - 设置 `app_password_enabled = "false"`
    - 清除 `app_auth_token`
  - **修改密码**（`enabled: true` 且提供了 `new_password`）：
    - 要求 `current_password`
    - bcrypt 验证当前密码
    - bcrypt 哈希新密码存入 `app_password_hash`
    - 清除 `app_auth_token`（强制重新登录）

### 4.3 新增辅助函数

在 `app/services/settings.py` 中新增：

- `async def get_setting(key: str) -> Optional[str]`
- `async def set_setting(key: str, value: Optional[str])`
- `async def get_app_password_status() -> dict` — 返回 `{enabled: bool, has_password: bool}`

### 4.4 依赖

- 新增 Python 依赖：`passlib[bcrypt]` 用于密码哈希验证

## 5. 前端设计

### 5.1 新增组件

#### `LoginOverlay.tsx`

- **用途**：在首页 `/` 和阅读页 `/reader/:id` 上，当密码保护开启且未登录时显示全屏覆盖层
- **样式**：
  - 固定定位（fixed inset-0）
  - 背景：半透明深色（bg-black/50）+ backdrop-blur
  - 居中卡片：白色圆角卡片，最大宽度 400px
- **内容**：
  - 标题：🔒 InkRead
  - 副标题："请输入启动密码"
  - 密码输入框（type="password"）
  - 登录按钮
  - 错误提示区域
- **交互**：
  - 输入密码后回车或点击登录
  - 调用 `POST /auth/login`
  - 成功：token 写入 localStorage（`app_auth_token`），覆盖层消失
  - 失败：显示"密码错误"

### 5.2 修改现有组件

#### `Home.tsx`

- 组件加载时调用 `GET /auth/status`
- 如果 `enabled=true` 且 localStorage 中无 `app_auth_token`：
  - 渲染 `<LoginOverlay />` 覆盖在原有内容之上
- 否则正常渲染

#### `Reader.tsx`

- 组件加载时调用 `GET /auth/status`
- 如果 `enabled=true` 且 localStorage 中无 `app_auth_token`：
  - 渲染 `<LoginOverlay />`
- 否则正常渲染

#### `Admin.tsx`

- **布局调整**：将"最近扫描任务"区块上移
- **新增"安全设置"区块**：
  - 调用 `GET /auth/status` 获取当前状态
  - 开关组件控制 `enabled`
  - 根据开关状态和当前是否已有密码，显示不同的表单
  - 提交时调用 `POST /admin/settings/security`

### 5.3 新增/修改 Hooks

#### `useAuth.ts`（新增）

```typescript
interface AuthState {
  token: string | null;
  isEnabled: boolean;
  isLoading: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  checkStatus: () => Promise<void>;
}
```

- 使用 Zustand + localStorage 持久化 token
- `checkStatus`：调用 `GET /auth/status`，更新 `isEnabled`
- `login`：调用 `POST /auth/login`，成功后存 token
- `logout`：清除 localStorage token，刷新页面

#### `useAdmin.ts`（修改）

- 保持不变（X-Admin-Key 认证逻辑不动）

### 5.4 API Client 调整

`api/client.ts`：
- 现有的 `X-Admin-Key` 拦截器不变
- 不需要为启动密码添加全局拦截器（因为启动密码只影响页面级访问控制，不影响 API 调用）

### 5.5 新增 API 模块

`api/auth.ts`：
```typescript
export const authApi = {
  getStatus: () => apiClient.get('/auth/status'),
  login: (password: string) => apiClient.post('/auth/login', { password }),
};
```

## 6. 认证流程总结

### 6.1 首次启用密码保护

1. 管理员进入 `/admin`
2. 在"安全设置"区块，将开关从"关闭"切换到"开启"
3. 弹出"设置密码"表单，输入新密码 + 确认密码
4. 点击保存，调用 `POST /admin/settings/security`
5. 后端存储 bcrypt 哈希密码，设置 enabled=true

### 6.2 用户访问受保护页面

1. 用户访问 `/` 或 `/reader/1`
2. 前端调用 `GET /auth/status`，返回 `enabled=true`
3. 检查 localStorage，无 `app_auth_token`
4. 显示 `<LoginOverlay />`
5. 用户输入密码，调用 `POST /auth/login`
6. 后端 bcrypt 验证，生成 token 存入 Settings
7. 前端收到 token，写入 localStorage，覆盖层消失
8. 用户正常使用应用

### 6.3 关闭密码保护

1. 管理员进入 `/admin`
2. 在"安全设置"区块，将开关从"开启"切换到"关闭"
3. 弹出"验证密码"表单
4. 验证成功后，后端设置 enabled=false，清除 token
5. 所有用户再次访问 `/` 时无需密码

## 7. 测试策略

### 7.1 后端测试

- `test_auth.py`：
  - `test_auth_status_no_password`：无密码时返回 `enabled=false`
  - `test_auth_login_wrong_password`：密码错误返回 401
  - `test_auth_login_correct_password`：密码正确返回 token
  - `test_admin_security_update_enable`：admin 接口开启保护
  - `test_admin_security_update_disable`：admin 接口关闭保护
  - `test_admin_security_update_change_password`：修改密码

### 7.2 前端测试

- 手动测试：
  - 开启/关闭密码保护流程
  - 输入错误密码时的提示
  - 登录成功后刷新页面是否保持登录
  - 修改密码后旧 token 是否失效

## 8. 风险与回退

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 忘记启动密码后无法进入应用 | 高 | 可通过环境变量 `ADMIN_KEY` 进入管理界面关闭保护 |
| token 存储在 localStorage，有 XSS 风险 | 低 | 本地个人工具，风险可接受 |
| 同时只能有一个有效 token | 低 | 本地个人工具，单用户场景 |

## 9. 实现文件清单

### 后端
- `backend/app/routers/auth.py` — 新增（public auth 路由）
- `backend/app/routers/admin.py` — 修改（新增 `/settings/security` endpoint）
- `backend/app/services/settings.py` — 新增（Settings 表 CRUD 辅助函数）
- `backend/app/schemas.py` — 修改（新增 auth/security schemas）
- `backend/app/main.py` — 修改（注册 auth router）
- `backend/pyproject.toml` 或 `requirements.txt` — 新增 `passlib[bcrypt]`
- `backend/tests/test_auth.py` — 新增

### 前端
- `frontend/src/pages/Admin.tsx` — 修改（布局调整 + 安全设置区块）
- `frontend/src/pages/Home.tsx` — 修改（添加 LoginOverlay）
- `frontend/src/pages/Reader.tsx` — 修改（添加 LoginOverlay）
- `frontend/src/components/LoginOverlay.tsx` — 新增
- `frontend/src/hooks/useAuth.ts` — 新增
- `frontend/src/api/auth.ts` — 新增
- `frontend/src/api/types.ts` — 修改（新增 auth 相关类型）
- `frontend/src/App.tsx` — 无需修改（覆盖层在页面组件内渲染）

---
*设计完成，等待实现计划。*
