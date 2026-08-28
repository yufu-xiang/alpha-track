/**
 * 資產配置圓餅。規格 §6.6:可切「依標的」或「依分類」。
 *
 * 圓餅只適合「部分佔整體」且分類不多的情況 —— 這正是資產配置。
 * 超過 6 塊就併成「其他」:再多的扇形人眼分不出大小,也排不下標籤。
 * 顏色沿用比較圖那組驗證過的 Okabe-Ito;第 7 塊起用中性灰,
 * 因為「其他」不是一個實體,不該和真正的持股搶識別度。
 */
import { formatPercent } from '../lib/format'
import { EmptyState } from './EmptyState'

const MAX_SLICES = 6

export interface Slice {
  label: string
  value: number
}

interface Props {
  slices: Slice[]
  /** 圓餅在螢幕閱讀器上是無意義的圖形,必須有文字說明 */
  title: string
}

export function AllocationPie({ slices, title }: Props) {
  const positive = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value)
  const total = positive.reduce((s, x) => s + x.value, 0)
  if (total <= 0) {
    return (
      <EmptyState
        marker="◎"
        title="目前還沒有持股"
        description="新增第一筆買進交易後，這裡會自動整理標的與分類占比。"
        action={<a href="#new-transaction">新增第一筆交易</a>}
        compact
      />
    )
  }

  const shown = positive.slice(0, MAX_SLICES)
  const restValue = positive.slice(MAX_SLICES).reduce((s, x) => s + x.value, 0)
  const parts = restValue > 0 ? [...shown, { label: '其他', value: restValue }] : shown

  let angle = -Math.PI / 2      // 自十二點鐘方向開始,符合閱讀直覺
  const arcs = parts.map((p, i) => {
    const span = (p.value / total) * Math.PI * 2
    const d = arcPath(60, 60, 55, angle, angle + span)
    angle += span
    return { ...p, d, share: p.value / total, idx: i }
  })

  return (
    <figure className="pie">
      <svg viewBox="0 0 120 120" role="img" aria-label={title} className="pie__svg">
        {arcs.map((a) => (
          <path key={a.label} d={a.d}
                className={`pie__slice ${a.label === '其他' ? 'pie__slice--rest' : `pie__slice--s${a.idx % 6}`}`} />
        ))}
      </svg>
      <figcaption>
        <ul className="pie__legend">
          {arcs.map((a) => (
            <li key={a.label}>
              <span className={`chart__key ${a.label === '其他' ? 'chart__key--rest' : `chart__key--s${a.idx % 6}`}`}>
                {a.label}
              </span>
              <span className="pie__share">{formatPercent(a.share).replace('+', '')}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}

/** 單一扇形的 path。整圓要特別處理 —— 起訖點重合時 arc 會畫不出來。 */
function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  if (to - from >= Math.PI * 2 - 1e-9) {
    // 只有一檔持股時是整個圓,用兩個半圓拼起來
    return `M${cx},${cy - r} A${r},${r} 0 1 1 ${cx},${cy + r} A${r},${r} 0 1 1 ${cx},${cy - r} Z`
  }
  const x1 = cx + r * Math.cos(from)
  const y1 = cy + r * Math.sin(from)
  const x2 = cx + r * Math.cos(to)
  const y2 = cy + r * Math.sin(to)
  const large = to - from > Math.PI ? 1 : 0
  return `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} ` +
         `A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`
}
