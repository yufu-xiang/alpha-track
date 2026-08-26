import { describe, expect, it } from 'vitest'
import { MAINTENANCE_THRESHOLD, marginPosition } from './margin'

describe('marginPosition', () => {
  it('查證過的實例:100 元買 1000 股、融資六成,跌到 78 元時維持率剛好 130%', () => {
    const r = marginPosition({
      shares: 1000, buyPrice: 100, marginRatio: 0.6, currentPrice: 78,
    })
    expect(r.loan).toBe(60_000)
    expect(r.ownFunds).toBe(40_000)
    expect(r.ratio).toBeCloseTo(MAINTENANCE_THRESHOLD)
    expect(r.marginCallPrice).toBeCloseTo(78)
  })

  it('買進當下的維持率就是 1 ÷ 融資成數', () => {
    const r = marginPosition({
      shares: 1000, buyPrice: 100, marginRatio: 0.6, currentPrice: 100,
    })
    expect(r.ratio).toBeCloseTo(1 / 0.6)
  })

  it('追繳價位不隨買進價變動 —— 它只取決於融資金額與股數', () => {
    const a = marginPosition({
      shares: 1000, buyPrice: 100, marginRatio: 0.6, currentPrice: 90,
    })
    const b = marginPosition({
      shares: 1000, buyPrice: 100, marginRatio: 0.6, currentPrice: 50,
    })
    expect(a.marginCallPrice).toBeCloseTo(b.marginCallPrice!)
  })

  it('回報距離追繳的跌幅', () => {
    const r = marginPosition({
      shares: 1000, buyPrice: 100, marginRatio: 0.6, currentPrice: 100,
    })
    expect(r.bufferToCall).toBeCloseTo(78 / 100 - 1)
  })

  it('已跌破門檻時 bufferToCall 為正 —— 代表要漲回去才脫離', () => {
    const r = marginPosition({
      shares: 1000, buyPrice: 100, marginRatio: 0.6, currentPrice: 70,
    })
    expect(r.ratio!).toBeLessThan(MAINTENANCE_THRESHOLD)
    expect(r.bufferToCall!).toBeGreaterThan(0)
  })

  it('沒有融資時維持率為 null,不是 0 —— 0 會被讀成馬上斷頭', () => {
    const r = marginPosition({
      shares: 1000, buyPrice: 100, marginRatio: 0, currentPrice: 50,
    })
    expect(r.ratio).toBeNull()
    expect(r.marginCallPrice).toBeNull()
    expect(r.ownFunds).toBe(100_000)
  })
})

describe('門檻常數', () => {
  it('MAINTENANCE_THRESHOLD 是 1.3(維持率 130%),不是 0.3', () => {
    // 這條測試存在的原因是一次真實的失誤:畫面上印出「追繳門檻 30%」——
    // 把 1.3 當成「130%」去減 1 的結果。130% 與 30% 在這裡是天差地別。
    expect(MAINTENANCE_THRESHOLD).toBe(1.3)
  })
})
