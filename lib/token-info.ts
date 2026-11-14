import fs from 'fs/promises'
import path from 'path'
import { createClient } from 'redis'
import { config } from './config.js'
import { getRootPath } from './path-utils.js'
import { requestMeta } from './request.js'

const LOCAL_PATH = path.join(getRootPath(), 'config.json')
const REDIS_KEY = 'token_info'

let clientPromise: Promise<any> | null = null

function getRedisClient(): Promise<any> {
  if (!clientPromise) {
    const url = `rediss://default:${encodeURIComponent(config.redis.token)}@${config.redis.addr}`
    const client = createClient({ url })
    client.on('error', (err: Error) => console.error('[Redis] Error', err))

    clientPromise = client
      .connect()
      .then(() => client)
      .catch((err: Error) => {
        clientPromise = null
        throw err
      })
  }

  return clientPromise
}

export async function closeTokenStore(): Promise<void> {
  if (!clientPromise) return

  try {
    const client = await clientPromise
    await client.quit()
  } catch {
    // 忽略关闭连接时的异常
  } finally {
    clientPromise = null
  }
}

function normalizeExpire(value: unknown): number | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  // 兼容秒级时间戳
  return numeric < 1_000_000_000_000 ? Math.round(numeric * 1000) : Math.round(numeric)
}

export class TokenInfo {
  token: string | null
  expire: number | null

  constructor(token: string | null = null, expire: number | null = null) {
    this.token = token || null
    this.expire = normalizeExpire(expire)
  }

  static async load(): Promise<TokenInfo> {
    return config.saveMode === 'remote' ? TokenInfo.fromRedis() : TokenInfo.fromLocal()
  }

  static async fromRedis(): Promise<TokenInfo> {
    const client = await getRedisClient()
    const json = await client.get(REDIS_KEY)
    if (!json) return new TokenInfo()

    try {
      const { token, expire } = JSON.parse(json)
      return new TokenInfo(token, expire)
    } catch {
      console.warn('⚠️ Redis 中的 Token 数据格式异常，已忽略。')
      return new TokenInfo()
    }
  }

  static async fromLocal(): Promise<TokenInfo> {
    try {
      const json = await fs.readFile(LOCAL_PATH, 'utf-8')
      const { token, expire } = JSON.parse(json)
      return new TokenInfo(token, expire)
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.warn(`⚠️ 读取本地 Token 失败：${err?.message || err}`)
      }
      return new TokenInfo()
    }
  }

  static async fetchTokenByWxCode(wxCode: string): Promise<TokenInfo> {
    const url = `https://i-api.jielong.com/api/User/OpenAuth?code=${wxCode}`
    const result = await requestMeta(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: '',
    })

    if (!result.ok) {
      throw new Error(`换取 Token 失败：HTTP ${result.status}`)
    }

    const tokenData = result.data?.Data?.Token
    const expire = result.data?.Data?.Expire
    if (!tokenData || !expire) {
      throw new Error('❌ 获取 Token 失败：响应中没有 Token 或 Expire')
    }

    return new TokenInfo(`Bearer ${tokenData}`, expire)
  }

  async save(): Promise<void> {
    if (config.saveMode === 'remote') {
      await this.saveWithRedis()
    } else {
      await this.saveWithLocal()
    }
  }

  async saveWithRedis(): Promise<void> {
    const client = await getRedisClient()
    const ttlSeconds = this.expire
      ? Math.max(60, Math.ceil((this.expire - Date.now()) / 1000))
      : config.token.defaultTtlHours * 3600

    await client.set(REDIS_KEY, JSON.stringify({ token: this.token, expire: this.expire }), {
      EX: ttlSeconds,
    })
    console.log('🎉 新 Token 已保存到 Redis')
  }

  async saveWithLocal(): Promise<void> {
    await fs.writeFile(LOCAL_PATH, JSON.stringify({ token: this.token, expire: this.expire }), 'utf-8')
    console.log('🎉 新 Token 已保存到本地 config.json')
  }

  isValid(now: number = Date.now()): boolean {
    return Boolean(this.token && this.expire && now < this.expire)
  }

  remainingMs(now: number = Date.now()): number {
    if (!this.expire) return 0
    return Math.max(0, this.expire - now)
  }

  /**
   * 从 JWT 中读取 iat/exp，推断服务端签发的 Token 有效期。
   * 该值只用于在用户登录前估算“登录后可持续到什么时候”。
   */
  getTtlMs(): number | null {
    if (!this.token) return null

    try {
      const raw = this.token.replace(/^Bearer\s+/i, '')
      const payloadPart = raw.split('.')[1]
      if (!payloadPart) return null

      const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf-8')) as {
        iat?: number
        exp?: number
      }

      if (typeof payload.iat === 'number' && typeof payload.exp === 'number') {
        return Math.max(0, (payload.exp - payload.iat) * 1000)
      }
    } catch {
      // 解析失败时使用默认有效期
    }

    return null
  }

  /** 如果现在重新登录，Token 预计会持续到的具体时间 */
  estimateNextExpire(now: number = Date.now()): number {
    return now + (this.getTtlMs() || config.token.defaultTtlHours * 60 * 60 * 1000)
  }
}

export { LOCAL_PATH as TOKEN_LOCAL_PATH, REDIS_KEY as TOKEN_REDIS_KEY }
