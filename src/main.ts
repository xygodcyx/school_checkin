#!/usr/bin/env bun
import 'dotenv/config'
import { createApplication } from './app.js'
import { assertConfig, config } from '../lib/config.js'
import { formatDateTime, getCheckinTimeLabel } from '../lib/time-utils.js'
import { TokenInfo } from '../lib/token-info.js'
import { isEmailEnabled } from '../lib/email-utils.js'

assertConfig()

console.log('==============================================')
console.log('🚀 校园自动签到 Webhook 服务')
console.log(`🕒 当前时间：${formatDateTime(Date.now())}`)
console.log(`⏰ 每日签到：每天 ${getCheckinTimeLabel()}（${config.timezone}）`)
console.log(`📧 邮件通知：${isEmailEnabled() ? '已启用' : '未启用'}`)
console.log(`💾 Token 存储：${config.saveMode === 'remote' ? 'Redis' : '本地 config.json'}`)
console.log(`🌐 服务地址：${config.baseUrl}`)
console.log('==============================================')

const application = await createApplication()

try {
  const token = await TokenInfo.load()
  if (token.isValid()) {
    console.log(`✅ 当前 Token 有效，过期时间：${formatDateTime(token.expire!)}`)
  } else if (isEmailEnabled()) {
    console.log('⚠️ 当前没有有效 Token，服务会在启动后发送一次登录提醒。')
  } else {
    console.log('⚠️ 当前没有有效 Token，且邮件通知未启用；请配置 SMTP 或手动访问 /webhook/login。')
  }
} catch (err: any) {
  console.warn(`⚠️ 启动时读取 Token 失败：${err?.message || err}`)
}

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  idleTimeout: 60,
  fetch: application.fetch,
})

application.start()

console.log(`✅ 服务已在 http://${config.host}:${config.port} 启动`)
if (config.baseUrl.startsWith('http://localhost')) {
  console.log(`⚠️ 当前 BASE_URL 为 ${config.baseUrl}，邮件中的按钮仅能在本机访问，请在部署后配置公网地址。`)
}
console.log('==============================================')

let shuttingDown = false

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  console.log(`\n🛑 收到 ${signal}，正在关闭服务...`)

  try {
    server.stop()
    await application.stop()
    console.log('👋 服务已安全关闭')
    process.exit(0)
  } catch (err: any) {
    console.error(`❌ 关闭服务失败：${err?.message || err}`)
    process.exit(1)
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
