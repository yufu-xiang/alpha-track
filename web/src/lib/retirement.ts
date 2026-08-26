/**
 * 退休提領與蒙地卡羅。規格 §7.2、§7.3。
 *
 * §7.3 開宗明義:「**這是本專案最容易產生「自信但錯誤」結果的功能。**」
 * 台股多數 ETF 只有 5 年內歷史,拿它模擬 30 年退休期間在統計上無效 ——
 * 會產生一條外觀精美、實則無意義的成功率曲線,而使用者可能據此做出
 * 重大財務決定。因此:
 *
 *   - 結果一律以百分位區間呈現,**不給單一數字**
 *   - 一律回報樣本年數,由 UI 在不足 10 年時顯著警告
 *   - 不提供「建議提領率」這類規範性建議 —— 工具呈現計算,決策在使用者
 */

export interface WithdrawalInput {
  /** 起始資產 */
  initial: number
  /** 第一年的提領金額 */
  annualWithdrawal: number
  /** 年化名目報酬 */
  annualReturn: number
  /** 年通膨率,提領金額逐年跟著調整 */
  inflation: number
  years: number
}

export interface WithdrawalYear {
  year: number
  /** 該年提領金額(已隨通膨調整) */
  withdrawal: number
  /** 年末餘額 */
  balance: number
}

/**
 * 固定報酬的提領試算(4% 法則那一類)。
 *
 * 提領發生在年初、報酬計入年末 —— 這是保守的假設:錢先離開,剩下的才
 * 參與市場。反過來算會系統性高估可支撐年數。
 */
export function simulateWithdrawal(input: WithdrawalInput): WithdrawalYear[] {
  const out: WithdrawalYear[] = []
  let balance = input.initial
  for (let y = 1; y <= input.years; y += 1) {
    const withdrawal = input.annualWithdrawal * (1 + input.inflation) ** (y - 1)
    balance -= withdrawal
    if (balance <= 0) {
      out.push({ year: y, withdrawal, balance: 0 })
      break
    }
    balance *= 1 + input.annualReturn
    out.push({ year: y, withdrawal, balance })
  }
  return out
}

/** 資產可支撐幾年;整段期間都沒耗盡則回傳 null(代表「撐過試算期間」)。 */
export function yearsUntilDepleted(input: WithdrawalInput): number | null {
  const path = simulateWithdrawal(input)
  const last = path[path.length - 1]
  if (!last || last.balance > 0) return null
  return last.year
}

export interface MonteCarloInput {
  initial: number
  annualWithdrawal: number
  inflation: number
  years: number
  runs: number
  /** 產生單一年度報酬的函式,由呼叫端決定是 bootstrap 還是參數化 */
  drawReturn: () => number
}

export interface MonteCarloResult {
  /** 退休金未耗盡的比率 */
  successRate: number
  /** 各年度的餘額百分位。規格 §7.3:結果一律以區間呈現,不給單一數字。 */
  percentiles: { year: number; p10: number; p50: number; p90: number }[]
  runs: number
}

export function monteCarlo(input: MonteCarloInput): MonteCarloResult {
  const balancesByYear: number[][] = Array.from({ length: input.years }, () => [])
  let survived = 0

  for (let r = 0; r < input.runs; r += 1) {
    let balance = input.initial
    let alive = true
    for (let y = 1; y <= input.years; y += 1) {
      if (alive) {
        balance -= input.annualWithdrawal * (1 + input.inflation) ** (y - 1)
        if (balance <= 0) { balance = 0; alive = false }
        else balance *= 1 + input.drawReturn()
      }
      balancesByYear[y - 1]!.push(balance)
    }
    if (alive) survived += 1
  }

  return {
    successRate: input.runs > 0 ? survived / input.runs : 0,
    runs: input.runs,
    percentiles: balancesByYear.map((vals, i) => {
      const sorted = [...vals].sort((a, b) => a - b)
      return {
        year: i + 1,
        p10: percentile(sorted, 0.1),
        p50: percentile(sorted, 0.5),
        p90: percentile(sorted, 0.9),
      }
    }),
  }
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * q
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

/**
 * 自歷史年報酬抽樣(bootstrap)。規格 §7.3 的模式一。
 *
 * 有放回抽樣:每一年獨立自歷史分布抽一個報酬。這會**打散順序**,
 * 因此模擬不出「連續數年下跌」這種真實的序列相關性 —— 是這個方法
 * 公認的限制,UI 必須說明,不能讓使用者以為它涵蓋了所有情境。
 */
export function bootstrapSampler(historicalReturns: number[], rand = Math.random) {
  if (historicalReturns.length === 0) {
    throw new Error('bootstrap 需要至少一個歷史年報酬')
  }
  return () => historicalReturns[Math.floor(rand() * historicalReturns.length)]!
}

/**
 * 常態分布抽樣(參數化)。規格 §7.3 的模式二。
 *
 * Box-Muller。實際市場報酬有肥尾與偏態,常態分布會**低估極端情境**的
 * 機率 —— 這也是為什麼 UI 必須標示「此為假設推演,非預測」。
 */
export function normalSampler(mean: number, stdev: number, rand = Math.random) {
  return () => {
    const u1 = Math.max(rand(), 1e-12)
    const u2 = rand()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    return mean + stdev * z
  }
}

/**
 * 由日收盤序列推出各年度報酬,供 bootstrap 使用。
 *
 * 兩個看似瑣碎、實則會污染抽樣池的細節:
 *
 * 1. **只採計完整年度**。序列的最後一年幾乎必定是半截的(今天是 8 月,
 *    2026 只有 1–8 月)。把那 8 個月當成一個「年度報酬」丟進池子,
 *    等於混入一個尺度不同的樣本,而且會讓「本模擬基於 N 年」多報一年。
 *    判準是該年最後一筆落在 12 月。
 * 2. **報酬跨年計算**(前一年年末 → 今年年末),不是年初→年末。
 *    後者會漏掉 12/31 到 1/1 之間那一段,於是各年報酬連乘起來
 *    對不上實際總報酬。
 *
 * 年度之間若有斷層(缺一整年)就跳過該組,不把兩年的報酬當成一年。
 */
export function annualReturnsFrom(
  points: { date: string; value: number }[],
): { returns: number[]; years: number } {
  const yearEnd = new Map<number, { month: string; value: number }>()
  for (const p of points) {
    const year = Number(p.date.slice(0, 4))
    const month = p.date.slice(5, 7)
    const seen = yearEnd.get(year)
    if (!seen || month >= seen.month) yearEnd.set(year, { month, value: p.value })
  }

  const years = [...yearEnd.keys()].sort((a, b) => a - b)
  const returns: number[] = []
  for (const year of years) {
    const end = yearEnd.get(year)!
    const prev = yearEnd.get(year - 1)
    // 本年必須收滿到 12 月;前一年也必須是完整年度,否則基期不是年末。
    if (end.month !== '12' || !prev || prev.month !== '12' || prev.value <= 0) continue
    returns.push(end.value / prev.value - 1)
  }
  return { returns, years: returns.length }
}
