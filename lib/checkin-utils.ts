import { config } from './config.js'
import { requestMeta, type RequestMeta } from './request.js'

export interface Location {
  latitude: number
  longitude: number
}

interface RecordValue {
  FieldId: number
  Values: string[]
  Texts: string[]
  HasValue: boolean
}

interface CheckInPayload {
  Id: number
  ThreadId: number
  Signature: string
  RecordValues: RecordValue[]
}

export const DEFAULT_LOCATION: Location = config.checkin.location
export const DEFAULT_LOCATION_LABEL = config.checkin.locationLabel

export async function getCheckInInfo(token: string): Promise<RequestMeta> {
  const url = `https://i-api.jielong.com/api/Thread/CheckIn/NameScope?threadId=${config.checkin.threadId}`
  return requestMeta(url, { method: 'GET' }, token)
}

export async function submitCheckIn(
  token: string,
  signature: string,
  location: Location | null = null,
): Promise<RequestMeta> {
  const payload: CheckInPayload = {
    Id: 0,
    ThreadId: config.checkin.threadId,
    Signature: signature,
    RecordValues: [
      {
        FieldId: 1,
        Values: [JSON.stringify(location || DEFAULT_LOCATION)],
        Texts: [DEFAULT_LOCATION_LABEL],
        HasValue: true,
      },
      {
        FieldId: 2,
        Values: [JSON.stringify(location || DEFAULT_LOCATION)],
        Texts: [DEFAULT_LOCATION_LABEL],
        HasValue: true,
      },
    ],
  }

  const url = `https://i-api.jielong.com/api/CheckIn/EditRecord`
  return requestMeta(url, { method: 'POST', body: payload }, token)
}

export interface CheckinEvaluation {
  success: boolean
  message: string
}

export function extractResponseMessage(data: any): string {
  if (data == null) return ''

  if (typeof data === 'string') {
    return data.trim().slice(0, 500)
  }

  const candidates = [
    data.Description,
    data.Message,
    data.Msg,
    data.message,
    data.msg,
    data.Data?.Description,
    data.Data?.Message,
    data.Data?.Msg,
  ]

  const found = candidates.find((value) => typeof value === 'string' && value.trim())
  if (found) return found.trim()

  try {
    return JSON.stringify(data).slice(0, 500)
  } catch {
    return String(data)
  }
}

export function evaluateCheckinResponse(result: RequestMeta): CheckinEvaluation {
  const message = extractResponseMessage(result.data)

  if (!result.ok) {
    return {
      success: false,
      message: message || `签到请求失败：HTTP ${result.status}`,
    }
  }

  const data = result.data
  if (data && typeof data === 'object') {
    if (data.Success === false || data.success === false || data.Data === false) {
      return { success: false, message: message || '服务端返回签到失败' }
    }

    const code = Number(data.Code ?? data.code)
    if (Number.isFinite(code) && ![0, 200].includes(code)) {
      return { success: false, message: message || `服务端返回错误码 ${code}` }
    }
  }

  return {
    success: true,
    message: message || '签到请求已成功提交',
  }
}

export function isAuthRequired(result: RequestMeta): boolean {
  if (result.status === 401 || result.status === 403) return true

  const code = Number(result.data?.Code ?? result.data?.code)
  if (code === 401 || code === 403) return true

  const message = `${extractResponseMessage(result.data)} ${result.text || ''}`
  return /(token|登录|授权|身份|expired|unauthorized)/i.test(message) &&
    /(过期|失效|无效|错误|失败|expired|invalid|unauthorized)/i.test(message)
}

export function extractCheckinInfoSummary(data: any): string {
  const value = data?.Data ?? data
  if (!value || typeof value !== 'object') return ''

  const candidates = [value.Name, value.Title, value.ThreadName, value.Subject, value.Description]
  return candidates.find((item) => typeof item === 'string' && item.trim())?.trim() || ''
}
