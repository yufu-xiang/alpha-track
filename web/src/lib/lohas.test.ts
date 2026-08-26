import { describe, expect, it } from 'vitest'
import { describePosition, fiveLines } from './lohas'

/** 完美指數成長:對數價格是一條直線,殘差應為 0。 */
function exponential(n: number, rate = 0.0005) {
  return Array.from({ length: n }, (_, i) => ({ day: i, price: 100 * Math.exp(rate * i) }))
}

describe('fiveLines', () => {
  it('完美指數成長時通道塌成一條線 —— 殘差為 0', () => {
    const r = fiveLines(exponential(100))!
    for (const line of r.lines) {
      expect(line.values[0]).toBeCloseTo(r.tl[0]!, 6)
    }
    expect(r.position).toBeCloseTo(0)
  })

  it('回歸建立在對數價格上,趨勢線因此是幾何而非算術', () => {
    // 價格從 100 翻倍到 200,中點的趨勢線應接近幾何中項 √(100×200)≈141.4,
    // 而不是算術平均 150。
    const pts = Array.from({ length: 101 }, (_, i) => ({
      day: i, price: 100 * 2 ** (i / 100),
    }))
    const r = fiveLines(pts)!
    expect(r.tl[50]).toBeCloseTo(Math.sqrt(100 * 200), 3)
  })

  it('五條線由高到低排列', () => {
    const pts = exponential(100).map((p, i) => ({
      ...p, price: p.price * (1 + (i % 7) * 0.01),
    }))
    const r = fiveLines(pts)!
    const at0 = r.lines.map((l) => l.values[0]!)
    expect(at0).toEqual([...at0].sort((a, b) => b - a))
  })

  it('位階以標準差回報 —— 最後一點高於趨勢線時為正', () => {
    const pts = exponential(50)
    pts[49]!.price *= 1.5
    expect(fiveLines(pts)!.position).toBeGreaterThan(0)
  })

  it('少於三點回傳 null —— 兩點必然完美配適,通道會塌成一條線', () => {
    expect(fiveLines([{ day: 0, price: 10 }, { day: 1, price: 20 }])).toBeNull()
  })

  it('所有點同一天時回傳 null,不回傳斜率 Infinity', () => {
    expect(fiveLines([
      { day: 5, price: 10 }, { day: 5, price: 20 }, { day: 5, price: 30 },
    ])).toBeNull()
  })

  it('價格為 0 或負的點被剔除,不讓 log 產生 -Infinity', () => {
    const r = fiveLines([
      { day: 0, price: 100 }, { day: 1, price: 0 },
      { day: 2, price: 102 }, { day: 3, price: 103 },
    ])!
    expect(r.count).toBe(3)
    expect(Number.isFinite(r.position)).toBe(true)
  })

  it('回報涵蓋年數,讓 UI 能說明這條通道是以多長的期間配出來的', () => {
    const r = fiveLines(exponential(100).map((p) => ({ ...p, day: p.day * 10 })))!
    expect(r.years).toBeCloseTo(990 / 365.25, 2)
  })
})

describe('describePosition', () => {
  it('不含「該買」「該賣」這類規範性字眼 —— 規格 §7.3', () => {
    for (const p of [-3, -1.5, 0, 1.5, 3]) {
      expect(describePosition(p)).not.toMatch(/買|賣|建議|應該/)
    }
  })

  it('高低位階分別描述', () => {
    expect(describePosition(2.5)).toMatch(/相對高位/)
    expect(describePosition(-2.5)).toMatch(/相對低位/)
    expect(describePosition(0)).toMatch(/趨勢線附近/)
  })
})
