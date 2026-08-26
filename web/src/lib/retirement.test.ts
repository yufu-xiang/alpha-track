import { describe, expect, it } from 'vitest'
import {
  annualReturnsFrom, bootstrapSampler, monteCarlo, normalSampler,
  simulateWithdrawal, yearsUntilDepleted,
} from './retirement'

const base = {
  initial: 10_000_000, annualWithdrawal: 400_000,
  annualReturn: 0.05, inflation: 0.02, years: 30,
}

describe('simulateWithdrawal', () => {
  it('提領在年初、報酬在年末 —— 反過來會系統性高估可支撐年數', () => {
    const p = simulateWithdrawal({ ...base, annualReturn: 0.1, inflation: 0, years: 1 })
    // (1000萬 − 40萬) × 1.1
    expect(p[0]!.balance).toBeCloseTo((10_000_000 - 400_000) * 1.1)
  })

  it('提領金額逐年隨通膨調整', () => {
    const p = simulateWithdrawal({ ...base, inflation: 0.03, years: 3 })
    expect(p[2]!.withdrawal).toBeCloseTo(400_000 * 1.03 ** 2)
  })

  it('4% 提領搭配 5% 報酬、2% 通膨可撐過 30 年', () => {
    expect(yearsUntilDepleted(base)).toBeNull()
  })

  it('提領太多會耗盡,並回報是第幾年', () => {
    const y = yearsUntilDepleted({ ...base, annualWithdrawal: 1_500_000 })
    expect(y).not.toBeNull()
    expect(y!).toBeLessThan(10)
  })

  it('耗盡後不再繼續模擬,餘額停在 0 不變負數', () => {
    const p = simulateWithdrawal({ ...base, annualWithdrawal: 20_000_000, years: 30 })
    expect(p).toHaveLength(1)
    expect(p[0]!.balance).toBe(0)
  })
})

describe('monteCarlo', () => {
  const mc = (over = {}) => monteCarlo({
    initial: 10_000_000, annualWithdrawal: 400_000, inflation: 0.02,
    years: 30, runs: 200, drawReturn: () => 0.05, ...over,
  })

  it('固定報酬時成功率為 1', () => {
    expect(mc().successRate).toBe(1)
  })

  it('提領過高時成功率為 0', () => {
    expect(mc({ annualWithdrawal: 5_000_000 }).successRate).toBe(0)
  })

  it('回傳每一年的百分位區間 —— 規格 §7.3 明令不給單一數字', () => {
    const r = mc({ drawReturn: normalSampler(0.07, 0.2, mulberry(1)) })
    expect(r.percentiles).toHaveLength(30)
    const last = r.percentiles[29]!
    expect(last.p10).toBeLessThanOrEqual(last.p50)
    expect(last.p50).toBeLessThanOrEqual(last.p90)
  })

  it('回報執行次數,讓使用者知道樣本量', () => {
    expect(mc({ runs: 500 }).runs).toBe(500)
  })

  it('波動越大成功率越低 —— 同樣的平均報酬', () => {
    const calm = mc({ drawReturn: normalSampler(0.05, 0.05, mulberry(7)), runs: 400 })
    const wild = mc({ drawReturn: normalSampler(0.05, 0.35, mulberry(7)), runs: 400 })
    expect(wild.successRate).toBeLessThan(calm.successRate)
  })

  it('耗盡的路徑餘額停在 0,不會拉低百分位到負值', () => {
    const r = mc({ annualWithdrawal: 3_000_000 })
    expect(r.percentiles.every((p) => p.p10 >= 0)).toBe(true)
  })
})

describe('bootstrapSampler', () => {
  it('只會抽出歷史裡出現過的報酬', () => {
    const hist = [0.1, -0.2, 0.35]
    const draw = bootstrapSampler(hist, mulberry(3))
    for (let i = 0; i < 50; i += 1) expect(hist).toContain(draw())
  })

  it('沒有歷史資料時拋錯,而不是悄悄回傳 0', () => {
    // 回傳 0 會產生一條「完全不波動」的模擬,看起來正常實則毫無意義。
    expect(() => bootstrapSampler([])).toThrow()
  })
})

describe('normalSampler', () => {
  it('大量抽樣的平均與標準差接近設定值', () => {
    const draw = normalSampler(0.08, 0.2, mulberry(11))
    const xs = Array.from({ length: 20000 }, draw)
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length)
    expect(mean).toBeCloseTo(0.08, 2)
    expect(sd).toBeCloseTo(0.2, 1)
  })
})

describe('annualReturnsFrom', () => {
  it('報酬跨年計算(前一年年末 → 今年年末),不漏掉跨年那一段', () => {
    const r = annualReturnsFrom([
      { date: '2024-01-02', value: 100 }, { date: '2024-12-30', value: 120 },
      { date: '2025-01-02', value: 121 }, { date: '2025-12-30', value: 100 },
    ])
    // 三年的資料只給得出兩個「年末→年末」報酬中的一個:2024 沒有基期。
    expect(r.years).toBe(1)
    expect(r.returns[0]).toBeCloseTo(100 / 120 - 1)
  })

  it('連乘各年報酬要等於整段總報酬 —— 年初→年末的算法做不到這件事', () => {
    const r = annualReturnsFrom([
      { date: '2023-12-29', value: 100 },
      { date: '2024-01-02', value: 105 }, { date: '2024-12-30', value: 120 },
      { date: '2025-01-02', value: 121 }, { date: '2025-12-30', value: 150 },
    ])
    const chained = r.returns.reduce((acc, x) => acc * (1 + x), 1)
    expect(chained).toBeCloseTo(150 / 100)
  })

  it('半截的最後一年不算數 —— 8 個月的報酬不是年度報酬', () => {
    const pts = []
    for (let y = 2003; y <= 2025; y += 1) {
      pts.push({ date: `${y}-01-02`, value: 100 }, { date: `${y}-12-30`, value: 110 })
    }
    pts.push({ date: '2026-01-02', value: 110 }, { date: '2026-08-24', value: 130 })
    const r = annualReturnsFrom(pts)
    // 2003 只當基期,2026 未收完 → 2004..2025 共 22 個年度報酬
    expect(r.years).toBe(22)
    expect(Math.max(...r.returns)).toBeLessThan(0.2)
  })

  it('年度之間有斷層時跳過該組,不把兩年報酬當成一年', () => {
    const r = annualReturnsFrom([
      { date: '2020-12-30', value: 100 },
      { date: '2023-12-30', value: 200 },
      { date: '2024-12-30', value: 220 },
    ])
    expect(r.years).toBe(1)
    expect(r.returns[0]).toBeCloseTo(0.1)
  })

  it('空序列回傳零年,不拋錯', () => {
    expect(annualReturnsFrom([])).toEqual({ returns: [], years: 0 })
  })
})

/** 可重現的偽隨機源,讓涉及隨機的測試不會偶發性失敗。 */
function mulberry(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
