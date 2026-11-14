import { config } from './config.js'
import {
  isEmailEnabled,
  sendLoginRequiredEmail,
  sendLoginSuccessEmail,
  sendTokenExpiringEmail,
} from './email-utils.js'
import { StateStore } from './state-store.js'
import { isDaytime } from './time-utils.js'
import { TokenInfo } from './token-info.js'

const RETRY_INTERVAL_MS = 10 * 60 * 1000

export class NotificationService {
  private lastAttempt = new Map<string, number>()

  constructor(private readonly state: StateStore) {}

  private canAttempt(key: string): boolean {
    const now = Date.now()
    const last = this.lastAttempt.get(key) || 0
    if (now - last < RETRY_INTERVAL_MS) return false

    this.lastAttempt.set(key, now)
    return true
  }

  async notifyInvalidToken(
    token: TokenInfo,
    reason: 'missing' | 'expired' = token.token ? 'expired' : 'missing',
  ): Promise<boolean> {
    if (!isEmailEnabled()) return false

    const key = token.expire || 0
    const current = this.state.get()
    if (current.invalidNoticeSentForExpire === key) return false
    if (!this.canAttempt(`invalid:${key}`)) return false

    const sent = await sendLoginRequiredEmail({
      reason,
      currentExpire: token.expire,
      estimatedNextExpire: token.estimateNextExpire(),
    })

    if (sent) {
      await this.state.update({
        invalidNoticeSentForExpire: key,
        lastInvalidNoticeAt: Date.now(),
      })
      console.log('📧 已发送登录失效提醒（本 Token 仅发送一次）。')
    }

    return sent
  }

  async notifyTokenExpiring(token: TokenInfo): Promise<boolean> {
    if (!isEmailEnabled() || !token.isValid() || !token.expire) return false

    const remaining = token.remainingMs()
    const warningWindow = config.token.warningHours * 60 * 60 * 1000
    if (remaining <= 0 || remaining > warningWindow) return false
    if (!isDaytime()) return false

    const current = this.state.get()
    if (current.warningSentForExpire === token.expire) return false
    if (!this.canAttempt(`warning:${token.expire}`)) return false

    const sent = await sendTokenExpiringEmail({
      expire: token.expire,
      estimatedNextExpire: token.estimateNextExpire(),
    })

    if (sent) {
      await this.state.update({
        warningSentForExpire: token.expire,
        lastWarningAt: Date.now(),
      })
      console.log('📧 已发送 Token 即将过期提醒（本 Token 仅发送一次）。')
    }

    return sent
  }

  async notifyLoginSuccess(
    token: TokenInfo,
    previousExpire: number | null,
    autoCheckin: boolean,
  ): Promise<boolean> {
    if (!token.expire) return false

    return sendLoginSuccessEmail({
      expire: token.expire,
      previousExpire,
      autoCheckin,
    })
  }

  /** 签到结果邮件本身已经包含登录按钮时，避免再单独发送一封登录失效提醒。 */
  async markInvalidNotified(token: TokenInfo): Promise<void> {
    await this.state.update({
      invalidNoticeSentForExpire: token.expire || 0,
      lastInvalidNoticeAt: Date.now(),
    })
  }
}
