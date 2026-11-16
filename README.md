# 学校自动签到 Webhook 服务

一个常驻运行的校园自动签到服务。它通过微信扫码登录获取 Token，在每天 **18:00（北京时间）** 自动签到，并通过经过完整设计的 HTML 邮件通知登录状态、Token 过期时间、签到结果和续期入口。

> 与旧版本最大的区别：**不再循环发送邮件直到扫码成功**。服务只在需要时发送一封提醒邮件；用户点击邮件里的按钮后，才会收到登录二维码邮件。

## ✨ 功能特性

- **常驻 Webhook 服务**：基于 Bun 原生 HTTP Server，提供状态查询、登录、签到等接口。
- **不会循环轰炸邮箱**：
  - 仅在 Token 实际过期后发送一封登录提醒，不会提前提醒；
  - 重新登录不会刷新 Token 的有效期，因此提前提醒没有意义；
  - 同一 Token 的提醒会持久化去重，服务重启也不会重复发送；
  - 每天 18:00 的签到结果邮件是独立通知，即使 Token 仍失效，也只会每天发送当天的签到结果，不会循环发送。
- **精确的过期时间**：所有与 Token 相关的邮件都会写明具体过期时间，精确到分钟并包含星期，例如：
  `2026年11月16日 星期一 18:35（北京时间）`
- **邮件内交互按钮**：
  - 「接收登录二维码」：点击后立即发送一封包含二维码的邮件；
  - 「立即签到 / 重新签到」：打开二次确认页，确认后执行签到，避免邮箱客户端预抓取链接造成误签到；
  - 「查看服务状态」：打开 Web 状态页。
- **登录成功后说明实际有效期**：扫码成功后发送确认邮件，写明新 Token 实际可持续到的具体时间。
- **每天 18:00 自动签到**：签到完成后发送 HTML 结果邮件；如果服务在 18:00 后首次启动且当天尚未成功签到，会自动补签一次。
- **登录后自动补签**：如果 Token 过期导致当天签到未执行，用户在当天签到时间后、23:00 前重新登录，会自动补签一次；第二天 18:00 前登录不会补签前一天的任务。
- **完整的 HTML + CSS 邮件**：响应式布局、状态卡片、信息表格、渐变头部、按钮、深色模式适配和纯文本降级。
- **Token 存储灵活**：支持本地 `config.json` 或 Redis。
- **Webhook 鉴权**：通过 `WEBHOOK_SECRET` 保护登录、签到等操作链接。

## 🔄 工作流程

### 1. Token 过期时

```text
检测到 Token 不存在 / 已过期
        ↓
发送一封“需要重新登录”邮件（只发一次）
        ↓
用户点击邮件中的「接收登录二维码」
        ↓
服务生成微信二维码并发送二维码邮件
        ↓
用户微信扫码
        ↓
保存新 Token，发送“登录成功”邮件，写明实际过期时间
```

> Token 过期前不会发送提醒，因为重新登录不会刷新 Token 的有效期。

### 2. 每日签到

```text
每天 18:00（Asia/Shanghai）
        ↓
检查 Token 是否有效
        ↓
有效：提交签到 → 发送签到结果邮件（成功 / 失败）
无效：发送“签到未执行”邮件，附带登录按钮
        ↓
用户完成登录后：
  当天签到时间 - 23:00 内：自动补签一次
  第二天 18:00 前登录：不补签前一天任务，等待当天定时签到
```

## 🛠️ 环境要求

- [Bun](https://bun.sh/) 1.2 或更高版本
- 一个可被公网访问的部署地址（用于邮件按钮回跳）
- SMTP 邮箱账号（QQ 邮箱、企业邮箱等）
- 可选：Redis 实例

## 📦 安装

```bash
git clone <repository-url>
cd school_checkin
bun install
```

## ⚙️ 配置

复制示例配置并填写：

```bash
cp .env.example .env
```

### 基础配置

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `NAME` | ✅ | - | 签到签名中的姓名 |
| `PORT` | ❌ | `3000` | HTTP 服务端口 |
| `BASE_URL` | 生产必填 | `http://localhost:3000` | 邮件按钮使用的外部访问地址，必须公网可访问；只填协议 + 域名 + 端口，不要带路径 |
| `WEBHOOK_SECRET` | 强烈建议 | - | Webhook 操作密钥，建议 32 位以上随机字符串 |
| `APP_TIMEZONE` | ❌ | `Asia/Shanghai` | 服务时区，用于 18:00 定时和邮件时间格式化 |

### 签到配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `THREAD_ID` | `183058660` | 签到任务 ID |
| `CHECKIN_HOUR` | `18` | 每日签到小时 |
| `CHECKIN_MINUTE` | `0` | 每日签到分钟 |
| `CHECKIN_LATITUDE` | `28.423147` | 签到纬度 |
| `CHECKIN_LONGITUDE` | `117.976543` | 签到经度 |
| `CHECKIN_LOCATION_LABEL` | `上饶市信州区•上饶师范学院` | 签到地点文本 |

### Token 与登录配置

服务只在 Token 实际过期后发送一次登录提醒，不需要配置提醒窗口。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `QR_TTL_SECONDS` | `300` | 登录二维码有效期 |
| `QR_EMAIL_RESEND_SECONDS` | `10` | 重复点击时二维码邮件的最短重发间隔 |
| `TOKEN_TTL_HOURS` | `72` | 无法从 JWT 推断时的默认 Token 有效期，用于“预计有效期” |

### Token 存储

```env
# local：保存到项目根目录 config.json
SAVE_MODE=local

# remote：保存到 Redis
SAVE_MODE=remote
REDIS_TOKEN=your_redis_password
REDIS_ADDR=your_redis_address:port
```

服务还会在 `data/state.json` 中记录：

- 最近一次签到日期和结果；
- Token 提醒是否已发送；
- 是否需要登录后补签；
- 最近登录成功时间。

该文件用于避免重复邮件、重复签到，部署时建议挂载持久化磁盘。

### SMTP 配置

```env
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your@qq.com
SMTP_PASS=your-smtp-app-password
TO_EMAIL=receiver@example.com
EMAIL_FROM_NAME=校园签到助手
```

> QQ 邮箱通常需要使用“授权码”而不是登录密码。

## 🚀 启动

```bash
bun run start
```

开发模式：

```bash
bun run dev
```

类型检查：

```bash
bun run typecheck
```

### 使用 PM2 守护进程

项目内置 `ecosystem.config.cjs`，会自动定位 Bun，并固定单实例运行（避免重复签到和重复发邮件）。PM2 通过 `scripts/pm2-run.sh` 以 Bash 包装脚本 `exec` 到 Bun，不依赖 PM2 的 Bun 解释器，因此兼容 PM2 5/6/7，不会出现 `ProcessContainerForkBun.js` 缺失问题。

PM2 已加入项目的 `dependencies`。执行 `bun install` 后，`bun run pm2:*` 会自动使用 `node_modules/.bin/pm2`，**不需要全局安装 PM2**。

```bash
bun install
bun run pm2:start
```

如果你也想直接在终端使用 `pm2` 命令，可以额外全局安装：

```bash
npm install -g pm2
```

常用命令：

```bash
bun run pm2:status     # 查看状态
bun run pm2:logs       # 实时日志
bun run pm2:restart    # 修改 .env 后重启并加载新环境
bun run pm2:stop       # 停止
bun run pm2:delete     # 删除 PM2 进程记录
bun run pm2:flush      # 清空日志
```

PM2 日志写入：

```text
logs/out.log
logs/error.log
```

如果 PM2 提示找不到 Bun，可以在启动命令前指定：

```bash
BUN_PATH=/home/你的用户名/.bun/bin/bun bun run pm2:start
```

设置开机自启：

```bash
bun run pm2:startup
# 按提示执行输出的 sudo 命令
bun run pm2:save
```

> 本服务必须保持单实例运行。不要使用 `pm2 start ... -i max`，否则可能重复签到、重复发送邮件。

如果旧进程仍在重启循环，先删除再重新启动：

```bash
bunx pm2 delete school-checkin
bun run pm2:start
bun run pm2:logs
```

> 如果之前是用 root 用户的全局 PM2 启动过旧进程，请先切到 root 停止旧实例，避免新旧两个进程同时运行：
>
> ```bash
> sudo -i
> pm2 delete school-checkin
> pm2 save
> exit
> ```

如果日志里出现：

```text
Module not found ".../pm2/lib/ProcessContainerForkBun.js"
```

说明服务器上的 PM2 版本较旧，不支持 Bun 解释器。项目的 `ecosystem.config.cjs` 已改为通过 Bash 包装脚本启动 Bun，不需要升级 PM2。更新代码后执行：

```bash
pm2 delete school-checkin
pm2 flush school-checkin
pm2 start ecosystem.config.cjs
pm2 logs school-checkin
```

如果仍然出现该错误，确认 PM2 加载的是项目根目录下最新的 `ecosystem.config.cjs`，并且其中包含：

```js
script: path.join(appRoot, 'scripts', 'pm2-run.sh'),
interpreter: '/bin/bash',
```

启动后会看到：

```text
🚀 校园自动签到 Webhook 服务
🕒 当前时间：2026年11月14日 星期六 13:10（北京时间）
⏰ 每日签到：每天 18:00（Asia/Shanghai）
📧 邮件通知：已启用
💾 Token 存储：本地 config.json
🌐 服务地址：https://checkin.example.com
```

## 🔗 Webhook 接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/`、`/status` | 否 | Web 状态页 |
| `GET` | `/health` | 否 | 健康检查 JSON |
| `GET` | `/api/status` | 否 | 详细状态 JSON |
| `GET/POST` | `/api/login` | 是 | 生成登录二维码并发送邮件，返回 JSON |
| `GET/POST` | `/api/checkin` | 是 | 立即签到，返回 JSON |
| `GET` | `/webhook/login` | 是 | 生成登录二维码并发送邮件，返回 HTML 页面 |
| `GET` | `/webhook/checkin` | 是 | 立即签到，返回 HTML 页面 |
| `GET` | `/confirm/checkin` | 是 | 邮件按钮的签到二次确认页（防止邮箱预抓取链接） |
| `GET` | `/qr/:uuid` | 否 | 二维码页面 |
| `GET` | `/qr/:uuid.png` | 否 | 二维码图片 |

鉴权方式（任选其一）：

```bash
# 查询参数
curl "https://checkin.example.com/api/checkin?token=YOUR_WEBHOOK_SECRET"

# 请求头
curl -H "x-webhook-token: YOUR_WEBHOOK_SECRET" \
  "https://checkin.example.com/api/checkin"

# Bearer Token
curl -H "Authorization: Bearer YOUR_WEBHOOK_SECRET" \
  "https://checkin.example.com/api/checkin"
```

手动触发登录二维码：

```bash
curl "https://checkin.example.com/api/login?token=YOUR_WEBHOOK_SECRET"
```

强制重新签到：

```bash
curl "https://checkin.example.com/api/checkin?token=YOUR_WEBHOOK_SECRET&force=1"
```

## 🔐 安全建议

1. **必须配置 `WEBHOOK_SECRET`**。否则任何知道服务地址的人都可以触发签到或生成登录二维码。
2. **使用 HTTPS**。邮件按钮中会携带 Webhook 密钥，公网部署必须启用 HTTPS。
3. 不要把带 `token` 参数的链接转发给他人。
4. 服务已为 HTML 页面设置 `Referrer-Policy: no-referrer`，降低密钥通过 Referrer 泄漏的风险。
5. `config.json`、`.env`、`data/` 均已被 `.gitignore` 忽略，请勿提交。

## 📬 邮件说明

所有邮件均为 HTML + CSS 响应式模板，包含：

- 渐变头部和状态标签；
- 关键信息卡片（Token 过期时间、剩余时间、二维码有效期、签到结果等）；
- 表格化详情，兼容主流邮箱客户端；
- 带样式的操作按钮；
- 深色模式适配；
- 纯文本降级内容。

邮件类型：

| 邮件 | 触发时机 | 关键内容 |
| --- | --- | --- |
| 需要重新登录 | Token 不存在或已过期，且尚未提醒过 | 当前过期时间、登录后预计有效期、登录按钮 |
| 微信登录二维码 | 用户点击「接收登录二维码」 | 二维码图片、二维码有效期、登录后预计有效期 |
| 登录成功 | 扫码并换取 Token 成功 | 新 Token **实际**过期时间、剩余有效期、签到按钮 |
| 签到结果 | 每天 18:00 自动签到后 / 手动签到后 | 成功或失败、签到时间、地点、服务响应、Token 有效期 |

> 如果邮件客户端屏蔽了内嵌图片，二维码邮件还会提供「在浏览器中打开二维码」按钮。

## 🖥️ 部署

> 本服务使用本地 `data/state.json` 做签到和提醒去重，请只运行**一个实例**。不要在多个进程或多个容器中同时运行同一份配置，否则可能重复签到或重复发送邮件。

### 使用 systemd

```ini
[Unit]
Description=School Check-in Webhook Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/school_checkin
ExecStart=/root/.bun/bin/bun run start
Restart=always
RestartSec=5
EnvironmentFile=/opt/school_checkin/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now school-checkin
sudo journalctl -u school-checkin -f
```

### 反向代理

建议使用 Nginx / Caddy 将 `https://checkin.example.com` 代理到 `127.0.0.1:3000`，并将 `.env` 中的 `BASE_URL` 设置为该公网地址。

```nginx
server {
    listen 443 ssl http2;
    server_name checkin.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### GitHub Actions（可选）

定时签到由常驻服务自行完成，不再依赖 GitHub Actions。仓库内的 `.github/workflows/checkin.yml` 已改为**手动触发**，可用于服务恢复后补签：

1. 在仓库 Secrets 中配置 `SERVER_URL`（例如 `https://checkin.example.com`）和 `WEBHOOK_SECRET`；
2. 在 Actions 页面手动运行 `Manual Server Check-in Trigger`；
3. 可选择是否强制重新签到。

## 🗂️ 项目结构

```text
school_checkin/
├── src/
│   ├── main.ts               # 服务入口、启动日志、优雅关闭
│   ├── app.ts                # 依赖装配、登录成功回调
│   ├── server.ts             # HTTP 路由、Webhook、鉴权、状态页
│   └── scheduler.ts          # 每日 18:00 签到与 Token 提醒调度
├── lib/
│   ├── config.ts             # 环境变量与配置
│   ├── time-utils.ts         # 时区、星期、精确时间格式化
│   ├── state-store.ts        # data/state.json 持久化状态
│   ├── token-info.ts         # Token 读取、保存、JWT 有效期推断
│   ├── login-manager.ts      # 二维码登录会话、扫码轮询
│   ├── notification-service.ts # 登录失效/登录成功通知
│   ├── checkin-service.ts    # 签到流程与结果邮件
│   ├── checkin-utils.ts      # 签到 API 请求与响应判断
│   ├── email-templates.ts    # HTML + CSS 邮件模板
│   ├── email-utils.ts        # SMTP 发送
│   ├── web-templates.ts      # Web 状态页和操作结果页
│   ├── qrcode-utils.ts       # 二维码图片获取与转码
│   ├── urls.ts               # 邮件/网页操作链接
│   ├── request.ts            # HTTP 请求封装
│   ├── wechat-utils.ts       # 微信 UUID 获取与扫码轮询
│   └── path-utils.ts         # 项目根目录定位
├── scripts/
│   └── pm2-run.sh            # PM2 启动包装脚本（exec 到 Bun）
├── data/state.json           # 运行状态（自动生成，已忽略）
├── logs/                     # PM2 日志（自动生成，已忽略）
├── config.json               # 本地 Token（自动生成，已忽略）
├── ecosystem.config.cjs      # PM2 守护配置
├── .env                      # 环境变量（已忽略）
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 自定义

### 更改签到位置

```env
CHECKIN_LATITUDE=28.423147
CHECKIN_LONGITUDE=117.976543
CHECKIN_LOCATION_LABEL=上饶市信州区•上饶师范学院
```

### 更改签到时间

```env
CHECKIN_HOUR=18
CHECKIN_MINUTE=0
```

### Token 提醒策略

服务不会在 Token 过期前提醒。Token 实际过期后，会发送一次登录提醒；同一个 Token 不会重复发送。

### 更换签到任务

```env
THREAD_ID=183058660
```

## 🐛 故障排除

### 邮件按钮打开后提示“链接无效”

- 检查 `WEBHOOK_SECRET` 是否与生成邮件时一致；
- 修改 `WEBHOOK_SECRET` 后，旧邮件中的链接会失效，需要重新触发一封邮件。

### 邮件里的按钮指向 localhost

- 配置公网可访问的 `BASE_URL`，例如 `https://checkin.example.com`；
- 修改后重启服务。

### 收不到邮件

- 检查 `SMTP_USER`、`SMTP_PASS`、`TO_EMAIL`；
- QQ 邮箱请使用授权码；
- 查看服务日志中的 `❌ 邮件发送失败` 信息；
- 部分邮箱会将自动通知归入垃圾邮件。

### 登录二维码无法显示

- 邮件客户端可能屏蔽了内嵌图片，点击「在浏览器中打开二维码」；
- 二维码约 5 分钟过期，过期后回到提醒邮件重新点击「接收登录二维码」。

### Token 已过期但没有收到登录提醒

- 登录提醒每个 Token 只发送一次，且需要邮件配置正确；
- 查看 `/api/status` 和 `data/state.json` 中的提醒状态；
- 可以直接访问 `/webhook/login?token=你的密钥` 手动获取二维码。

### 每天 18:00 没有签到

- 确认服务在 18:00 时仍在运行；
- 查看 `/api/status` 中的 `lastCheckin`；
- 当天 18:00-23:00 内重新登录会自动补签；其他时间登录会等待下一次定时签到；
- 可手动访问 `/webhook/checkin?token=你的密钥&force=1`。

## 📝 许可证

ISC
