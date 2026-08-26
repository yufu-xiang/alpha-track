/**
 * 應領配息的自動推估。規格 §6.4。
 *
 * 規格對這件事的態度很明確:**推估值不是事實**。
 *
 * > 不視為事實的原因:實際入帳會扣除匯費與二代健保補充保費,
 * > 金額與對帳單不符。每筆推估配息提供編輯,填入實際入帳金額後轉為確定值。
 *
 * 因此這個模組回傳的每一筆都帶著毛額、預估扣繳、預估實收三個數字,
 * 讓使用者看得出差額從哪來,而不是給一個「大概是這樣」的淨額。
 *
 * ## 二代健保補充保費(2026-08-26 查證現行規定,未憑記憶填寫)
 *
 * - 費率 **2.11%**
 * - **單次給付**股利達 **20,000 元**才扣;未達不扣
 * - 2026 年仍維持單次給付制(年度結算制已由行政院指示暫緩)
 *
 * 已知未模擬的部分,UI 必須說明:
 * - **匯費**(各券商/股務代理不同,通常十元上下)
 * - 同一標的同年度分次配息,健保署可能**合併計算**是否達門檻。
 *   月配型 ETF 每次金額小、全年加總大,這一點的影響最大。
 * - 單次給付另有金額上限,超過部分不計 —— ETF 配息極少觸及,故不模擬。
 */
import type { Transaction } from './portfolio'

/** 二代健保補充保費費率。查證日期 2026-08-26。 */
export const NHI_PREMIUM_RATE = 0.0211

/** 單次給付的扣繳門檻。未達此金額不扣。 */
export const NHI_SINGLE_PAYMENT_THRESHOLD = 20_000

export interface DividendEvent {
  code: string
  ex_date: string
  pay_date: string | null
  /** 每股配息 */
  amount: number
}

export interface DividendEstimate {
  code: string
  ex_date: string
  pay_date: string | null
  amountPerShare: number
  /** 除息日**當天已持有**的股數 */
  shares: number
  /** 應領配息(毛額) */
  gross: number
  /** 預估二代健保補充保費 */
  nhiPremium: number
  /** 預估實收 */
  net: number
}

/**
 * 依除息日與當時持股推估應領配息。
 *
 * **除息日當天買進不算。** 台股要在除息日前一交易日收盤時就持有,
 * 才領得到這次配息。用 `<=` 會讓當天才買的人也被算進去,
 * 而那筆錢實際上不會入帳 —— 對不上對帳單正是這個功能最該避免的事。
 *
 * 已經自己記過同一檔、同一除息日配息的,不再推估 —— 否則會重複計算,
 * 而使用者手動記的那筆才是實際入帳金額。
 */
export function estimateDividends(
  txs: Transaction[],
  events: DividendEvent[],
): DividendEstimate[] {
  const recorded = new Set(
    txs.filter((t) => t.type === 'dividend').map((t) => `${t.code}@${t.date}`),
  )

  const out: DividendEstimate[] = []
  for (const ev of events) {
    if (recorded.has(`${ev.code}@${ev.ex_date}`)) continue

    // 嚴格小於除息日 —— 見上面的說明
    let shares = 0
    for (const t of txs) {
      if (t.code !== ev.code || t.date >= ev.ex_date) continue
      if (t.type === 'buy') shares += t.shares
      else if (t.type === 'sell') shares -= t.shares
    }
    if (shares <= 0) continue

    const gross = shares * ev.amount
    const nhiPremium = gross >= NHI_SINGLE_PAYMENT_THRESHOLD
      ? gross * NHI_PREMIUM_RATE
      : 0
    out.push({
      code: ev.code,
      ex_date: ev.ex_date,
      pay_date: ev.pay_date,
      amountPerShare: ev.amount,
      shares,
      gross,
      nhiPremium,
      net: gross - nhiPremium,
    })
  }

  // 新到舊:最近一次配息是最常要對帳的那一筆
  return out.sort((a, b) => b.ex_date.localeCompare(a.ex_date))
}

/** 把一筆推估轉成可寫入的交易紀錄。金額留空時採用預估實收。 */
export function toTransaction(
  est: DividendEstimate,
  actualNet: number | null,
  id: string,
): Transaction {
  const net = actualNet ?? est.net
  return {
    id,
    type: 'dividend',
    code: est.code,
    // 記在**發放日**:那才是錢實際入帳的日子,XIRR 要的是這個。
    // 除息日只是決定「誰領得到」。發放日未知時退回除息日。
    date: est.pay_date ?? est.ex_date,
    shares: est.shares,
    price: est.amountPerShare,
    // 毛額與實收的差額記為費用,讓 shares × price − fee 等於實收金額。
    // 取到分為止:浮點相減會留下 1139.4000000000015 這種殘渣,
    // 而這個數字會原封不動進到匯出檔裡。
    fee: Math.round((est.shares * est.amountPerShare - net) * 100) / 100,
    tax: 0,
    estimated: actualNet === null,
  }
}
