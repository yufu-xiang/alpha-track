/**
 * 偵測「使用者沒記錄的股票分割」。
 *
 * ## 為什麼需要偵測,而不是直接拿一份分割表來套
 *
 * 沒有分割表可拿。實測(2026-08-27):
 *   - Yahoo chart API 即使帶 `events=div,split`,對 0050.TW 也回傳
 *     **零筆分割事件** —— 它默默調整了歷史卻不揭露。
 *   - 證交所的 TWT49U 是除權息表,不含受益權單位分割。
 *
 * 但有兩件我們確定知道的事:
 *   1. **使用者記的是當時的真實成交價**(對帳單上的數字)。
 *   2. **我方的價格序列已經被還原**(Yahoo 的 close 對歷史日期已除以分割倍率)。
 *
 * 兩者相除就是那個時點的累積分割倍率。實證:0050 在 2025-01-02 的
 * 證交所官方收盤是 194.05,我方序列是 48.5125,比值恰為 4.000。
 *
 * 只接受**乾淨的整數倍率**(或其倒數)。使用者打錯價格、或買在當天的
 * 高低點,比值不會剛好落在整數上;要求整數可以把那些排除掉。
 */

/** 可接受的分割倍率。台股的分割與反分割都落在這個範圍。 */
export const PLAUSIBLE_RATIOS = [2, 3, 4, 5, 6, 7, 8, 10] as const

/** 比值與整數倍率的容許偏差。買在當天高低點大約是 ±3–5%,故取 2%。 */
export const RATIO_TOLERANCE = 0.02

export interface SplitHint {
  code: string
  /** 推得的倍率:1:4 分割為 4,反分割 4:1 為 0.25 */
  ratio: number
  /** 最晚一筆尺度不符的交易日 */
  lastMismatch: string
  /** 建議的分割日:上述日期的隔天 —— 保證晚於所有不符的交易、
   *  且早於所有相符的交易(若有)。 */
  suggestedDate: string
  recordedPrice: number
  seriesPrice: number
  /** 有幾筆交易呈現同一個倍率 */
  count: number
}

interface Tx {
  type: string
  code: string
  date: string
  price: number
}

/**
 * @param priceOn 查某代號在某日的**已還原**價格;查不到回 null。
 */
export function detectSplits(
  txs: Tx[],
  priceOn: (code: string, date: string) => number | null,
): SplitHint[] {
  const byCode = new Map<string, SplitHint>()

  // 已記錄的分割要先扣掉,否則補完之後警告還會一直掛著 ——
  // 原始買價與序列價格的差距本來就不會因為補了一筆而消失,
  // 消失的是「這個差距無法解釋」這件事。
  const recorded = txs.filter((t) => t.type === 'split' && t.price > 0)

  for (const tx of txs) {
    if (tx.type !== 'buy' && tx.type !== 'sell') continue
    if (tx.price <= 0) continue
    const series = priceOn(tx.code, tx.date)
    if (series === null || series <= 0) continue

    // 這筆交易之後發生的分割,累積倍率
    const explained = recorded
      .filter((sp) => sp.code === tx.code && sp.date > tx.date)
      .reduce((acc, sp) => acc * sp.price, 1)

    const ratio = snapToSplitRatio(tx.price / series / explained)
    if (ratio === null) continue

    const prev = byCode.get(tx.code)
    // 同一檔可能有多筆不符。取**最晚**的那一筆決定建議日期,
    // 因為分割必定發生在所有不符的交易之後。
    if (!prev) {
      byCode.set(tx.code, {
        code: tx.code, ratio, lastMismatch: tx.date,
        suggestedDate: nextDay(tx.date),
        recordedPrice: tx.price, seriesPrice: series, count: 1,
      })
    } else if (prev.ratio === ratio) {
      prev.count += 1
      if (tx.date > prev.lastMismatch) {
        prev.lastMismatch = tx.date
        prev.suggestedDate = nextDay(tx.date)
        prev.recordedPrice = tx.price
        prev.seriesPrice = series
      }
    }
    // 同一檔出現兩種不同倍率時保留先前的那一筆:那通常代表多次分割,
    // 補一次之後重新偵測會再抓到下一次,一次補一個比較不會弄錯。
  }

  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))
}

/** 把比值對到乾淨的整數倍率(或其倒數);對不到回 null。 */
export function snapToSplitRatio(raw: number): number | null {
  if (!Number.isFinite(raw) || raw <= 0) return null
  for (const r of PLAUSIBLE_RATIOS) {
    if (Math.abs(raw / r - 1) <= RATIO_TOLERANCE) return r
    if (Math.abs(raw * r - 1) <= RATIO_TOLERANCE) return 1 / r
  }
  return null
}

function nextDay(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(t)) return iso
  return new Date(t + 86_400_000).toISOString().slice(0, 10)
}
