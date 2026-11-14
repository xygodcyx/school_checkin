import { config } from './config.js'

type QueryValue = string | number | boolean | null | undefined

function buildUrl(pathname: string, params: Record<string, QueryValue> = {}): string {
  const base = config.baseUrl.replace(/\/+$/, '')
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  const url = new URL(`${base}${path}`)

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

export function publicUrl(pathname: string, params: Record<string, QueryValue> = {}): string {
  return buildUrl(pathname, params)
}

/** 带 Webhook 鉴权参数的操作链接 */
export function actionUrl(pathname: string, params: Record<string, QueryValue> = {}): string {
  return buildUrl(pathname, {
    ...params,
    ...(config.webhookSecret ? { token: config.webhookSecret } : {}),
  })
}

export function qrImageUrl(uuid: string): string {
  return publicUrl(`/qr/${encodeURIComponent(uuid)}.png`)
}

export function qrPageUrl(uuid: string): string {
  return publicUrl(`/qr/${encodeURIComponent(uuid)}`)
}
