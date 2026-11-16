import { timingSafeEqual } from 'node:crypto'
import { CheckinService } from '../lib/checkin-service.js'
import { config } from '../lib/config.js'
import { isEmailEnabled } from '../lib/email-utils.js'
import { LoginManager, type LoginSource } from '../lib/login-manager.js'
import { fetchQrCodeImage } from '../lib/qrcode-utils.js'
import { StateStore } from '../lib/state-store.js'
import {
  describeNextCheckin,
  formatDateTime,
  formatDuration,
  getCheckinTimeLabel,
  getPostLoginCheckinWindowLabel,
  getZonedTime,
} from '../lib/time-utils.js'
import { TokenInfo } from '../lib/token-info.js'
import { actionUrl } from '../lib/urls.js'
import {
  renderActionResultPage,
  renderConfirmCheckinPage,
  renderDashboardPage,
  renderErrorPage,
  renderQrPage,
  type PageAction,
  type PageTone,
} from '../lib/web-templates.js'

interface ServerDeps {
  state: StateStore
  loginManager: LoginManager
  checkinService: CheckinService
}

interface TokenLoadResult {
  info: TokenInfo
  error: string | null
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function wantsJson(request: Request, url: URL): boolean {
  return (
    url.pathname.startsWith('/api/') ||
    url.searchParams.get('format') === 'json' ||
    request.headers.get('accept')?.includes('application/json') === true
  )
}

function getProvidedSecret(request: Request, url: URL): string {
  const querySecret = url.searchParams.get('token') || url.searchParams.get('key') || ''
  if (querySecret) return querySecret

  const headerSecret = request.headers.get('x-webhook-token') || ''
  if (headerSecret) return headerSecret

  const authorization = request.headers.get('authorization') || ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1] || ''
}

function isAuthorized(request: Request, url: URL): boolean {
  if (!config.webhookSecret) return true

  const provided = getProvidedSecret(request, url)
  if (!provided) return false

  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(config.webhookSecret)
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  )
}

async function loadTokenInfoSafe(): Promise<TokenLoadResult> {
  try {
    return { info: await TokenInfo.load(), error: null }
  } catch (err: any) {
    return { info: new TokenInfo(), error: err?.message || String(err) }
  }
}

function tokenStatus(token: TokenInfo) {
  const now = Date.now()
  const valid = token.isValid(now)
  const remainingMs = token.remainingMs(now)
  const ttlMs = token.getTtlMs()

  return {
    hasToken: Boolean(token.token),
    valid,
    expire: token.expire,
    expireIso: token.expire ? new Date(token.expire).toISOString() : null,
    expireText: token.expire ? formatDateTime(token.expire) : '暂无 Token',
    remainingMs,
    remainingText: token.expire ? (valid ? formatDuration(remainingMs) : '已过期') : '无',
    ttlHours: ttlMs ? Math.round(ttlMs / 3_600_000) : config.token.defaultTtlHours,
    estimatedNextExpireText: formatDateTime(token.estimateNextExpire(now)),
  }
}

async function buildStatusPayload(request: Request, url: URL, deps: ServerDeps) {
  const { info, error } = await loadTokenInfoSafe()
  const current = deps.state.get()
  const session = deps.loginManager.getSession()
  const now = Date.now()
  const authorized = isAuthorized(request, url)

  return {
    ok: true,
    serverTime: {
      timestamp: now,
      text: formatDateTime(now),
      timezone: config.timezone,
      dateKey: getZonedTime(now).dateKey,
    },
    token: {
      ...tokenStatus(info),
      error,
    },
    email: {
      enabled: isEmailEnabled(),
      recipientConfigured: Boolean(config.email.to),
    },
    schedule: {
      checkinTime: getCheckinTimeLabel(),
      nextCheckin: describeNextCheckin(now),
      timezone: config.timezone,
      postLoginCheckinWindow: getPostLoginCheckinWindowLabel(),
      qrTtlSeconds: config.login.qrTtlSeconds,
    },
    lastCheckin: {
      date: current.lastCheckinDate,
      at: current.lastCheckinAt,
      atText: current.lastCheckinAt ? formatDateTime(current.lastCheckinAt) : null,
      success: current.lastCheckinSuccess,
      message: current.lastCheckinMessage,
      lastScheduledDate: current.lastScheduledCheckinDate,
      pending: current.pendingCheckin,
    },
    loginSession: session
      ? {
          ...session,
          createdAtText: formatDateTime(session.createdAt),
          expiresAtText: formatDateTime(session.expiresAt),
          estimatedNextExpireText: formatDateTime(session.estimatedNextExpire),
        }
      : null,
    authorized,
    actions: authorized
      ? {
          login: actionUrl('/webhook/login'),
          checkin: actionUrl('/webhook/checkin'),
          status: actionUrl('/status'),
        }
      : null,
  }
}

async function handleLogin(
  request: Request,
  url: URL,
  deps: ServerDeps,
  respondJson: boolean,
): Promise<Response> {
  const sourceRaw = url.searchParams.get('source') || 'manual'
  const allowedSources: LoginSource[] = ['manual', 'invalid', 'checkin']
  const source: LoginSource = allowedSources.includes(sourceRaw as LoginSource)
    ? (sourceRaw as LoginSource)
    : 'manual'

  const result = await deps.loginManager.requestLogin(source)
  if (respondJson) {
    return jsonResponse(result, result.ok ? 200 : 502)
  }

  if (!result.ok || !result.session) {
    return htmlResponse(
      renderActionResultPage({
        title: '无法生成登录二维码',
        subtitle: '微信二维码生成失败，请稍后重试。',
        tone: 'danger',
        badge: '操作失败',
        icon: '⚠️',
        message: result.message,
        actions: [
          { label: '重试获取二维码', href: actionUrl('/webhook/login', { source }) },
          { label: '查看服务状态', href: actionUrl('/status'), variant: 'secondary' },
        ],
      }),
      502,
    )
  }

  const { info } = await loadTokenInfoSafe()
  const session = result.session
  const actions: PageAction[] = [
    { label: '打开二维码页面', href: session.qrPageUrl },
    { label: '查看服务状态', href: actionUrl('/status'), variant: 'secondary' },
  ]

  return htmlResponse(
    renderActionResultPage({
      title: result.emailSent ? '登录二维码邮件已发送' : '登录二维码已生成',
      subtitle: '请使用微信扫一扫完成授权，二维码过期后可从原提醒邮件重新获取。',
      tone: result.emailSent ? 'success' : 'warning',
      badge: '等待扫码',
      icon: '📱',
      message: result.message,
      details: [
        ['二维码邮件', result.emailSent ? '已发送到通知邮箱' : '未发送，可直接打开二维码页面'],
        ['二维码有效期至', formatDateTime(session.expiresAt)],
        ['当前 Token 过期时间', info.expire ? formatDateTime(info.expire) : '暂无有效登录'],
        ['登录后预计有效期至', formatDateTime(session.estimatedNextExpire)],
        ['每日自动签到时间', `每天 ${getCheckinTimeLabel()}`],
      ],
      actions,
      calloutTitle: result.emailSent ? '邮件已送达通知邮箱' : '二维码已生成，但邮件未发送',
      calloutBody: '扫码成功后，系统会自动保存新的 Token，并发送一封包含实际过期时间的登录成功邮件。',
    }),
  )
}

async function handleCheckin(
  request: Request,
  url: URL,
  deps: ServerDeps,
  respondJson: boolean,
): Promise<Response> {
  const force = url.searchParams.get('force') === '1'
  const outcome = await deps.checkinService.run({ trigger: 'webhook', force })

  if (respondJson) {
    const status = outcome.status === 'busy' ? 409 : 200
    return jsonResponse(outcome, status)
  }

  const { info } = await loadTokenInfoSafe()
  const tokenExpire = outcome.tokenExpire || info.expire
  const checkedAtText = formatDateTime(outcome.checkedAt)
  const statusLabel =
    outcome.status === 'success'
      ? '签到成功'
      : outcome.status === 'already-ran'
        ? '今日已完成'
        : outcome.status === 'busy'
          ? '执行中'
          : '签到失败'

  const baseDetails: Array<[string, string]> = [
    ['执行状态', statusLabel],
    ['签到时间', checkedAtText],
    ['签到人', config.name],
    ['签到任务 ID', String(config.checkin.threadId)],
    ['签到地点', config.checkin.locationLabel],
    ['当前 Token 有效期至', tokenExpire ? formatDateTime(tokenExpire) : '暂无有效 Token'],
    ['服务响应', outcome.message],
    ...(outcome.infoSummary ? ([['签到主题', outcome.infoSummary]] as Array<[string, string]>) : []),
  ]

  if (outcome.status === 'already-ran') {
    return htmlResponse(
      renderActionResultPage({
        title: '今日已经完成签到',
        subtitle: '无需重复执行。如需强制重新签到，可以使用带 force=1 的链接。',
        tone: 'success',
        badge: '已完成',
        icon: '✅',
        message: outcome.message,
        details: baseDetails,
        actions: [
          { label: '查看服务状态', href: actionUrl('/status'), variant: 'secondary' },
          { label: '强制重新签到', href: actionUrl('/webhook/checkin', { force: '1' }), variant: 'secondary' },
        ],
      }),
    )
  }

  if (outcome.status === 'busy') {
    return htmlResponse(
      renderActionResultPage({
        title: '签到正在进行中',
        subtitle: '请稍后刷新查看结果。',
        tone: 'warning',
        badge: '处理中',
        icon: '⏳',
        message: outcome.message,
        actions: [{ label: '查看服务状态', href: actionUrl('/status'), variant: 'secondary' }],
      }),
      409,
    )
  }

  const tone: PageTone = outcome.success ? 'success' : outcome.authRequired ? 'warning' : 'danger'
  const actions: PageAction[] = outcome.authRequired
    ? [
        { label: '接收登录二维码', href: actionUrl('/webhook/login', { source: 'checkin' }) },
        { label: '重新签到', href: actionUrl('/webhook/checkin', { force: '1' }), variant: 'secondary' },
        { label: '查看服务状态', href: actionUrl('/status'), variant: 'secondary' },
      ]
    : outcome.success
      ? [{ label: '查看服务状态', href: actionUrl('/status'), variant: 'secondary' }]
      : [
          { label: '重新签到', href: actionUrl('/webhook/checkin', { force: '1' }), variant: 'danger' },
          { label: '接收登录二维码', href: actionUrl('/webhook/login', { source: 'checkin' }), variant: 'secondary' },
          { label: '查看服务状态', href: actionUrl('/status'), variant: 'secondary' },
        ]

  return htmlResponse(
    renderActionResultPage({
      title: outcome.success ? '今日签到成功' : outcome.authRequired ? '签到未执行：登录已过期' : '签到失败',
      subtitle: `每天 ${getCheckinTimeLabel()} 自动签到结果通知`,
      tone,
      badge: outcome.success ? '签到成功' : outcome.authRequired ? '需要登录' : '签到失败',
      icon: outcome.success ? '✅' : '⚠️',
      message: outcome.message,
      details: baseDetails,
      actions,
      calloutTitle: outcome.success ? '签到完成' : outcome.authRequired ? '登录状态失效' : '签到未成功',
      calloutBody: outcome.success
        ? `下一次自动签到将在${describeNextCheckin()}执行，完成后会发送结果邮件。`
        : outcome.authRequired
          ? `如果在当天 ${getPostLoginCheckinWindowLabel()} 内完成登录，系统会自动补签一次；其他时间登录请等待下一次定时签到。`
          : '可以点击“重新签到”立即重试。如果连续失败，请查看服务日志。',
    }),
  )
}

function renderDashboard(
  data: Awaited<ReturnType<typeof buildStatusPayload>>,
): string {
  const lastCheckin = data.lastCheckin
  const session = data.loginSession

  return renderDashboardPage({
    serverTime: data.serverTime.text,
    token: {
      hasToken: data.token.hasToken,
      valid: data.token.valid,
      expireText: data.token.expireText,
      remainingText: data.token.remainingText,
      tone: data.token.valid ? 'success' : 'danger',
    },
    emailEnabled: data.email.enabled,
    checkinTime: data.schedule.checkinTime,
    nextCheckin: data.schedule.nextCheckin,
    timezone: data.schedule.timezone,
    postLoginCheckinWindow: data.schedule.postLoginCheckinWindow,
    lastCheckin: {
      time: lastCheckin.atText,
      success: lastCheckin.success,
      message: lastCheckin.message,
    },
    session:
      session && session.status === 'pending'
        ? {
            status: '等待扫码',
            expiresAt: session.expiresAtText,
            qrPageUrl: session.qrPageUrl,
          }
        : null,
    authorized: data.authorized,
    actions: data.actions || {
      login: '/',
      checkin: '/',
      status: '/status',
    },
  })
}

async function route(request: Request, url: URL, deps: ServerDeps): Promise<Response> {
  const respondJson = wantsJson(request, url)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  if (request.method !== 'GET' && request.method !== 'POST' && request.method !== 'HEAD') {
    return respondJson
      ? jsonResponse({ ok: false, error: 'method_not_allowed' }, 405)
      : htmlResponse(
          renderErrorPage({
            status: 405,
            title: '请求方法不被支持',
            message: '请使用 GET 或 POST 请求。',
          }),
          405,
        )
  }

  if (url.pathname === '/favicon.ico') {
    return new Response(null, { status: 204 })
  }

  if (url.pathname === '/health') {
    const { info } = await loadTokenInfoSafe()
    return jsonResponse({
      ok: true,
      uptimeSeconds: Math.round(process.uptime()),
      serverTime: formatDateTime(Date.now()),
      timezone: config.timezone,
      emailEnabled: isEmailEnabled(),
      token: tokenStatus(info),
      checkinTime: getCheckinTimeLabel(),
      nextCheckin: describeNextCheckin(),
    })
  }

  if (url.pathname === '/api/status') {
    return jsonResponse(await buildStatusPayload(request, url, deps))
  }

  if (url.pathname === '/api/login') {
    if (!isAuthorized(request, url)) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401)
    }
    return handleLogin(request, url, deps, true)
  }

  if (url.pathname === '/api/checkin') {
    if (!isAuthorized(request, url)) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401)
    }
    return handleCheckin(request, url, deps, true)
  }

  if (url.pathname === '/webhook/login') {
    if (!isAuthorized(request, url)) {
      return respondJson
        ? jsonResponse({ ok: false, error: 'unauthorized' }, 401)
        : htmlResponse(
            renderErrorPage({
              status: 401,
              title: '链接无效或已过期',
              message: 'Webhook 密钥不正确。请从通知邮件中的按钮重新进入。',
            }),
            401,
          )
    }
    return handleLogin(request, url, deps, respondJson)
  }

  if (url.pathname === '/confirm/checkin') {
    if (!isAuthorized(request, url)) {
      return htmlResponse(
        renderErrorPage({
          status: 401,
          title: '链接无效或已过期',
          message: 'Webhook 密钥不正确。请从通知邮件中的按钮重新进入。',
        }),
        401,
      )
    }

    const { info } = await loadTokenInfoSafe()
    const current = deps.state.get()
    const force = url.searchParams.get('force') === '1'
    const lastCheckinText = current.lastCheckinAt
      ? `${formatDateTime(current.lastCheckinAt)}${current.lastCheckinSuccess === true ? '（成功）' : current.lastCheckinSuccess === false ? '（失败）' : ''}`
      : '暂无记录'

    return htmlResponse(
      renderConfirmCheckinPage({
        actionUrl: actionUrl('/webhook/checkin', force ? { force: '1' } : {}),
        statusUrl: actionUrl('/status'),
        name: config.name,
        tokenExpireText: info.expire ? formatDateTime(info.expire) : '暂无有效 Token',
        lastCheckinText,
        force,
      }),
    )
  }

  if (url.pathname === '/webhook/checkin') {
    if (!isAuthorized(request, url)) {
      return respondJson
        ? jsonResponse({ ok: false, error: 'unauthorized' }, 401)
        : htmlResponse(
            renderErrorPage({
              status: 401,
              title: '链接无效或已过期',
              message: 'Webhook 密钥不正确。请从通知邮件中的按钮重新进入。',
            }),
            401,
          )
    }
    return handleCheckin(request, url, deps, respondJson)
  }

  if (url.pathname === '/login' || url.pathname === '/checkin') {
    const redirect = new URL(url.toString())
    redirect.pathname = url.pathname === '/login' ? '/webhook/login' : '/webhook/checkin'
    return Response.redirect(redirect.toString(), 302)
  }

  const qrImageMatch = url.pathname.match(/^\/qr\/([A-Za-z0-9_-]+)\.png$/)
  if (qrImageMatch) {
    const uuid = qrImageMatch[1]
    const cached = deps.loginManager.getQrByUuid(uuid)

    try {
      const qr = cached || (await fetchQrCodeImage(uuid))
      return new Response(new Uint8Array(qr.buffer), {
        status: 200,
        headers: {
          'content-type': qr.contentType,
          'cache-control': 'no-store',
        },
      })
    } catch (err: any) {
      console.warn(`⚠️ 获取二维码图片失败：${err?.message || err}`)
      return htmlResponse(
        renderErrorPage({
          status: 404,
          title: '二维码无法加载',
          message: '二维码可能已经过期，请回到提醒邮件重新点击“接收登录二维码”。',
        }),
        404,
      )
    }
  }

  const qrPageMatch = url.pathname.match(/^\/qr\/([A-Za-z0-9_-]+)$/)
  if (qrPageMatch) {
    const uuid = qrPageMatch[1]
    const session = deps.loginManager.getSessionByUuid(uuid)
    const { info } = await loadTokenInfoSafe()

    return htmlResponse(
      renderQrPage({
        uuid,
        expiresAt: session ? formatDateTime(session.expiresAt) : '未知（如已过期请重新获取）',
        status: session
          ? session.status === 'pending'
            ? '等待扫码'
            : session.status === 'success'
              ? '授权成功'
              : session.status === 'expired'
                ? '已过期'
                : '登录失败'
          : '未知',
        tokenExpireText: info.expire ? formatDateTime(info.expire) : '暂无有效 Token',
        estimatedNextExpireText: formatDateTime(
          session ? session.estimatedNextExpire : info.estimateNextExpire(),
        ),
      }),
    )
  }

  if (url.pathname === '/' || url.pathname === '/status') {
    const payload = await buildStatusPayload(request, url, deps)
    return htmlResponse(renderDashboard(payload))
  }

  return respondJson
    ? jsonResponse({ ok: false, error: 'not_found' }, 404)
    : htmlResponse(
        renderErrorPage({
          status: 404,
          title: '页面不存在',
          message: '请检查访问地址是否正确。',
        }),
        404,
      )
}

function withSecurityHeaders(response: Response, url: URL): Response {
  const headers = new Headers(response.headers)
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'no-referrer')
  headers.set('x-frame-options', 'DENY')
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  headers.set('cache-control', headers.get('cache-control') || 'no-store')

  const contentType = headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    let formAction = "'self'"
    try {
      formAction += ` ${new URL(config.baseUrl).origin}`
    } catch {
      // BASE_URL 非法时由配置检查/启动日志暴露
    }

    headers.set(
      'content-security-policy',
      `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action ${formAction}`,
    )
  }

  if (config.baseUrl.startsWith('https://')) {
    headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains')
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function createRequestHandler(deps: ServerDeps): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const startedAt = Date.now()
    const url = new URL(request.url)

    try {
      const response = await route(request, url, deps)
      const secured = withSecurityHeaders(response, url)
      console.log(`[HTTP] ${request.method} ${url.pathname} ${secured.status} ${Date.now() - startedAt}ms`)
      return secured
    } catch (err: any) {
      console.error(`[HTTP] ${request.method} ${url.pathname} 500`, err)
      const respondJson = wantsJson(request, url)
      const response = respondJson
        ? jsonResponse({ ok: false, error: 'internal_error', message: err?.message || String(err) }, 500)
        : htmlResponse(
            renderErrorPage({
              status: 500,
              title: '服务内部错误',
              message: err?.message || '处理请求时发生未知错误，请稍后重试。',
            }),
            500,
          )
      return withSecurityHeaders(response, url)
    }
  }
}
