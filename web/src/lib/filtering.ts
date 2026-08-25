/**
 * 篩選邏輯。純函式,與 UI 分離以便測試。
 *
 * 槓桿與反向 ETF 預設隱藏(規格 §3.4):它們的長期報酬本質上不可與
 * 現股型比較,混在同一張榜單會使排名失去意義。
 */
import type { EtfRow } from '../types'

export interface FilterState {
  categories: string[]
  regions: string[]
  query: string
  showLevered: boolean
}

/** 複合地區以頓號分隔(「台灣、美國」)。拆成單一地區的清單。 */
function splitRegion(region: string | null): string[] {
  return region ? region.split('、').map((r) => r.trim()).filter(Boolean) : []
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
/**
 * 篩選列的地區順序。台股網站,台灣在前;其餘依台灣投資人常見程度排,
 * 「全球」殿後 —— 它是「沒有單一市場」的意思,不是一個地方。
 */
const REGION_ORDER = [
  '台灣', '美國', '日本', '中國', '香港', '南韓', '印度', '越南',
  '歐洲', '澳洲', '亞太', '新興市場', '全球',
]

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

    if (state.regions.length > 0) {
      // 複合地區(「台灣、美國」)只要包含選取的其中之一就算命中 ——
      // 那種標的兩邊都投,選任一邊都該找得到它。
      const own = splitRegion(row.region)
      if (!own.some((r) => state.regions.includes(r))) return false
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

export function collectRegions(rows: EtfRow[]): string[] {
  const seen = new Set<string>()
  for (const row of rows) {
    for (const r of splitRegion(row.region)) seen.add(r)
  }
  const rank = (r: string) => {
    const i = REGION_ORDER.indexOf(r)
    return i === -1 ? REGION_ORDER.length : i
  }
  return [...seen].sort((a, b) => rank(a) - rank(b))
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
