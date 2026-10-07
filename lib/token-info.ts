// token-info.ts
import { createClient } from "redis"
import { fetchUUID, pollWxCode } from "./wechat-utils.js"
import { printAsciiQRCode } from "./qrcode-utils.js"
import { sendEmailWithQRCode } from "./email-utils.js"
import { request } from "./request.js"
import fetch from "node-fetch"
import fs from 'fs';

import { getRootPath } from './path-utils';
import path from "path"

enum SAVE_MODE_ENUM {
  REMOTE,
  LOCAL
}

const REDIS_TOKEN = process.env.REDIS_TOKEN
const REDIS_ADDR = process.env.REDIS_ADDR
const SAVE_MODE = process.env.SAVE_MODE === "remote" ? SAVE_MODE_ENUM.REMOTE : SAVE_MODE_ENUM.LOCAL

if (SAVE_MODE === SAVE_MODE_ENUM.REMOTE && (!REDIS_TOKEN || !REDIS_ADDR)) {
  throw new Error("❌ Redis 配置不完整")
}

const REDIS_URL = `rediss://default:${REDIS_TOKEN}@${REDIS_ADDR}`
const LOCAL_PATH = `${path.join(getRootPath(), "config.json")}`
const DEFAULT_TTL = 3600 * 24 * 3

let clientPromise: Promise<any>

function getClient() {
  if (!clientPromise) {
    clientPromise = createClient({ url: REDIS_URL })
      .on("error", (err: Error) => console.error("[Redis] Error", err))
      .connect()
  }
  return clientPromise
}

class TokenInfo {
  token: string | null
  expire: number | null

  constructor(token: string | null = null, expire: number | null = null) {
    this.token = token
    this.expire = expire
  }

  static async fromRedis(key: string = "token_info"): Promise<TokenInfo> {
    console.log("从Redis获取Token...")
    const client = await getClient()
    const json = await client.get(key)
    if (!json) return new TokenInfo()
    const { token, expire } = JSON.parse(json)
    return new TokenInfo(token, expire)
  }

  static async fromLocal(): Promise<TokenInfo> {
    console.log(`=====================Start: ${new Date()}=====================`)
    console.log("从Local获取Token...")
    const isExist = await fs.promises.exists(LOCAL_PATH)
    if (!isExist) {
      return new TokenInfo("", 0)
    }
    const json = await fs.promises.readFile(LOCAL_PATH, "utf-8")
    const { token, expire } = JSON.parse(json)
    return new TokenInfo(token, expire)
  }

  static async fetchTokenByWxCode(wxCode: string): Promise<TokenInfo> {
    const url = `https://i-api.jielong.com/api/User/OpenAuth?code=${wxCode}`
    const headers = {
      "content-type": "application/x-www-form-urlencoded",
    }
    const json = await request(url, {
      method: "POST",
      headers,
      body: "",
    })
    const tokenData = json?.Data?.Token
    const expire = json?.Data?.Expire
    if (!tokenData || !expire) throw new Error("❌ 获取 Token 失败")
    console.log("✅ 登录成功，Token 获取完毕")
    return new TokenInfo(`Bearer ${tokenData}`, expire)
  }

  async saveWithRedis(key: string = "token_info", ttl: number = DEFAULT_TTL): Promise<void> {
    const client = await getClient()
    await client.set(key, JSON.stringify(this), { EX: ttl })
    console.log("\n🎉 新 Token 已保存到 Redis")
  }

  async saveWithLocal() {
    await fs.promises.writeFile(LOCAL_PATH, JSON.stringify(this))
    console.log("\n🎉 新 Token 已保存到 本地")
  }

  isValid(): boolean {
    return !!(this.token && this.expire && Date.now() < this.expire)
  }

  static async get_ensureLoggedIn(): Promise<TokenInfo> {
    let tokenInfo = null
    switch (SAVE_MODE) {
      case SAVE_MODE_ENUM.REMOTE:
        tokenInfo = await TokenInfo.fromRedis()
        break;
      case SAVE_MODE_ENUM.LOCAL:
        tokenInfo = await TokenInfo.fromLocal()
        break;
      default:
        tokenInfo = await TokenInfo.fromLocal()
        break;
    }

    if (tokenInfo.isValid()) {
      console.log("✅ 检测到有效 Token，无需重新扫码。")
      return tokenInfo
    }

    while (true) {
      console.log("⚠️ Token 不存在或已过期，生成新的二维码并等待扫码...")

      let uuid: string
      try {
        uuid = await fetchUUID()
      } catch (err: any) {
        console.error(`获取 UUID 失败，稍后重试：${err?.message || err}`)
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }

      const qrRes = await fetch(
        `https://open.weixin.qq.com/connect/qrcode/${uuid}`
      )
      const qrBuffer = Buffer.from(await qrRes.arrayBuffer())

      // 打印到控制台并尝试发送邮件（邮件失败不会阻塞）
      // try {
      //   await printAsciiQRCode(uuid)
      // } catch (err: any) {
      //   console.warn("打印到控制台失败，仍会继续。", err?.message || err)
      // }

      // 发送邮件但不抛出错误
      await sendEmailWithQRCode(uuid, qrBuffer)

      // 等待扫码（阻塞直到扫码成功或二维码过期）
      const wxCode = await pollWxCode(uuid)
      if (!wxCode) {
        // 二维码过期，短暂等待并重试获取新的二维码
        console.log("二维码过期，准备重新生成新的二维码...")
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }

      // 成功拿到 wx_code，尝试换取 token
      try {
        const tokenInfo = await TokenInfo.fetchTokenByWxCode(wxCode)
        switch (SAVE_MODE) {
          case SAVE_MODE_ENUM.REMOTE:
            await tokenInfo.saveWithRedis()
            break;
          case SAVE_MODE_ENUM.LOCAL:
            await tokenInfo.saveWithLocal()
            break;
          default:
            await tokenInfo.saveWithLocal()
            break;
        }

        return tokenInfo
      } catch (err: any) {
        console.error(
          "用 wx_code 换取 Token 失败，稍后重试：",
          err?.message || err
        )
        await new Promise((r) => setTimeout(r, 2000))
        // 不直接退出，继续循环重新生成二维码
      }
    }
  }
}

export default TokenInfo

