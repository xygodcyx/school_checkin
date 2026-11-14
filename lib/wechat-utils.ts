import { request } from './request.js'

const APPID = process.env.APPID || 'wx4a23ae4b8f291087'
const REDIRECT_URI = 'https%3A%2F%2Fi.jielong.com%2Flogin-callback'

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export async function fetchUUID(): Promise<string> {
  const url = `https://open.weixin.qq.com/connect/qrconnect?appid=${APPID}&scope=snsapi_login&redirect_uri=${REDIRECT_URI}`
  const html = await request(url, { method: 'GET' })
  const match = typeof html === 'string' ? html.match(/uuid=([a-zA-Z0-9_-]+)/) : null
  if (!match) throw new Error('❌ 未能从微信页面提取到 UUID')
  return match[1]
}

/**
 * 轮询微信扫码结果。
 * - 返回 wx_code 表示扫码成功
 * - 返回 null 表示二维码过期、被取消或轮询被中断
 */
export async function pollWxCode(
  uuid: string,
  isCancelled: () => boolean = () => false,
): Promise<string | null> {
  const pollUrl = `https://lp.open.weixin.qq.com/connect/l/qrconnect?uuid=${uuid}&last=404`

  while (!isCancelled()) {
    let text: any

    try {
      text = await request(pollUrl, { timeoutMs: 15_000 })
    } catch (err: any) {
      if (isCancelled()) return null
      console.warn(`⚠️ 轮询扫码状态失败，稍后重试：${err?.message || err}`)
      await sleep(2000)
      continue
    }

    if (typeof text !== 'string') {
      await sleep(1000)
      continue
    }

    const errMatch = text.match(/wx_errcode=(\d+)/)
    const codeMatch = text.match(/wx_code='([^']+)'/)
    const errcode = errMatch ? Number.parseInt(errMatch[1], 10) : null

    if (errcode === 405 && codeMatch) {
      console.log('✅ 微信扫码成功')
      return codeMatch[1]
    }

    if (errcode === 403 || errcode === 402 || errcode === 666) {
      console.log('⚠️ 微信二维码已过期')
      return null
    }

    await sleep(1000)
  }

  return null
}
