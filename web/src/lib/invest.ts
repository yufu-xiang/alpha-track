/**
 * 投入方式與財務自由試算。規格 §7.2。
 *
 * §7.1 的原則:每個工具提供「假設模式」與「實據模式」兩種參數來源。
 * 這裡的函式只吃報酬序列 —— 序列從哪來(使用者假設,還是某檔 ETF 的
 * 真實歷史)由呼叫端決定,計算本身不需要知道。
 */

export interface LumpVsDcaResult {
  /** 單筆投入的期末價值 */
  lumpSum: number
  /** 定期定額的期末價值 */
  dca: number
  /** 兩者投入的總金額(相同,供對照) */
  invested: number
  /** 定期定額的平均買進成本(每股) */
  dcaAvgCost: number
}

/**
 * 單筆 vs 定期定額。
 *
 * @param prices 期間內的價格序列(至少兩點),定期定額在每一個點各投入一次
 * @param total  總投入金額。兩種方式投入相同金額才可比。
 */
export function lumpVsDca(prices: number[], total: number): LumpVsDcaResult | null {
  const valid = prices.filter((p) => p > 0)
  if (valid.length < 2 || total <= 0) return null

  const first = valid[0]!
  const last = valid[valid.length - 1]!

  // 單筆:第一天全部買進
  const lumpShares = total / first

  // 定期定額:每期投入相同「金額」,故價格低時買到較多股數
  const perPeriod = total / valid.length
  let dcaShares = 0
  for (const p of valid) dcaShares += perPeriod / p

  return {
    lumpSum: lumpShares * last,
    dca: dcaShares * last,
    invested: total,
    dcaAvgCost: total / dcaShares,
  }
}

export interface FireInput {
  /** 目前年支出 */
  annualSpending: number
  /** 目前已累積的資產 */
  currentAssets: number
  /** 每年可存下的金額 */
  annualSavings: number
  /** 投資年化報酬 */
  annualReturn: number
  /** 提領率。4% 法則即 0.04。 */
  withdrawalRate: number
}

export interface FireResult {
  /** 財務自由所需的資產(年支出 ÷ 提領率) */
  target: number
  /** 還需要幾年;已達成回傳 0;永遠達不到回傳 null */
  years: number | null
}

/**
 * 財務自由試算。
 *
 * 刻意**不建議提領率** —— 規格 §7.3:「不提供『建議提領率』這類規範性建議。
 * 工具呈現計算結果,決策由使用者自行判斷。」所以提領率是使用者輸入的參數,
 * 不是本函式的預設值。
 */
export function yearsToFire(input: FireInput): FireResult {
  if (input.withdrawalRate <= 0) return { target: Infinity, years: null }
  const target = input.annualSpending / input.withdrawalRate
  if (input.currentAssets >= target) return { target, years: 0 }

  let assets = input.currentAssets
  for (let y = 1; y <= 100; y += 1) {
    assets = assets * (1 + input.annualReturn) + input.annualSavings
    if (assets >= target) return { target, years: y }
  }
  // 一百年還達不到就不是「還要很久」,是這組參數下達不到 ——
  // 回傳一個大數字會讓人以為只要活夠久就會到。
  return { target, years: null }
}
