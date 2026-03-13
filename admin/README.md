# 直播系统 - 后台管理

敏感词管理、违规日志、黑白名单等后台功能。

## 启动

```bash
cd admin
npm install
npm start
```

默认运行在 `http://localhost:3000`（若 client 已占用则使用 3001）。

## 配置

- 后端 API 地址：通过环境变量 `REACT_APP_API_URL` 配置，默认 `http://localhost:3001/api`
- 创建 `.env` 可覆盖：
  ```
  REACT_APP_API_URL=http://your-server:3001/api
  ```

## 登录

使用直播系统主站的用户账号登录（与 client 共用 auth 接口）。

## 功能

- **敏感词列表**：增删改查、批量导入、热更新
- **违规日志**：按用户/直播间/等级/时间筛选、导出 CSV
- **黑白名单**：用户黑名单、白名单管理
