/**
 * 走勢圖。內嵌 SVG,不用圖表套件 —— 兩條折線不值得 100 KB 的相依。
 *
 * 兩條線一律標準化為起點 100(見 lib/chart.ts)。**絕不用雙 Y 軸**:
 * 兩個刻度可以任意縮放,看起來的「交叉」由刻度決定而非資料。
 *
 * 配色取自 dataviz 參考調色盤的插槽 1(藍)與 5(洋紅),已用驗證器確認
 * 淺色與深色兩種底色都通過 —— 我原本想用的藍+紫在深色模式是 hard fail
 * (ΔE 9.8,低於 15 的可辨識門檻)。基準線另加虛線與較細線寬,
 * 由線型承擔「這是參考線不是對手」的層級,顏色只負責辨識。
 */
import { useMemo, useState } from 'react'
import { alignBenchmark, normalize, sliceSeries, toPath, type ChartPoint } from '../lib/chart'
import { formatDate, formatPercent } from '../lib/format'
import type { BenchmarkSeries, Series } from '../types'

const BOX = { width: 760, height: 300, padX: 44, padY: 16 }

export const CHART_RANGES = [
  { label: '一年', days: 365 },
  { label: '三年', days: 365 * 3 },
  { label: '五年', days: 365 * 5 },
  { label: '全部', days: null },
] as const

interface Props {
  series: Series
  benchmark?: BenchmarkSeries | null
  name: string
}

export function PriceChart({ series, benchmark, name }: Props) {
  const [rangeIdx, setRangeIdx] = useState(0)
  const [hover, setHover] = useState<number | null>(null)
  const range = CHART_RANGES[rangeIdx]!

  const model = useMemo(() => {
    const own = sliceSeries(series, range.days)
    const main = normalize(own.days, own.values, series.start)
    if (main.points.length === 0) return null

    const from = own.days[0]!
    const to = own.days[own.days.length - 1]!
    let bench: ChartPoint[] = []
    if (benchmark && series.start) {
      const aligned = alignBenchmark(benchmark, series.start, from, to)
      bench = normalize(aligned.days, aligned.values, series.start).points
    }

    const all = [...main.points, ...bench]
    const values = all.map((p) => p.value)
    // 上下各留 4% 餘裕,線才不會貼著邊框
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const pad = (hi - lo) * 0.04 || 1
    return {
      main: main.points,
      bench,
      startDate: main.startDate,
      endDate: main.endDate,
      domain: { minDay: from, maxDay: to, minValue: lo - pad, maxValue: hi + pad },
    }
  }, [series, benchmark, range.days])

  if (!model) {
    return <p className="chart-empty">這個區間沒有足夠的價格資料。</p>
  }

  const { domain } = model
  const innerW = BOX.width - BOX.padX * 2
  const innerH = BOX.height - BOX.padY * 2
  const xOf = (day: number) =>
    BOX.padX + ((day - domain.minDay) / (domain.maxDay - domain.minDay || 1)) * innerW
  const yOf = (v: number) =>
    BOX.padY + innerH - ((v - domain.minValue) / (domain.maxValue - domain.minValue || 1)) * innerH

  // 四條水平參考線就夠;更多只是雜訊
  const ticks = [0, 1, 2, 3].map((i) =>
    domain.minValue + ((domain.maxValue - domain.minValue) * i) / 3)

  const hovered = hover === null ? null : model.main[hover] ?? null
  const hoveredBench = hovered
    ? model.bench.reduce<ChartPoint | null>(
        (best, p) =>
          best && Math.abs(best.day - hovered.day) <= Math.abs(p.day - hovered.day) ? best : p,
        null)
    : null

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const day = domain.minDay + ratio * (domain.maxDay - domain.minDay)
    // 找最接近的資料點,而不是插值 —— tooltip 要顯示真實存在的那一天
    let best = 0
    for (let i = 1; i < model!.main.length; i += 1) {
      if (Math.abs(model!.main[i]!.day - day) < Math.abs(model!.main[best]!.day - day)) best = i
    }
    setHover(best)
  }

  return (
    <figure className="chart">
      <div className="chart__ranges" role="toolbar" aria-label="選擇走勢圖區間">
        {CHART_RANGES.map((r, i) => (
          <button key={r.label} type="button" aria-pressed={i === rangeIdx}
                  onClick={() => { setRangeIdx(i); setHover(null) }}>
            {r.label}
          </button>
        ))}
      </div>

      <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} className="chart__svg"
           role="img"
           aria-label={`${name}的還原價走勢,標準化為起點 100${model.bench.length ? ',並疊加加權報酬指數' : ''}`}
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart__grid" x1={BOX.padX} x2={BOX.width - BOX.padX}
                  y1={yOf(t)} y2={yOf(t)} />
            <text className="chart__tick" x={BOX.padX - 6} y={yOf(t) + 4} textAnchor="end">
              {t.toFixed(0)}
            </text>
          </g>
        ))}

        {model.bench.length > 0 && (
          <path className="chart__line chart__line--bench"
                d={toPath(model.bench, BOX, domain)} />
        )}
        <path className="chart__line chart__line--main" d={toPath(model.main, BOX, domain)} />

        {hovered && (
          <g>
            <line className="chart__crosshair" x1={xOf(hovered.day)} x2={xOf(hovered.day)}
                  y1={BOX.padY} y2={BOX.height - BOX.padY} />
            <circle className="chart__dot chart__dot--main"
                    cx={xOf(hovered.day)} cy={yOf(hovered.value)} r={4} />
            {hoveredBench && (
              <circle className="chart__dot chart__dot--bench"
                      cx={xOf(hoveredBench.day)} cy={yOf(hoveredBench.value)} r={4} />
            )}
          </g>
        )}

        <text className="chart__tick" x={BOX.padX} y={BOX.height - 2}>
          {formatDate(model.startDate)}
        </text>
        <text className="chart__tick" x={BOX.width - BOX.padX} y={BOX.height - 2}
              textAnchor="end">
          {formatDate(model.endDate)}
        </text>
      </svg>

      <figcaption className="chart__legend">
        <span className="chart__key chart__key--main">{name}</span>
        {model.bench.length > 0 && (
          <span className="chart__key chart__key--bench">加權報酬指數</span>
        )}
        <span className="chart__note">起點標準化為 100</span>
      </figcaption>

      {hovered && (
        <p className="chart__tooltip" role="status">
          {name} {formatPercent(hovered.value / 100 - 1)}
          {hoveredBench && <> · 大盤 {formatPercent(hoveredBench.value / 100 - 1)}</>}
        </p>
      )}
    </figure>
  )
}
