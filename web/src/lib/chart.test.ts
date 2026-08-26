import { describe, expect, it } from 'vitest'
import { alignBenchmark, normalize, sliceSeries, toPath } from './chart'

const series = { start: '2026-01-01', days: [0, 1, 2, 3], adj: [100, 110, 90, 120] }

describe('sliceSeries', () => {
  it('null 代表全部', () => {
    expect(sliceSeries(series, null).days).toEqual([0, 1, 2, 3])
  })

  it('只取最後 N 個日曆天', () => {
    expect(sliceSeries(series, 2).days).toEqual([1, 2, 3])
  })

  it('空序列不炸', () => {
    expect(sliceSeries({ start: null, days: [], adj: [] }, 30).days).toEqual([])
  })
})

describe('normalize', () => {
  it('起點為 100,其餘依比例', () => {
    const r = normalize([0, 1, 2, 3], [100, 110, 90, 120], '2026-01-01')
    for (const [i, want] of [100, 110, 90, 120].entries()) {
      expect(r.points[i]!.value).toBeCloseTo(want, 10)
    }
  })

  it('不同量級的兩條線標準化後可直接比較', () => {
    // 加權報酬指數在十萬點量級,ETF 價格在百元量級 ——
    // 不標準化的話其中一條會是一直線。雙 Y 軸不是解法:
    // 兩個刻度可任意縮放,看到的「交叉」由刻度決定而非資料。
    const etf = normalize([0, 1], [100, 110], '2026-01-01')
    const idx = normalize([0, 1], [103316, 113647], '2026-01-01')
    expect(etf.points[1]!.value).toBeCloseTo(110)
    expect(idx.points[1]!.value).toBeCloseTo(110)
  })

  it('推出實際起訖日供軸標籤使用', () => {
    const r = normalize([0, 3], [100, 120], '2026-01-01')
    expect(r.startDate).toBe('2026-01-01')
    expect(r.endDate).toBe('2026-01-04')
  })

  it('起點值為零時回傳空序列,不產生 Infinity', () => {
    expect(normalize([0, 1], [0, 10], '2026-01-01').points).toEqual([])
  })
})

describe('alignBenchmark', () => {
  it('把基準的天數位移換算到標的的日期原點', () => {
    // 基準自 2026-01-03 起,標的自 2026-01-01 起 —— 相差兩天。
    // 不換算的話整條線會錯位兩天。
    const b = { start: '2026-01-03', days: [0, 1], value: [1000, 1010] }
    const r = alignBenchmark(b, '2026-01-01', 0, 10)
    expect(r.days).toEqual([2, 3])
  })

  it('只取落在標的區間內的點', () => {
    const b = { start: '2026-01-01', days: [0, 5, 10], value: [1, 2, 3] }
    expect(alignBenchmark(b, '2026-01-01', 2, 8).days).toEqual([5])
  })

  it('空基準回傳空序列', () => {
    expect(alignBenchmark({ start: null, days: [], value: [] }, '2026-01-01', 0, 9).days)
      .toEqual([])
  })
})

describe('toPath', () => {
  const box = { width: 100, height: 100, padX: 0, padY: 0 }
  const domain = { minDay: 0, maxDay: 10, minValue: 0, maxValue: 100 }

  it('第一點是 M,其餘是 L', () => {
    const d = toPath([{ day: 0, value: 0 }, { day: 10, value: 100 }], box, domain)
    expect(d.startsWith('M')).toBe(true)
    expect(d).toContain('L')
  })

  it('y 軸向上為大 —— SVG 的 y 是往下增加,不翻轉會上下顛倒', () => {
    const d = toPath([{ day: 0, value: 100 }], box, domain)
    expect(d).toBe('M0.0,0.0')      // 最大值在頂端
    expect(toPath([{ day: 0, value: 0 }], box, domain)).toBe('M0.0,100.0')
  })

  it('空序列回傳空字串,呼叫端不必特別處理', () => {
    expect(toPath([], box, domain)).toBe('')
  })

  it('值域為零寬時不除以零', () => {
    const flat = { minDay: 0, maxDay: 0, minValue: 5, maxValue: 5 }
    expect(toPath([{ day: 0, value: 5 }], box, flat)).not.toContain('NaN')
  })
})
