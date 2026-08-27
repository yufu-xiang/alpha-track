import { describe, expect, it } from 'vitest'
import { describeOverlap, overlap } from './overlap'
import type { Holdings } from '../types'

const h = (items: [string, number][], ym = '202607'): Holdings => ({
  year_month: ym,
  items: items.map(([code, weight]) => ({ code, name: `名稱${code}`, weight })),
})

describe('overlap', () => {
  it('完全相同的持股,重疊度等於各自的權重合計', () => {
    const a = h([['2330', 0.6], ['2454', 0.05]])
    const r = overlap(a, a)
    expect(r.weight).toBeCloseTo(0.65)
    expect(r.coverageA).toBeCloseTo(0.65)
    expect(r.sharedCount).toBe(2)
  })

  it('完全不同的持股,重疊度為 0 而非 null', () => {
    const r = overlap(h([['2330', 0.6]]), h([['2412', 0.5]]))
    expect(r.weight).toBe(0)
    expect(r.sharedCount).toBe(0)
  })

  it('取小值:共同持有但權重懸殊時,重疊只算小的那一邊', () => {
    // 只數「共同持有幾檔」的話會說「重疊一檔」,
    // 但實際的資金重疊只有 2% —— 那是完全不同的結論。
    const r = overlap(h([['2330', 0.60]]), h([['2330', 0.02]]))
    expect(r.weight).toBeCloseTo(0.02)
    expect(r.sharedCount).toBe(1)
  })

  it('回報雙方的涵蓋率 —— 前十大不是全部持股', () => {
    const r = overlap(h([['2330', 0.6], ['2454', 0.2]]), h([['2330', 0.3]]))
    expect(r.coverageA).toBeCloseTo(0.8)
    expect(r.coverageB).toBeCloseTo(0.3)
  })

  it('共同持股依貢獻由大到小排序', () => {
    const a = h([['A', 0.1], ['B', 0.5], ['C', 0.3]])
    const b = h([['A', 0.4], ['B', 0.2], ['C', 0.35]])
    expect(overlap(a, b).shared.map((s) => s.code)).toEqual(['C', 'B', 'A'])
  })

  it('任一邊沒有資料時回 null,不是 0', () => {
    // 0 代表「查過了,沒有共同持股」;null 代表「不知道」。
    const empty: Holdings = { year_month: null, items: [] }
    expect(overlap(h([['2330', 0.6]]), empty).weight).toBeNull()
    expect(overlap(empty, empty).weight).toBeNull()
  })

  it('權重不明的持股整筆略過,不當成 0', () => {
    // 當成 0 會讓它靜靜地不參與計算,而結果看起來像「沒有共同持有它」。
    const a: Holdings = {
      year_month: '202607',
      items: [{ code: '2330', name: '台積電', weight: null },
              { code: '2454', name: '聯發科', weight: 0.05 }],
    }
    const r = overlap(a, h([['2330', 0.6], ['2454', 0.05]]))
    expect(r.sharedCount).toBe(1)
    expect(r.coverageA).toBeCloseTo(0.05)
  })

  it('對稱', () => {
    const a = h([['A', 0.3], ['B', 0.2]])
    const b = h([['A', 0.1], ['C', 0.4]])
    expect(overlap(a, b).weight).toBeCloseTo(overlap(b, a).weight!)
  })
})

describe('describeOverlap', () => {
  it('以**相對於涵蓋率**判讀,不是絕對值', () => {
    // 兩檔前十大各佔 40%,重疊 36%(九成)—— 那是「幾乎同一批」。
    // 用絕對值 0.36 判讀的話會落到「部分重疊」,結論完全不同。
    expect(describeOverlap(0.36, 0.4)).toMatch(/幾乎是同一批/)
    expect(describeOverlap(0.36, 1)).toMatch(/部分重疊/)
  })

  it('不含規範性字眼', () => {
    for (const w of [0, 0.1, 0.3, 0.5, 0.8]) {
      expect(describeOverlap(w, 1)).not.toMatch(/該買|不該買|建議|應該/)
    }
  })

  it('沒有共同持股時直說', () => {
    expect(describeOverlap(0, 0.8)).toMatch(/沒有共同持股/)
  })
})
