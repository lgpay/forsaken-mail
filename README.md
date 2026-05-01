Forsaken-Mail
==============
一个适合自部署的临时邮箱服务，支持收信历史持久化。

[在线演示](http://disposable.dhc-app.com)

## 项目简介

这个分支在原项目“偏演示”的基础上，往“能自用、能部署、能保留历史邮件”的方向做了二开。

当前已经补上的能力：

- 邮件历史持久化
- Inbox 历史列表 API
- 邮件详情 API
- 自定义邮箱前缀校验
- HTML 邮件基础净化后再展示
- 每个 Inbox 的邮件保留上限
- TTL 过期清理
- 旧版 SQLite 数据迁移到 JSON 的脚本
- 存储异常检测与健康状态返回

## 技术结构

- **SMTP 收信**：`mailin`
- **Web / API**：Express + socket.io
- **存储**：JSON 文件存储
- **前端**：静态 HTML + jQuery

项目仍保留实时推送体验，同时通过 API 拉取历史邮件。

## 快速开始

### 1）安装依赖

```bash
npm install
```

### 2）修改配置

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

### 3）启动服务

```bash
npm start
```

浏览器打开：

```bash
http://localhost:3000
```

### 4）运行测试

```bash
npm test
```

## 存储与数据目录说明

当前代码使用的是 **JSON 文件存储**，但默认配置里的路径仍然写成：

```bash
./data/forsaken-mail.sqlite
```

注意：

虽然文件名还是 `.sqlite`，但**当前版本实际写入的是 JSON 内容**。这个命名主要是为了兼容旧部署，避免直接改路径时引入额外迁移步骤。

### 为什么 Docker 一定要挂载数据目录

无论你以前用的是：

- 旧版 SQLite
- 当前版本的 JSON 文件存储

本质上都属于：**数据写在本地文件里**。

所以如果你用 Docker 部署，**一定要把容器内的数据目录映射到宿主机**，否则容器删除或重建后，邮件历史就会丢失。

### 容器内数据目录

Dockerfile 当前工作目录是：

```bash
/forsaken-mail
```

默认存储路径是：

```bash
./data/forsaken-mail.sqlite
```

因此容器内实际数据目录是：

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

这样做的好处：

- 邮件历史不会因为容器重建而丢失
- 便于备份和迁移
- 后续从旧 SQLite 迁移到 JSON 也更顺手

### 新部署建议

如果是新部署，建议直接把配置改成 `.json` 文件名，避免误解：

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

这样能避免“老数据还在，但界面像空邮箱”的坑。

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

### 推荐迁移流程

```bash
# 1. 把旧 SQLite 数据导出成 JSON
npm run migrate:sqlite -- --from ./data/forsaken-mail.sqlite --to ./data/forsaken-mail.json

# 2. 修改配置，把 storage.path 指向新的 JSON 文件
#    storage.path = ./data/forsaken-mail.json

# 3. 启动服务
npm start
```

## API 说明

### `GET /api/`

健康检查 + 存储状态。

示例响应：

```json
{
  "ok": true,
  "storage": {
    "path": "/forsaken-mail/data/forsaken-mail.json",
    "blocked": false,
    "format": "json",
    "reason": ""
  }
}
```

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

如果当前存储文件仍是旧版 SQLite，相关 API 会返回 `503`，并附带检测到的原因。

## Inbox 命名规则

自定义邮箱前缀必须满足：

- 以小写字母或数字开头
- 只能包含 `a-z`、`0-9`、`.`、`_`、`-`
- 长度 2 到 32 位
- 不能包含 `keywordBlackList` 里的保留关键词

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

## Docker 使用

### 构建镜像

```bash
docker build -t lgpay/forsaken-mail:latest .
```

### 运行容器（推荐带数据目录挂载）

```bash
docker run --name forsaken-mail -d \
  -p 25:25 \
  -p 3000:3000 \
  -v /opt/forsaken-mail/data:/forsaken-mail/data \
  lgpay/forsaken-mail:latest
```

### 直接拉取 Docker Hub 镜像

```bash
docker pull lgpay/forsaken-mail:latest
```

### 如果你只想临时体验

也可以不挂载数据目录直接跑，但容器删掉后邮件历史会一起消失：

```bash
docker run --name forsaken-mail -d -p 25:25 -p 3000:3000 lgpay/forsaken-mail:latest
```

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
