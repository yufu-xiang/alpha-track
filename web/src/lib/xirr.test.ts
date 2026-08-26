import { describe, expect, it } from 'vitest'
import { xirr, type CashFlow } from './xirr'

describe('xirr', () => {
  it('一年整、賺 10% 的單筆投資', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 1100 },
    ])!
    expect(r).toBeCloseTo(0.1, 3)
  })

  it('半年賺 10% 年化約 21%', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2025-07-02', amount: 1100 },
    ])!
    expect(r).toBeGreaterThan(0.20)
    expect(r).toBeLessThan(0.22)
  })

  it('虧損得到負的年化報酬', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 900 },
    ])!
    expect(r).toBeCloseTo(-0.1, 3)
  })

  it('投入時點不同,同樣的總報酬會得到不同的年化 —— 這正是 XIRR 的用意', () => {
    // 規格 §6.1:同樣 20% 報酬,三年前投入與上月投入意義截然不同。
    const early = xirr([
      { date: '2023-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 1200 },
    ])!
    const late = xirr([
      { date: '2025-12-01', amount: -1000 },
      { date: '2026-01-01', amount: 1200 },
    ])!
    expect(late).toBeGreaterThan(early * 5)
  })

  it('多筆不規則現金流', () => {
    const r = xirr([
      { date: '2024-01-01', amount: -10000 },
      { date: '2024-07-01', amount: -5000 },
      { date: '2025-03-15', amount: 2000 },
      { date: '2026-01-01', amount: 15000 },
    ])!
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThan(1)
  })

  it('配息與期末市值都算流入', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2025-07-01', amount: 30 },
      { date: '2026-01-01', amount: 1080 },
    ])!
    expect(r).toBeGreaterThan(0.10)
  })

  it('只有流出時回傳 null,不是 0 —— 「算不出來」與「不賺不賠」是兩回事', () => {
    expect(xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2025-06-01', amount: -500 },
    ])).toBeNull()
  })

  it('只有一筆現金流回傳 null', () => {
    expect(xirr([{ date: '2025-01-01', amount: -1000 }])).toBeNull()
  })

  it('全部同一天回傳 null —— 無法年化', () => {
    expect(xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2025-01-01', amount: 1100 },
    ])).toBeNull()
  })

  it('日期無法解析時回傳 null,不回傳 NaN', () => {
    expect(xirr([
      { date: '不是日期', amount: -1000 },
      { date: '2026-01-01', amount: 1100 },
    ])).toBeNull()
  })

  it('極端虧損不會發散到 -100% 以下 —— 那個數字沒有意義', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -10000 },
      { date: '2026-01-01', amount: 1 },
    ])
    expect(r).not.toBeNull()
    expect(r!).toBeGreaterThan(-1)
  })

  it('大量現金流仍能收斂', () => {
    const flows: CashFlow[] = []
    for (let i = 0; i < 60; i += 1) {
      const d = new Date(Date.UTC(2021, i % 12, 1 + (i % 27)))
      flows.push({ date: d.toISOString().slice(0, 10), amount: -1000 })
    }
    flows.push({ date: '2026-08-01', amount: 90000 })
    const r = xirr(flows)
    expect(r).not.toBeNull()
    expect(Number.isFinite(r!)).toBe(true)
  })
})
