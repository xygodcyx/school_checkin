import fetch from 'node-fetch'
import sharp from 'sharp'

export interface QrCodeImage {
  buffer: Buffer
  contentType: 'image/png'
}

export async function fetchQrCodeImage(uuid: string): Promise<QrCodeImage> {
  const qrUrl = `https://open.weixin.qq.com/connect/qrcode/${uuid}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)

  try {
    const response = await fetch(qrUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/16A366 MicroMessenger/8.0.40 NetType/WIFI Language/zh_CN',
      },
      signal: controller.signal as any,
    })

    if (!response.ok) {
      throw new Error(`获取微信二维码失败：HTTP ${response.status}`)
    }

    const raw = Buffer.from(await response.arrayBuffer())
    // 微信有时返回 JPEG，统一转换为 PNG，避免邮件客户端对二维码附件类型兼容性差。
    const buffer = await sharp(raw).png().toBuffer()
    return { buffer, contentType: 'image/png' }
  } finally {
    clearTimeout(timer)
  }
}
