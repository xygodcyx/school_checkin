#!/usr/bin/env node
import TokenInfo from './lib/token-info.js'
import { getCheckInInfo, submitCheckIn } from './lib/checkin-utils.js'
import { sendCheckinResult } from './lib/email-utils.js'

try {
  const token_info = await TokenInfo.get_ensureLoggedIn()

  console.log('\n📋 开始签到...')
  const info = await getCheckInInfo(token_info.token)
  console.log('签到信息:', info)

  const result = await submitCheckIn(token_info.token)
  console.log('✅ 签到完成:', result)

  // 发送签到结果邮件（可选，失败不阻塞）
  await sendCheckinResult(result)
} catch (err) {
  console.error('❌ 运行出错:', err.message || err)
  process.exit(1)
}

process.exit(0)