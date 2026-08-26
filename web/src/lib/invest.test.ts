import { describe, expect, it } from 'vitest'
import { lumpVsDca, yearsToFire } from './invest'

describe('lumpVsDca', () => {
  it('價格一路上漲時單筆勝出 —— 越早進場買得越便宜', () => {
    const r = lumpVsDca([100, 110, 120, 130], 120_000)!
    expect(r.lumpSum).toBeGreaterThan(r.dca)
  })

  it('價格先跌後回時定期定額勝出 —— 低點買到較多股數', () => {
    const r = lumpVsDca([100, 60, 60, 100], 120_000)!
    expect(r.dca).toBeGreaterThan(r.lumpSum)
  })

  it('價格不變時兩者相同', () => {
    const r = lumpVsDca([100, 100, 100], 90_000)!
    expect(r.dca).toBeCloseTo(r.lumpSum)
  })

  it('定期定額的平均成本低於單純平均價 —— 這就是平均成本法的效果', () => {
    // 每期投入固定金額,價低買多、價高買少,故平均成本(調和平均)
    // 一定低於等權算術平均。
    const prices = [100, 50]
    const r = lumpVsDca(prices, 100_000)!
    const arithmetic = (100 + 50) / 2
    expect(r.dcaAvgCost).toBeLessThan(arithmetic)
  })

  it('兩種方式的總投入相同,才有可比性', () => {
    const r = lumpVsDca([100, 120], 50_000)!
    expect(r.invested).toBe(50_000)
  })

  it('資料不足或金額為零時回傳 null,不回傳 0', () => {
    expect(lumpVsDca([100], 1000)).toBeNull()
    expect(lumpVsDca([100, 110], 0)).toBeNull()
  })

  it('忽略非正價格,不產生 Infinity', () => {
    const r = lumpVsDca([100, 0, -5, 120], 20_000)!
    expect(Number.isFinite(r.dca)).toBe(true)
  })
})

describe('yearsToFire', () => {
  const base = {
    annualSpending: 600_000, currentAssets: 0,
    annualSavings: 500_000, annualReturn: 0.06, withdrawalRate: 0.04,
  }

  it('目標資產 = 年支出 ÷ 提領率', () => {
    expect(yearsToFire(base).target).toBe(600_000 / 0.04)
  })

  it('已達標回傳 0 年', () => {
    expect(yearsToFire({ ...base, currentAssets: 20_000_000 }).years).toBe(0)
  })

  it('存得越多越快達成', () => {
    const slow = yearsToFire(base).years!
    const fast = yearsToFire({ ...base, annualSavings: 1_500_000 }).years!
    expect(fast).toBeLessThan(slow)
  })

  it('存不夠且報酬不足時回傳 null,而不是一個很大的年數', () => {
    // 回傳 999 會讓人以為「只要活夠久就會到」。
    const r = yearsToFire({ ...base, annualSavings: 1000, annualReturn: 0 })
    expect(r.years).toBeNull()
  })

  it('提領率為零或負時不算出無限大的目標而崩潰', () => {
    const r = yearsToFire({ ...base, withdrawalRate: 0 })
    expect(r.years).toBeNull()
  })
})
