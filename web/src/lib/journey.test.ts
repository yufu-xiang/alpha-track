import { beforeEach, describe, expect, it } from 'vitest'
import {
  getJourneyProgress, loadJourneyGuideDismissed, saveJourneyGuideDismissed,
} from './journey'

beforeEach(() => localStorage.clear())

describe('research journey', () => {
  it('依收藏、比較、交易與完整目標配置計算進度', () => {
    expect(getJourneyProgress({
      watchlistCount: 1,
      compareCount: 2,
      transactionCount: 3,
      targets: { '0050': 0.6, '0056': 0.4 },
    })).toEqual({
      watched: true, compared: true, recorded: true, balanced: true, completed: 4,
    })
  })

  it('只有目標比例、沒有交易時不算完成再平衡', () => {
    expect(getJourneyProgress({
      watchlistCount: 0, compareCount: 0, transactionCount: 0, targets: { '0050': 1 },
    }).balanced).toBe(false)
  })

  it('可保存與重新開啟導覽', () => {
    saveJourneyGuideDismissed(true)
    expect(loadJourneyGuideDismissed()).toBe(true)
    saveJourneyGuideDismissed(false)
    expect(loadJourneyGuideDismissed()).toBe(false)
  })
})
