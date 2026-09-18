import { describe, expect, it } from 'vitest'
import { fixtureRankings } from '../data/fixture'
import {
  advanceWatchHistory, buildWatchSnapshot, getWatchChanges,
  normalizeWatchHistory,
} from './watchChanges'

const rows = fixtureRankings.etfs

describe('自選變化', () => {
  it('跨資料日比較一年報酬與折溢價，標出新資料異常', () => {
    const oldRows = rows.map((row) => row.code === '0050'
      ? { ...row, returns: { ...row.returns, Y1: 0.1734 }, premium_discount: 0.0002 }
      : row)
    const first = advanceWatchHistory(null,
      buildWatchSnapshot('2026-08-20', oldRows, ['0050'], []))
    const next = advanceWatchHistory(first,
      buildWatchSnapshot('2026-08-21', rows, ['0050'], [{ code: '0050', reason: '價格異常' }]))
    const change = getWatchChanges(next, '2026-08-21', rows, ['0050'],
      [{ code: '0050', reason: '價格異常' }])[0]!
    expect(change.oneYearReturnChange).toBeCloseTo(0.01)
    expect(change.premiumChange).toBeCloseTo(0.001)
    expect(change.newAnomaly).toBe(true)
  })

  it('同資料日新增自選保留原紀錄，舊版資料不覆蓋新版', () => {
    const first = advanceWatchHistory(null,
      buildWatchSnapshot('2026-08-21', rows, ['0050'], []))
    const added = advanceWatchHistory(first,
      buildWatchSnapshot('2026-08-21', rows, ['0056'], []))
    expect(Object.keys(added.current.values).sort()).toEqual(['0050', '0056'])
    expect(advanceWatchHistory(added,
      buildWatchSnapshot('2026-08-20', rows, ['0050'], []))).toEqual(added)
  })

  it('匯入時拒絕無效或倒置日期的比較基準', () => {
    expect(normalizeWatchHistory({ current: { date: '無效', values: {} } })).toBeNull()
    expect(normalizeWatchHistory({
      current: buildWatchSnapshot('2026-08-20', rows, ['0050'], []),
      previous: buildWatchSnapshot('2026-08-21', rows, ['0050'], []),
    })?.previous).toBeNull()
  })
})
