import { describe, expect, it } from 'vitest'
import { fixtureRankings } from '../data/fixture'
import { applyFilters, collectCategories } from './filtering'

const ROWS = fixtureRankings.etfs
const NONE = { categories: [], query: '', showLevered: false }

describe('applyFilters', () => {
  it('預設隱藏槓桿與反向標的', () => {
    const out = applyFilters(ROWS, NONE)
    expect(out.some((r) => r.is_leveraged || r.is_inverse)).toBe(false)
  })

  it('開啟開關後顯示槓桿與反向標的', () => {
    const out = applyFilters(ROWS, { ...NONE, showLevered: true })
    expect(out.some((r) => r.is_leveraged)).toBe(true)
    expect(out.some((r) => r.is_inverse)).toBe(true)
  })

  it('依分類篩選', () => {
    const out = applyFilters(ROWS, { ...NONE, categories: ['高股息'] })
    expect(out.map((r) => r.code).sort()).toEqual(['0056', '00929'])
  })

  it('多個分類為聯集', () => {
    const out = applyFilters(ROWS, { ...NONE, categories: ['高股息', '市值型'] })
    expect(out).toHaveLength(3)
  })

  it('以代號搜尋', () => {
    expect(applyFilters(ROWS, { ...NONE, query: '0050' }).map((r) => r.code))
      .toEqual(['0050'])
  })

  it('以名稱搜尋', () => {
    expect(applyFilters(ROWS, { ...NONE, query: '高股息' }).map((r) => r.code))
      .toEqual(['0056'])
  })

  it('搜尋只看代號與名稱,不看分類', () => {
    // 若把分類也納入搜尋範圍,搜「高股息」會連 00929(名稱不含高股息、
    // 但分類是高股息)一起帶出來,使用者無從理解為何命中。
    expect(applyFilters(ROWS, { ...NONE, query: '高股息' })).toHaveLength(1)
  })

  it('搜尋忽略前後空白', () => {
    expect(applyFilters(ROWS, { ...NONE, query: '  0050  ' })).toHaveLength(1)
  })

  it('搜尋不分大小寫,B 結尾代號可用小寫查到', () => {
    expect(applyFilters(ROWS, { ...NONE, query: '00679b', showLevered: true }))
      .toHaveLength(1)
  })

  it('分類與搜尋同時作用時取交集', () => {
    const out = applyFilters(ROWS, { ...NONE, categories: ['高股息'], query: '復華' })
    expect(out.map((r) => r.code)).toEqual(['00929'])
  })

  it('槓桿篩選優先於分類篩選 —— 選了槓桿型分類但開關關著,結果仍是空的', () => {
    // 兩個條件互相矛盾時不該顯示槓桿標的,否則預設隱藏的保護等於形同虛設。
    const out = applyFilters(ROWS, { ...NONE, categories: ['槓桿型'] })
    expect(out).toEqual([])
  })

  it('無結果時回傳空陣列,不拋錯', () => {
    expect(applyFilters(ROWS, { ...NONE, query: '不存在的標的' })).toEqual([])
  })

  it('不修改傳入的陣列', () => {
    const before = [...ROWS]
    applyFilters(ROWS, { ...NONE, query: '0050' })
    expect(ROWS).toEqual(before)
  })
})

describe('collectCategories', () => {
  it('依規格的分類順序排列,未分類與未知分類墊底', () => {
    // 中文既沒有有意義的字母序,localeCompare 的結果又相依於執行環境的
    // ICU 資料(zh-Hant 給的是筆畫序,與 code point 序完全不同)。
    // 排行榜的篩選列該照使用者最常用的順序,而不是任何一種機器排序。
    expect(collectCategories(ROWS)).toEqual([
      '市值型', '高股息', '債券型', '槓桿型', '反向型', '未分類',
    ])
  })

  it('去除重複', () => {
    expect(collectCategories([...ROWS, ...ROWS])).toEqual(collectCategories(ROWS))
  })

  it('略過沒有分類的列', () => {
    const rows = ROWS.map((r) => ({ ...r, category: null }))
    expect(collectCategories(rows)).toEqual([])
  })

  it('沒列在順序表裡的分類排在最後,且彼此順序穩定', () => {
    const rows = [
      { ...ROWS[0]!, category: '市值型' },
      { ...ROWS[0]!, category: '某種新分類' },
      { ...ROWS[0]!, category: '未分類' },
    ]
    expect(collectCategories(rows)).toEqual(['市值型', '未分類', '某種新分類'])
  })
})
