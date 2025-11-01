import path from 'path'
import nodemailer from 'nodemailer'
import fs from 'fs'

const SMTP_PORT = process.env.SMTP_PORT
const SMTP_HOST = process.env.SMTP_HOST
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const TO_EMAIL = process.env.TO_EMAIL

export let EMAIL_ENABLE = true

if (!SMTP_USER || !SMTP_PASS || !TO_EMAIL) {
  console.log('⚠️ 邮件发送配置不完整，邮件功能已禁用。请设置 SMTP_USER, SMTP_PASS, TO_EMAIL 环境变量以启用邮件功能。')
  EMAIL_ENABLE = false
}

export function createMailSender() {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '465'),
    secure: true,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  })
  return transporter
}

export async function sendEmailWithQRCode(uuid: string, qrBuffer: Buffer): Promise<void> {
  if (!EMAIL_ENABLE) {
    return
  }
  console.log('📧 正在发送二维码邮件...')
  try {
    const transporter = createMailSender()

    const qrPath = path.resolve(`./qrcode.png`)
    await fs.promises.writeFile(qrPath, qrBuffer as NodeJS.ArrayBufferView)

    const info = await transporter.sendMail({
      from: `"WeChat Login" <${SMTP_USER || '1323943635@qq.com'}>`,
      to: TO_EMAIL!,
      subject: '请扫码登录微信（自动签到机器人）',
      text: '请使用微信扫描附件二维码进行登录授权。',
      attachments: [
        {
          filename: `wechat_login_${uuid}.png`,
          path: qrPath,
        },
      ],
    })

    fs.unlinkSync(qrPath)
    console.log('✅ 邮件已发送:', info.messageId)
  } catch (err: any) {
    // 发送失败仅记录，不抛出
    console.log(
      `⚠️ 发送邮件失败：请前往网址扫描二维码：https://open.weixin.qq.com/connect/qrcode/${uuid}`
    )
  }
}

export async function sendCheckinResult(result: any): Promise<void> {
  if (!EMAIL_ENABLE) {
    return
  }
  try {
    console.log('📧 正在发送签到结果邮件...')
    const transporter = createMailSender()
    const info = await transporter.sendMail({
      from: `"WeChat Login" <${SMTP_USER || '1323943635@qq.com'}>`,
      to: TO_EMAIL!,
      subject: `签到结果 - ${result?.Data || '未知'}`,
      text: `${result?.Description || JSON.stringify(result)}`,
    })
    console.log('✅ 邮件已发送:', info.messageId)
  } catch (err: any) {
    console.warn(
      '⚠️ 发送签到结果邮件失败:',
      err?.message || err
    )
  }
}

