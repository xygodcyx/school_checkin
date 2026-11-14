import { config } from '../lib/config.js'
import { CheckinService } from '../lib/checkin-service.js'
import { LoginManager } from '../lib/login-manager.js'
import { NotificationService } from '../lib/notification-service.js'
import { StateStore } from '../lib/state-store.js'
import { getDateKey, isAtOrAfterCheckin } from '../lib/time-utils.js'
import { closeTokenStore } from '../lib/token-info.js'
import { createRequestHandler } from './server.js'
import { Scheduler } from './scheduler.js'

export interface Application {
  fetch: (request: Request) => Promise<Response>
  start: () => void
  stop: () => Promise<void>
}

export async function createApplication(): Promise<Application> {
  const state = await StateStore.load(config.stateFile)
  const notifications = new NotificationService(state)
  const checkinService = new CheckinService(state, notifications)

  const loginManager = new LoginManager({
    onSuccess: async (token, context) => {
      const now = Date.now()
      const today = getDateKey(now)
      const current = state.get()

      const shouldCheckin =
        current.pendingCheckin ||
        (isAtOrAfterCheckin(now) &&
          !(current.lastCheckinDate === today && current.lastCheckinSuccess === true))

      await state.update({
        warningSentForExpire: null,
        invalidNoticeSentForExpire: null,
        pendingCheckin: false,
        lastLoginAt: now,
        lastLoginSuccessExpire: token.expire,
      })

      await notifications.notifyLoginSuccess(
        token,
        context.previousExpire,
        shouldCheckin,
      )

      if (shouldCheckin) {
        console.log('🔁 登录成功，继续完成今日签到...')
        const outcome = await checkinService.run({ trigger: 'post-login' })
        console.log(`🔁 登录后签到结果：${outcome.status} - ${outcome.message}`)
      }
    },
  })

  const scheduler = new Scheduler(state, notifications, checkinService)
  const fetch = createRequestHandler({
    state,
    loginManager,
    checkinService,
  })

  return {
    fetch,
    start: () => scheduler.start(),
    stop: async () => {
      scheduler.stop()
      await closeTokenStore()
    },
  }
}
