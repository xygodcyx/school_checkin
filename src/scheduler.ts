import { CheckinService } from '../lib/checkin-service.js'
import { NotificationService } from '../lib/notification-service.js'
import { StateStore } from '../lib/state-store.js'
import { formatDateTime, getZonedTime, isAtOrAfterCheckin } from '../lib/time-utils.js'
import { TokenInfo } from '../lib/token-info.js'

const TICK_INTERVAL_MS = 30_000
const NOTIFICATION_INTERVAL_MS = 5 * 60_000

export class Scheduler {
  private interval: ReturnType<typeof setInterval> | null = null
  private initialTimer: ReturnType<typeof setTimeout> | null = null
  private ticking = false
  private lastNotificationCheck = 0

  constructor(
    private readonly state: StateStore,
    private readonly notifications: NotificationService,
    private readonly checkinService: CheckinService,
  ) {}

  start(): void {
    console.log('⏰ 定时任务已启动：每日签到、Token 过期提醒。')
    this.initialTimer = setTimeout(() => void this.tick(), 1500)
    this.interval = setInterval(() => void this.tick(), TICK_INTERVAL_MS)
  }

  stop(): void {
    if (this.initialTimer) clearTimeout(this.initialTimer)
    if (this.interval) clearInterval(this.interval)
    this.initialTimer = null
    this.interval = null
  }

  private async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true

    try {
      const now = Date.now()
      const zoned = getZonedTime(now)
      const current = this.state.get()
      const alreadySucceededToday =
        current.lastCheckinDate === zoned.dateKey && current.lastCheckinSuccess === true

      if (
        isAtOrAfterCheckin(now) &&
        !alreadySucceededToday &&
        current.lastScheduledCheckinDate !== zoned.dateKey
      ) {
        console.log(`📋 到达每日签到时间（${zoned.dateKey}），开始执行签到...`)
        const outcome = await this.checkinService.run({ trigger: 'schedule' })

        // 通过独立字段记录“今日定时任务已尝试”，避免手动签到失败后每 30 秒重复触发。
        await this.state.update({ lastScheduledCheckinDate: zoned.dateKey })

        console.log(
          `📋 每日签到结束：${outcome.status} - ${outcome.message}（${formatDateTime(outcome.checkedAt)}）`,
        )
      }

      if (now - this.lastNotificationCheck < NOTIFICATION_INTERVAL_MS) return
      this.lastNotificationCheck = now

      try {
        const token = await TokenInfo.load()
        if (token.isValid()) {
          await this.notifications.notifyTokenExpiring(token)
        } else {
          await this.notifications.notifyInvalidToken(token)
        }
      } catch (err: any) {
        console.error(`⚠️ 检查 Token 状态失败：${err?.message || err}`)
      }
    } catch (err: any) {
      console.error(`⚠️ 定时任务执行异常：${err?.message || err}`)
    } finally {
      this.ticking = false
    }
  }
}
