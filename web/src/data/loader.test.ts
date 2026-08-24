import { afterEach, describe, expect, it, vi } from 'vitest'
import { daysSince, loadData } from './loader'
import { fixtureMeta, fixtureRankings } from './fixture'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('loadData', () => {
  it('兩份 JSON 都成功時回傳 ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes('meta') ? fixtureMeta : fixtureRankings,
    })))
    const r = await loadData()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.rankings.etfs).toHaveLength(7)
  })

  it('HTTP 錯誤時回傳明確錯誤,不拋例外', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    const r = await loadData()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('404')
  })

  it('網路失敗時回傳明確錯誤', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    const r = await loadData()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('載入失敗')
  })

  it('JSON 格式錯誤時回傳明確錯誤,而非空白畫面', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token') },
    })))
    const r = await loadData()
    expect(r.ok).toBe(false)
  })

  it('只有 meta.json 存在時整體視為失敗,不半殘地渲染', async () => {
    // rankings 缺了卻仍回 ok,畫面會是一張空表 —— 而空表會被讀成
    // 「今天沒有任何 ETF」,正是規格 §8.2 要避免的誤導。
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('meta')
        ? { ok: true, json: async () => fixtureMeta }
        : { ok: false, status: 404 }))
    const r = await loadData()
    expect(r.ok).toBe(false)
  })
})

describe('daysSince', () => {
  it('計算相隔天數', () => {
    expect(daysSince('2026-08-18', new Date('2026-08-21T12:00:00+08:00'))).toBe(3)
  })

  it('當天為 0', () => {
    expect(daysSince('2026-08-21', new Date('2026-08-21T20:00:00+08:00'))).toBe(0)
  })
})
