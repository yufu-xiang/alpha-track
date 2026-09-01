/** 資產配置甜甜圈圖。超過六個主要分類後合併為「其他」。 */
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCompactMoney, formatPercent } from '../lib/format'
import { EmptyState } from './EmptyState'

const MAX_SLICES = 6

export interface Slice {
  label: string
  value: number
}

interface Props {
  slices: Slice[]
  /** 圖形本身無法傳達比例，必須提供螢幕閱讀器可讀的名稱。 */
  title: string
}

export function AllocationPie({ slices, title }: Props) {
  const positive = slices.filter((slice) => slice.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = positive.reduce((sum, slice) => sum + slice.value, 0)
  if (total <= 0) {
    return (
      <EmptyState
        marker="◎"
        title="目前還沒有持股"
        description="新增第一筆買進交易後，這裡會自動整理標的與分類占比。"
        action={<button type="button" onClick={() => {
          document.getElementById('new-transaction')?.scrollIntoView?.({
            behavior: 'smooth', block: 'start',
          })
        }}>新增第一筆交易</button>}
        compact
      />
    )
  }

  const shown = positive.slice(0, MAX_SLICES)
  const restValue = positive.slice(MAX_SLICES).reduce((sum, slice) => sum + slice.value, 0)
  const parts = (restValue > 0
    ? [...shown, { label: '其他', value: restValue }]
    : shown).map((part, index) => ({
      ...part,
      share: part.value / total,
      index,
    }))

  return (
    <figure className="pie">
      <div className="pie__visual" role="img" aria-label={title}>
        <ResponsiveContainer width="100%" height={220} minWidth={0}
                             initialDimension={{ width: 220, height: 220 }}>
          <PieChart>
            <Pie data={parts} dataKey="value" nameKey="label"
                 cx="50%" cy="50%" innerRadius="61%" outerRadius="88%"
                 startAngle={90} endAngle={-270} paddingAngle={parts.length > 1 ? 2 : 0}
                 stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
              {parts.map((part) => (
                <Cell key={part.label}
                      className={`pie__slice ${part.label === '其他'
                        ? 'pie__slice--rest'
                        : `pie__slice--s${part.index % 6}`}`}
                      fill={part.label === '其他'
                        ? 'var(--fg-muted)'
                        : part.index === 5 ? 'var(--accent)' : `var(--s${part.index % 5})`} />
              ))}
            </Pie>
            <Tooltip cursor={false} content={({ active, payload }) => {
              const item = payload?.[0]
              const value = Number(item?.value)
              if (!active || !item || !Number.isFinite(value)) return null
              return (
                <div className="chart-popover" role="status">
                  <p className="chart-popover__date">{String(item.name)}</p>
                  <strong>{formatPercent(value / total).replace('+', '')}</strong>
                  <small>{formatCompactMoney(value)}</small>
                </div>
              )
            }} />
            <text x="50%" y="47%" textAnchor="middle" className="pie__center-label">總市值</text>
            <text x="50%" y="57%" textAnchor="middle" className="pie__center-value">
              {formatCompactMoney(total)}
            </text>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <figcaption>
        <ul className="pie__legend">
          {parts.map((part) => (
            <li key={part.label}>
              <span className={`chart__key ${part.label === '其他'
                ? 'chart__key--rest'
                : `chart__key--s${part.index % 6}`}`}>
                {part.label}
              </span>
              <span className="pie__share">{formatPercent(part.share).replace('+', '')}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}
