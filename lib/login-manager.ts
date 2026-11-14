import { config } from './config.js'
import { sendLoginQrEmail, sendLoginRequiredEmail } from './email-utils.js'
import { fetchQrCodeImage, type QrCodeImage } from './qrcode-utils.js'
import { formatDateTime } from './time-utils.js'
import { TokenInfo } from './token-info.js'
import { qrPageUrl } from './urls.js'
import { fetchUUID, pollWxCode, sleep } from './wechat-utils.js'

export type LoginSource = 'manual' | 'warning' | 'invalid' | 'checkin'

export type LoginSessionStatus = 'pending' | 'success' | 'expired' | 'error'

interface LoginSessionInternal {
  uuid: string
  createdAt: number
  expiresAt: number
  status: LoginSessionStatus
  source: LoginSource
  previousExpire: number | null
  estimatedNextExpire: number
  qr: QrCodeImage
  lastEmailAt: number
  lastEmailSent: boolean
}

export interface LoginSessionPublic {
  uuid: string
  createdAt: number
  expiresAt: number
  status: LoginSessionStatus
  source: LoginSource
  previousExpire: number | null
  estimatedNextExpire: number
  qrPageUrl: string
  lastEmailAt: number
  lastEmailSent: boolean
}

export interface LoginRequestResult {
  ok: boolean
  emailSent: boolean
  reused: boolean
  message: string
  session: LoginSessionPublic | null
}

export interface LoginSuccessContext {
  source: LoginSource
  previousExpire: number | null
}

export class LoginManager {
  private session: LoginSessionInternal | null = null
  private requestInFlight: Promise<LoginRequestResult> | null = null

  constructor(
    private readonly options: {
      onSuccess: (token: TokenInfo, context: LoginSuccessContext) => Promise<void>
    },
  ) {}

  async requestLogin(source: LoginSource): Promise<LoginRequestResult> {
    if (this.requestInFlight) return this.requestInFlight

    const promise = this.doRequestLogin(source)
    this.requestInFlight = promise

    return promise.finally(() => {
      if (this.requestInFlight === promise) this.requestInFlight = null
    })
  }

  getSession(): LoginSessionPublic | null {
    return this.session ? this.toPublicSession(this.session) : null
  }

  getSessionByUuid(uuid: string): LoginSessionPublic | null {
    if (!this.session || this.session.uuid !== uuid) return null
    return this.toPublicSession(this.session)
  }

  getQrByUuid(uuid: string): QrCodeImage | null {
    if (!this.session || this.session.uuid !== uuid) return null
    return this.session.qr
  }

  private toPublicSession(session: LoginSessionInternal): LoginSessionPublic {
    return {
      uuid: session.uuid,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      status: session.status,
      source: session.source,
      previousExpire: session.previousExpire,
      estimatedNextExpire: session.estimatedNextExpire,
      qrPageUrl: qrPageUrl(session.uuid),
      lastEmailAt: session.lastEmailAt,
      lastEmailSent: session.lastEmailSent,
    }
  }

  private async doRequestLogin(source: LoginSource): Promise<LoginRequestResult> {
    const now = Date.now()
    const active =
      this.session &&
      this.session.status === 'pending' &&
      now < this.session.expiresAt
        ? this.session
        : null

    if (active) {
      if (now - active.lastEmailAt < config.login.resendIntervalMs) {
        return {
          ok: true,
          emailSent: active.lastEmailSent,
          reused: true,
          message: active.lastEmailSent
            ? '二维码邮件刚刚已经发送，请稍候查收。'
            : config.email.enabled
              ? '二维码仍然有效，但邮件尚未成功发送，可直接打开二维码页面。'
              : '二维码仍然有效，但邮件通知未启用，可直接打开二维码页面。',
          session: this.toPublicSession(active),
        }
      }

      const emailSent = await this.sendQrEmail(active)
      active.lastEmailAt = Date.now()
      active.lastEmailSent = emailSent

      return {
        ok: true,
        emailSent,
        reused: true,
        message: emailSent
          ? '已重新发送当前登录二维码邮件。'
          : '二维码仍然有效，但邮件发送失败，可直接打开二维码页面。',
        session: this.toPublicSession(active),
      }
    }

    if (this.session && this.session.status === 'pending') {
      this.session.status = 'expired'
    }

    let currentToken = new TokenInfo()
    try {
      currentToken = await TokenInfo.load()
    } catch (err: any) {
      console.warn(`⚠️ 读取当前 Token 失败，将继续生成登录二维码：${err?.message || err}`)
    }

    try {
      const uuid = await fetchUUID()
      const qr = await fetchQrCodeImage(uuid)
      const createdAt = Date.now()

      const session: LoginSessionInternal = {
        uuid,
        createdAt,
        expiresAt: createdAt + config.login.qrTtlSeconds * 1000,
        status: 'pending',
        source,
        previousExpire: currentToken.expire,
        estimatedNextExpire: currentToken.estimateNextExpire(createdAt),
        qr,
        lastEmailAt: 0,
        lastEmailSent: false,
      }

      this.session = session
      console.log(`📨 已生成新的微信登录二维码（来源：${source}）`)

      const emailSent = await this.sendQrEmail(session)
      session.lastEmailAt = Date.now()
      session.lastEmailSent = emailSent

      void this.pollSession(session)

      return {
        ok: true,
        emailSent,
        reused: false,
        message: emailSent
          ? '登录二维码邮件已发送，请使用微信扫码。'
          : '二维码已生成，但邮件发送失败，可直接打开二维码页面。',
        session: this.toPublicSession(session),
      }
    } catch (err: any) {
      const message = err?.message || String(err)
      console.error(`❌ 生成登录二维码失败：${message}`)
      return {
        ok: false,
        emailSent: false,
        reused: false,
        message: `生成登录二维码失败：${message}`,
        session: null,
      }
    }
  }

  private async sendQrEmail(session: LoginSessionInternal): Promise<boolean> {
    const sent = await sendLoginQrEmail({
      uuid: session.uuid,
      qrBuffer: session.qr.buffer,
      qrContentType: session.qr.contentType,
      currentExpire: session.previousExpire,
      estimatedNextExpire: session.estimatedNextExpire,
      expiresAt: session.expiresAt,
      source: session.source,
    })

    if (!sent) {
      console.warn(`⚠️ 登录二维码邮件未发送，可访问二维码页面：${qrPageUrl(session.uuid)}`)
    }

    return sent
  }

  private async pollSession(session: LoginSessionInternal): Promise<void> {
    const isCancelled = () =>
      this.session !== session ||
      session.status !== 'pending' ||
      Date.now() > session.expiresAt + 5_000

    const wxCode = await pollWxCode(session.uuid, isCancelled)

    if (this.session !== session || session.status !== 'pending') return

    if (!wxCode) {
      session.status = 'expired'
      console.log('⌛ 登录二维码已过期，等待用户重新获取。')
      return
    }

    let lastError: any = null

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const token = await TokenInfo.fetchTokenByWxCode(wxCode)
        await token.save()

        session.status = 'success'
        console.log(`✅ 微信登录成功，Token 有效期至 ${formatDateTime(token.expire || Date.now())}`)

        try {
          await this.options.onSuccess(token, {
            source: session.source,
            previousExpire: session.previousExpire,
          })
        } catch (err: any) {
          console.error(`⚠️ 登录成功回调执行失败：${err?.message || err}`)
        }

        return
      } catch (err: any) {
        lastError = err
        console.warn(`⚠️ 换取 Token 失败（第 ${attempt}/3 次）：${err?.message || err}`)
        if (attempt < 3) await sleep(1500)
      }
    }

    session.status = 'error'
    console.error(`❌ 扫码后换取 Token 失败：${lastError?.message || lastError}`)

    await sendLoginRequiredEmail({
      reason: 'login-failed',
      currentExpire: session.previousExpire,
      estimatedNextExpire: session.estimatedNextExpire,
    })
  }
}
