import nodemailer, { type Transporter } from 'nodemailer'
import { config } from './config.js'
import {
  buildCheckinResultEmail,
  buildLoginQrEmail,
  buildLoginRequiredEmail,
  buildLoginSuccessEmail,
  buildTokenExpiringEmail,
  type EmailContent,
} from './email-templates.js'
import { actionUrl, qrPageUrl } from './urls.js'
import type { LoginSource } from './login-manager.js'

interface MailAttachment {
  filename: string
  content: Buffer
  contentType: string
  cid: string
}

let transporter: Transporter | null = null

export function isEmailEnabled(): boolean {
  return config.email.enabled
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    })
  }

  return transporter
}

async function sendMail(content: EmailContent, attachments: MailAttachment[] = []): Promise<boolean> {
  if (!config.email.enabled) {
    console.warn(`⚠️ 邮件功能未启用，跳过发送：${content.subject}`)
    return false
  }

  try {
    const info = await getTransporter().sendMail({
      from: `"${config.email.fromName}" <${config.email.user}>`,
      to: config.email.to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      attachments,
      headers: {
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
      },
    })

    console.log(`📧 邮件已发送：${content.subject}（${info.messageId}）`)
    return true
  } catch (err: any) {
    console.error(`❌ 邮件发送失败：${content.subject} - ${err?.message || err}`)
    return false
  }
}

export async function sendLoginRequiredEmail(options: {
  reason: 'missing' | 'expired' | 'checkin' | 'login-failed'
  currentExpire: number | null
  estimatedNextExpire: number
}): Promise<boolean> {
  const loginSource = options.reason === 'checkin' ? 'checkin' : 'invalid'
  const content = buildLoginRequiredEmail({
    reason: options.reason,
    currentExpire: options.currentExpire,
    estimatedNextExpire: options.estimatedNextExpire,
    loginUrl: actionUrl('/webhook/login', { source: loginSource }),
    statusUrl: actionUrl('/status'),
  })

  return sendMail(content)
}

export async function sendLoginQrEmail(options: {
  uuid: string
  qrBuffer: Buffer
  qrContentType: string
  currentExpire: number | null
  estimatedNextExpire: number
  expiresAt: number
  source: LoginSource
}): Promise<boolean> {
  const qrCid = 'wechat-login-qr'
  const content = buildLoginQrEmail({
    uuid: options.uuid,
    qrCid,
    currentExpire: options.currentExpire,
    estimatedNextExpire: options.estimatedNextExpire,
    expiresAt: options.expiresAt,
    qrPageUrl: qrPageUrl(options.uuid),
    statusUrl: actionUrl('/status'),
    source: options.source,
  })

  const extension = options.qrContentType === 'image/png' ? 'png' : 'jpg'

  return sendMail(content, [
    {
      filename: `wechat-login-${options.uuid}.${extension}`,
      content: options.qrBuffer,
      contentType: options.qrContentType,
      cid: qrCid,
    },
  ])
}

export async function sendLoginSuccessEmail(options: {
  expire: number
  previousExpire: number | null
  autoCheckin: boolean
}): Promise<boolean> {
  const content = buildLoginSuccessEmail({
    expire: options.expire,
    previousExpire: options.previousExpire,
    autoCheckin: options.autoCheckin,
    checkinUrl: actionUrl('/confirm/checkin'),
    statusUrl: actionUrl('/status'),
  })

  return sendMail(content)
}

export async function sendTokenExpiringEmail(options: {
  expire: number
  estimatedNextExpire: number
}): Promise<boolean> {
  const content = buildTokenExpiringEmail({
    expire: options.expire,
    estimatedNextExpire: options.estimatedNextExpire,
    loginUrl: actionUrl('/webhook/login', { source: 'warning' }),
    checkinUrl: actionUrl('/confirm/checkin'),
    statusUrl: actionUrl('/status'),
  })

  return sendMail(content)
}

export async function sendCheckinResultEmail(options: {
  success: boolean
  message: string
  checkedAt: number
  tokenExpire: number | null
  authRequired: boolean
  infoSummary: string
}): Promise<boolean> {
  const content = buildCheckinResultEmail({
    success: options.success,
    message: options.message,
    checkedAt: options.checkedAt,
    name: config.name,
    threadId: config.checkin.threadId,
    location: config.checkin.locationLabel,
    tokenExpire: options.tokenExpire,
    authRequired: options.authRequired,
    infoSummary: options.infoSummary,
    retryUrl: actionUrl('/confirm/checkin', { force: '1' }),
    loginUrl: actionUrl('/webhook/login', { source: 'checkin' }),
    statusUrl: actionUrl('/status'),
  })

  return sendMail(content)
}
