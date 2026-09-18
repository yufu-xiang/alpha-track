import { describe, expect, it } from 'vitest'
import { hasRelevantTaiwanBenchmark } from './benchmark'

describe('臺灣大盤比較適用範圍', () => {
  it('只將臺灣股票 ETF 視為可比較', () => {
    expect(hasRelevantTaiwanBenchmark({ category: '市值型', region: '台灣' })).toBe(true)
    expect(hasRelevantTaiwanBenchmark({ category: '高股息', region: '台灣' })).toBe(true)
    expect(hasRelevantTaiwanBenchmark({ category: '債券型', region: '美國' })).toBe(false)
    expect(hasRelevantTaiwanBenchmark({ category: '海外指數', region: '美國' })).toBe(false)
    expect(hasRelevantTaiwanBenchmark({ category: '槓桿型', region: '台灣' })).toBe(false)
  })
})
