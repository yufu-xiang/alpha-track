/**
 * 股息再投入試算。規格 §7.2:配息再投入與不再投入的長期差異,使用實際配息資料。
 *
 * **必須用未還原收盤價。** 還原價本身就已假設配息再投入,拿它算再投入
 * 等於把配息算兩次,而且兩條線會完全重疊 —— 看起來像程式壞了,
 * 實際上是資料用錯。
 */

export interface PricePoint {
  /** ISO 日期 */
  date: string
  /** 未還原收盤價 */
  close: number
}

export interface DividendEvent {
  ex_date: string
  /** 已換算到價格序列尺度的每股配息(契約的 amount_adj)。 */
  amount: number
  /** 換算倍率是否確定。false 時呼叫端應提醒使用者結果可能不準。 */
  scaleKnown?: boolean
}

export interface ReinvestResult {
  /** 再投入的期末總值 */
  reinvested: number
  /** 不再投入的期末總值(持股市值 + 累積現金) */
  cashOut: number
  /** 不再投入時累積領到的現金 */
  totalDividends: number
  /** 起始股數 */
  initialShares: number
  /** 再投入後的期末股數 */
  finalShares: number
  /** 實際納入計算的配息次數 */
  events: number
  /** 落在持有期間之外、因而未納入的配息次數 */
  skipped: number
}

/**
 * 以 `initial` 元在第一個交易日買進,比較兩條路徑到最後一個交易日。
 *
 * 再投入的股數在除息日以**當日收盤價**買進。真實情況是配息要等到發放日
 * 才拿得到、且可能有匯費與零股問題;這裡不模擬那些,因為它們是雜訊,
 * 而這個工具要回答的是「再投入與不再投入的量級差多少」。
 */
export function compareReinvestment(
  prices: PricePoint[],
  dividends: DividendEvent[],
  initial: number,
): ReinvestResult | null {
  const first = prices[0]
  const last = prices[prices.length - 1]
  if (!first || !last || first.close <= 0) return null

  const initialShares = initial / first.close
  let shares = initialShares
  let cash = 0
  let events = 0
  let skipped = 0

  // 由舊到新處理:再投入是複利,順序反了會算錯。
  const sorted = [...dividends].sort((a, b) => a.ex_date.localeCompare(b.ex_date))
  for (const d of sorted) {
    // 除息日當天可能不在序列裡(停牌、或序列是月頻)。取除息日**當天或
    // 之後**的第一筆價格;完全沒有後續價格就代表這次配息落在持有期間
    // 之外,略過並計數 —— 靜默丟掉會讓「配息次數」與實際不符。
    const at = prices.find((p) => p.date >= d.ex_date)
    if (!at || d.ex_date < first.date || at.close <= 0) { skipped += 1; continue }
    cash += shares * d.amount
    shares += (shares * d.amount) / at.close
    events += 1
  }

  return {
    reinvested: shares * last.close,
    cashOut: initialShares * last.close + cash,
    totalDividends: cash,
    initialShares,
    finalShares: shares,
    events,
    skipped,
  }
}
