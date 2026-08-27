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

/** 可自選顯示的非期間欄位。規格 §5.2:欄位選單須列出風險指標,勾選即顯示。 */
export const RISK_COLUMNS = [
  'excess', 'volatility', 'mdd', 'sharpe', 'beta', 'premium_discount',
] as const

export type RiskColumn = (typeof RISK_COLUMNS)[number]

export const RISK_LABELS: Record<RiskColumn, string> = {
  excess: '超額報酬',
  volatility: '年化波動',
  mdd: '最大回撤',
  sharpe: '夏普值',
  beta: '貝他值',
  premium_discount: '折溢價',
}

/** 欄位對應的詞典條目,供表頭的 ⓘ 使用。 */
export const RISK_TERMS: Record<RiskColumn, string> = {
  excess: 'excess',
  volatility: 'volatility',
  mdd: 'mdd',
  sharpe: 'sharpe',
  beta: 'beta',
  premium_discount: 'premium_discount',
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
  /** 近 60 日折溢價的最低值(最深折價)。樣本不足 20 個交易日時為 null。 */
  premium_low: number | null
  /** 近 60 日折溢價的最高值(最高溢價)。 */
  premium_high: number | null
  /** 近 60 日中折溢價為正的天數佔比。 */
  premium_days_ratio: number | null
  /**
   * 實際納入折溢價統計的天數。
   *
   * 這個欄位存在的理由是它讓「為什麼區間是空的」有答案 ——
   * 淨值來源只有當日快照、沒有歷史,折溢價因此只能逐日累積。
   * 沒有它,使用者只會看到一個沒有原因的破折號。
   */
  premium_sample: number
  /** 近 20 個交易日的平均成交股數。 */
  avg_volume: number | null
  /**
   * 近 20 個交易日的平均成交金額。比較流動性要看**金額**不是股數:
   * 10 元與 100 元的 ETF 成交同樣股數,實際換手的資金差十倍,
   * 只排成交量會讓低價 ETF 系統性看起來比較熱門。
   */
  avg_turnover: number | null
  /**
   * 近一年**實配**配息 ÷ 現價。不年化、不推估 ——
   * 推估會把一次性的特別配息當成常態,殖利率排行會被那種標的佔滿。
   * 無配息紀錄者為 null,不是 0:「沒有資料」與「這一年沒配」是兩件事。
   */
  dividend_yield: number | null
}

/** 價格序列:起點 + 天數位移 + 平行陣列。見 docs/json-contract.md 的說明。 */
export interface Series {
  start: string | null
  days: number[]
  /** 還原價 —— 走勢圖比的是含息報酬。 */
  adj: number[]
  /**
   * 未還原收盤價。不是 adj 的備份:「配息再投入 vs 不再投入」的比較
   * 非它不可 —— 還原價本身就已假設配息再投入,拿它去算再投入會把配息
   * 算兩次,而且兩條線會完全重疊,看起來像程式壞了。
   */
  close: number[]
}

export interface DividendRecord {
  ex_date: string
  pay_date: string | null
  /** 每股配息的**原始金額**(當時實際配的錢)。配息紀錄表顯示這個。 */
  amount: number
  /**
   * 換算到**價格序列尺度**的每股配息。
   *
   * 價格序列來自 Yahoo,對歷史日期已除以分割倍率;amount 卻是當時的
   * 原始金額。任何「拿配息去買股」的計算都必須用這個欄位 ——
   * 用 amount 會讓分割過的標的離譜地錯(實測 0050 的股息再投入
   * 試算因此高估 155.6%)。
   */
  amount_adj: number
  /**
   * 換算倍率是否確定。false 代表缺少證交所的除權息前收盤價、
   * 或比值對不上任何乾淨的分割倍率 —— 此時 amount_adj 等於 amount,
   * 而 UI 必須說明那可能不準,不能靜靜地用一個猜的數字。
   */
  scale_known: boolean
}

/** 個股頁資料。lazy load `data/etf/{代號}.json`。 */
export interface EtfDetail {
  code: string
  name: string
  category: string | null
  region: string | null
  exchange: string
  issuer: string | null
  tracking_index: string | null
  listing_date: string | null
  data_start: string | null
  returns: Record<PeriodCode, number | null>
  annualized: Record<PeriodCode, number | null>
  excess: Record<PeriodCode, number | null>
  risk: RiskMetrics
  premium_discount: number | null
  /** 近 60 日折溢價的最低值(最深折價)。樣本不足 20 個交易日時為 null。 */
  premium_low: number | null
  /** 近 60 日折溢價的最高值(最高溢價)。 */
  premium_high: number | null
  /** 近 60 日中折溢價為正的天數佔比。 */
  premium_days_ratio: number | null
  /**
   * 實際納入折溢價統計的天數。
   *
   * 這個欄位存在的理由是它讓「為什麼區間是空的」有答案 ——
   * 淨值來源只有當日快照、沒有歷史,折溢價因此只能逐日累積。
   * 沒有它,使用者只會看到一個沒有原因的破折號。
   */
  premium_sample: number
  /**
   * 折溢價走勢。與價格序列分開,因為兩者的起點不同:淨值只能自接上
   * 來源的那天開始逐日累積,價格則有多年歷史。共用同一組 days
   * 會讓折溢價前面補上一長串 null,而那看起來像資料壞了。
   */
  premium_series: PremiumSeries
  /** 基金規模(新台幣元)= 已發行受益權單位數 × 每單位淨值。 */
  fund_size: number | null
  /**
   * 成分股。來源是投信投顧公會的**月報**,而且**只有前十大**——
   * items 的權重加總遠小於 1(0050 實測 80.4%,高股息型更低)。
   * 任何以此計算的重疊度都必須寫明這一點,否則「前十大重疊 30%」
   * 會被讀成「整體重疊 30%」。
   */
  holdings: Holdings
  series: Series
  dividends: DividendRecord[]
}

/** 折溢價序列。格式與價格序列一致(起點 + 天數位移)。 */
export interface PremiumSeries {
  start: string | null
  days: number[]
  premium: number[]
}

export interface Holdings {
  /** 資料所屬月份 `YYYYMM`;沒有資料時為 null。 */
  year_month: string | null
  items: { code: string; name: string; weight: number | null }[]
}

/** 加權報酬指數序列,全站共用一份。 */
export interface BenchmarkSeries {
  start: string | null
  days: number[]
  value: number[]
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
  /**
   * 加權報酬指數的近一年漲幅。不是健康狀態,是**判讀基準** ——
   * 大盤漲九成的年份,整張表的報酬與夏普值都會很誇張,
   * 沒有這個對照,使用者無從判斷「+99%」是這檔厲害還是全市場都在漲。
   */
  benchmark_return_1y: number | null
}
