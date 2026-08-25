import { describe, expect, it } from 'vitest'
import { fixtureMeta, fixtureRankings } from './data/fixture'
import { PERIODS, type EtfRow } from './types'

describe('契約型別', () => {
  it('期間代碼與後端 Period enum 逐字一致', () => {
    expect(PERIODS).toEqual([
      'D1', 'W1', 'M1', 'M3', 'M6', 'YTD', 'Y1', 'Y3', 'Y5', 'Y10', 'INCEPTION',
    ])
  })

  it('fixture 的每一列都具備契約規定的全部欄位', () => {
    const row: EtfRow = fixtureRankings.etfs[0]!
    expect(Object.keys(row).sort()).toEqual([
      'annualized', 'category', 'close', 'code', 'data_start', 'excess',
      'is_inverse', 'is_leveraged', 'listing_date', 'name', 'premium_discount',
      'region', 'returns', 'risk',
    ])
  })

  it('data_start 與 listing_date 是兩件事,不可混用', () => {
    // 0050 掛牌於 2003,但免費資料源實際只回溯到 2014(見 1a 的 ledger R24:
    // Yahoo 的 2014-01-02 有一次未調整的 1:4 分割,之前的區段被捨棄)。
    // 「成立以來」因此是 null —— UI 必須用 data_start 說明這欄為何空白,
    // 否則使用者只會看到一個沒有理由的破折號。
    const old = fixtureRankings.etfs.find((e) => e.code === '0050')!
    expect(old.listing_date).toBe('2003-06-30')
    expect(old.data_start).toBe('2014-01-02')
    expect(old.returns.INCEPTION).toBeNull()
  })

  it('fixture 以 null 表示資料不足,而非 0', () => {
    const young = fixtureRankings.etfs.find((e) => e.code === '00929')!
    expect(young.returns.Y10).toBeNull()
    expect(young.returns.Y5).toBeNull()
    expect(young.returns.Y1).not.toBeNull()
  })

  it('fixture 涵蓋槓桿與反向標的,供篩選功能測試', () => {
    expect(fixtureRankings.etfs.some((e) => e.is_leveraged)).toBe(true)
    expect(fixtureRankings.etfs.some((e) => e.is_inverse)).toBe(true)
  })

  it('meta fixture 具備健康狀態列所需的全部欄位', () => {
    expect(Object.keys(fixtureMeta).sort()).toEqual([
      'anomalies', 'benchmark_return_1y', 'data_date', 'etf_count',
      'generated_at', 'is_stale', 'risk_free_rate', 'unclassified',
    ])
  })
})
