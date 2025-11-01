// token-info.js
import { createClient } from "redis";
import { fetchUUID, pollWxCode, fetchTokenByWxCode } from "./wechat-utils.js";
import { printAsciiQRCode } from "./qrcode-utils.js";
import { sendEmailWithQRCode } from "./email-utils.js";
import { request } from "./request.js";
import  fetch from "node-fetch";

const REDIS_TOKEN = process.env.REDIS_TOKEN
const REDIS_ADDR = process.env.REDIS_ADDR

if (!REDIS_TOKEN || !REDIS_ADDR) {
  throw new Error("❌ Redis 配置不完整");
}
const REDIS_URL = `rediss://default:${REDIS_TOKEN}@${REDIS_ADDR}`;
const DEFAULT_TTL = 3600;

let clientPromise;
function getClient() {
  if (!clientPromise) {
    clientPromise = createClient({ url: REDIS_URL })
      .on("error", (err) => console.error("[Redis] Error", err))
      .connect();
  }
  return clientPromise;
}

class TokenInfo {
  constructor(token = null, expire = null) {
    this.token = token;
    this.expire = expire;
  }

  static async fromRedis(key = "token_info") {
    const client = await getClient();
    const json = await client.get(key);
    if (!json) return new TokenInfo();
    const { token, expire } = JSON.parse(json);
    return new TokenInfo(token, expire);
  }

  static async fetchTokenByWxCode(wxCode) {
    const url = `https://i-api.jielong.com/api/User/OpenAuth?code=${wxCode}`;
    const headers = {
      "content-type": "application/x-www-form-urlencoded",
    };
    const json = await request(url, {
      method: "POST",
      headers,
      body: "",
    });
    const tokenData = json?.Data?.Token;
    const expire = json?.Data?.Expire;
    if (!tokenData || !expire) throw new Error("❌ 获取 Token 失败");
    console.log("✅ 登录成功，Token 获取完毕");
    return new TokenInfo(`Bearer ${tokenData}`, expire);
  }

  async save(key = "token_info", ttl = DEFAULT_TTL) {
    const client = await getClient();
    await client.set(key, JSON.stringify(this), { EX: ttl });
  }

  isValid() {
    return !!(this.token && this.expire && Date.now() < this.expire);
  }

  static async get_ensureLoggedIn() {
    const tokenInfo = await TokenInfo.fromRedis();
    if (tokenInfo.isValid()) {
      console.log("✅ 检测到有效 Token，无需重新扫码。");
      return tokenInfo;
    }

    while (true) {
      console.log("⚠️ Token 不存在或已过期，生成新的二维码并等待扫码...");

      let uuid;
      try {
        uuid = await fetchUUID();
      } catch (err) {
        console.error(`获取 UUID 失败，稍后重试：${err?.message || err}`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      const qrRes = await fetch(
        `https://open.weixin.qq.com/connect/qrcode/${uuid}`
      );
      const qrBuffer = Buffer.from(await qrRes.arrayBuffer());

      // 打印到控制台并尝试发送邮件（邮件失败不会阻塞）
      try {
        await printAsciiQRCode(uuid);
      } catch (err) {
        console.warn("打印到控制台失败，仍会继续。", err?.message || err);
      }

      // 发送邮件但不抛出错误
      await sendEmailWithQRCode(uuid, qrBuffer);

      // 等待扫码（阻塞直到扫码成功或二维码过期）
      const wxCode = await pollWxCode(uuid);
      if (!wxCode) {
        // 二维码过期，短暂等待并重试获取新的二维码
        console.log("二维码过期，准备重新生成新的二维码...");
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      // 成功拿到 wx_code，尝试换取 token
      try {
        const tokenInfo = await TokenInfo.fetchTokenByWxCode(wxCode);
        tokenInfo.save();
        console.log("\n🎉 新 Token 已保存到 config.json");
        return tokenInfo;
      } catch (err) {
        console.error(
          "用 wx_code 换取 Token 失败，稍后重试：",
          err?.message || err
        );
        await new Promise((r) => setTimeout(r, 2000));
        // 不直接退出，继续循环重新生成二维码
      }
    }
  }
}

export default TokenInfo;
