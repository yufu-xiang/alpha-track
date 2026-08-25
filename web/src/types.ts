/**
 * 契約型別:docs/json-contract.md 的 TypeScript 鏡像。
 *
 * 這裡的欄位名稱必須與 pipeline 的 export.py 逐字一致。
 * 改名是破壞性變更,兩邊必須同步修改。
 *
 * null 的意義固定為「資料不足」——顯示為 —,排序時置於最末,
 * 絕不當成 0 參與計算。
 */

export const PERIODS = [
  'D1', 'W1', 'M1', 'M3', 'M6', 'YTD', 'Y1', 'Y3', 'Y5', 'Y10', 'INCEPTION',
] as const

export type PeriodCode = (typeof PERIODS)[number]

export const PERIOD_LABELS: Record<PeriodCode, string> = {
  D1: '當日',
  W1: '一週',
  M1: '一月',
  M3: '三月',
  M6: '六月',
  YTD: '今年以來',
  Y1: '一年',
  Y3: '三年',
  Y5: '五年',
  Y10: '十年',
  INCEPTION: '成立以來',
}

export interface RiskMetrics {
  volatility: number | null
  mdd: number | null
  sharpe: number | null
  beta: number | null
}

export interface EtfRow {
  code: string
  name: string
  category: string | null
  region: string | null
  is_leveraged: boolean
  is_inverse: boolean
  close: number
  listing_date: string | null
  /**
   * 實際持有價格資料的起點。與 listing_date 不同時,代表免費資料源涵蓋不足
   * (Yahoo 的歷史深度、或未調整分割導致舊區段被捨棄)。
   * 「成立以來」為 null 時,UI 用這個日期說明原因,而不是留一個沒有理由的破折號。
   */
  data_start: string | null
  returns: Record<PeriodCode, number | null>
  annualized: Record<PeriodCode, number | null>
  /**
   * 相對加權報酬指數的超額報酬(規格 §4.5b)。同期間的標的報酬減大盤報酬。
   * 正值代表贏大盤。大盤資料涵蓋不到的期間為 null。
   */
  excess: Record<PeriodCode, number | null>
  risk: RiskMetrics
  premium_discount: number | null
}

export interface RankingsData {
  data_date: string
  etfs: EtfRow[]
}

export interface Anomaly {
  code: string
  reason: string
}

export interface MetaData {
  generated_at: string
  data_date: string
  is_stale: boolean
  etf_count: number
  unclassified: string[]
  anomalies: Anomaly[]
  risk_free_rate: number
}
