/**
 * 折溢價走勢圖。規格 §5.2 ②(台股 ETF 特有,外部網站少見)。
 *
 * 這張圖與價格走勢圖有一個關鍵差別:**零軸是有意義的**。
 * 折溢價的 0 代表「市價等於淨值」,是這個量唯一的自然基準,
 * 因此 y 軸一律含 0 且畫出零線,並且上下對稱 —— 讓 +1% 與 −1%
 * 在圖上離零線一樣遠。若讓範圍隨資料浮動,一段全是小幅溢價的期間
 * 會被拉伸成看起來劇烈波動,而那正是使用者最容易誤判的情況。
 *
 * 溢價與折價分開上色:規格所在的台股慣例是漲紅跌綠,而溢價(買貴了)
 * 對買方不利、折價對買方有利 —— 沿用漲跌色會讓「紅色」同時意味著
 * 「上漲」與「買貴」,是相反的價值判斷。這裡改用警告色標溢價、
 * 中性色標折價,並且一律附上 +/− 符號,不讓判讀只依賴顏色。
 */
import { useMemo, useState } from 'react'
import { formatDate, formatPercent } from '../lib/format'
import type { PremiumSeries } from '../types'

const BOX = { width: 760, height: 220, padX: 52, padY: 16 }

/** y 軸至少涵蓋 ±0.5%,否則貼近零的一段期間會被放大成劇烈起伏。 */
const MIN_HALF_RANGE = 0.005

interface Props {
  series: PremiumSeries
  name: string
  sample: number
}

export function PremiumChart({ series, name, sample }: Props) {
  const [hover, setHover] = useState<number | null>(null)

  const model = useMemo(() => {
    // series 可能整個不存在:使用者的瀏覽器快取著舊版 etf/*.json,而契約
    // 新增了這個欄位。少一張圖是小事,整頁白畫面不是。
    if (!series?.start || !series.premium?.length) return null
    const base = Date.parse(`${series.start}T00:00:00Z`)
    const points = series.premium.map((v, i) => ({
      day: series.days[i]!,
      value: v,
      date: new Date(base + series.days[i]! * 86_400_000).toISOString().slice(0, 10),
    }))
    const half = Math.max(
      MIN_HALF_RANGE, ...points.map((p) => Math.abs(p.value)),
    ) * 1.1
    return { points, half }
  }, [series])

  if (!model) {
    return (
      <p className="chart-empty">
        還沒有折溢價資料。淨值來源只有當日快照、沒有歷史,
        這條線自接上來源那天起逐日累積。
      </p>
    )
  }

  const { points, half } = model
  const minDay = points[0]!.day
  const maxDay = points[points.length - 1]!.day
  const innerW = BOX.width - BOX.padX * 2
  const innerH = BOX.height - BOX.padY * 2
  // 只有一天資料時 maxDay === minDay,除以 0 會讓整條線變成 NaN。
  // 畫在正中央 —— 一個點本來就沒有「位置」可言。
  const xOf = (d: number) =>
    maxDay === minDay
      ? BOX.padX + innerW / 2
      : BOX.padX + ((d - minDay) / (maxDay - minDay)) * innerW
  const yOf = (v: number) => BOX.padY + innerH / 2 - (v / half) * (innerH / 2)

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.day).toFixed(2)} ${yOf(p.value).toFixed(2)}`)
    .join(' ')

  const hovered = hover === null ? null : points[hover] ?? null

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const day = minDay + ratio * (maxDay - minDay)
    let best = 0
    for (let i = 1; i < points.length; i += 1) {
      if (Math.abs(points[i]!.day - day) < Math.abs(points[best]!.day - day)) best = i
    }
    setHover(best)
  }

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} className="chart__svg" role="img"
           aria-label={`${name}的折溢價走勢,共 ${points.length} 個交易日`}
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {[half, half / 2, 0, -half / 2, -half].map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'chart__zero' : 'chart__grid'}
                  x1={BOX.padX} x2={BOX.width - BOX.padX} y1={yOf(t)} y2={yOf(t)} />
            <text className="chart__tick" x={BOX.padX - 6} y={yOf(t) + 4} textAnchor="end">
              {(t * 100).toFixed(1)}%
            </text>
          </g>
        ))}

        <path className="chart__line premium__line" d={path} />

        {/* 一個點畫不出線。單獨標一個圓,否則圖看起來是空的。 */}
        {points.length === 1 && (
          <circle className="chart__dot chart__dot--main"
                  cx={xOf(points[0]!.day)} cy={yOf(points[0]!.value)} r={4} />
        )}

        {hovered && points.length > 1 && (
          <>
            <line className="chart__crosshair" x1={xOf(hovered.day)} x2={xOf(hovered.day)}
                  y1={BOX.padY} y2={BOX.height - BOX.padY} />
            <circle className="chart__dot chart__dot--main"
                    cx={xOf(hovered.day)} cy={yOf(hovered.value)} r={4} />
          </>
        )}

        <text className="chart__tick" x={BOX.padX} y={BOX.height - 2}>
          {formatDate(points[0]!.date)}
        </text>
        {points.length > 1 && (
          <text className="chart__tick" x={BOX.width - BOX.padX} y={BOX.height - 2}
                textAnchor="end">
            {formatDate(points[points.length - 1]!.date)}
          </text>
        )}
      </svg>

      <figcaption className="chart__legend">
        <span className="chart__note">
          零線代表市價等於淨值。上方為溢價(買貴),下方為折價(買便宜)。
          目前累積 {sample} 個交易日。
        </span>
      </figcaption>

      {hovered && (
        <p className="chart__tooltip" role="status">
          {formatDate(hovered.date)} {formatPercent(hovered.value)}
          {hovered.value > 0 ? '(溢價)' : hovered.value < 0 ? '(折價)' : '(與淨值一致)'}
        </p>
      )}
    </figure>
  )
}
