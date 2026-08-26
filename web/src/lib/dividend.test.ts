import { describe, expect, it } from 'vitest'
import { compareReinvestment } from './dividend'

const flat = [
  { date: '2024-01-01', close: 100 },
  { date: '2024-07-01', close: 100 },
  { date: '2025-01-01', close: 100 },
]

describe('compareReinvestment', () => {
  it('沒有配息時兩條路徑完全一樣', () => {
    const r = compareReinvestment(flat, [], 100_000)!
    expect(r.reinvested).toBeCloseTo(r.cashOut)
    expect(r.totalDividends).toBe(0)
    expect(r.events).toBe(0)
  })

  it('價格持平時再投入仍然勝出 —— 多出來的是股數', () => {
    const r = compareReinvestment(flat, [{ ex_date: '2024-07-01', amount: 5 }], 100_000)!
    // 1000 股 × 5 元 = 5000 元,以 100 元再買 50 股
    expect(r.initialShares).toBeCloseTo(1000)
    expect(r.finalShares).toBeCloseTo(1050)
    expect(r.reinvested).toBeCloseTo(105_000)
    // 不再投入:1000 股仍值 10 萬,外加 5000 元現金
    expect(r.cashOut).toBeCloseTo(105_000)
    expect(r.totalDividends).toBeCloseTo(5000)
  })

  it('股價上漲時再投入才真的勝出', () => {
    const rising = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-07-01', close: 100 },
      { date: '2025-01-01', close: 200 },
    ]
    const r = compareReinvestment(rising, [{ ex_date: '2024-07-01', amount: 5 }], 100_000)!
    expect(r.reinvested).toBeCloseTo(210_000)
    expect(r.cashOut).toBeCloseTo(205_000)
    expect(r.reinvested).toBeGreaterThan(r.cashOut)
  })

  it('配息複利:兩次配息的第二次是以已增加的股數計算', () => {
    const r = compareReinvestment(flat, [
      { ex_date: '2024-07-01', amount: 5 },
      { ex_date: '2025-01-01', amount: 5 },
    ], 100_000)!
    // 第一次後 1050 股;第二次配 1050×5 = 5250,再買 52.5 股
    expect(r.finalShares).toBeCloseTo(1102.5)
    expect(r.events).toBe(2)
  })

  it('配息順序顛倒不影響結果 —— 內部會先排序', () => {
    const asc = compareReinvestment(flat, [
      { ex_date: '2024-07-01', amount: 5 },
      { ex_date: '2025-01-01', amount: 5 },
    ], 100_000)!
    const desc = compareReinvestment(flat, [
      { ex_date: '2025-01-01', amount: 5 },
      { ex_date: '2024-07-01', amount: 5 },
    ], 100_000)!
    expect(desc.finalShares).toBeCloseTo(asc.finalShares)
  })

  it('除息日不在序列裡時取之後的第一筆價格(月頻資料就是這樣)', () => {
    const monthly = [
      { date: '2024-01-31', close: 100 },
      { date: '2024-07-31', close: 100 },
    ]
    const r = compareReinvestment(monthly, [{ ex_date: '2024-07-15', amount: 5 }], 100_000)!
    expect(r.events).toBe(1)
    expect(r.finalShares).toBeCloseTo(1050)
  })

  it('持有期間之外的配息計入 skipped,不靜默丟掉', () => {
    const r = compareReinvestment(flat, [
      { ex_date: '2020-01-01', amount: 5 },  // 買進之前
      { ex_date: '2030-01-01', amount: 5 },  // 序列結束之後
    ], 100_000)!
    expect(r.events).toBe(0)
    expect(r.skipped).toBe(2)
  })

  it('沒有價格資料時回傳 null,不回傳一組 0', () => {
    expect(compareReinvestment([], [{ ex_date: '2024-01-01', amount: 5 }], 100_000))
      .toBeNull()
  })
})
