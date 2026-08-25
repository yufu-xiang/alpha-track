/**
 * 篩選邏輯。純函式,與 UI 分離以便測試。
 *
 * 槓桿與反向 ETF 預設隱藏(規格 §3.4):它們的長期報酬本質上不可與
 * 現股型比較,混在同一張榜單會使排名失去意義。
 */
import type { EtfRow } from '../types'

export interface FilterState {
  categories: string[]
  query: string
  showLevered: boolean
}

/**
 * 篩選列的分類順序。規格 §3.2 的分類,常用的在前;
 * 槓桿、反向、未分類墊底。
 *
 * 刻意不用 localeCompare 排序:中文沒有有意義的字母序,zh-Hant 給的是
 * 筆畫序(反向型、市值型、未分類、高股息、債券型、槓桿型),對讀者
 * 一樣沒有意義,而且結果相依於執行環境的 ICU 資料。既然兩種機器排序
 * 都不好用,不如照使用者實際會找的順序寫死。
 */
const CATEGORY_ORDER = [
  // 股票型:一般人最常比較的,放最前面
  '市值型', '高股息', '因子型', '主題型', '產業型', '海外指數',
  // 其他資產類別
  '債券型', '特別股', '多資產', '期貨信託',
  // 主動式:報酬來源是經理人而非指數,與上列不可直接類比
  '主動型',
  // 不建議長期持有 / 待維護
  '槓桿型', '反向型', '未分類',
]

export function applyFilters(rows: EtfRow[], state: FilterState): EtfRow[] {
  const q = state.query.trim().toLowerCase()

  return rows.filter((row) => {
    // 這一條放最前面,因此即使使用者選了「槓桿型」分類,開關關著時
    // 結果仍是空的 —— 否則預設隱藏的保護形同虛設。
    if (!state.showLevered && (row.is_leveraged || row.is_inverse)) return false

    if (state.categories.length > 0) {
      if (!row.category || !state.categories.includes(row.category)) return false
    }

    if (q) {
      // 只比對代號與名稱。把分類也納入的話,搜「高股息」會連名稱不含
      // 該詞、只是分類相同的標的一起帶出來,使用者無從理解為何命中。
      const haystack = `${row.code} ${row.name}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }

    return true
  })
}

export function collectCategories(rows: EtfRow[]): string[] {
  const seen = new Set<string>()
  for (const row of rows) {
    if (row.category) seen.add(row.category)
  }
  const rank = (c: string) => {
    const i = CATEGORY_ORDER.indexOf(c)
    return i === -1 ? CATEGORY_ORDER.length : i
  }
  // 未列在順序表裡的分類(pipeline 新增了分類但這裡忘了同步)排在最後,
  // 彼此之間維持出現順序,不會憑空消失。
  return [...seen].sort((a, b) => rank(a) - rank(b))
}
