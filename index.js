#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'
import sharp from 'sharp'
import terminalImage from 'terminal-image'
import nodemailer from 'nodemailer'
import dotenv from 'dotenv'
dotenv.config()

// ==================== Tool工具函数 ====================

// 判断是否在 GitHub Actions 环境
const isGithubAction = !!process.env.IS_GITHUB_ACTIONS
const CONFIG_FILE = './config.json'

/**
 * 读取配置
 * @returns {object|null} 配置对象，如果不存在返回 null
 */
export async function getConfig() {
  try {
    // 运行在 GitHub Actions 时，从远程拉取 config（你之前的逻辑）
    if (isGithubAction) {
      console.log('远程仓库，从github获取')
      const configPromise = (
        await fetch(
          'https://xygodcyx.github.io/school_checkin/config.json'
        )
      ).json()
      const config = await configPromise
      return config
    } else {
      if (!fs.existsSync(CONFIG_FILE)) return null
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
      return JSON.parse(raw)
    }
  } catch (err) {
    console.error('Failed to read config:', err)
    return null
  }
}

/**
 * 写入配置
 * @param {object} data 配置对象
 */
export function setConfig(data) {
  try {
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify(data, null, 2),
      'utf-8'
    )
  } catch (err) {
    console.error('Failed to write config:', err)
  }
}

function isTokenValid(config) {
  return (
    config?.token &&
    config?.expire &&
    Date.now() < config.expire
  )
}

function createMailSender() {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: parseInt(process.env.SMTP_PORT || 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER || '1323943635@qq.com',
      pass: process.env.SMTP_PASS || 'vfqtkervzmldghjj',
    },
  })
  return transporter
}

// ==================== 全局配置 ====================
const APPID = process.env.APPID || 'wx4a23ae4b8f291087'
const REDIRECT_URI =
  'https%3A%2F%2Fi.jielong.com%2Flogin-callback'

// 签到相关
const THREAD_ID = 163231508
const DEFAULT_LOCATION = {
  latitude: 28.42995,
  longitude: 117.964691,
}

// ==================== 通用请求封装 ====================
async function request(url, options = {}, token = null) {
  const defaultHeaders = {
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
  })

  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// ==================== 邮件发送 ====================
async function sendEmailWithQRCode(uuid, qrBuffer) {
  console.log('📧 正在发送二维码邮件...')
  try {
    const transporter = createMailSender()

    const qrPath = path.resolve(`./qrcode.png`)
    fs.writeFileSync(qrPath, qrBuffer)

    const info = await transporter.sendMail({
      from: `"WeChat Login" <${
        process.env.SMTP_USER || '1323943635@qq.com'
      }>`,
      to: process.env.TO_EMAIL,
      subject: '请扫码登录微信（自动签到机器人）',
      text: '请使用微信扫描附件二维码进行登录授权。',
      attachments: [
        {
          filename: `wechat_login_${uuid}.png`,
          path: qrPath,
        },
      ],
    })
    console.log('✅ 邮件已发送:', info.messageId)
  } catch (err) {
    // 发送失败仅记录，不抛出
    console.log(
      `⚠️ 发送邮件失败：请前往网址扫描二维码：https://open.weixin.qq.com/connect/qrcode/${uuid}`
    )
  }
}

async function sendCheckinResult(result) {
  try {
    console.log('📧 正在发送签到结果邮件...')
    const transporter = createMailSender()
    const info = await transporter.sendMail({
      from: `"WeChat Login" <${
        process.env.SMTP_USER || '1323943635@qq.com'
      }>`,
      to: process.env.TO_EMAIL,
      subject: `签到结果 - ${result?.Data || '未知'}`,
      text: `${
        result?.Description || JSON.stringify(result)
      }`,
    })
    console.log('✅ 邮件已发送:', info.messageId)
  } catch (err) {
    console.warn(
      '⚠️ 发送签到结果邮件失败:',
      err?.message || err
    )
  }
}

// ==================== 微信登录 ====================
async function fetchUUID() {
  const url = `https://open.weixin.qq.com/connect/qrconnect?appid=${APPID}&scope=snsapi_login&redirect_uri=${REDIRECT_URI}`
  const html = await request(url, { method: 'GET' })
  const match = html.match(/uuid=([a-zA-Z0-9_-]+)/)
  if (!match) throw new Error('❌ 未能提取到 UUID')
  return match[1]
}

async function pollWxCode(uuid) {
  const pollUrl = `https://lp.open.weixin.qq.com/connect/l/qrconnect?uuid=${uuid}&last=404`
  process.stdout.write('⌛ 等待扫码')
  while (true) {
    const text = await request(pollUrl)
    const err = text.match(/wx_errcode=(\d+)/)
    const code = text.match(/wx_code='([^']+)'/)
    const errcode = err ? parseInt(err[1]) : null

    if (errcode === 405 && code) {
      console.log('\n✅ 扫码成功，wx_code:', code[1])
      return code[1]
    } else if (errcode === 404) process.stdout.write('.')
    else if (errcode === 403) {
      console.log('\n⚠️ 二维码过期，请重试')
      return null
    }
    await new Promise(r => setTimeout(r, 1000))
  }
}

async function fetchTokenByWxCode(wxCode) {
  const url = `https://i-api.jielong.com/api/User/OpenAuth?code=${wxCode}`
  const headers = {
    'content-type': 'application/x-www-form-urlencoded',
  }
  const json = await request(url, {
    method: 'POST',
    headers,
    body: '',
  })
  const tokenData = json?.Data?.Token
  const expire = json?.Data?.Expire
  if (!tokenData || !expire)
    throw new Error('❌ 获取 Token 失败')
  console.log('✅ 登录成功，Token 获取完毕')
  return { token: `Bearer ${tokenData}`, expire }
}

// ==================== 控制台二维码 ====================
async function printAsciiQRCode(uuid) {
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

// ==================== 签到接口 ====================
async function getCheckInInfo(token) {
  const url = `https://i-api.jielong.com/api/Thread/CheckIn/NameScope?threadId=${THREAD_ID}`
  return request(url, { method: 'GET' }, token)
}

async function submitCheckIn(
  token,
  signature = '曹英翔',
  location = null
) {
  const payload = {
    Id: 0,
    ThreadId: THREAD_ID,
    Signature: signature,
    RecordValues: [
      {
        FieldId: 1,
        Values: [],
        Texts: [],
        HasValue: false,
      },
      {
        FieldId: 2,
        Values: [
          JSON.stringify(location || DEFAULT_LOCATION),
        ],
        Texts: ['上饶市信州区•上饶市信州区人民政府'],
        HasValue: true,
      },
    ],
  }
  const url = `https://i-api.jielong.com/api/CheckIn/EditRecord`
  return request(
    url,
    { method: 'POST', body: payload },
    token
  )
}

// ==================== 主流程：确保登录（无限重试直到扫码成功） ====================
async function ensureLoggedIn() {
  let config = await getConfig()
  if (isTokenValid(config)) {
    console.log('✅ 检测到有效 Token，无需重新扫码。')
    return config
  }

  while (true) {
    console.log(
      '⚠️ Token 不存在或已过期，生成新的二维码并等待扫码...'
    )

    let uuid
    try {
      uuid = await fetchUUID()
    } catch (err) {
      console.error(
        '获取 UUID 失败，稍后重试：',
        err?.message || err
      )
      await new Promise(r => setTimeout(r, 2000))
      continue
    }

    const qrRes = await fetch(
      `https://open.weixin.qq.com/connect/qrcode/${uuid}`
    )
    const qrBuffer = Buffer.from(await qrRes.arrayBuffer())

    // 打印到控制台并尝试发送邮件（邮件失败不会阻塞）
    try {
      await printAsciiQRCode(uuid)
    } catch (err) {
      console.warn(
        '打印到控制台失败，仍会继续。',
        err?.message || err
      )
    }

    // 发送邮件但不抛出错误
    await sendEmailWithQRCode(uuid, qrBuffer)

    // 等待扫码（阻塞直到扫码成功或二维码过期）
    const wxCode = await pollWxCode(uuid)
    if (!wxCode) {
      // 二维码过期，短暂等待并重试获取新的二维码
      console.log('二维码过期，准备重新生成新的二维码...')
      await new Promise(r => setTimeout(r, 2000))
      continue
    }

    // 成功拿到 wx_code，尝试换取 token
    try {
      const { token, expire } = await fetchTokenByWxCode(
        wxCode
      )
      const newConfig = { token, expire }
      setConfig(newConfig)
      console.log('\n🎉 新 Token 已保存到 config.json')
      return newConfig
    } catch (err) {
      console.error(
        '用 wx_code 换取 Token 失败，稍后重试：',
        err?.message || err
      )
      await new Promise(r => setTimeout(r, 2000))
      // 不直接退出，继续循环重新生成二维码
    }
  }
}

// ==================== 主流程：签到 ====================
async function main() {
  try {
    const config = await ensureLoggedIn()

    console.log('\n📋 开始签到...')
    const info = await getCheckInInfo(config.token)
    console.log('签到信息:', info)

    const result = await submitCheckIn(config.token)
    console.log('✅ 签到完成:', result)

    // 发送签到结果邮件（可选，失败不阻塞）
    await sendCheckinResult(result)
  } catch (err) {
    console.error('❌ 运行出错:', err.message || err)
    process.exit(1)
  }
}

main()
