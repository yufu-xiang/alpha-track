/** 折溢價走勢：零軸固定置中，上方溢價、下方折價。 */
import { useMemo } from 'react'
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatDate, formatPercent } from '../lib/format'
import type { PremiumSeries } from '../types'
import { ChartTooltip } from './ChartTooltip'

const MIN_HALF_RANGE = 0.005

interface Props {
  series: PremiumSeries
  name: string
  sample: number
}

export function PremiumChart({ series, name, sample }: Props) {
  const model = useMemo(() => {
    if (!series?.start || !series.premium?.length) return null
    const base = Date.parse(`${series.start}T00:00:00Z`)
    const data = series.premium.map((value, index) => ({
      day: series.days[index]!,
      value,
      date: new Date(base + series.days[index]! * 86_400_000).toISOString().slice(0, 10),
    }))
    const half = Math.max(MIN_HALF_RANGE, ...data.map((point) => Math.abs(point.value))) * 1.1
    const values = data.map((point) => point.value)
    return {
      data,
      half,
      current: data[data.length - 1]!.value,
      high: Math.max(...values),
      low: Math.min(...values),
    }
  }, [series])

  if (!model) {
    return (
      <p className="chart-empty">
        還沒有折溢價資料。淨值來源只有當日快照、沒有歷史，
        這條線自接上來源那天起逐日累積。
      </p>
    )
  }

  return (
    <figure className="chart chart--premium">
      <div className="chart-toolbar chart-toolbar--summary">
        <div className="chart-insights" aria-label="折溢價區間摘要">
          <span><small>最新</small><strong>{formatPercent(model.current)}</strong></span>
          <span><small>最高溢價</small><strong>{formatPercent(model.high)}</strong></span>
          <span><small>最深折價</small><strong>{formatPercent(model.low)}</strong></span>
        </div>
        <span className="chart-sample">累積 {sample} 個交易日</span>
      </div>

      <div className="chart-canvas" role="img"
           aria-label={`${name}的折溢價走勢，共 ${model.data.length} 個交易日`}>
        <ResponsiveContainer width="100%" height={270} minWidth={0}
                             initialDimension={{ width: 760, height: 270 }}>
          <AreaChart data={model.data} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="premium-split-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--premium-high)" stopOpacity={0.3} />
                <stop offset="49%" stopColor="var(--premium-high)" stopOpacity={0.05} />
                <stop offset="51%" stopColor="var(--premium-low)" stopOpacity={0.05} />
                <stop offset="100%" stopColor="var(--premium-low)" stopOpacity={0.28} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
            <XAxis dataKey="day" type="number" domain={['dataMin', 'dataMax']}
                   tickFormatter={(day) => dayToLabel(series.start!, Number(day))}
                   tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                   axisLine={false} tickLine={false} minTickGap={48} />
            <YAxis domain={[-model.half, model.half]} width={51}
                   ticks={[-model.half, -model.half / 2, 0, model.half / 2, model.half]}
                   tickFormatter={(value) => `${(Number(value) * 100).toFixed(1)}%`}
                   tick={{ fill: 'var(--fg-muted)', fontSize: 11 }}
                   axisLine={false} tickLine={false} />
            <ReferenceLine y={0} className="chart__zero" stroke="var(--fg-muted)"
                           strokeWidth={1.5} />
            <Tooltip content={
              <ChartTooltip
                formatLabel={(day) => formatDate(dayToIso(series.start!, Number(day)))}
                formatValue={(value) => `${formatPercent(value)}${value > 0 ? ' · 溢價' : value < 0 ? ' · 折價' : ''}`}
              />
            } cursor={{ stroke: 'var(--fg-muted)', strokeDasharray: '3 4' }} />
            <Area className="chart__line premium__line" type="linear" dataKey="value"
                  name="折溢價" stroke="var(--premium-line)" strokeWidth={2.4}
                  fill="url(#premium-split-gradient)" dot={model.data.length === 1 ? { r: 4 } : false}
                  activeDot={{ r: 4 }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="chart__legend">
        <span className="chart__key chart__key--premium">折溢價</span>
        <span className="chart__note">
          零線代表市價等於淨值；上方為溢價，下方為折價。
        </span>
      </figcaption>
    </figure>
  )
}

function dayToIso(start: string, day: number): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + day * 86_400_000)
    .toISOString().slice(0, 10)
}

function dayToLabel(start: string, day: number): string {
  return dayToIso(start, day).slice(0, 7).replace('-', '/')
}
