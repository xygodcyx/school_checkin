import { config } from './config.js'

export interface ZonedTime {
  timestamp: number
  year: string
  month: string
  day: string
  hour: number
  minute: number
  second: number
  weekday: string
  dateKey: string
  minutesOfDay: number
}

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: config.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const weekdayFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: config.timezone,
  weekday: 'long',
})

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function getZonedTime(timestamp: number = Date.now()): ZonedTime {
  const date = new Date(timestamp)
  const parts = dateTimeFormatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value || ''

  const year = get('year')
  const month = get('month')
  const day = get('day')
  const hour = Number(get('hour'))
  const minute = Number(get('minute'))
  const second = Number(get('second'))

  return {
    timestamp,
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: weekdayFormatter.format(date),
    dateKey: `${year}-${month}-${day}`,
    minutesOfDay: hour * 60 + minute,
  }
}

/** 2026年11月14日 星期六 18:05（北京时间） */
export function formatDateTime(timestamp: number): string {
  const time = getZonedTime(timestamp)
  return `${time.year}年${time.month}月${time.day}日 ${time.weekday} ${pad2(time.hour)}:${pad2(time.minute)}（${config.timezone === 'Asia/Shanghai' ? '北京时间' : config.timezone}）`
}

/** 11月14日 星期六 18:05 */
export function formatDateTimeShort(timestamp: number): string {
  const time = getZonedTime(timestamp)
  return `${time.month}月${time.day}日 ${time.weekday} ${pad2(time.hour)}:${pad2(time.minute)}`
}

/** 18:05 */
export function formatTime(timestamp: number = Date.now()): string {
  const time = getZonedTime(timestamp)
  return `${pad2(time.hour)}:${pad2(time.minute)}`
}

/** 2026-11-14 */
export function getDateKey(timestamp: number = Date.now()): string {
  return getZonedTime(timestamp).dateKey
}

export function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days} 天`)
  if (hours > 0) parts.push(`${hours} 小时`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} 分钟`)
  return parts.join(' ')
}

export function isAtOrAfterCheckin(timestamp: number = Date.now()): boolean {
  const { minutesOfDay } = getZonedTime(timestamp)
  return minutesOfDay >= config.checkin.hour * 60 + config.checkin.minute
}

export function getCheckinTimeLabel(): string {
  return `${pad2(config.checkin.hour)}:${pad2(config.checkin.minute)}`
}

/** 今天 18:00 / 明天 18:00 */
export function describeNextCheckin(timestamp: number = Date.now()): string {
  const time = getZonedTime(timestamp)
  const checkinMinutes = config.checkin.hour * 60 + config.checkin.minute
  return time.minutesOfDay < checkinMinutes
    ? `今天 ${getCheckinTimeLabel()}`
    : `明天 ${getCheckinTimeLabel()}`
}

export function addHours(timestamp: number, hours: number): number {
  return timestamp + hours * 60 * 60 * 1000
}
