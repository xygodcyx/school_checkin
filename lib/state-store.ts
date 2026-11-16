import fs from 'fs/promises'
import path from 'path'

export interface PersistedState {
  version: 1
  lastCheckinDate: string | null
  lastCheckinAt: number | null
  lastCheckinSuccess: boolean | null
  lastCheckinMessage: string | null
  lastScheduledCheckinDate: string | null
  pendingCheckin: boolean
  invalidNoticeSentForExpire: number | null
  lastInvalidNoticeAt: number | null
  lastLoginAt: number | null
  lastLoginSuccessExpire: number | null
}

export const DEFAULT_STATE: PersistedState = {
  version: 1,
  lastCheckinDate: null,
  lastCheckinAt: null,
  lastCheckinSuccess: null,
  lastCheckinMessage: null,
  lastScheduledCheckinDate: null,
  pendingCheckin: false,
  invalidNoticeSentForExpire: null,
  lastInvalidNoticeAt: null,
  lastLoginAt: null,
  lastLoginSuccessExpire: null,
}

export class StateStore {
  private state: PersistedState
  private writeChain: Promise<void> = Promise.resolve()

  private constructor(
    private readonly filePath: string,
    state: PersistedState,
  ) {
    this.state = state
  }

  static async load(filePath: string): Promise<StateStore> {
    let state: PersistedState = { ...DEFAULT_STATE }

    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<PersistedState>
      state = { ...DEFAULT_STATE, ...parsed, version: 1 }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.warn(`⚠️ 读取状态文件失败，将使用默认状态：${err?.message || err}`)
      }
    }

    return new StateStore(filePath, state)
  }

  get(): Readonly<PersistedState> {
    return this.state
  }

  async update(patch: Partial<PersistedState>): Promise<void> {
    this.state = { ...this.state, ...patch, version: 1 }
    await this.persist()
  }

  private async persist(): Promise<void> {
    const snapshot = JSON.stringify(this.state, null, 2)
    const dir = path.dirname(this.filePath)

    this.writeChain = this.writeChain
      .then(async () => {
        await fs.mkdir(dir, { recursive: true })
        const tmpPath = `${this.filePath}.${process.pid}.tmp`
        await fs.writeFile(tmpPath, `${snapshot}\n`, 'utf-8')
        await fs.rename(tmpPath, this.filePath)
      })
      .catch((err: any) => {
        console.error(`⚠️ 写入状态文件失败：${err?.message || err}`)
      })

    await this.writeChain
  }
}
