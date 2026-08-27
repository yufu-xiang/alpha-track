/**
 * 多檔標的的報酬相關性。
 *
 * ## 為什麼是相關性,而不是規格 §7.2 寫的「成分股重疊度」
 *
 * 成分股重疊度需要各 ETF 的持股明細,而勘查後確認**沒有任何公開的統一來源**
 * (詳見 docs/data-sources.md)。持股是各投信自行公告,臺灣指數公司的
 * 成分股是付費商品。
 *
 * 相關性回答的是同一個問題的另一面:「這兩檔一起買,是分散還是重押?」
 * 而且在某些方面更貼近實情 —— 兩檔持股名單完全不同的半導體 ETF,
 * 重疊度是 0,但它們會一起漲一起跌,對分散風險毫無幫助。
 * 相關性抓得到這件事,成分股比對抓不到。
 *
 * **但它不是成分股重疊度的等價替代**,UI 必須說清楚差別:
 * 相關性看不出「我是不是重複持有同一檔股票」,而那是配置檢查會問的問題。
 */
import type { Series } from '../types'
import { toAbsoluteDays } from './chart'

/** 少於此樣本數不計算 —— 十幾天的相關係數幾乎只是雜訊。 */
export const MIN_SAMPLE = 60

export interface CorrelationCell {
  /** 皮爾森相關係數;樣本不足時為 null,不是 0 —— 0 代表「不相關」。 */
  value: number | null
  /** 實際納入計算的重疊交易日數 */
  sample: number
}

/**
 * 依**共同交易日**計算日報酬的相關係數。
 *
 * 兩檔的交易日不必相同(上市與上櫃偶有差異),取交集即可。
 * 不做內插補值:補出來的價格會產生真實市場沒有發生過的報酬,
 * 而那個假報酬與另一檔的真實報酬相關,結果會系統性偏高。
 */
export function correlationMatrix(
  seriesByCode: Map<string, Series>,
  windowDays: number | null,
): Map<string, Map<string, CorrelationCell>> {
  const codes = [...seriesByCode.keys()]
  const byCode = new Map<string, Map<number, number>>()
  let latestDay = -Infinity

  for (const code of codes) {
    const abs = toAbsoluteDays(seriesByCode.get(code)!)
    const m = new Map<number, number>()
    abs.days.forEach((d, i) => m.set(d, abs.values[i]!))
    byCode.set(code, m)
    if (abs.days.length > 0) latestDay = Math.max(latestDay, abs.days[abs.days.length - 1]!)
  }
  const cutoff = windowDays === null || latestDay === -Infinity
    ? -Infinity
    : latestDay - windowDays

  const out = new Map<string, Map<string, CorrelationCell>>()
  for (const a of codes) {
    const row = new Map<string, CorrelationCell>()
    for (const b of codes) {
      row.set(b, a === b
        ? { value: 1, sample: byCode.get(a)!.size }
        : pairCorrelation(byCode.get(a)!, byCode.get(b)!, cutoff))
    }
    out.set(a, row)
  }
  return out
}

function pairCorrelation(
  a: Map<number, number>,
  b: Map<number, number>,
  cutoff: number,
): CorrelationCell {
  // 先取共同交易日並排序,再算報酬 —— 順序反了的話,某一檔在對方停牌那天
  // 的報酬會被算成跨兩天的報酬,尺度不一致。
  const days = [...a.keys()].filter((d) => d >= cutoff && b.has(d)).sort((x, y) => x - y)
  const ra: number[] = []
  const rb: number[] = []
  for (let i = 1; i < days.length; i += 1) {
    const pa0 = a.get(days[i - 1]!)!
    const pb0 = b.get(days[i - 1]!)!
    if (pa0 <= 0 || pb0 <= 0) continue
    ra.push(a.get(days[i]!)! / pa0 - 1)
    rb.push(b.get(days[i]!)! / pb0 - 1)
  }
  if (ra.length < MIN_SAMPLE) return { value: null, sample: ra.length }
  return { value: pearson(ra, rb), sample: ra.length }
}

export function pearson(x: number[], y: number[]): number | null {
  const n = x.length
  if (n === 0 || n !== y.length) return null
  const mx = x.reduce((s, v) => s + v, 0) / n
  const my = y.reduce((s, v) => s + v, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i += 1) {
    const dx = x[i]! - mx
    const dy = y[i]! - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  // 任一邊完全沒有波動 —— 相關係數在數學上無定義。
  // 回傳 0 會被讀成「毫不相關」,那是一個有意義的結論,而這裡沒有結論。
  if (sxx === 0 || syy === 0) return null
  return sxy / Math.sqrt(sxx * syy)
}

/** 把相關係數轉成一句話。刻意不含「該買/不該買」。 */
export function describeCorrelation(r: number): string {
  if (r >= 0.9) return '幾乎同步 —— 一起買很難達到分散效果'
  if (r >= 0.7) return '高度同步'
  if (r >= 0.4) return '中度同步'
  if (r > -0.2) return '關聯不強'
  return '反向 —— 一檔漲時另一檔傾向跌'
}
