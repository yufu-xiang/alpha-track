import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PREFS, loadPrefs, savePrefs } from './prefs'

describe('偏好儲存', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('未儲存過時回傳預設值', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('預設顯示欄位為規格指定的五個期間', () => {
    expect(DEFAULT_PREFS.visibleColumns).toEqual(['D1', 'M1', 'M3', 'Y1', 'Y3'])
  })

  it('存檔後可讀回', () => {
    savePrefs({ ...DEFAULT_PREFS, visibleColumns: ['Y1', 'Y10'] })
    expect(loadPrefs().visibleColumns).toEqual(['Y1', 'Y10'])
  })

  it('儲存內容毀損時回退到預設值,不讓整頁崩潰', () => {
    localStorage.setItem('alpha-track:prefs', '{ 這不是 JSON')
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('localStorage 讀取拋例外時回退到預設值(無痕模式)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('localStorage 寫入拋例外時靜默失敗,不中斷操作', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => savePrefs(DEFAULT_PREFS)).not.toThrow()
  })

  it('捨棄不認識的期間代碼,避免舊版偏好污染新版欄位', () => {
    localStorage.setItem(
      'alpha-track:prefs',
      JSON.stringify({ visibleColumns: ['Y1', 'BOGUS'], showLevered: false }),
    )
    expect(loadPrefs().visibleColumns).toEqual(['Y1'])
  })

  it('存進非陣列的 visibleColumns 不得讓載入崩潰', () => {
    localStorage.setItem('alpha-track:prefs',
      JSON.stringify({ visibleColumns: 'Y1', showLevered: false }))
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('showLevered 為 true 時應被保留', () => {
    savePrefs({ ...DEFAULT_PREFS, showLevered: true })
    expect(loadPrefs().showLevered).toBe(true)
  })
})

describe('風險欄位偏好', () => {
  beforeEach(() => localStorage.clear())

  it('預設開啟超額報酬、波動度、MDD、夏普值與貝他值', () => {
    expect(DEFAULT_PREFS.visibleRisk).toEqual([
      'excess', 'volatility', 'mdd', 'sharpe', 'beta',
    ])
  })

  it('折溢價預設關閉 —— 目前查不到淨值來源,整欄都是破折號', () => {
    expect(DEFAULT_PREFS.visibleRisk).not.toContain('premium_discount')
  })

  it('允許全部關閉,不像期間欄位至少要留一欄', () => {
    savePrefs({ ...DEFAULT_PREFS, visibleRisk: [] })
    expect(loadPrefs().visibleRisk).toEqual([])
  })

  it('捨棄不認識的欄位代碼', () => {
    localStorage.setItem('alpha-track:prefs',
      JSON.stringify({ visibleRisk: ['sharpe', 'BOGUS'] }))
    expect(loadPrefs().visibleRisk).toEqual(['sharpe'])
  })

  it('舊版偏好沒有這個欄位時回退預設,而非變成空的', () => {
    localStorage.setItem('alpha-track:prefs',
      JSON.stringify({ visibleColumns: ['Y1'], showLevered: false }))
    expect(loadPrefs().visibleRisk).toEqual(DEFAULT_PREFS.visibleRisk)
  })
})
