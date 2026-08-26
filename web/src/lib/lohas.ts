/**
 * 樂活五線譜。規格 §7.2:以回歸線與標準差通道判斷相對位階。
 *
 * 作法:對**對數價格**做時間的線性回歸,取殘差標準差,畫出
 * 回歸線與 ±1σ、±2σ 共五條線。
 *
 * 用對數價格而非原始價格,是因為長期價格是幾何成長的:在原始價格上
 * 配一條直線,會讓同樣的百分比波動在高價區看起來比低價區大,
 * 於是通道在圖的右半邊被撐得過寬,左半邊被壓得過窄 ——
 * 「現在位階偏高還是偏低」的判斷會因此系統性偏向早期。
 *
 * 這是統計描述,不是預測。價格回到通道中線沒有任何機制保證。
 */

export interface LohasPoint {
  /** 距離序列起點的天數 */
  day: number
  price: number
}

export interface LohasBands {
  /** 回歸線在每個時點的值(已還原為價格尺度) */
  tl: number[]
  /** 由 +2σ 到 −2σ,共五條 */
  lines: { label: string; sigma: number; values: number[] }[]
  /** 最後一點落在幾個標準差的位置。正值代表高於回歸線。 */
  position: number
  /** 用於配適的資料點數 */
  count: number
  /** 涵蓋的年數 */
  years: number
}

const SIGMAS = [
  { label: '+2σ 樂觀', sigma: 2 },
  { label: '+1σ 相對高', sigma: 1 },
  { label: '趨勢線', sigma: 0 },
  { label: '−1σ 相對低', sigma: -1 },
  { label: '−2σ 悲觀', sigma: -2 },
]

export function fiveLines(points: LohasPoint[]): LohasBands | null {
  // 兩點必然完美配適,殘差為 0,通道會塌成一條線 —— 那不是「波動很小」,
  // 是樣本不足以估計波動。回 null 讓 UI 說明,而不是畫一張看似精確的圖。
  const usable = points.filter((p) => p.price > 0)
  if (usable.length < 3) return null

  const n = usable.length
  const xs = usable.map((p) => p.day)
  const ys = usable.map((p) => Math.log(p.price))
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n

  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - meanX
    sxx += dx * dx
    sxy += dx * (ys[i]! - meanY)
  }
  // 所有點同一天(理論上不會,但資料可能重複)—— 斜率無從定義。
  if (sxx === 0) return null

  const slope = sxy / sxx
  const intercept = meanY - slope * meanX
  const fitted = xs.map((x) => slope * x + intercept)

  // 除以 n−2:回歸用掉了兩個自由度。除以 n 會低估 σ,通道偏窄,
  // 於是「已到 +2σ」這種訊號出現得比實際頻繁。
  const sse = ys.reduce((acc, y, i) => acc + (y - fitted[i]!) ** 2, 0)
  const sigma = Math.sqrt(sse / (n - 2))

  const lines = SIGMAS.map((s) => ({
    label: s.label,
    sigma: s.sigma,
    values: fitted.map((f) => Math.exp(f + s.sigma * sigma)),
  }))

  const lastResidual = ys[n - 1]! - fitted[n - 1]!
  return {
    tl: fitted.map(Math.exp),
    lines,
    position: sigma > 0 ? lastResidual / sigma : 0,
    count: n,
    years: (xs[n - 1]! - xs[0]!) / 365.25,
  }
}

/** 把位階換成一句話。刻意不含「該買/該賣」——本站不給規範性建議。 */
export function describePosition(position: number): string {
  if (position >= 2) return '高於 +2σ,處於這段期間的相對高位'
  if (position >= 1) return '介於 +1σ 與 +2σ 之間,偏高'
  if (position > -1) return '在趨勢線附近的一個標準差內'
  if (position > -2) return '介於 −1σ 與 −2σ 之間,偏低'
  return '低於 −2σ,處於這段期間的相對低位'
}
