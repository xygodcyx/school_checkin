import fetch from 'node-fetch'

export interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: string | object
  timeoutMs?: number
}

export interface RequestMeta {
  ok: boolean
  status: number
  data: any
  text: string
}

// ==================== 通用请求封装 ====================
export async function requestMeta(
  url: string,
  options: RequestOptions = {},
  token: string | null = null,
): Promise<RequestMeta> {
  const defaultHeaders: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/plain, */*',
    origin: 'https://i.jielong.com',
    referer: 'https://i.jielong.com/',
    'user-agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/16A366 MicroMessenger/8.0.40 NetType/WIFI Language/zh_CN',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'sec-fetch-dest': 'empty',
  }

  if (token) defaultHeaders['Authorization'] = token

  const controller = new AbortController()
  const timeoutMs = options.timeoutMs || 20_000
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        ...defaultHeaders,
        ...(options.headers || {}),
      },
      body: options.body
        ? typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body)
        : undefined,
      signal: controller.signal as any,
    })

    const text = await res.text()
    let data: any = text
    try {
      data = JSON.parse(text)
    } catch {
      // 保留原始文本
    }

    return { ok: res.ok, status: res.status, data, text }
  } finally {
    clearTimeout(timer)
  }
}

export async function request(
  url: string,
  options: RequestOptions = {},
  token: string | null = null,
): Promise<any> {
  const result = await requestMeta(url, options, token)
  return result.data
}
