/**
 * 融資維持率。規格 §7.2。
 *
 * 規則於實作時查證,未憑記憶填寫(規格 §6.3 的原則):
 *
 *   - 維持率 = 股票現值 ÷ 融資金額 × 100%
 *   - 追繳門檻 130%,自 2015 年起(在那之前是 120%)
 *   - 融資成數:上市股 6 成、上櫃股 5 成、ETF 最高 6 成
 *   - 槓桿/反向型 ETF 本身已有槓桿,多數券商不開放融資
 *
 * **門檻是「整戶」擔保維持率,不是單一個股。** 這點常被誤解:某一檔
 * 跌破 130% 不必然被追繳,券商看的是整個帳戶的擔保品市值對融資總額。
 * 本工具算的是單一部位,所以 UI 必須把這件事講清楚,否則會讓人在
 * 帳戶其實安全的時候恐慌賣出 —— 那正是最糟的時點。
 */

/** 追繳門檻。2015 年起自 120% 調升至 130%。 */
export const MAINTENANCE_THRESHOLD = 1.3

/** 各類標的的融資成數上限。 */
export const MARGIN_RATIOS = {
  listed: 0.6,
  otc: 0.5,
  etf: 0.6,
} as const

export interface MarginInput {
  /** 買進股數 */
  shares: number
  /** 買進價格 */
  buyPrice: number
  /** 融資成數 */
  marginRatio: number
  /** 目前股價 */
  currentPrice: number
}

export interface MarginResult {
  /** 融資金額 = 成交金額 × 融資成數 */
  loan: number
  /** 自備款 */
  ownFunds: number
  /** 目前的單一部位維持率;融資金額為 0 時無意義,回傳 null */
  ratio: number | null
  /** 跌到這個價位,維持率剛好觸及門檻 */
  marginCallPrice: number | null
  /** 距離追繳還有多少跌幅(負數);已跌破則為正 */
  bufferToCall: number | null
}

export function marginPosition(input: MarginInput): MarginResult {
  const cost = input.shares * input.buyPrice
  const loan = cost * input.marginRatio
  const ownFunds = cost - loan

  if (loan <= 0 || input.shares <= 0) {
    // 沒有融資就沒有維持率可言。回傳 0 會被讀成「維持率 0%,馬上斷頭」,
    // 那是完全相反的意思 —— 全額自備反而是最安全的狀態。
    return { loan, ownFunds, ratio: null, marginCallPrice: null, bufferToCall: null }
  }

  const marketValue = input.shares * input.currentPrice
  const marginCallPrice = (loan * MAINTENANCE_THRESHOLD) / input.shares
  return {
    loan,
    ownFunds,
    ratio: marketValue / loan,
    marginCallPrice,
    bufferToCall: input.currentPrice > 0
      ? marginCallPrice / input.currentPrice - 1
      : null,
  }
}
