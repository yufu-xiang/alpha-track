/**
 * 走勢圖的資料整形。與繪製分離,可獨立測試。
 *
 * **兩條線一律標準化為起點 100。** 這不是美觀選擇:加權報酬指數在十萬點的
 * 量級,而 ETF 價格在幾十到幾百元 —— 直接疊圖的話,其中一條會是一直線。
 * 雙 Y 軸是常見的錯解:兩個刻度可以任意縮放,看起來的「交叉」全由刻度決定,
 * 而不是由資料決定。共同基準才能真的比較。
 */
import type { BenchmarkSeries, Series } from '../types'

export interface ChartPoint {
  /** 距序列起點的天數,供 x 軸定位 */
  day: number
  /** 標準化為起點 100 的值 */
  value: number
}

export interface ChartSeries {
  points: ChartPoint[]
  /** 這段區間的實際起訖日,供軸標籤使用 */
  startDate: string | null
  endDate: string | null
}

function toDate(start: string, offset: number): string {
  const d = new Date(`${start}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

/** 取序列最後 windowDays 個日曆天;windowDays 為 null 代表全部。 */
export function sliceSeries(
  series: Series | BenchmarkSeries,
  windowDays: number | null,
): { days: number[]; values: number[] } {
  const values = 'adj' in series ? series.adj : series.value
  if (!series.start || series.days.length === 0) return { days: [], values: [] }
  if (windowDays === null) return { days: [...series.days], values: [...values] }

  const lastDay = series.days[series.days.length - 1]!
  const cutoff = lastDay - windowDays
  const from = series.days.findIndex((d) => d >= cutoff)
  if (from < 0) return { days: [], values: [] }
  return { days: series.days.slice(from), values: values.slice(from) }
}

/** 標準化為起點 100。起點值為零或負時無法標準化,回傳空序列而非 NaN。 */
export function normalize(days: number[], values: number[], start: string | null): ChartSeries {
  if (days.length === 0 || !start) return { points: [], startDate: null, endDate: null }
  const base = values[0]!
  if (!(base > 0)) return { points: [], startDate: null, endDate: null }
  return {
    points: days.map((day, i) => ({ day, value: (values[i]! / base) * 100 })),
    startDate: toDate(start, days[0]!),
    endDate: toDate(start, days[days.length - 1]!),
  }
}

/**
 * 把基準線對齊到標的的區間。
 *
 * 兩者的起點日期不同(基準自 2016 起,ETF 可能更早或更晚),而 days 是各自
 * 相對自己 start 的位移 —— 直接拿去畫會整條錯位。這裡換算成同一個日期原點。
 */
export function alignBenchmark(
  benchmark: BenchmarkSeries,
  targetStart: string,
  fromDay: number,
  toDay: number,
): { days: number[]; values: number[] } {
  if (!benchmark.start || benchmark.days.length === 0) return { days: [], values: [] }
  const shift = Math.round(
    (Date.parse(`${benchmark.start}T00:00:00Z`) - Date.parse(`${targetStart}T00:00:00Z`))
    / 86_400_000,
  )
  const days: number[] = []
  const values: number[] = []
  benchmark.days.forEach((d, i) => {
    const aligned = d + shift
    if (aligned >= fromDay && aligned <= toDay) {
      days.push(aligned)
      values.push(benchmark.value[i]!)
    }
  })
  return { days, values }
}

/** SVG 折線的 path。空序列回傳空字串,呼叫端不必特別處理。 */
export function toPath(
  points: ChartPoint[],
  box: { width: number; height: number; padX: number; padY: number },
  domain: { minDay: number; maxDay: number; minValue: number; maxValue: number },
): string {
  if (points.length === 0) return ''
  const dayRange = domain.maxDay - domain.minDay || 1
  const valRange = domain.maxValue - domain.minValue || 1
  const innerW = box.width - box.padX * 2
  const innerH = box.height - box.padY * 2
  return points
    .map((p, i) => {
      const x = box.padX + ((p.day - domain.minDay) / dayRange) * innerW
      const y = box.padY + innerH - ((p.value - domain.minValue) / valRange) * innerH
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}
