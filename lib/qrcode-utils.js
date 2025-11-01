import sharp from 'sharp'
import terminalImage from 'terminal-image'
import fetch from 'node-fetch'
export async function printAsciiQRCode(uuid) {
  const qrUrl = `https://open.weixin.qq.com/connect/qrcode/${uuid}`
  const buffer = Buffer.from(
    await (await fetch(qrUrl)).arrayBuffer()
  )
  const resized = await sharp(buffer)
    .resize({ width: 200 })
    .toBuffer()
  console.log('\n请使用微信扫描下方二维码：\n')
  console.log(
    await terminalImage.buffer(resized, { width: 200 })
  )
  console.log('\n（提示：此二维码为登录二维码）')
}