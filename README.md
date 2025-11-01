# 学校自动签到系统

一个使用微信二维码认证自动进行学校签到的系统。该项目通过微信登录自动化完成学校签到流程。

## 🚀 功能特性

- 自动微信二维码登录
- 自动签到提交（包含地理位置信息）
- 邮件通知（二维码和签到结果）
- Redis 基于的令牌缓存，实现无缝重新认证
- 支持定时签到

## 🛠️ 环境要求

- [Bun](https://bun.sh/) (版本 1.2.x 或更高)
- Redis 数据库实例
- SMTP 服务器用于邮件通知（可选）
- 微信账号用于认证

## 📦 安装

1. 克隆仓库：

```bash
git clone <repository-url>
cd school_checkin
```

2. 使用 Bun 安装依赖：

```bash
bun install
```

## ⚙️ 配置

在项目根目录创建 `.env` 文件，并添加以下环境变量：

```env
# Redis 配置
REDIS_TOKEN=your_redis_password
REDIS_ADDR=your_redis_address:port

# SMTP 配置（可选，用于邮件通知）
SMTP_HOST=smtp.your-email-provider.com
SMTP_PORT=465
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
TO_EMAIL=recipient@example.com
```

### 必需配置
- `REDIS_TOKEN`: Redis 数据库密码
- `REDIS_ADDR`: Redis 实例地址，格式为 `host:port`

### 可选配置
- `SMTP_HOST`: SMTP 服务器地址，用于发送邮件通知
- `SMTP_PORT`: SMTP 服务器端口（通常 SSL 为 465）
- `SMTP_USER`: SMTP 用户名（邮箱地址）
- `SMTP_PASS`: SMTP 密码或应用专用密码
- `TO_EMAIL`: 接收二维码和签到通知的邮箱地址

## 🚀 使用方法

### 手动执行

手动运行签到流程：

```bash
bun run main.js
```

或

```bash
bun main.js
```

### 使用启动脚本

```bash
bun run start
```

### 自动执行

要自动运行签到（例如，每天运行），可以使用系统 cron 或任务调度器：

```bash
# 示例 cron 任务，每天早上 8:00 AM 运行
0 8 * * * cd /path/to/school_checkin && bun run main.js
```

## 🔍 工作原理

1. **认证**: 系统检查 Redis 中的缓存有效令牌
   - 如果没有有效令牌，生成微信二维码进行认证
   - 二维码显示在控制台并可选择通过邮件发送
   - 系统等待用户使用微信扫描二维码
   - 成功扫描后，令牌缓存在 Redis 中

2. **签到流程**:
   - 获取配置学校的签到信息
   - 提交包含位置信息的签到（默认使用配置的坐标）
   - 发送结果通知邮件（如果配置）

3. **位置**: 系统使用默认位置（上饶师范学院，坐标：28.423147, 117.976543），但可自定义

## 📁 项目结构

```
school_checkin/
├── main.js                 # 主应用入口点
├── package.json            # 项目依赖和脚本
├── bun.lock                # Bun 锁定文件
├── .env                    # 环境变量（未提交）
├── lib/
│   ├── checkin-utils.js    # 签到相关函数
│   ├── email-utils.js      # 邮件通知工具
│   ├── qrcode-utils.js     # 二维码生成工具
│   ├── request.js          # HTTP 请求工具
│   ├── token-info.js       # 令牌管理和认证
│   └── wechat-utils.js     # 微信 API 工具
└── README.md               # 此文件
```

## 🔧 自定义

### 更改签到位置

修改 `lib/checkin-utils.js` 中的 `DEFAULT_LOCATION`：

```javascript
const DEFAULT_LOCATION = {
  latitude: YOUR_LATITUDE,
  longitude: YOUR_LONGITUDE,
}
```

### 更改签到主题

修改 `lib/checkin-utils.js` 中的 `THREAD_ID` 以针对不同的签到主题：

```javascript
const THREAD_ID = YOUR_THREAD_ID
```

### 自定义签名

可以通过在 `main.js` 中修改 `submitCheckIn` 调用的 `signature` 参数来自定义签名：

```javascript
const result = await submitCheckIn(token_info.token, '您的姓名')
```

## 🔐 安全性

- 令牌存储在 Redis 中并设置过期时间
- 使用环境变量存储敏感配置
- HTTP 请求通过安全连接发出
- Redis 连接使用 SSL (`rediss://`)

## 🐛 故障排除

### 常见问题

1. **Redis 连接问题**:
   - 确保 Redis 正在运行且配置的地址可访问
   - 验证 `.env` 文件中的 `REDIS_TOKEN` 和 `REDIS_ADDR`

2. **微信登录不工作**:
   - 确保可以访问 `open.weixin.qq.com` 和 `i-api.jielong.com`
   - 如在企业网络后运行，请检查防火墙设置

3. **邮件通知不工作**:
   - 验证 `.env` 文件中的 SMTP 配置
   - 检查您的邮件提供商是否支持配置的 SMTP 设置
   - 某些提供商需要应用专用密码

### 启用调试

添加以下行以查看更详细的日志：

```javascript
// 在 main.js 或相关文件中添加调试
console.log("调试信息:", variable_to_debug);
```

## 🤝 贡献

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/awesome-feature`)
3. 提交您的更改 (`git commit -m 'Add some awesome feature'`)
4. 推送到分支 (`git push origin feature/awesome-feature`)
5. 开启 Pull Request

## 📝 许可证

本项目使用 ISC 许可证。

## 🆘 支持

如果您遇到任何问题或有疑问：

1. 查看 [故障排除](#-故障排除) 部分
2. 搜索现有问题
3. 创建新问题并详细描述您的问题