import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addToCompareBasket, loadCompareBasket, loadWatchlist,
  saveCompareBasket, saveWatchlist, toggleWatchlist,
} from './personalLists'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('自選清單', () => {
  it('可加入、移除並跨次讀回', () => {
    expect(toggleWatchlist([], '0050')).toEqual(['0050'])
    expect(loadWatchlist()).toEqual(['0050'])
    expect(toggleWatchlist(['0050'], '0050')).toEqual([])
  })

  it('清理大小寫、重複與無效代號', () => {
    saveWatchlist(['00679b', '00679B', '00 50'])
    expect(loadWatchlist()).toEqual(['00679B'])
  })

  it('資料毀損或無痕模式不讓頁面崩潰', () => {
    localStorage.setItem('alpha-track:watchlist', '{bad json')
    expect(loadWatchlist()).toEqual([])
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveWatchlist(['0050'])).not.toThrow()
  })
})

describe('比較籃', () => {
  it('加入時不會把已存在的代號移除', () => {
    saveCompareBasket(['0050'])
    expect(addToCompareBasket('0050')).toEqual(['0050'])
  })

  it('最多保留五檔', () => {
    saveCompareBasket(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(loadCompareBasket()).toEqual(['A', 'B', 'C', 'D', 'E'])
  })
})
