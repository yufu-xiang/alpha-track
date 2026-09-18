import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadFilterPresets, normalizeFilterPresets, upsertFilterPreset,
} from './filterPresets'

beforeEach(() => localStorage.clear())

const saved = {
  name: '長期低回撤',
  filters: {
    categories: ['市值型'], regions: ['台灣'], query: '',
    showLevered: false, onlyWatchlist: false,
    minListingYears: 5, minTurnoverMillions: 100,
    maxDrawdownPercent: 35, sortBy: 'Y3' as const,
  },
}

describe('篩選組合', () => {
  it('可儲存與更新同名組合', () => {
    expect(upsertFilterPreset([], saved)).toEqual([saved])
    expect(loadFilterPresets()).toEqual([saved])
    const changed = { ...saved, filters: { ...saved.filters, maxDrawdownPercent: 25 } }
    expect(upsertFilterPreset(loadFilterPresets(), changed)).toEqual([changed])
  })

  it('匯入時清理不合法門檻與期間', () => {
    const out = normalizeFilterPresets([{ name: '錯誤資料', filters: {
      ...saved.filters, minListingYears: -3, maxDrawdownPercent: 300,
      minTurnoverMillions: Infinity, sortBy: 'invalid',
    } }])
    expect(out[0]?.filters).toMatchObject({
      minListingYears: 0, maxDrawdownPercent: null,
      minTurnoverMillions: null, sortBy: 'Y1',
    })
  })
})
