/**
 * ETF 與大盤的標準化走勢圖。
 *
 * 資料計算仍由 lib/chart.ts 負責；Recharts 只處理響應式座標、互動與呈現。
 * 兩條線共用同一個 Y 軸且起點皆為 100，避免雙 Y 軸造成視覺誤導。
 */
import { useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { alignBenchmark, normalize, sliceSeries } from '../lib/chart'
import { formatDate, formatPercent } from '../lib/format'
import type { BenchmarkSeries, Series } from '../types'
import { ChartTooltip } from './ChartTooltip'

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

interface PricePoint {
  day: number
  date: string
  main: number
  benchmark?: number
}

const DAY = 86_400_000

export function PriceChart({ series, benchmark, name }: Props) {
  const [rangeIdx, setRangeIdx] = useState(0)
  const range = CHART_RANGES[rangeIdx]!

  const model = useMemo(() => {
    const own = sliceSeries(series, range.days)
    const main = normalize(own.days, own.values, series.start)
    if (main.points.length === 0 || !series.start) return null

    const from = own.days[0]!
    const to = own.days[own.days.length - 1]!
    const aligned = benchmark
      ? alignBenchmark(benchmark, series.start, from, to)
      : { days: [], values: [] }
    const bench = normalize(aligned.days, aligned.values, series.start)
    const benchByDay = new Map(bench.points.map((p) => [p.day, p.value]))
    const base = Date.parse(`${series.start}T00:00:00Z`)
    const data: PricePoint[] = main.points.map((p) => ({
      day: p.day,
      date: new Date(base + p.day * DAY).toISOString().slice(0, 10),
      main: p.value,
      benchmark: benchByDay.get(p.day),
    }))
    const values = [
      ...data.map((p) => p.main),
      ...data.flatMap((p) => p.benchmark === undefined ? [] : [p.benchmark]),
    ]
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const pad = (hi - lo) * 0.08 || 1
    const mainReturn = data[data.length - 1]!.main / 100 - 1
    const lastBench = [...data].reverse().find((p) => p.benchmark !== undefined)?.benchmark

    return {
      data,
      startDate: main.startDate,
      endDate: main.endDate,
      hasBenchmark: bench.points.length > 0,
      domain: [lo - pad, hi + pad] as [number, number],
      mainReturn,
      benchmarkReturn: lastBench === undefined ? null : lastBench / 100 - 1,
    }
  }, [series, benchmark, range.days])

  if (!model) {
    return <p className="chart-empty">這個區間沒有足夠的價格資料。</p>
  }

  return (
    <figure className="chart chart--featured">
      <div className="chart-toolbar">
        <div className="chart__ranges" role="toolbar" aria-label="選擇走勢圖區間">
          {CHART_RANGES.map((r, i) => (
            <button key={r.label} type="button" aria-pressed={i === rangeIdx}
                    onClick={() => setRangeIdx(i)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="chart-insights" aria-label="區間摘要">
          <span><small>{name}</small><strong className={tone(model.mainReturn)}>
            {formatPercent(model.mainReturn)}
          </strong></span>
          {model.benchmarkReturn !== null && (
            <span><small>大盤</small><strong className={tone(model.benchmarkReturn)}>
              {formatPercent(model.benchmarkReturn)}
            </strong></span>
          )}
          {model.benchmarkReturn !== null && (
            <span><small>超額</small><strong className={tone(model.mainReturn - model.benchmarkReturn)}>
              {formatPercent(model.mainReturn - model.benchmarkReturn)}
            </strong></span>
          )}
        </div>
      </div>

      <div className="chart-canvas" role="img"
           aria-label={`${name}的還原價走勢，標準化為起點 100${model.hasBenchmark ? '，並疊加加權報酬指數' : ''}`}>
        <ResponsiveContainer width="100%" height={340} minWidth={0}
                             initialDimension={{ width: 760, height: 340 }}>
          <AreaChart data={model.data} margin={{ top: 16, right: 12, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="price-main-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-main)" stopOpacity={0.28} />
                <stop offset="82%" stopColor="var(--chart-main)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
            <XAxis dataKey="day" type="number" domain={['dataMin', 'dataMax']}
                   tickFormatter={(day) => dayToLabel(series.start!, Number(day))}
                   tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                   axisLine={false} tickLine={false} minTickGap={48} />
            <YAxis domain={model.domain} width={43}
                   tickFormatter={(value) => Number(value).toFixed(0)}
                   tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                   axisLine={false} tickLine={false} tickCount={5} />
            <Tooltip content={
              <ChartTooltip
                formatLabel={(day) => formatDate(dayToIso(series.start!, Number(day)))}
                formatValue={(value) => formatPercent(value / 100 - 1)}
              />
            } cursor={{ stroke: 'var(--fg-muted)', strokeDasharray: '3 4' }} />
            <Area className="chart__line chart__line--main" type="linear" dataKey="main"
                  name={name} stroke="var(--chart-main)" strokeWidth={2.6}
                  fill="url(#price-main-gradient)" dot={false} activeDot={{ r: 4 }}
                  isAnimationActive={false} />
            {model.hasBenchmark && (
              <Line className="chart__line chart__line--bench" type="linear"
                    dataKey="benchmark" name="加權報酬指數"
                    stroke="var(--chart-bench)" strokeWidth={1.8} strokeDasharray="6 5"
                    dot={false} activeDot={{ r: 3 }} connectNulls isAnimationActive={false} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="chart__legend">
        <span className="sr-only">{formatDate(model.startDate)}</span>
        <span className="sr-only">{formatDate(model.endDate)}</span>
        <span className="chart__key chart__key--main">{name}</span>
        {model.hasBenchmark && (
          <span className="chart__key chart__key--bench">加權報酬指數</span>
        )}
        <span className="chart__note">
          {formatDate(model.startDate)}–{formatDate(model.endDate)} · 起點標準化為 100
        </span>
      </figcaption>
    </figure>
  )
}

function dayToIso(start: string, day: number): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + day * DAY).toISOString().slice(0, 10)
}

function dayToLabel(start: string, day: number): string {
  return dayToIso(start, day).slice(0, 7).replace('-', '/')
}

function tone(value: number): string {
  return value === 0 ? '' : value > 0 ? 'gain' : 'loss'
}
