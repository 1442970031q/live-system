# 直播全场景敏感词合规管控 - 集成说明

## 一、依赖安装

### 后端（server）

无新增 npm 依赖，使用 Node.js 内置 `worker_threads`、`os`、`path`。

### 前端（client）

```bash
cd client
npm install antd
```

antd 会自动安装 dayjs（用于 DatePicker 等组件）。

---

## 二、数据库

### 自动创建（推荐）

服务启动时 `db.initDB()` 会自动执行 `createSensitiveTables()`，创建以下表并初始化默认分类：

- `sensitive_category` - 敏感词分级分类
- `sensitive_word` - 敏感词主表
- `sensitive_hit_log` - 命中日志
- `user_black_white_list` - 用户黑白名单

### 手动迁移（可选）

若需单独执行 SQL，可运行：

```bash
mysql -u user -p database < server/migrations/sensitive_tables.sql
```

### 用户表 bio 列

若 `users` 表无 `bio` 列（用于用户简介敏感词检测），请执行：

```sql
ALTER TABLE users ADD COLUMN bio TEXT;
```

---

## 三、路由与中间件挂载

### 已修改文件

| 文件 | 修改内容 |
|-----|---------|
| `server/server.js` | 引入 `sensitiveRoutes`、`sensitiveService`；挂载 `/api/sensitive`；启动时调用 `sensitiveService.initPool()` |
| `server/routes/comment.js` | 使用 `sensitiveCheck` 替代 `checkSensitive` |
| `server/routes/live.js` | 创建直播接口增加 `sensitiveCheck`（title、description） |
| `server/routes/user.js` | 新增 `PUT /profile` 接口，带 `sensitiveCheck`（bio） |
| `server/routes/voice.js` | 使用 `sensitiveService.check` 替代 `checkSensitive`，返回 `highestLevel`、`handleStrategy`、`hitLogId` |

### 中间件挂载位置

- **弹幕发送**：`POST /api/comments/:streamId` → `sensitiveCheck({ field: 'content', scene: 'danmaku' })`
- **直播标题/描述**：`POST /api/live/create` → `sensitiveCheck({ field: 'title', scene: 'title' })` + `sensitiveCheck({ field: 'description', scene: 'title' })`
- **用户简介**：`PUT /api/users/profile` → `sensitiveCheck({ field: 'bio', scene: 'bio' })`

---

## 四、语音接口升级

### 返回值变更

**原返回：**

```json
{ "text": "...", "containsSensitive": false, "matchedWords": [] }
```

**新返回（命中时）：**

```json
{
  "text": "...",
  "containsSensitive": true,
  "matchedWords": ["违禁词"],
  "highestLevel": 1,
  "handleStrategy": "reject",
  "hitLogId": 123
}
```

### 可选：一级违禁词触发断流

在 `server/routes/voice.js` 的 `POST /check` 中，若需命中一级违禁词时触发直播断流，可在 `hit && highestLevel === 1` 时调用媒体服务断流逻辑（需根据 `mediaServer` 实现扩展）。

---

## 五、前端集成

### 后台管理项目（admin）

敏感词管理已独立为后台管理项目，位于 `admin/` 目录：

```bash
cd admin
npm install
npm start
```

默认运行在 `http://localhost:3002`（与 client 3000 不冲突）。

### 路由

- `/sensitive/list` - 敏感词列表
- `/sensitive/log` - 违规日志
- `/sensitive/whitelist` - 黑白名单

### 登录

使用直播系统主站用户账号登录（与 client 共用 auth 接口）。

### API 基础路径

所有敏感词管理接口需携带 JWT：`Authorization: Bearer <token>`

---

## 六、测试用例

### 1. 文本不含敏感词

```bash
curl -X POST http://localhost:3001/api/voice/check-text \
  -H "Content-Type: application/json" \
  -d '{"text":"这是一段正常内容"}'
```

预期：`containsSensitive: false`，`matchedWords: []`

### 2. 文本含敏感词

先往 `sensitive_word` 插入测试词（如 category_id=1 对应一级）：

```sql
INSERT INTO sensitive_word (category_id, word) VALUES (1, '违禁');
```

```bash
curl -X POST http://localhost:3001/api/voice/check-text \
  -H "Content-Type: application/json" \
  -d '{"text":"这是违禁内容"}'
```

预期：`containsSensitive: true`，`matchedWords: ["违禁"]`，`highestLevel: 1`

### 3. 变形词绕检（全角、大小写）

```bash
curl -X POST http://localhost:3001/api/voice/check-text \
  -H "Content-Type: application/json" \
  -d '{"text":"这是Ｗｅｉ禁内容"}'
```

DFA 会做归一化（全角转半角、小写），若词库有对应映射可命中。

### 4. 弹幕敏感词拦截

```bash
curl -X POST http://localhost:3001/api/comments/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT>" \
  -d '{"content":"违禁词测试"}'
```

预期：`400`，`message: "内容含有违禁词，请修改后再提交"`，`matchedWords`

### 5. 黑白名单

- 将用户加入黑名单后，再发弹幕应返回 `403`
- 将用户加入白名单后，含敏感词弹幕应放行

### 6. 高并发

使用 `artillery` 或 `ab` 压测 `POST /api/voice/check-text`，观察工作线程池是否稳定、无阻塞主线程。

---

## 七、热更新

词库变更后调用热更新接口，无需重启服务：

```bash
curl -X POST http://localhost:3001/api/sensitive/words/hot-reload \
  -H "Authorization: Bearer <JWT>"
```

或在前端「敏感词列表」页点击「热更新」按钮。
