/**
 * 由交易紀錄推導持股與損益。規格 §6.1、§6.2。
 *
 * 存交易紀錄而非持股快照:持股快照寫起來簡單,但**算不出 XIRR** ——
 * 年化報酬需要知道每筆資金的投入時點。交易紀錄可推導出持股,反之不行。
 */
import type { CashFlow } from './xirr'
import { xirr } from './xirr'

export type TxType = 'buy' | 'sell' | 'dividend'

export interface Transaction {
  id: string
  type: TxType
  code: string
  /** ISO 日期 */
  date: string
  /** 配息時為 0(金額直接記在 amount) */
  shares: number
  /** 每股價格;配息時為每股配息金額 */
  price: number
  fee: number
  tax: number
  /**
   * 配息專用:是否為系統推估值。規格 §6.4 —— 實際入帳會扣匯費與二代健保
   * 補充保費,與對帳單不符,所以推估值不可當成事實,必須標示且可覆寫。
   */
  estimated?: boolean
}

export interface Holding {
  code: string
  shares: number
  /** 移動平均成本(含買進手續費),與台灣券商對帳單口徑一致 */
  avgCost: number
  /** 該檔累計已實現損益 */
  realized: number
  /** 該檔累計已領配息 */
  dividends: number
}

/**
 * 依時間順序重放交易,推出每一檔的持股與成本。
 *
 * 平均成本用**移動平均法**(規格 §6.2):賣出不改變平均成本,
 * 只減少股數並結算已實現損益 —— 這是台灣券商對帳單的口徑。
 * 若改用先進先出,同一批交易會得到不同的成本與損益數字。
 */
export function buildHoldings(txs: Transaction[]): Map<string, Holding> {
  const byCode = new Map<string, Holding>()
  const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  for (const tx of sorted) {
    const h = byCode.get(tx.code) ?? {
      code: tx.code, shares: 0, avgCost: 0, realized: 0, dividends: 0,
    }

    if (tx.type === 'buy') {
      // 買進手續費併入成本 —— 那是取得這些股份實際付出的錢
      const cost = h.avgCost * h.shares + tx.shares * tx.price + tx.fee
      h.shares += tx.shares
      h.avgCost = h.shares > 0 ? cost / h.shares : 0
    } else if (tx.type === 'sell') {
      // 賣超過持股數視為全部賣出,不產生負持股 ——
      // 資料輸入錯誤不該讓後面每一筆計算都跟著錯。
      const sold = Math.min(tx.shares, h.shares)
      h.realized += sold * tx.price - sold * h.avgCost - tx.fee - tx.tax
      h.shares -= sold
      if (h.shares === 0) h.avgCost = 0
    } else {
      h.dividends += tx.shares * tx.price - tx.fee - tx.tax
    }
    byCode.set(tx.code, h)
  }
  return byCode
}

export interface PortfolioSummary {
  /** 目前持股的市值 */
  marketValue: number
  /** 尚未回收的投入成本(持股數 × 平均成本) */
  costBasis: number
  unrealized: number
  realized: number
  dividends: number
  /** (市值 + 已實現 + 已領息 − 總投入) ÷ 總投入 */
  totalReturn: number | null
  xirr: number | null
}

/**
 * @param prices 目前價格。查不到的代號其市值以 0 計並回報,
 *               不靜默當成沒有持股 —— 那會讓總市值悄悄短少。
 */
export function summarize(
  txs: Transaction[],
  prices: Map<string, number>,
  today: string,
): PortfolioSummary & { missingPrices: string[] } {
  const holdings = buildHoldings(txs)
  let marketValue = 0
  let costBasis = 0
  let realized = 0
  let dividends = 0
  const missingPrices: string[] = []

  for (const h of holdings.values()) {
    realized += h.realized
    dividends += h.dividends
    if (h.shares <= 0) continue
    costBasis += h.shares * h.avgCost
    const px = prices.get(h.code)
    if (px === undefined) missingPrices.push(h.code)
    else marketValue += h.shares * px
  }

  // 總投入 = 所有買進付出的錢(含手續費)
  const invested = txs
    .filter((t) => t.type === 'buy')
    .reduce((s, t) => s + t.shares * t.price + t.fee, 0)

  const totalReturn = invested > 0
    ? (marketValue + realized + dividends - costBasis) / invested
    : null

  return {
    marketValue,
    costBasis,
    unrealized: marketValue - costBasis,
    realized,
    dividends,
    totalReturn,
    xirr: xirr(toCashFlows(txs, marketValue, today)),
    missingPrices,
  }
}

/**
 * 轉成 XIRR 的現金流。規格 §6.2:
 * 買入為負、賣出與配息為正、期末市值為正。
 */
export function toCashFlows(
  txs: Transaction[],
  marketValue: number,
  today: string,
): CashFlow[] {
  const flows: CashFlow[] = txs.map((t) => {
    if (t.type === 'buy') return { date: t.date, amount: -(t.shares * t.price + t.fee) }
    if (t.type === 'sell') return { date: t.date, amount: t.shares * t.price - t.fee - t.tax }
    return { date: t.date, amount: t.shares * t.price - t.fee - t.tax }
  })
  // 期末市值當成「今天全部賣掉會拿回多少」,讓未實現的部分也計入年化
  if (marketValue > 0) flows.push({ date: today, amount: marketValue })
  return flows
}
