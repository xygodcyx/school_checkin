const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const appRoot = __dirname
const logDir = path.join(appRoot, 'logs')
fs.mkdirSync(logDir, { recursive: true })

function resolveBun() {
  const candidates = [
    process.env.BUN_PATH,
    path.join(os.homedir(), '.bun', 'bin', 'bun'),
    '/usr/local/bin/bun',
    '/usr/bin/bun',
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate)
      if (stat.isDirectory()) {
        const binary = path.join(candidate, 'bun')
        fs.accessSync(binary, fs.constants.X_OK)
        return binary
      }
      fs.accessSync(candidate, fs.constants.X_OK)
      return candidate
    } catch {
      // 尝试下一个候选路径
    }
  }

  try {
    const command = process.platform === 'win32' ? 'where' : 'which'
    const output = execFileSync(command, ['bun'], { encoding: 'utf8' }).trim()
    const first = output.split(/\r?\n/).find(Boolean)
    if (first) return first
  } catch {
    // 交给 PM2 在 PATH 中解析
  }

  return 'bun'
}

const bun = resolveBun()
const bunBinDir = path.isAbsolute(bun) ? path.dirname(bun) : ''
const runtimePath = [bunBinDir, process.env.PATH].filter(Boolean).join(path.delimiter)
const bash = fs.existsSync('/bin/bash') ? '/bin/bash' : 'bash'

module.exports = {
  apps: [
    {
      name: 'school-checkin',
      cwd: appRoot,
      // 通过 bash 包装脚本 exec 到 Bun，避免旧版 PM2 的 ProcessContainerForkBun.js 兼容问题。
      script: path.join(appRoot, 'scripts', 'pm2-run.sh'),
      interpreter: bash,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 5000,
      min_uptime: '10s',
      max_restarts: 20,
      kill_timeout: 10000,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      out_file: path.join(logDir, 'out.log'),
      error_file: path.join(logDir, 'error.log'),
      env: {
        NODE_ENV: 'production',
        BUN_BIN: bun,
        PATH: runtimePath,
      },
    },
  ],
}
