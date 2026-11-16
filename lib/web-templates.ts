import { escapeHtml } from './email-templates.js'
import { getCheckinTimeLabel } from './time-utils.js'

export type PageTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral'

export interface PageAction {
  label: string
  href: string
  variant?: 'primary' | 'secondary' | 'danger'
}

interface PageOptions {
  title: string
  kicker: string
  subtitle: string
  tone: PageTone
  badge: string
  icon: string
  content: string
  actions?: PageAction[]
  footer?: string
}

const TONE_VARS: Record<PageTone, { accent: string; accentDark: string; soft: string; border: string }> = {
  primary: { accent: '#4f46e5', accentDark: '#3730a3', soft: '#eef2ff', border: '#c7d2fe' },
  success: { accent: '#059669', accentDark: '#065f46', soft: '#ecfdf5', border: '#a7f3d0' },
  warning: { accent: '#d97706', accentDark: '#92400e', soft: '#fffbeb', border: '#fde68a' },
  danger: { accent: '#dc2626', accentDark: '#991b1b', soft: '#fef2f2', border: '#fecaca' },
  neutral: { accent: '#475569', accentDark: '#1e293b', soft: '#f8fafc', border: '#e2e8f0' },
}

function renderButton(action: PageAction): string {
  const variant = action.variant || 'primary'
  return `<a class="btn btn-${variant}" href="${escapeHtml(action.href)}">${escapeHtml(action.label)} <span aria-hidden="true">&rarr;</span></a>`
}

function renderActions(actions: PageAction[] = []): string {
  if (!actions.length) return ''
  return `<div class="actions">${actions.map(renderButton).join('')}</div>`
}

function renderPage(options: PageOptions): string {
  const tone = TONE_VARS[options.tone]

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="${tone.accent}">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(options.title)} · 校园签到助手</title>
  <style>
    :root {
      --bg: #eef2f9;
      --surface: #ffffff;
      --surface-soft: #f8fafc;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --accent: ${tone.accent};
      --accent-dark: ${tone.accentDark};
      --accent-soft: ${tone.soft};
      --accent-border: ${tone.border};
      --shadow: 0 24px 70px rgba(15, 23, 42, 0.14);
      --radius: 22px;
    }
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 8% 0%, rgba(79, 70, 229, 0.18), transparent 30%),
        radial-gradient(circle at 92% 8%, rgba(14, 165, 233, 0.14), transparent 28%),
        linear-gradient(180deg, #f5f7fc 0%, var(--bg) 100%);
    }
    a { color: var(--accent); text-decoration: none; }
    .shell { width: 100%; max-width: 940px; margin: 0 auto; padding: 28px 18px 46px; }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 4px 20px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-mark {
      width: 44px; height: 44px; display: grid; place-items: center;
      border-radius: 14px; color: #fff; font-size: 22px;
      background: linear-gradient(135deg, #4338ca, #7c3aed 58%, #db2777);
      box-shadow: 0 12px 28px rgba(79, 70, 229, 0.32);
    }
    .brand-name { font-size: 15px; font-weight: 800; letter-spacing: -0.2px; }
    .brand-sub { margin-top: 2px; font-size: 11px; font-weight: 600; letter-spacing: 1.6px; color: var(--muted); text-transform: uppercase; }
    .top-link { font-size: 13px; font-weight: 700; color: var(--muted); }
    .card { overflow: hidden; background: var(--surface); border: 1px solid rgba(226, 232, 240, 0.8); border-radius: 28px; box-shadow: var(--shadow); }
    .hero {
      position: relative; overflow: hidden; padding: 34px 38px 32px;
      color: #fff; background:
        radial-gradient(circle at 90% -10%, rgba(255, 255, 255, 0.26), transparent 35%),
        linear-gradient(135deg, ${tone.accentDark} 0%, ${tone.accent} 58%, ${tone.accent} 100%);
    }
    .hero::after {
      content: ""; position: absolute; right: -60px; bottom: -100px; width: 260px; height: 260px;
      border-radius: 50%; background: rgba(255, 255, 255, 0.08);
    }
    .hero-top { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .hero-icon {
      width: 54px; height: 54px; display: grid; place-items: center; border-radius: 17px;
      font-size: 27px; background: rgba(255, 255, 255, 0.16); border: 1px solid rgba(255, 255, 255, 0.26);
      backdrop-filter: blur(10px);
    }
    .badge {
      display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border-radius: 999px;
      font-size: 11px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase;
      background: rgba(255, 255, 255, 0.17); border: 1px solid rgba(255, 255, 255, 0.28);
    }
    .badge-dot { width: 7px; height: 7px; border-radius: 50%; background: #86efac; box-shadow: 0 0 0 4px rgba(134, 239, 172, 0.16); }
    .kicker { margin-top: 24px; font-size: 11px; font-weight: 800; letter-spacing: 2.2px; text-transform: uppercase; color: rgba(255, 255, 255, 0.74); }
    h1 { position: relative; z-index: 1; margin: 7px 0 0; font-size: clamp(27px, 4.5vw, 38px); line-height: 1.15; letter-spacing: -1.1px; }
    .hero p { position: relative; z-index: 1; margin: 12px 0 0; max-width: 640px; font-size: 14px; line-height: 1.8; color: rgba(255, 255, 255, 0.84); }
    .content { padding: 32px 38px 38px; }
    .section { margin-top: 28px; }
    .section:first-child { margin-top: 0; }
    .section-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .section-title h2 { margin: 0; font-size: 13px; font-weight: 800; letter-spacing: 1.4px; color: var(--muted); text-transform: uppercase; }
    .section-title span { font-size: 12px; color: var(--muted); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
    .stat { padding: 18px 19px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-soft); }
    .stat-label { font-size: 11px; font-weight: 800; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; }
    .stat-value { margin-top: 8px; font-size: 19px; font-weight: 800; line-height: 1.35; letter-spacing: -0.3px; }
    .stat-value.small { font-size: 15px; line-height: 1.55; }
    .stat-hint { margin-top: 5px; font-size: 12px; line-height: 1.6; color: var(--muted); }
    .tone-success { color: #047857; }
    .tone-warning { color: #b45309; }
    .tone-danger { color: #b91c1c; }
    .tone-primary { color: #4338ca; }
    .data-card { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-soft); }
    .data-row { display: grid; grid-template-columns: minmax(130px, 0.42fr) 1fr; gap: 16px; padding: 14px 18px; border-top: 1px solid var(--border); }
    .data-row:first-child { border-top: 0; }
    .data-label { font-size: 13px; line-height: 1.65; color: var(--muted); }
    .data-value { font-size: 14px; font-weight: 650; line-height: 1.65; overflow-wrap: anywhere; }
    .callout { display: flex; gap: 14px; padding: 17px 18px; border: 1px solid var(--accent-border); border-left: 4px solid var(--accent); border-radius: 16px; background: var(--accent-soft); }
    .callout-icon { flex: 0 0 auto; font-size: 20px; line-height: 1.4; }
    .callout-title { font-size: 14px; font-weight: 800; line-height: 1.5; }
    .callout-body { margin-top: 4px; font-size: 13px; line-height: 1.75; color: #475569; overflow-wrap: anywhere; }
    .callout-body code { padding: 2px 5px; border-radius: 5px; background: rgba(15, 23, 42, 0.06); font-size: 12px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 18px; border-radius: 12px;
      font-family: inherit; font-size: 14px; font-weight: 800; line-height: 1.2; border: 1px solid transparent;
      cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .btn:hover { transform: translateY(-1px); }
    .btn-primary { color: #fff; background: linear-gradient(135deg, var(--accent-dark), var(--accent)); box-shadow: 0 10px 24px rgba(79, 70, 229, 0.22); }
    .btn-secondary { color: var(--accent-dark); background: var(--surface); border-color: var(--accent-border); }
    .btn-danger { color: #fff; background: linear-gradient(135deg, #991b1b, #dc2626); box-shadow: 0 10px 24px rgba(220, 38, 38, 0.2); }
    .qr-card { display: grid; place-items: center; padding: 22px; border: 1px solid var(--border); border-radius: 24px; background: #fff; }
    .qr-card img { display: block; width: min(300px, 100%); height: auto; border-radius: 14px; }
    .qr-caption { margin-top: 12px; text-align: center; font-size: 12px; line-height: 1.6; color: var(--muted); }
    .footer { padding: 24px 6px 0; text-align: center; font-size: 12px; line-height: 1.7; color: var(--muted); }
    .muted { color: var(--muted); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    @media (max-width: 640px) {
      .shell { padding: 18px 12px 36px; }
      .hero { padding: 26px 22px 26px; border-radius: 0; }
      .content { padding: 24px 20px 28px; }
      .data-row { grid-template-columns: 1fr; gap: 4px; }
      .top-link { display: none; }
      .actions { flex-direction: column; align-items: stretch; }
      .btn { justify-content: center; }
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #080d19;
        --surface: #101827;
        --surface-soft: #0b1220;
        --text: #e5e7eb;
        --muted: #94a3b8;
        --border: #1e293b;
        --shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
      }
      body { background: radial-gradient(circle at 8% 0%, rgba(79, 70, 229, 0.22), transparent 30%), #080d19; }
      .callout-body { color: #cbd5e1; }
      .btn-secondary { background: #0f172a; color: #c7d2fe; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <div class="topbar">
      <div class="brand">
        <div class="brand-mark">📅</div>
        <div>
          <div class="brand-name">校园自动签到</div>
          <div class="brand-sub">School Check-in Service</div>
        </div>
      </div>
      <a class="top-link" href="/">服务状态</a>
    </div>
    <article class="card">
      <header class="hero">
        <div class="hero-top">
          <div class="hero-icon">${escapeHtml(options.icon)}</div>
          <div class="badge"><span class="badge-dot"></span>${escapeHtml(options.badge)}</div>
        </div>
        <div class="kicker">${escapeHtml(options.kicker)}</div>
        <h1>${escapeHtml(options.title)}</h1>
        <p>${escapeHtml(options.subtitle)}</p>
      </header>
      <div class="content">
        ${options.content}
        ${renderActions(options.actions)}
      </div>
    </article>
    <footer class="footer">
      ${options.footer ? `<div>${escapeHtml(options.footer)}</div>` : ''}
      <div>校园自动签到服务 · 每天 ${escapeHtml(getCheckinTimeLabel())} 自动执行</div>
    </footer>
  </main>
</body>
</html>`
}

function stat(label: string, value: string, hint: string, toneClass = ''): string {
  return `<div class="stat">
    <div class="stat-label">${escapeHtml(label)}</div>
    <div class="stat-value ${value.length > 24 ? 'small' : ''} ${toneClass}">${escapeHtml(value)}</div>
    <div class="stat-hint">${escapeHtml(hint)}</div>
  </div>`
}

function dataRows(rows: Array<[string, string]>): string {
  return `<div class="data-card">${rows
    .map(
      ([label, value]) =>
        `<div class="data-row"><div class="data-label">${escapeHtml(label)}</div><div class="data-value">${escapeHtml(value)}</div></div>`,
    )
    .join('')}</div>`
}

function callout(icon: string, title: string, body: string): string {
  return `<div class="callout">
    <div class="callout-icon">${escapeHtml(icon)}</div>
    <div><div class="callout-title">${escapeHtml(title)}</div><div class="callout-body">${body}</div></div>
  </div>`
}

export interface DashboardData {
  serverTime: string
  token: {
    hasToken: boolean
    valid: boolean
    expireText: string
    remainingText: string
    tone: PageTone
  }
  emailEnabled: boolean
  checkinTime: string
  nextCheckin: string
  timezone: string
  lastCheckin: {
    time: string | null
    success: boolean | null
    message: string | null
  }
  session: {
    status: string
    expiresAt: string
    qrPageUrl: string
  } | null
  authorized: boolean
  actions: {
    login: string
    checkin: string
    status: string
  }
}

export function renderDashboardPage(data: DashboardData): string {
  const tokenTone: Record<PageTone, string> = {
    success: 'tone-success',
    warning: 'tone-warning',
    danger: 'tone-danger',
    primary: 'tone-primary',
    neutral: '',
  }

  const checkinResultText =
    data.lastCheckin.success === null
      ? '暂无记录'
      : data.lastCheckin.success
        ? '签到成功'
        : '签到失败'

  const content = `
    <section class="section">
      <div class="section-title"><h2>登录状态</h2><span>${escapeHtml(data.serverTime)}</span></div>
      <div class="grid">
        ${stat(
          'Token 状态',
          data.token.valid ? '有效' : data.token.hasToken ? '已过期' : '未登录',
          data.token.valid ? '自动签到可以正常执行' : '需要重新扫码登录',
          tokenTone[data.token.tone],
        )}
        ${stat('Token 过期时间', data.token.expireText, '精确到分钟，包含星期')}
        ${stat('剩余有效期', data.token.remainingText, '过期后将无法自动签到')}
        ${stat('邮件通知', data.emailEnabled ? '已启用' : '未启用', data.emailEnabled ? '提醒和结果会发送到邮箱' : '请检查 SMTP 配置')}
      </div>
    </section>

    <section class="section">
      <div class="section-title"><h2>自动签到</h2><span>${escapeHtml(data.timezone)}</span></div>
      ${dataRows([
        ['每日执行时间', `每天 ${data.checkinTime}`],
        ['下一次执行', data.nextCheckin],
        ['最近签到时间', data.lastCheckin.time || '暂无记录'],
        ['最近签到结果', checkinResultText],
        ['最近服务响应', data.lastCheckin.message || '暂无记录'],
        ['Token 提醒策略', 'Token 过期后发送一次登录提醒，不会提前提醒'],
      ])}
    </section>

    ${
      data.session
        ? `<section class="section">
            <div class="section-title"><h2>等待扫码</h2><span>${escapeHtml(data.session.status)}</span></div>
            ${callout(
              '📱',
              '登录二维码正在等待微信扫码',
              `当前二维码有效至 ${escapeHtml(data.session.expiresAt)}。<a href="${escapeHtml(data.session.qrPageUrl)}">打开二维码页面</a> 可直接查看二维码。`,
            )}
          </section>`
        : ''
    }

    ${
      data.authorized
        ? `<section class="section">
            <div class="section-title"><h2>快捷操作</h2><span>Webhook</span></div>
            ${callout(
              '🔐',
              '操作链接已鉴权',
              '下面的按钮携带 <code>WEBHOOK_SECRET</code>。请不要把带有 token 参数的链接分享给他人。',
            )}
          </section>`
        : `<section class="section">
            ${callout(
              '🔒',
              '操作按钮已隐藏',
              '当前访问链接没有携带有效的 <code>WEBHOOK_SECRET</code>。请从通知邮件中的按钮进入，或在 URL 中添加 <code>?token=你的密钥</code>。',
            )}
          </section>`
    }
  `

  const actions: PageAction[] = data.authorized
    ? [
        { label: '接收登录二维码', href: data.actions.login },
        { label: '立即签到', href: data.actions.checkin, variant: 'secondary' },
        { label: '状态 JSON', href: '/api/status', variant: 'secondary' },
      ]
    : [{ label: '查看状态 JSON', href: '/api/status', variant: 'secondary' }]

  return renderPage({
    title: !data.token.valid ? '需要重新登录微信' : '服务运行正常',
    kicker: 'Service Dashboard',
    subtitle: !data.token.valid
      ? '当前登录状态不可用。请从提醒邮件中获取登录二维码，扫码后即可恢复自动签到。'
      : '自动签到服务正在运行。Token 有效期内不需要任何操作，过期后会发送一次登录提醒。',
    tone: data.token.tone,
    badge: !data.token.valid ? '需要处理' : '运行中',
    icon: !data.token.valid ? '🔐' : '✅',
    content,
    actions,
    footer: `当前服务器时间：${data.serverTime}`,
  })
}

export function renderActionResultPage(options: {
  title: string
  subtitle: string
  tone: PageTone
  badge: string
  icon: string
  message: string
  details?: Array<[string, string]>
  actions?: PageAction[]
  calloutTitle?: string
  calloutBody?: string
}): string {
  const content = `
    ${callout(options.icon, options.calloutTitle || '操作结果', escapeHtml(options.message))}
    ${options.details && options.details.length ? `<section class="section">${dataRows(options.details)}</section>` : ''}
    ${
      options.calloutBody
        ? `<section class="section">${callout('💡', '接下来', escapeHtml(options.calloutBody))}</section>`
        : ''
    }
  `

  return renderPage({
    title: options.title,
    kicker: 'Webhook Action',
    subtitle: options.subtitle,
    tone: options.tone,
    badge: options.badge,
    icon: options.icon,
    content,
    actions: options.actions,
  })
}

export function renderConfirmCheckinPage(options: {
  actionUrl: string
  statusUrl: string
  name: string
  tokenExpireText: string
  lastCheckinText: string
  force: boolean
}): string {
  const content = `
    ${callout(
      '📝',
      options.force ? '确认强制重新签到' : '需要确认后才会提交签到',
      '系统每天会自动签到，通常不需要手动操作。这里增加一次确认，是为了避免邮件客户端预抓取链接而造成误签到。',
    )}
    <section class="section">
      ${dataRows([
        ['签到人', options.name],
        ['每日自动签到时间', `每天 ${getCheckinTimeLabel()}`],
        ['当前 Token 有效期至', options.tokenExpireText],
        ['最近一次签到', options.lastCheckinText],
        ['本次操作', options.force ? '强制重新签到（可能覆盖今日结果）' : '普通签到（今日已成功则跳过）'],
      ])}
    </section>
    <form method="post" action="${escapeHtml(options.actionUrl)}" style="margin-top:26px;">
      <button type="submit" class="btn btn-primary">确认立即签到 <span aria-hidden="true">&rarr;</span></button>
    </form>
    <div style="margin-top:12px;font-size:12px;line-height:1.7;color:var(--muted);">如果今日已签到成功，普通签到不会重复提交。只有点击上方按钮后，服务才会真正执行签到。</div>
  `

  return renderPage({
    title: options.force ? '强制重新签到' : '立即签到',
    kicker: 'Confirm Check-in',
    subtitle: '请确认是否现在执行签到。',
    tone: 'primary',
    badge: '等待确认',
    icon: '📝',
    content,
    actions: [{ label: '返回服务状态', href: options.statusUrl, variant: 'secondary' }],
  })
}

export function renderQrPage(options: {
  uuid: string
  expiresAt: string
  status: string
  tokenExpireText: string
  estimatedNextExpireText: string
}): string {
  const content = `
    <div class="qr-card">
      <img src="/qr/${encodeURIComponent(options.uuid)}.png" alt="微信登录二维码" width="300" height="300">
      <div class="qr-caption">二维码有效至 ${escapeHtml(options.expiresAt)}<br>请使用微信“扫一扫”完成授权</div>
    </div>
    <section class="section">
      ${dataRows([
        ['二维码状态', options.status],
        ['当前 Token 过期时间', options.tokenExpireText],
        ['登录后预计有效期至', options.estimatedNextExpireText],
        ['每日自动签到时间', `每天 ${getCheckinTimeLabel()}`],
      ])}
    </section>
    <section class="section">
      ${callout(
        '💡',
        '扫码成功后',
        '系统会自动保存新的 Token，并向你的邮箱发送一封“登录成功”邮件，写明实际过期时间。二维码过期后，请回到提醒邮件重新点击“接收登录二维码”。',
      )}
    </section>
  `

  return renderPage({
    title: '微信登录二维码',
    kicker: 'WeChat Login',
    subtitle: '使用微信扫描二维码，完成授权后即可恢复自动签到。',
    tone: 'primary',
    badge: options.status === 'pending' ? '等待扫码' : options.status,
    icon: '📱',
    content,
    actions: [{ label: '返回服务状态', href: '/', variant: 'secondary' }],
  })
}

export function renderErrorPage(options: {
  status: number
  title: string
  message: string
}): string {
  return renderPage({
    title: options.title,
    kicker: `HTTP ${options.status}`,
    subtitle: options.message,
    tone: 'danger',
    badge: '请求失败',
    icon: '⚠️',
    content: callout('⚠️', '无法完成请求', escapeHtml(options.message)),
    actions: [{ label: '返回服务状态', href: '/', variant: 'secondary' }],
  })
}
