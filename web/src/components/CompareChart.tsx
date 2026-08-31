/** 多檔 ETF 共同區間走勢。每條線同日起點標準化為 100。 */
import { useMemo, useState } from 'react'
import {
  CartesianGrid, Curve, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { commonWindow, normalizeWithin, type ChartPoint } from '../lib/chart'
import { formatDate, formatPercent } from '../lib/format'
import type { Series } from '../types'
import { ChartTooltip } from './ChartTooltip'
import { CHART_RANGES } from './PriceChart'

/** 顏色之外的第二重編碼，讓色覺障礙使用者也能分辨各線。 */
export const DASHES = ['none', '7 4', '3 3', '10 3 2 3', '2 5'] as const

export interface CompareSeries {
  code: string
  name: string
  series: Series
}

interface Props {
  items: CompareSeries[]
}

type ComparePoint = { day: number; date: string } & Record<string, number | string>

export function CompareChart({ items }: Props) {
  const [rangeIdx, setRangeIdx] = useState(0)
  const range = CHART_RANGES[rangeIdx]!

  const model = useMemo(() => {
    const win = commonWindow(items.map((it) => it.series), range.days)
    if (!win) return null

    const lines = items
      .map((it) => ({ ...it, points: normalizeWithin(it.series, win.from, win.to) }))
      .filter((line) => line.points.length > 0)
    if (lines.length === 0) return null

    const byDay = new Map<number, ComparePoint>()
    lines.forEach((line) => {
      line.points.forEach((point) => {
        const row = byDay.get(point.day) ?? {
          day: point.day,
          date: dayToIso(point.day),
        }
        row[line.code] = point.value
        byDay.set(point.day, row)
      })
    })
    const data = [...byDay.values()].sort((a, b) => a.day - b.day)
    const values = lines.flatMap((line) => line.points.map((point) => point.value))
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const pad = (hi - lo) * 0.08 || 1
    const ranked = lines
      .map((line) => ({
        code: line.code,
        name: line.name,
        value: lastValue(line.points) / 100 - 1,
      }))
      .sort((a, b) => b.value - a.value)

    return {
      lines,
      data,
      from: win.from,
      to: win.to,
      domain: [lo - pad, hi + pad] as [number, number],
      ranked,
    }
  }, [items, range.days])

  if (!model) {
    return (
      <p className="chart-empty">
        選取的標的沒有共同的資料區間，無法在同一個起點比較。
      </p>
    )
  }

  return (
    <figure className="chart chart--featured">
      <div className="chart-toolbar">
        <div className="chart__ranges" role="toolbar" aria-label="選擇比較圖區間">
          {CHART_RANGES.map((r, i) => (
            <button key={r.label} type="button" aria-pressed={i === rangeIdx}
                    onClick={() => setRangeIdx(i)}>{r.label}</button>
          ))}
        </div>
        <div className="chart-leader">
          <span>區間領先</span>
          <strong>{model.ranked[0]!.code}</strong>
          <b className={tone(model.ranked[0]!.value)}>{formatPercent(model.ranked[0]!.value)}</b>
        </div>
      </div>

      <div className="chart-canvas" role="img"
           aria-label={`${model.lines.map((line) => line.name).join('、')}的走勢比較，皆標準化為起點 100`}>
        <ResponsiveContainer width="100%" height={360} minWidth={0}
                             initialDimension={{ width: 760, height: 360 }}>
          <LineChart data={model.data} margin={{ top: 16, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
            <XAxis dataKey="day" type="number" domain={['dataMin', 'dataMax']}
                   tickFormatter={(day) => dayToIso(Number(day)).slice(0, 7).replace('-', '/')}
                   tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                   axisLine={false} tickLine={false} minTickGap={48} />
            <YAxis domain={model.domain} width={43}
                   tickFormatter={(value) => Number(value).toFixed(0)}
                   tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                   axisLine={false} tickLine={false} tickCount={5} />
            <Tooltip content={
              <ChartTooltip
                formatLabel={(day) => formatDate(dayToIso(Number(day)))}
                formatValue={(value) => formatPercent(value / 100 - 1)}
              />
            } cursor={{ stroke: 'var(--fg-muted)', strokeDasharray: '3 4' }} />
            {model.lines.map((line, index) => (
              <Line key={line.code}
                    type="linear" dataKey={line.code} name={`${line.code} ${line.name}`}
                    stroke={`var(--s${index})`} strokeWidth={2.3}
                    shape={(props) => (
                      <Curve {...props} className={`chart__line chart__line--s${index}`}
                             strokeDasharray={DASHES[index]} />
                    )}
                    dot={false} activeDot={{ r: 4 }}
                    connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="chart__legend chart__legend--comparison">
        {model.ranked.map((line) => {
          const index = model.lines.findIndex((item) => item.code === line.code)
          return (
            <span key={line.code} className={`chart__key chart__key--s${index}`}>
              <span className="sr-only">{line.name} {formatPercent(line.value)}</span>
              {line.code} {line.name} <strong className={tone(line.value)}>{formatPercent(line.value)}</strong>
            </span>
          )
        })}
        <span className="chart__note">
          自 {formatDate(dayToIso(model.from))} 起標準化為 100 · 至 {formatDate(dayToIso(model.to))}
        </span>
      </figcaption>
    </figure>
  )
}

function dayToIso(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10)
}

function lastValue(points: ChartPoint[]): number {
  return points[points.length - 1]?.value ?? 100
}

function tone(value: number): string {
  return value === 0 ? '' : value > 0 ? 'gain' : 'loss'
}
