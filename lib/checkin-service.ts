import { config } from './config.js'
import {
  extractCheckinInfoSummary,
  extractResponseMessage,
  evaluateCheckinResponse,
  getCheckInInfo,
  isAuthRequired,
  submitCheckIn,
} from './checkin-utils.js'
import { sendCheckinResultEmail } from './email-utils.js'
import { NotificationService } from './notification-service.js'
import { StateStore } from './state-store.js'
import { formatDateTime, getDateKey } from './time-utils.js'
import { TokenInfo } from './token-info.js'

export type CheckinTrigger = 'schedule' | 'webhook' | 'post-login'
export type CheckinStatus = 'success' | 'failed' | 'already-ran' | 'busy'

export interface CheckinOutcome {
  status: CheckinStatus
  success: boolean
  message: string
  checkedAt: number
  tokenExpire: number | null
  authRequired: boolean
  infoSummary: string
}

export class CheckinService {
  private inFlight: Promise<CheckinOutcome> | null = null
  private lastForceRunAt = 0

  constructor(
    private readonly state: StateStore,
    private readonly notifications: NotificationService,
  ) {}

  async run(options: {
    trigger: CheckinTrigger
    force?: boolean
  }): Promise<CheckinOutcome> {
    if (this.inFlight) {
      return {
        status: 'busy',
        success: false,
        message: '签到任务正在执行中，请稍后再查看结果。',
        checkedAt: Date.now(),
        tokenExpire: null,
        authRequired: false,
        infoSummary: '',
      }
    }

    if (options.force) {
      const now = Date.now()
      if (now - this.lastForceRunAt < 15_000) {
        return {
          status: 'busy',
          success: false,
          message: '操作过于频繁，请 15 秒后再试，避免重复提交和重复发送邮件。',
          checkedAt: now,
          tokenExpire: null,
          authRequired: false,
          infoSummary: '',
        }
      }
      this.lastForceRunAt = now
    }

    const promise = this.perform(options)
    this.inFlight = promise

    try {
      return await promise
    } finally {
      if (this.inFlight === promise) this.inFlight = null
    }
  }

  private async perform(options: {
    trigger: CheckinTrigger
    force?: boolean
  }): Promise<CheckinOutcome> {
    const checkedAt = Date.now()
    const today = getDateKey(checkedAt)
    const current = this.state.get()

    if (!options.force && current.lastCheckinDate === today && current.lastCheckinSuccess === true) {
      const message = `今日已签到成功（${current.lastCheckinAt ? formatDateTime(current.lastCheckinAt) : '今天'}），无需重复执行。`
      console.log(`ℹ️ ${message}`)
      return {
        status: 'already-ran',
        success: true,
        message,
        checkedAt: current.lastCheckinAt || checkedAt,
        tokenExpire: null,
        authRequired: false,
        infoSummary: '',
      }
    }

    let tokenInfo: TokenInfo
    try {
      tokenInfo = await TokenInfo.load()
    } catch (err: any) {
      return this.failWithoutToken(checkedAt, today, `读取登录状态失败：${err?.message || err}`)
    }

    if (!tokenInfo.isValid()) {
      const authMessage = tokenInfo.token
        ? `登录状态已过期（${tokenInfo.expire ? formatDateTime(tokenInfo.expire) : '过期时间未知'}）`
        : '尚未登录微信，无法执行签到'

      console.warn(`⚠️ ${authMessage}`)
      await this.state.update({
        lastCheckinDate: today,
        lastCheckinAt: checkedAt,
        lastCheckinSuccess: false,
        lastCheckinMessage: authMessage,
        pendingCheckin: true,
      })

      const emailSent = await sendCheckinResultEmail({
        success: false,
        message: authMessage,
        checkedAt,
        tokenExpire: tokenInfo.expire,
        authRequired: true,
        infoSummary: '',
      })

      if (emailSent) {
        await this.notifications.markInvalidNotified(tokenInfo)
      }

      return {
        status: 'failed',
        success: false,
        message: authMessage,
        checkedAt,
        tokenExpire: tokenInfo.expire,
        authRequired: true,
        infoSummary: '',
      }
    }

    let infoSummary = ''
    try {
      const info = await getCheckInInfo(tokenInfo.token!)
      if (!info.ok && isAuthRequired(info)) {
        return this.failAuthRequired(checkedAt, today, tokenInfo, info.data)
      }
      if (info.ok) {
        infoSummary = extractCheckinInfoSummary(info.data)
      } else {
        console.warn(`⚠️ 获取签到信息失败，仍将尝试签到：HTTP ${info.status}`)
      }
    } catch (err: any) {
      console.warn(`⚠️ 获取签到信息异常，仍将尝试签到：${err?.message || err}`)
    }

    console.log(`📋 开始签到（触发方式：${options.trigger}）`)

    let result
    try {
      result = await submitCheckIn(tokenInfo.token!, config.name)
    } catch (err: any) {
      const message = `签到请求异常：${err?.message || err}`
      console.error(`❌ ${message}`)
      await this.state.update({
        lastCheckinDate: today,
        lastCheckinAt: checkedAt,
        lastCheckinSuccess: false,
        lastCheckinMessage: message,
        pendingCheckin: false,
      })

      await sendCheckinResultEmail({
        success: false,
        message,
        checkedAt,
        tokenExpire: tokenInfo.expire,
        authRequired: false,
        infoSummary,
      })

      return {
        status: 'failed',
        success: false,
        message,
        checkedAt,
        tokenExpire: tokenInfo.expire,
        authRequired: false,
        infoSummary,
      }
    }

    if (isAuthRequired(result)) {
      return this.failAuthRequired(checkedAt, today, tokenInfo, result.data, infoSummary)
    }

    const evaluation = evaluateCheckinResponse(result)
    const success = evaluation.success

    await this.state.update({
      lastCheckinDate: today,
      lastCheckinAt: checkedAt,
      lastCheckinSuccess: success,
      lastCheckinMessage: evaluation.message,
      pendingCheckin: false,
    })

    console.log(`${success ? '✅' : '❌'} 签到结果：${evaluation.message}`)

    await sendCheckinResultEmail({
      success,
      message: evaluation.message,
      checkedAt,
      tokenExpire: tokenInfo.expire,
      authRequired: false,
      infoSummary,
    })

    return {
      status: success ? 'success' : 'failed',
      success,
      message: evaluation.message,
      checkedAt,
      tokenExpire: tokenInfo.expire,
      authRequired: false,
      infoSummary,
    }
  }

  private async failAuthRequired(
    checkedAt: number,
    today: string,
    tokenInfo: TokenInfo,
    data: any,
    infoSummary = '',
  ): Promise<CheckinOutcome> {
    const detail = data ? extractResponseMessage(data).slice(0, 300) : ''
    const message = `登录状态已失效，签到未执行${detail ? `：${detail}` : ''}`

    await this.state.update({
      lastCheckinDate: today,
      lastCheckinAt: checkedAt,
      lastCheckinSuccess: false,
      lastCheckinMessage: message,
      pendingCheckin: true,
    })

    const emailSent = await sendCheckinResultEmail({
      success: false,
      message,
      checkedAt,
      tokenExpire: tokenInfo.expire,
      authRequired: true,
      infoSummary,
    })

    if (emailSent) {
      await this.notifications.markInvalidNotified(tokenInfo)
    }

    return {
      status: 'failed',
      success: false,
      message,
      checkedAt,
      tokenExpire: tokenInfo.expire,
      authRequired: true,
      infoSummary,
    }
  }

  private async failWithoutToken(checkedAt: number, today: string, message: string): Promise<CheckinOutcome> {
    console.error(`❌ ${message}`)
    await this.state.update({
      lastCheckinDate: today,
      lastCheckinAt: checkedAt,
      lastCheckinSuccess: false,
      lastCheckinMessage: message,
      pendingCheckin: true,
    })

    await sendCheckinResultEmail({
      success: false,
      message,
      checkedAt,
      tokenExpire: null,
      authRequired: true,
      infoSummary: '',
    })

    return {
      status: 'failed',
      success: false,
      message,
      checkedAt,
      tokenExpire: null,
      authRequired: true,
      infoSummary: '',
    }
  }
}
