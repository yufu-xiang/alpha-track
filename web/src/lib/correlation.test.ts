import { describe, expect, it } from 'vitest'
import {
  correlationMatrix, describeCorrelation, MIN_SAMPLE, pearson,
} from './correlation'
import type { Series } from '../types'

/** 由日報酬序列造出一條價格序列。 */
function seriesFrom(returns: number[], start = '2026-01-01'): Series {
  const adj = [100]
  for (const r of returns) adj.push(adj[adj.length - 1]! * (1 + r))
  return {
    start,
    days: adj.map((_, i) => i),
    adj,
    close: adj,
  }
}

const n = MIN_SAMPLE + 10
const wiggle = Array.from({ length: n }, (_, i) => (i % 7 - 3) / 100)

describe('pearson', () => {
  it('完全同向為 1', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1)
  })

  it('完全反向為 -1', () => {
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1)
  })

  it('任一邊沒有波動時回傳 null,不是 0 —— 0 代表「不相關」,是個結論', () => {
    expect(pearson([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull()
  })

  it('長度不同回傳 null', () => {
    expect(pearson([1, 2], [1, 2, 3])).toBeNull()
  })
})

describe('correlationMatrix', () => {
  it('對角線恆為 1', () => {
    const m = correlationMatrix(new Map([
      ['A', seriesFrom(wiggle)], ['B', seriesFrom(wiggle.map((r) => -r))],
    ]), null)
    expect(m.get('A')!.get('A')!.value).toBe(1)
    expect(m.get('B')!.get('B')!.value).toBe(1)
  })

  it('矩陣對稱', () => {
    const m = correlationMatrix(new Map([
      ['A', seriesFrom(wiggle)],
      ['B', seriesFrom(wiggle.map((r, i) => r * 0.5 + (i % 3 - 1) / 200))],
    ]), null)
    expect(m.get('A')!.get('B')!.value).toBeCloseTo(m.get('B')!.get('A')!.value!)
  })

  it('同向序列相關性接近 1', () => {
    const m = correlationMatrix(new Map([
      ['A', seriesFrom(wiggle)], ['B', seriesFrom(wiggle.map((r) => r * 2))],
    ]), null)
    expect(m.get('A')!.get('B')!.value).toBeCloseTo(1)
  })

  it('反向序列相關性接近 -1', () => {
    const m = correlationMatrix(new Map([
      ['A', seriesFrom(wiggle)], ['B', seriesFrom(wiggle.map((r) => -r))],
    ]), null)
    expect(m.get('A')!.get('B')!.value).toBeLessThan(-0.99)
  })

  it('重疊樣本不足時回傳 null 並回報實際樣本數', () => {
    const short = Array.from({ length: 10 }, (_, i) => (i % 5 - 2) / 100)
    const m = correlationMatrix(new Map([
      ['A', seriesFrom(short)], ['B', seriesFrom(short.map((r) => -r))],
    ]), null)
    const cell = m.get('A')!.get('B')!
    expect(cell.value).toBeNull()
    expect(cell.sample).toBeLessThan(MIN_SAMPLE)
  })

  it('只採共同交易日 —— 不補值', () => {
    // B 的起點晚 30 天,重疊只有 n-30 天
    const a = seriesFrom(wiggle, '2026-01-01')
    const b = seriesFrom(wiggle, '2026-01-31')
    const m = correlationMatrix(new Map([['A', a], ['B', b]]), null)
    const cell = m.get('A')!.get('B')!
    expect(cell.sample).toBeLessThan(a.days.length)
    expect(cell.sample).toBeGreaterThan(0)
  })

  it('起點錯開時仍對齊到同一天比較,不會把不同日的報酬配在一起', () => {
    // 兩檔同樣的報酬序列、起點差 10 天 —— 對齊到真實日期之後,
    // 重疊區間的日報酬完全相同,相關性必須是 1。
    // 若誤用各自的相對位移,配到的會是錯開 10 天的報酬,結果遠低於 1。
    const shared = Array.from({ length: 200 }, (_, i) => Math.sin(i / 3) / 100)
    const a = seriesFrom(shared, '2026-01-01')
    const b: Series = {
      start: '2026-01-11',
      days: a.days.slice(10).map((d) => d - 10),
      adj: a.adj.slice(10),
      close: a.close.slice(10),
    }
    expect(correlationMatrix(new Map([['A', a], ['B', b]]), null)
      .get('A')!.get('B')!.value).toBeCloseTo(1, 6)
  })

  it('視窗只截尾端 —— 近一年只看最後 365 天', () => {
    const long = Array.from({ length: 500 }, (_, i) => (i % 11 - 5) / 100)
    const m = correlationMatrix(new Map([
      ['A', seriesFrom(long)], ['B', seriesFrom(long.map((r) => r * 1.5))],
    ]), 100)
    expect(m.get('A')!.get('B')!.sample).toBeLessThanOrEqual(101)
  })
})

describe('describeCorrelation', () => {
  it('不含規範性字眼', () => {
    for (const r of [-1, -0.5, 0, 0.5, 0.95]) {
      expect(describeCorrelation(r)).not.toMatch(/該買|不該買|建議|應該/)
    }
  })

  it('高相關直說很難分散', () => {
    expect(describeCorrelation(0.95)).toMatch(/分散/)
  })
})
