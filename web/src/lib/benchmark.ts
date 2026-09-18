import type { EtfRow } from '../types'

/** 臺灣加權報酬指數只作為臺灣股票 ETF 的參考基準。 */
const TAIWAN_EQUITY_CATEGORIES = new Set([
  '市值型', '高股息', '產業型', '主題型', '因子型', '主動型',
])

export function hasRelevantTaiwanBenchmark(
  item: Pick<EtfRow, 'category' | 'region'>,
): boolean {
  return item.region === '台灣'
    && item.category !== null
    && TAIWAN_EQUITY_CATEGORIES.has(item.category)
}
