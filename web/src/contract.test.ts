/**
 * 跨語言契約守門。
 *
 * 前端的型別與 fixture 是後端 export.py 的鏡像,但 TypeScript 管不到
 * Python —— 兩邊漂移時編譯器不會有任何意見(1a 的 ledger R25 就是這樣
 * 漏掉 data_start 的:pre-flight 掃描當時「逐字相符」,後來只改了一側)。
 *
 * 這裡把後端**實際產出**的鍵集合寫死成期望值,由 docs/json-contract.md
 * 的範例逐字抄來。任一側動了欄位,這個測試就會紅。
 */
import { describe, expect, it } from 'vitest'
import { fixtureMeta, fixtureRankings } from './data/fixture'
import { PERIODS } from './types'

// 由 pipeline/src/alpha_track/export.py 的實際輸出取得,見 docs/json-contract.md
const BACKEND_TOP_LEVEL_KEYS = ['data_date', 'etfs']
const BACKEND_ROW_KEYS = [
  'annualized', 'category', 'close', 'code', 'data_start', 'excess',
  'is_inverse', 'is_leveraged', 'listing_date', 'name', 'premium_discount',
  'region', 'returns', 'risk',
]
const BACKEND_RISK_KEYS = ['beta', 'mdd', 'sharpe', 'volatility']
const BACKEND_META_KEYS = [
  'anomalies', 'benchmark_return_1y', 'data_date', 'etf_count', 'generated_at',
  'is_stale', 'risk_free_rate', 'unclassified',
]
const BACKEND_PERIODS = [
  'D1', 'W1', 'M1', 'M3', 'M6', 'YTD', 'Y1', 'Y3', 'Y5', 'Y10', 'INCEPTION',
]

describe('與後端 export.py 的契約', () => {
  it('rankings 最外層的鍵一致', () => {
    expect(Object.keys(fixtureRankings).sort()).toEqual(BACKEND_TOP_LEVEL_KEYS)
  })

  it('每一列的鍵一致', () => {
    for (const row of fixtureRankings.etfs) {
      expect(Object.keys(row).sort()).toEqual(BACKEND_ROW_KEYS)
    }
  })

  it('risk 的鍵一致', () => {
    for (const row of fixtureRankings.etfs) {
      expect(Object.keys(row.risk).sort()).toEqual(BACKEND_RISK_KEYS)
    }
  })

  it('meta 的鍵一致', () => {
    expect(Object.keys(fixtureMeta).sort()).toEqual(BACKEND_META_KEYS)
  })

  it('期間代碼與順序一致', () => {
    expect([...PERIODS]).toEqual(BACKEND_PERIODS)
  })

  it('每一列的 returns 與 annualized 都含全部期間,不缺鍵', () => {
    // 後端保證一定送出全部十一個鍵(資料不足者為 null),
    // 前端才能安全地直接索引而不必先檢查鍵是否存在。
    for (const row of fixtureRankings.etfs) {
      expect(Object.keys(row.returns).sort()).toEqual([...BACKEND_PERIODS].sort())
      expect(Object.keys(row.annualized).sort()).toEqual([...BACKEND_PERIODS].sort())
      expect(Object.keys(row.excess).sort()).toEqual([...BACKEND_PERIODS].sort())
    }
  })
})
