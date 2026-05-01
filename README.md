Forsaken-Mail
==============
一个适合自部署的临时邮箱服务，支持 **匿名随机收件箱** 与 **owner 持久收件箱** 两种模式。

- GitHub：<https://github.com/lgpay/forsaken-mail>
- Docker Hub：<https://hub.docker.com/r/lgpay/forsaken-mail>

## 项目简介

这个分支在原项目“偏演示”的基础上，往“能自用、能部署、能保留历史邮件”的方向做了二开。

现在已经支持两种核心用法：

### 1）匿名用户模式
- 自动分配随机前缀
- 可实时收信
- 邮件**不持久化**
- 更适合一次性注册、验证码测试、临时回执接收

### 2）owner 持久模式
- 首次启动自动生成随机 owner 密码
- owner 登录后可自定义邮箱前缀
- 邮件会持久保存
- owner 可在 Web 界面里自行修改密码

## 当前特性

- 匿名随机 inbox
- owner 持久 inbox
- owner 登录 / 退出 / 修改密码
- 首次启动自动生成 owner 密码
- 邮件历史持久化
- Inbox 历史列表 API
- 邮件详情 API
- 自定义邮箱前缀校验
- HTML 邮件基础净化后再展示
- 每个 Inbox 的邮件保留上限
- TTL 过期清理
- 旧版 SQLite 数据迁移到 JSON 的脚本
- 存储异常检测与健康状态返回
- Docker 多架构镜像（amd64 / arm64）

## 技术结构

- **SMTP 收信**：`mailin`
- **Web / API**：Express + socket.io
- **存储**：JSON 文件存储
- **前端**：静态 HTML + jQuery

项目仍保留实时推送体验，同时通过 API 拉取历史邮件。

---

## 快速开始

### 方式一：直接用 Docker Hub 镜像

```bash
docker pull lgpay/forsaken-mail:latest
```

运行：

```bash
docker run --name forsaken-mail -d \
  -p 25:25 \
  -p 3000:3000 \
  -v /opt/forsaken-mail/data:/forsaken-mail/data \
  lgpay/forsaken-mail:latest
```

浏览器打开：

```bash
http://localhost:3000
```

### 方式二：本地源码启动

#### 1）安装依赖

```bash
npm install
```

#### 2）修改配置

编辑 `config-default.json`：

```json
{
  "mailin": {
    "host": "0.0.0.0",
    "port": 25,
    "disableWebhook": true
  },
  "web": {
    "port": 3000
  },
  "storage": {
    "path": "./data/forsaken-mail.sqlite",
    "maxMailsPerInbox": 100,
    "mailTtlHours": 48,
    "maxBodyChars": 200000
  },
  "auth": {
    "ownerPassword": "",
    "statePath": "./data/auth-state.json",
    "sessionTtlHours": 168
  },
  "host": "arm.3w.pm",
  "keywordBlackList": [
    "admin",
    "postmaster",
    "system",
    "webmaster",
    "administrator",
    "hostmaster",
    "service",
    "server",
    "root"
  ]
}
```

#### 3）启动服务

```bash
npm start
```

#### 4）运行测试

```bash
npm test
```

---

## 首次启动密码机制

这是当前版本最重要的行为之一。

### 如果没有现成认证状态文件
服务首次启动时会：

- 自动生成一枚随机 owner 密码
- 把密码 hash 与状态写入 `auth.statePath`
- 在启动日志里打印出这枚初始密码

示例日志：

```text
[auth] Generated initial owner password: xxxxxxxxxxxxxx
[auth] Stored auth state at: /forsaken-mail/data/auth-state.json
```

### 后续重启时
只要 `auth-state.json` 还在，就不会重复生成新密码。

### owner 修改密码后
- 初始随机密码提示会消失
- 后续以 owner 自己改过的密码为准

---

## 为什么 Docker 一定要挂载数据目录

无论你现在用的是：

- 匿名随机 inbox 的临时会话数据
- owner 持久 inbox 的历史邮件
- 自动生成的 owner 密码状态文件

本质上都和本地文件状态有关。

所以如果你用 Docker 部署，**一定要把容器内的数据目录映射到宿主机**，否则容器删除或重建后，下面这些都会出问题：

- owner 密码状态丢失
- 持久化邮件历史丢失
- 迁移产物丢失

### 容器内数据目录

Dockerfile 当前工作目录是：

```bash
/forsaken-mail
```

默认数据目录是：

```bash
/forsaken-mail/data
```

### 推荐挂载方式

```bash
docker run --name forsaken-mail -d \
  -p 25:25 \
  -p 3000:3000 \
  -v /opt/forsaken-mail/data:/forsaken-mail/data \
  lgpay/forsaken-mail:latest
```

---

## 存储说明

当前代码使用的是 **JSON 文件存储**，但默认配置里的路径仍然写成：

```bash
./data/forsaken-mail.sqlite
```

注意：

虽然文件名还是 `.sqlite`，但**当前版本实际写入的是 JSON 内容**。这个命名主要是为了兼容旧部署，避免直接改路径时引入额外迁移步骤。

### 新部署建议

如果是新部署，建议直接把存储路径改成 `.json`，更清晰：

```json
{
  "storage": {
    "path": "./data/forsaken-mail.json"
  }
}
```

### 旧版 SQLite 检测

如果 `storage.path` 指向的是真正的旧 SQLite 数据库，当前版本不会再把它误当成空数据继续运行，而是会：

- 在 `GET /api/` 中返回存储状态
- 在邮件相关 API 中返回 `503`
- 明确提示你这是旧 SQLite，需要先迁移

---

## SQLite 迁移到 JSON

如果你之前用的是旧版 SQLite 存储，可以先执行迁移：

```bash
npm run migrate:sqlite -- --from ./data/forsaken-mail.sqlite --to ./data/forsaken-mail.json
```

常用参数：

- `--force`：覆盖已存在且非空的目标 JSON 文件
- `--compact`：输出压缩后的 JSON
- `--help`：查看帮助

迁移完成后，脚本会输出一份 JSON 摘要，包含：

- 迁移的邮件数量
- Inbox 数量
- 生成后的 `nextId`

推荐迁移流程：

```bash
# 1. 把旧 SQLite 数据导出成 JSON
npm run migrate:sqlite -- --from ./data/forsaken-mail.sqlite --to ./data/forsaken-mail.json

# 2. 修改配置，把 storage.path 指向新的 JSON 文件
#    storage.path = ./data/forsaken-mail.json

# 3. 启动服务
npm start
```

---

## 使用说明

### 匿名模式
默认进入匿名模式：

- 系统自动分配随机前缀
- 邮件不持久保存
- 只适合当前会话临时查看

### owner 模式
登录 owner 后：

- 可以自定义前缀
- 邮件会持久保存
- 可以查看历史邮件
- 可以修改自己的密码

---

## API 说明

### `GET /api/`

健康检查 + 存储状态 + 认证状态。

### `GET /api/auth/status`

获取当前登录状态与认证初始化信息。

### `POST /api/auth/login`

owner 登录。

请求体示例：

```json
{
  "password": "your-owner-password"
}
```

### `POST /api/auth/logout`

owner 退出登录。

### `POST /api/auth/change-password`

owner 修改密码。

请求体示例：

```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password-123"
}
```

### `GET /api/session/inbox`

获取当前匿名 / 持久 inbox 会话绑定信息。

### `GET /api/inboxes/:inbox/mails`

获取指定 Inbox 的历史邮件列表。

示例：

```bash
curl http://localhost:3000/api/inboxes/demo/mails
```

### `GET /api/mails/:id`

获取指定邮件详情。

示例：

```bash
curl http://localhost:3000/api/mails/1
```

---

## Inbox 命名规则

自定义邮箱前缀必须满足：

- 以小写字母或数字开头
- 只能包含 `a-z`、`0-9`、`.`、`_`、`-`
- 长度 2 到 32 位
- 不能包含 `keywordBlackList` 里的保留关键词

---

## DNS 配置

如果你希望真实接收外部邮件，需要正确配置 DNS。

假设你想接收：

```text
*@subdomain.domain.com
```

那么至少需要：

- MX 记录：`subdomain.domain.com MX 10 mxsubdomain.domain.com`
- A 记录：`mxsubdomain.domain.com A <你的服务器 IP>`

可以用这类工具做检查：

- <http://mxtoolbox.com/diagnostic.aspx>

---

## 当前定位

这个项目目前更适合：

- 个人自用
- 小规模自部署
- 临时收信场景
- 开发 / 测试 / 验证邮件流程

它还不是一个面向大规模生产环境的完整邮件平台。

## 后续可继续做的方向

- 附件支持
- 限流 / 防滥用
- 多域名支持
- 管理后台
- 更完整的生产部署方案

## License

GPL-2.0
