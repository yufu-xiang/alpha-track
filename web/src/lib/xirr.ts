/**
 * XIRR —— 不規則現金流的年化報酬率。規格 §6.2。
 *
 * 為什麼不能用單純的總報酬率:同樣 20% 的報酬,三年前投入與上月投入
 * 意義截然不同。XIRR 讓每一筆資金按它實際待在市場裡的時間計價。
 *
 * 解法是 Newton-Raphson,失敗時退回二分法。純 Newton 對這類函式並不可靠:
 * 現金流不規則時 NPV 的導數可能極小,一步就跳到 -1 以下(年化報酬 -100%
 * 以下無意義)或發散。二分法慢但只要區間內有根就一定收斂。
 */

export interface CashFlow {
  /** ISO 日期 */
  date: string
  /** 流出為負(買進)、流入為正(賣出、配息、期末市值) */
  amount: number
}

const DAY = 86_400_000
const MAX_RATE = 1e6      // 上界:年化 100000 倍,超過即視為無意義
const MIN_RATE = -0.999999

function npv(flows: { years: number; amount: number }[], rate: number): number {
  return flows.reduce((sum, f) => sum + f.amount / (1 + rate) ** f.years, 0)
}

/**
 * 回傳年化報酬率(0.15 代表 15%),無解時回傳 null。
 *
 * 無解的常見情況:全部同號(只買沒賣也沒市值)、少於兩筆、
 * 或所有現金流同一天(無法年化)。這些回傳 null 而不是 0 ——
 * 0% 是「不賺不賠」,與「算不出來」是兩回事。
 */
export function xirr(cashFlows: CashFlow[]): number | null {
  if (cashFlows.length < 2) return null

  const times = cashFlows.map((f) => Date.parse(`${f.date}T00:00:00Z`))
  if (times.some(Number.isNaN)) return null
  const t0 = Math.min(...times)
  const flows = cashFlows.map((f, i) => ({
    years: (times[i]! - t0) / DAY / 365,
    amount: f.amount,
  }))

  const hasIn = flows.some((f) => f.amount > 0)
  const hasOut = flows.some((f) => f.amount < 0)
  if (!hasIn || !hasOut) return null
  if (flows.every((f) => f.years === flows[0]!.years)) return null

  // Newton-Raphson
  let rate = 0.1
  for (let i = 0; i < 60; i += 1) {
    const f = npv(flows, rate)
    if (Math.abs(f) < 1e-9) return clean(rate)
    const d = flows.reduce(
      (sum, x) => sum - (x.years * x.amount) / (1 + rate) ** (x.years + 1), 0)
    if (!Number.isFinite(d) || Math.abs(d) < 1e-12) break
    const next = rate - f / d
    if (!Number.isFinite(next) || next <= MIN_RATE || next > MAX_RATE) break
    if (Math.abs(next - rate) < 1e-10) return clean(next)
    rate = next
  }

  // 退回二分法:先找出讓 NPV 變號的區間
  let lo = MIN_RATE
  let hi = MAX_RATE
  const fLo = npv(flows, lo)
  const fHi = npv(flows, hi)
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2
    const fMid = npv(flows, mid)
    if (Math.abs(fMid) < 1e-9) return clean(mid)
    if (fLo * fMid < 0) hi = mid
    else lo = mid
  }
  return clean((lo + hi) / 2)
}

function clean(rate: number): number | null {
  return Number.isFinite(rate) ? rate : null
}
