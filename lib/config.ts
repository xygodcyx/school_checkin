import 'dotenv/config'
import path from 'path'
import { getRootPath } from './path-utils.js'

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) ? value : fallback
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const port = envInt('PORT', 3000)
const baseUrl = (process.env.BASE_URL || process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '')

const smtpPort = envInt('SMTP_PORT', 465)
const smtpUser = process.env.SMTP_USER?.trim() || ''
const smtpPass = process.env.SMTP_PASS || ''
const toEmail = process.env.TO_EMAIL?.trim() || ''

export const config = {
  name: process.env.NAME?.trim() || '',
  host: process.env.HOST || '0.0.0.0',
  port,
  baseUrl,
  webhookSecret: process.env.WEBHOOK_SECRET?.trim() || '',
  timezone: process.env.APP_TIMEZONE || 'Asia/Shanghai',

  saveMode: process.env.SAVE_MODE === 'remote' ? ('remote' as const) : ('local' as const),
  redis: {
    token: process.env.REDIS_TOKEN || '',
    addr: process.env.REDIS_ADDR || '',
  },

  checkin: {
    hour: clamp(envInt('CHECKIN_HOUR', 18), 0, 23),
    minute: clamp(envInt('CHECKIN_MINUTE', 0), 0, 59),
    threadId: envInt('THREAD_ID', 183058660),
    location: {
      latitude: envNumber('CHECKIN_LATITUDE', 28.423147),
      longitude: envNumber('CHECKIN_LONGITUDE', 117.976543),
    },
    locationLabel: process.env.CHECKIN_LOCATION_LABEL || '上饶市信州区•上饶师范学院',
  },

  token: {
    defaultTtlHours: Math.max(1, envNumber('TOKEN_TTL_HOURS', 72)),
  },

  login: {
    qrTtlSeconds: Math.max(60, envInt('QR_TTL_SECONDS', 300)),
    resendIntervalMs: Math.max(0, envInt('QR_EMAIL_RESEND_SECONDS', 10)) * 1000,
  },

  email: {
    host: process.env.SMTP_HOST?.trim() || 'smtp.qq.com',
    port: smtpPort,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : smtpPort === 465,
    user: smtpUser,
    pass: smtpPass,
    to: toEmail,
    fromName: process.env.EMAIL_FROM_NAME || '校园签到助手',
    enabled: Boolean(smtpUser && smtpPass && toEmail),
  },

  stateFile: process.env.STATE_FILE
    ? path.resolve(process.env.STATE_FILE)
    : path.join(getRootPath(), 'data', 'state.json'),
}

export type AppConfig = typeof config

export function assertConfig(): void {
  if (!config.name) {
    throw new Error('❌ 请设置环境变量 NAME 为您的姓名')
  }

  try {
    const baseUrl = new URL(config.baseUrl)
    if (!['http:', 'https:'].includes(baseUrl.protocol)) {
      throw new Error('协议必须是 http 或 https')
    }
  } catch (err: any) {
    throw new Error(`❌ BASE_URL 不是合法地址：${config.baseUrl}（${err?.message || err}）`)
  }

  if (config.saveMode === 'remote' && (!config.redis.token || !config.redis.addr)) {
    throw new Error('❌ SAVE_MODE=remote 时必须设置 REDIS_TOKEN 和 REDIS_ADDR')
  }

  if (!config.email.enabled) {
    console.warn('⚠️ 邮件配置不完整，邮件通知已禁用。请设置 SMTP_USER、SMTP_PASS、TO_EMAIL。')
  }

  if (!config.webhookSecret) {
    console.warn('⚠️ 未设置 WEBHOOK_SECRET，Webhook 操作链接将没有鉴权保护，建议在生产环境配置。')
  }

  if (!process.env.BASE_URL && !process.env.PUBLIC_BASE_URL) {
    console.warn(`⚠️ 未设置 BASE_URL，邮件中的操作链接将使用 ${config.baseUrl}，外部邮箱可能无法访问。`)
  }
}
