import {
  describeNextCheckin,
  formatDateTime,
  formatDateTimeShort,
  formatDuration,
  getCheckinTimeLabel,
  getPostLoginCheckinWindowLabel,
} from './time-utils.js'

type Tone = 'primary' | 'success' | 'warning' | 'danger'

export interface EmailContent {
  subject: string
  html: string
  text: string
}

interface EmailAction {
  label: string
  url: string
  variant?: 'primary' | 'secondary' | 'danger'
}

interface LayoutOptions {
  subject: string
  preheader: string
  kicker: string
  title: string
  subtitle: string
  badge: string
  tone: Tone
  icon: string
  content: string
  footerNote?: string
}

const TONE_META: Record<Tone, { gradient: string; fallback: string; accent: string; soft: string; border: string }> = {
  primary: {
    gradient: 'linear-gradient(135deg,#312e81 0%,#4f46e5 55%,#7c3aed 100%)',
    fallback: '#4338ca',
    accent: '#4f46e5',
    soft: '#eef2ff',
    border: '#c7d2fe',
  },
  success: {
    gradient: 'linear-gradient(135deg,#064e3b 0%,#059669 55%,#10b981 100%)',
    fallback: '#047857',
    accent: '#059669',
    soft: '#ecfdf5',
    border: '#a7f3d0',
  },
  warning: {
    gradient: 'linear-gradient(135deg,#78350f 0%,#d97706 55%,#f59e0b 100%)',
    fallback: '#b45309',
    accent: '#d97706',
    soft: '#fffbeb',
    border: '#fde68a',
  },
  danger: {
    gradient: 'linear-gradient(135deg,#7f1d1d 0%,#dc2626 55%,#f43f5e 100%)',
    fallback: '#b91c1c',
    accent: '#dc2626',
    soft: '#fef2f2',
    border: '#fecaca',
  },
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderButton(action: EmailAction): string {
  const variant = action.variant || 'primary'
  const isPrimary = variant === 'primary'
  const isDanger = variant === 'danger'
  const background = isDanger ? '#dc2626' : isPrimary ? '#4f46e5' : '#ffffff'
  const color = isPrimary || isDanger ? '#ffffff' : '#4338ca'
  const border = isDanger ? '#dc2626' : isPrimary ? '#4f46e5' : '#c7d2fe'
  const className = isPrimary || isDanger ? 'email-btn-solid' : 'email-btn-secondary'

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
    <tr>
      <td bgcolor="${background}" class="${className}" style="border-radius:12px;border:1px solid ${border};background-color:${background};">
        <a href="${escapeHtml(action.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;font-weight:700;line-height:1.2;color:${color};text-decoration:none;border-radius:12px;">${escapeHtml(action.label)} &rarr;</a>
      </td>
    </tr>
  </table>`
}

function renderActions(actions: EmailAction[]): string {
  if (actions.length === 0) return ''

  return `<div style="margin-top:26px;">
    ${actions
      .map(
        (action, index) =>
          `${index > 0 ? '<div style="height:10px;line-height:10px;font-size:10px;">&nbsp;</div>' : ''}${renderButton(action)}`,
      )
      .join('')}
  </div>`
}

function renderInfoRow(label: string, value: string, isFirst = false): string {
  return `<tr>
    <td class="text-muted divider" style="padding:14px 0;${isFirst ? '' : 'border-top:1px solid #e2e8f0;'}font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:13px;line-height:1.6;color:#64748b;vertical-align:top;width:42%;">${escapeHtml(label)}</td>
    <td class="text-main" style="padding:14px 0 14px 18px;${isFirst ? '' : 'border-top:1px solid #e2e8f0;'}font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:14px;font-weight:600;line-height:1.6;color:#0f172a;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(value)}</td>
  </tr>`
}

function renderInfoCard(title: string, rows: Array<[string, string]>): string {
  return `<div style="margin-top:24px;">
    <div class="text-muted" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:12px;font-weight:700;letter-spacing:1.2px;color:#64748b;text-transform:uppercase;margin-bottom:8px;">${escapeHtml(title)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="surface" style="border-collapse:collapse;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;">
      <tr>
        <td style="padding:4px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            ${rows.map(([label, value], index) => renderInfoRow(label, value, index === 0)).join('')}
          </table>
        </td>
      </tr>
    </table>
  </div>`
}

function renderCallout(tone: Tone, title: string, body: string): string {
  const meta = TONE_META[tone]
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border-collapse:separate;">
    <tr>
      <td style="background-color:${meta.soft};border:1px solid ${meta.border};border-left:4px solid ${meta.accent};border-radius:14px;padding:16px 18px;">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:14px;font-weight:700;color:#0f172a;line-height:1.5;">${escapeHtml(title)}</div>
        <div class="text-muted" style="margin-top:5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:13px;line-height:1.75;color:#475569;overflow-wrap:anywhere;word-break:break-word;">${body}</div>
      </td>
    </tr>
  </table>`
}

function renderParagraph(text: string): string {
  return `<p class="text-main" style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:15px;line-height:1.85;color:#334155;overflow-wrap:anywhere;word-break:break-word;">${text}</p>`
}

function renderLayout(options: LayoutOptions): string {
  const tone = TONE_META[options.tone]
  const generatedAt = formatDateTime(Date.now())

  return `<!DOCTYPE html>
<html lang="zh-CN" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(options.subject)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    table { border-collapse: collapse; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a { text-decoration: none; }
    .email-shell { background-color: #eef2f9; background-image: linear-gradient(180deg, #eef2f9 0%, #e5ebf7 100%); }
    .email-card { background-color: #ffffff; border-radius: 22px; overflow: hidden; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.12); }
    .email-header { background-color: ${tone.fallback}; background-image: ${tone.gradient}; }
    .email-pill { background-color: rgba(255, 255, 255, 0.18); border: 1px solid rgba(255, 255, 255, 0.28); }
    .email-content { padding: 34px 38px 30px; }
    .email-title { font-size: 26px; line-height: 1.3; letter-spacing: -0.4px; }
    .email-btn-secondary { background-color: #ffffff; }
    .qr-shell { background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; }
    @media (max-width: 640px) {
      .email-content { padding: 26px 22px 22px !important; }
      .email-header { padding: 28px 22px !important; }
      .email-title { font-size: 22px !important; }
      .email-footer { padding-left: 22px !important; padding-right: 22px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .email-shell { background-color: #0b1120 !important; background-image: none !important; }
      .email-card { background-color: #111827 !important; box-shadow: none !important; }
      .text-main { color: #e5e7eb !important; }
      .text-muted { color: #94a3b8 !important; }
      .surface { background-color: #0f172a !important; border-color: #1e293b !important; }
      .divider { border-color: #1e293b !important; }
      .email-btn-secondary { background-color: #1e293b !important; border-color: #334155 !important; }
      .email-btn-secondary a { color: #c7d2fe !important; }
      .email-footer { color: #64748b !important; }
      .qr-shell { background-color: #f8fafc !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#eef2f9;">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#eef2f9;">${escapeHtml(options.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-shell" style="width:100%;background-color:#eef2f9;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;">
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-card" style="width:100%;background-color:#ffffff;border-radius:22px;overflow:hidden;">
                <tr>
                  <td class="email-header" bgcolor="${tone.fallback}" style="padding:32px 38px;background-color:${tone.fallback};background-image:${tone.gradient};">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" width="54" style="width:54px;">
                          <div style="width:52px;height:52px;line-height:52px;text-align:center;border-radius:16px;background-color:rgba(255,255,255,0.16);border:1px solid rgba(255,255,255,0.22);font-size:26px;">${options.icon}</div>
                        </td>
                        <td valign="middle" style="padding-left:14px;">
                          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;line-height:1.4;color:#dbeafe;text-transform:uppercase;">${escapeHtml(options.kicker)}</div>
                          <div style="margin-top:3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:17px;font-weight:700;line-height:1.4;color:#ffffff;">校园自动签到</div>
                        </td>
                        <td align="right" valign="middle">
                          <span class="email-pill" style="display:inline-block;padding:6px 11px;border-radius:999px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:11px;font-weight:700;line-height:1.4;color:#ffffff;">${escapeHtml(options.badge)}</span>
                        </td>
                      </tr>
                    </table>
                    <h1 class="email-title" style="margin:26px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:26px;font-weight:800;line-height:1.3;letter-spacing:-0.4px;color:#ffffff;">${escapeHtml(options.title)}</h1>
                    <p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:14px;line-height:1.7;color:#e0e7ff;">${escapeHtml(options.subtitle)}</p>
                  </td>
                </tr>
                <tr>
                  <td class="email-content" style="padding:34px 38px 30px;">
                    ${options.content}
                  </td>
                </tr>
                <tr>
                  <td class="email-footer" style="padding:0 38px 30px;">
                    <div style="border-top:1px solid #e2e8f0;padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:12px;line-height:1.75;color:#94a3b8;">
                      ${options.footerNote ? `<div style="margin-bottom:5px;">${escapeHtml(options.footerNote)}</div>` : ''}
                      <div>本邮件由校园自动签到服务于 ${escapeHtml(generatedAt)} 生成。</div>
                      <div style="margin-top:3px;">如非本人操作，请忽略此邮件。</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildText(lines: Array<string | null | undefined>): string {
  return lines.filter((line): line is string => Boolean(line)).join('\n')
}

export function buildLoginRequiredEmail(options: {
  reason: 'missing' | 'expired' | 'checkin' | 'login-failed'
  currentExpire: number | null
  estimatedNextExpire: number
  loginUrl: string
  statusUrl: string
}): EmailContent {
  const reasonMap = {
    missing: {
      title: '需要登录微信',
      badge: '需要登录',
      tone: 'warning' as Tone,
      icon: '🔐',
      message: '服务尚未检测到有效的微信登录状态，自动签到暂时无法执行。',
    },
    expired: {
      title: '微信登录已过期',
      badge: '登录过期',
      tone: 'danger' as Tone,
      icon: '🔐',
      message: '当前微信登录状态已过期，请重新扫码以恢复自动签到。',
    },
    checkin: {
      title: '今日签到未能执行',
      badge: '签到未完成',
      tone: 'danger' as Tone,
      icon: '⚠️',
      message: `今日 ${getCheckinTimeLabel()} 的自动签到因登录状态失效而未能执行。`,
    },
    'login-failed': {
      title: '扫码成功，但登录未完成',
      badge: '登录异常',
      tone: 'danger' as Tone,
      icon: '⚠️',
      message: '微信扫码已成功，但在换取 Token 时出现异常，请重新获取登录二维码。',
    },
  }

  const meta = reasonMap[options.reason]
  const currentExpireText = options.currentExpire
    ? `${formatDateTime(options.currentExpire)}${options.currentExpire <= Date.now() ? '（已过期）' : ''}`
    : '暂无有效登录记录'

  const subject =
    options.reason === 'checkin'
      ? `⚠️ 今日签到未执行 · 请重新登录微信`
      : options.reason === 'login-failed'
        ? '⚠️ 微信登录未完成 · 请重新扫码'
        : '🔐 需要重新登录微信 · 校园签到服务'

  const content = `
    ${renderParagraph(`<strong>${escapeHtml(meta.message)}</strong>`)}
    ${renderInfoCard('登录状态', [
      ['当前 Token 过期时间', currentExpireText],
      ['重新登录后预计有效期至', formatDateTime(options.estimatedNextExpire)],
      ['每日自动签到时间', `每天 ${getCheckinTimeLabel()}（${describeNextCheckin()}）`],
    ])}
    ${renderCallout(
      'warning',
      '如何恢复自动签到？',
      `点击下方“接收登录二维码”按钮，系统会立即发送一封包含登录二维码的邮件。请使用微信扫一扫完成授权，二维码约 5 分钟内有效。登录成功后，你会收到一封包含实际 Token 过期时间的确认邮件。如果在当天 ${getPostLoginCheckinWindowLabel()} 内完成登录，系统会自动补签一次。`,
    )}
    ${renderActions([
      { label: '接收登录二维码', url: options.loginUrl },
      { label: '查看服务状态', url: options.statusUrl, variant: 'secondary' },
    ])}
    ${renderCallout(
      'primary',
      '说明',
      '本服务不会反复发送提醒邮件。每次点击“接收登录二维码”才会发送一封新的二维码邮件，避免邮箱被重复通知打扰。',
    )}
  `

  return {
    subject,
    html: renderLayout({
      subject,
      preheader: `${meta.message} 点击邮件中的按钮获取登录二维码。`,
      kicker: 'Security Notice',
      title: meta.title,
      subtitle: '完成微信授权后，自动签到将恢复正常。',
      badge: meta.badge,
      tone: meta.tone,
      icon: meta.icon,
      content,
      footerNote: '登录提醒仅在需要时发送一次，不会循环发送。',
    }),
    text: buildText([
      '校园自动签到 - 登录提醒',
      '',
      meta.message,
      '',
      `当前 Token 过期时间：${currentExpireText}`,
      `重新登录后预计有效期至：${formatDateTime(options.estimatedNextExpire)}`,
      `每日自动签到时间：每天 ${getCheckinTimeLabel()}`,
      '',
      `接收登录二维码：${options.loginUrl}`,
      `查看服务状态：${options.statusUrl}`,
      '',
      '点击按钮后系统会发送一封包含二维码的邮件，二维码约 5 分钟内有效。',
      `如果在当天 ${getPostLoginCheckinWindowLabel()} 内完成登录，系统会自动补签一次。`,
      '本服务不会反复发送提醒邮件。',
    ]),
  }
}

export function buildLoginQrEmail(options: {
  uuid: string
  qrCid: string
  currentExpire: number | null
  estimatedNextExpire: number
  expiresAt: number
  qrPageUrl: string
  statusUrl: string
  source: string
}): EmailContent {
  const subject = `📱 微信登录二维码 · ${formatDateTimeShort(options.expiresAt)} 前有效`
  const currentExpireText = options.currentExpire
    ? `${formatDateTime(options.currentExpire)}${options.currentExpire <= Date.now() ? '（已过期）' : ''}`
    : '暂无有效登录记录'

  const content = `
    ${renderParagraph('请使用微信扫描下方二维码完成登录授权。扫码成功后，服务会自动保存新的登录状态并发送确认邮件。')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="qr-shell" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:20px;">
            <tr>
              <td align="center" style="padding:20px;">
                <img src="cid:${escapeHtml(options.qrCid)}" width="228" height="228" alt="微信登录二维码" style="display:block;width:228px;max-width:228px;height:auto;border:0;border-radius:12px;">
                <div class="text-muted" style="margin-top:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:12px;line-height:1.6;color:#64748b;">二维码有效至 ${escapeHtml(formatDateTime(options.expiresAt))}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${renderInfoCard('登录与有效期', [
      ['当前 Token 过期时间', currentExpireText],
      ['扫码登录后预计有效期至', formatDateTime(options.estimatedNextExpire)],
      ['二维码有效期至', formatDateTime(options.expiresAt)],
      ['每日自动签到时间', `每天 ${getCheckinTimeLabel()}`],
    ])}
    ${renderCallout(
      'primary',
      '扫码后会发生什么？',
      '微信确认授权后，系统会立即保存新的 Token，并发送一封“登录成功”邮件，邮件中会写明本次 Token 实际可持续到的具体时间（精确到分钟，并包含星期）。',
    )}
    ${renderActions([
      { label: '在浏览器中打开二维码', url: options.qrPageUrl, variant: 'secondary' },
      { label: '查看服务状态', url: options.statusUrl, variant: 'secondary' },
    ])}
    ${renderCallout(
      'warning',
      '二维码过期了怎么办？',
      '如果二维码已经失效，请回到上一封提醒邮件，再次点击“接收登录二维码”即可重新生成。服务不会自动重复发送邮件。',
    )}
  `

  return {
    subject,
    html: renderLayout({
      subject,
      preheader: `微信登录二维码，${formatDateTime(options.expiresAt)} 前有效。`,
      kicker: 'WeChat Login',
      title: '微信登录二维码',
      subtitle: '使用微信扫一扫，即可恢复自动签到。',
      badge: '等待扫码',
      tone: 'primary',
      icon: '📱',
      content,
      footerNote: `二维码来源：${
        options.source === 'checkin'
          ? '签到失败重试'
          : options.source === 'invalid'
            ? '登录失效提醒'
            : '手动获取'
      }`,
    }),
    text: buildText([
      '校园自动签到 - 微信登录二维码',
      '',
      '请使用微信扫描邮件中的二维码完成登录授权。',
      `二维码有效至：${formatDateTime(options.expiresAt)}`,
      `当前 Token 过期时间：${currentExpireText}`,
      `扫码登录后预计有效期至：${formatDateTime(options.estimatedNextExpire)}`,
      '',
      `在浏览器中打开二维码：${options.qrPageUrl}`,
      `查看服务状态：${options.statusUrl}`,
      '',
      '二维码过期后，请回到提醒邮件再次点击“接收登录二维码”。',
    ]),
  }
}

export function buildLoginSuccessEmail(options: {
  expire: number
  previousExpire: number | null
  autoCheckin: boolean
  checkinUrl: string
  statusUrl: string
}): EmailContent {
  const subject = `✅ 登录成功 · Token 有效期至 ${formatDateTimeShort(options.expire)}`
  const remaining = formatDuration(options.expire - Date.now())

  const content = `
    ${renderParagraph('微信登录已完成，新的 Token 已安全保存。自动签到服务已恢复正常。')}
    ${renderInfoCard('新的登录有效期', [
      ['Token 过期时间', formatDateTime(options.expire)],
      ['剩余有效期', remaining],
      ['本次登录时间', formatDateTime(Date.now())],
      ...(options.previousExpire ? ([['上次 Token 过期时间', formatDateTime(options.previousExpire)]] as Array<[string, string]>) : []),
      ['下一次自动签到', describeNextCheckin()],
    ])}
    ${renderCallout(
      'success',
      '登录成功',
      options.autoCheckin
        ? '检测到今日签到尚未完成，系统正在自动继续执行签到，签到结果将单独发送一封邮件。'
        : `Token 有效期已更新。下一次自动签到将在${describeNextCheckin()}进行，请保持服务在线。`,
    )}
    ${renderActions([
      { label: '立即签到', url: options.checkinUrl },
      { label: '查看服务状态', url: options.statusUrl, variant: 'secondary' },
    ])}
  `

  return {
    subject,
    html: renderLayout({
      subject,
      preheader: `登录成功，Token 有效期至 ${formatDateTime(options.expire)}。`,
      kicker: 'Login Success',
      title: '登录成功，Token 已更新',
      subtitle: '新的登录状态已保存，自动签到已恢复。',
      badge: '已续期',
      tone: 'success',
      icon: '✅',
      content,
      footerNote: '请妥善保管邮箱与服务地址，避免他人获取登录二维码。',
    }),
    text: buildText([
      '校园自动签到 - 登录成功',
      '',
      `Token 过期时间：${formatDateTime(options.expire)}`,
      `剩余有效期：${remaining}`,
      ...(options.previousExpire ? [`上次 Token 过期时间：${formatDateTime(options.previousExpire)}`] : []),
      `下一次自动签到：${describeNextCheckin()}`,
      '',
      options.autoCheckin
        ? '检测到今日签到尚未完成，系统正在继续执行签到，结果将单独发送。'
        : '新的 Token 已保存，自动签到服务已恢复。',
      '',
      `立即签到：${options.checkinUrl}`,
      `查看服务状态：${options.statusUrl}`,
    ]),
  }
}

export function buildCheckinResultEmail(options: {
  success: boolean
  message: string
  checkedAt: number
  name: string
  threadId: number
  location: string
  tokenExpire: number | null
  authRequired: boolean
  infoSummary: string
  retryUrl: string
  loginUrl: string
  statusUrl: string
}): EmailContent {
  const tone: Tone = options.success ? 'success' : options.authRequired ? 'warning' : 'danger'
  const subject = options.success
    ? `✅ 签到成功 · ${formatDateTimeShort(options.checkedAt)}`
    : options.authRequired
      ? `⚠️ 签到未执行 · 登录已过期 · ${formatDateTimeShort(options.checkedAt)}`
      : `❌ 签到失败 · ${formatDateTimeShort(options.checkedAt)}`

  const title = options.success ? '今日签到成功' : options.authRequired ? '今日签到未能执行' : '今日签到失败'
  const badge = options.success ? '签到成功' : options.authRequired ? '需要登录' : '签到失败'
  const icon = options.success ? '✅' : '⚠️'
  const tokenExpireText = options.tokenExpire
    ? `${formatDateTime(options.tokenExpire)}${options.tokenExpire < Date.now() ? '（已过期）' : ''}`
    : '暂无有效 Token'
  const locationText = options.location || '上饶市信州区•上饶师范学院'

  const rows: Array<[string, string]> = [
    ['签到时间', formatDateTime(options.checkedAt)],
    ['签到人', options.name],
    ['签到任务 ID', String(options.threadId)],
    ['签到地点', locationText],
    ['当前 Token 有效期至', tokenExpireText],
    ...(options.infoSummary ? ([['签到主题', options.infoSummary]] as Array<[string, string]>) : []),
    ['服务响应', options.message],
  ]

  const failureAction: EmailAction = options.authRequired
    ? { label: '接收登录二维码', url: options.loginUrl }
    : { label: '重新签到', url: options.retryUrl }

  const content = `
    ${renderCallout(
      tone,
      options.success ? '签到已完成' : options.authRequired ? '登录已过期，本次签到未执行' : '签到请求未成功',
      escapeHtml(options.message),
    )}
    ${renderInfoCard('签到详情', rows)}
    ${
      options.success
        ? renderCallout(
            'success',
            '下一次签到',
            `系统将在${escapeHtml(describeNextCheckin())}自动执行下一次签到，并在完成后发送结果邮件。`,
          )
        : renderCallout(
            options.authRequired ? 'warning' : 'danger',
            '接下来怎么做？',
            options.authRequired
              ? `请先点击下方按钮获取登录二维码。如果在当天 ${getPostLoginCheckinWindowLabel()} 内完成登录，系统会自动补签一次；其他时间登录请等待下一次定时签到。`
              : '可以点击“重新签到”立即重试。如果多次失败，请检查服务日志或查看服务状态页面。',
          )
    }
    ${renderActions(
      options.success
        ? [{ label: '查看服务状态', url: options.statusUrl, variant: 'secondary' }]
        : [
            failureAction,
            {
              label: options.authRequired ? '重新签到' : '接收登录二维码',
              url: options.authRequired ? options.retryUrl : options.loginUrl,
              variant: 'secondary',
            },
            { label: '查看服务状态', url: options.statusUrl, variant: 'secondary' },
          ],
    )}
  `

  return {
    subject,
    html: renderLayout({
      subject,
      preheader: options.success
        ? `签到成功，完成时间 ${formatDateTime(options.checkedAt)}。`
        : `签到未完成：${options.message}`,
      kicker: 'Daily Check-in',
      title,
      subtitle: `每天 ${getCheckinTimeLabel()} 自动签到结果通知`,
      badge,
      tone,
      icon,
      content,
      footerNote: '如果对签到结果有疑问，可通过服务状态页面查看最近一次执行记录。',
    }),
    text: buildText([
      `校园自动签到 - ${title}`,
      '',
      `签到时间：${formatDateTime(options.checkedAt)}`,
      `签到人：${options.name}`,
      `签到任务 ID：${options.threadId}`,
      `签到地点：${locationText}`,
      `当前 Token 有效期至：${tokenExpireText}`,
      `服务响应：${options.message}`,
      '',
      options.success ? `下一次签到：${describeNextCheckin()}` : `重新签到：${options.retryUrl}`,
      ...(options.authRequired
        ? [`登录后自动补签：当天 ${getPostLoginCheckinWindowLabel()} 内完成登录会自动补签一次`]
        : []),
      `接收登录二维码：${options.loginUrl}`,
      `查看服务状态：${options.statusUrl}`,
    ]),
  }
}
