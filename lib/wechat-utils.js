import { request } from './request.js'

const APPID = process.env.APPID || 'wx4a23ae4b8f291087'
const REDIRECT_URI =
  'https%3A%2F%2Fi.jielong.com%2Flogin-callback'
  
export async function fetchUUID() {
  const url = `https://open.weixin.qq.com/connect/qrconnect?appid=${APPID}&scope=snsapi_login&redirect_uri=${REDIRECT_URI}`
  const html = await request(url, { method: 'GET' })
  const match = html.match(/uuid=([a-zA-Z0-9_-]+)/)
  if (!match) throw new Error('❌ 未能提取到 UUID')
  return match[1]
}
export async function pollWxCode(uuid) {
  const pollUrl = `https://lp.open.weixin.qq.com/connect/l/qrconnect?uuid=${uuid}&last=404`
  process.stdout.write('⌛ 等待扫码')
  while (true) {
    const text = await request(pollUrl)
    const err = text.match(/wx_errcode=(\d+)/)
    const code = text.match(/wx_code='([^']+)'/)
    const errcode = err ? parseInt(err[1]) : null

    
    console.log(errcode, code)

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

export async function fetchTokenByWxCode(wxCode) {
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