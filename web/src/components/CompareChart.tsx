/**
 * 多檔疊圖。規格 §5.2 ③:走勢標準化為起點 100。
 *
 * 絕對價格疊圖無意義:一檔 200 元與一檔 20 元無法目視比較漲幅。
 *
 * ## 配色是量出來的,不是挑出來的
 *
 * dataviz 的驗證器實測結果:參考調色盤的 8 個插槽取 5,**56 組全部無法**
 * 在淺色與深色兩種底色下通過 all-pairs 可辨識檢查;取 4 也只有 2 組通過。
 * 最後改用 Okabe-Ito(色覺障礙友善調色盤),並為深色模式重新取階
 * (原色超出深色底的亮度帶 L 0.48–0.67)。
 *
 * 即便如此,驗證器仍標了兩個條件,兩個都已滿足:
 *   - CVD separation 落在 "floor"(ΔE 7.2 deutan)—— 僅在搭配**非顏色編碼**
 *     時合法,故每條線各有不同虛線樣式。
 *   - Contrast 需要 "relief"(可見標籤或表格)—— 圖下方的指標對照表即是。
 */
import { useMemo, useState } from 'react'
import { commonWindow, normalizeWithin, toPath, type ChartPoint } from '../lib/chart'
import { formatDate, formatPercent } from '../lib/format'
import type { Series } from '../types'
import { CHART_RANGES } from './PriceChart'

const BOX = { width: 760, height: 320, padX: 44, padY: 16 }

/** 五種虛線樣式。顏色之外的第二重編碼 —— 不是裝飾,是合規條件。 */
export const DASHES = ['none', '6 4', '2 3', '9 3 2 3', '1 4'] as const

export interface CompareSeries {
  code: string
  name: string
  series: Series
}

interface Props {
  items: CompareSeries[]
}

export function CompareChart({ items }: Props) {
  const [rangeIdx, setRangeIdx] = useState(0)
  const range = CHART_RANGES[rangeIdx]!

  const model = useMemo(() => {
    // 每檔的 days 是相對自己 start 的位移。不換算成共同的日期原點,
    // 各檔會落在不同的水平區段而完全不重疊 —— 而且「標準化為 100」會發生在
    // 不同的日期,比較本身就沒有意義。
    const win = commonWindow(items.map((it) => it.series), range.days)
    if (!win) return null

    const lines = items
      .map((it) => ({ ...it, points: normalizeWithin(it.series, win.from, win.to) }))
      .filter((l) => l.points.length > 0)
    if (lines.length === 0) return null

    const values = lines.flatMap((l) => l.points).map((p) => p.value)
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const pad = (hi - lo) * 0.04 || 1
    return {
      lines,
      from: win.from,
      domain: { minDay: win.from, maxDay: win.to, minValue: lo - pad, maxValue: hi + pad },
    }
  }, [items, range.days])

  if (!model) {
    return (
      <p className="chart-empty">
        選取的標的沒有共同的資料區間 —— 有些檔的掛牌日晚於其他檔的最後交易日,
        無法在同一個起點比較。
      </p>
    )
  }

  const { domain } = model
  const innerH = BOX.height - BOX.padY * 2
  const yOf = (v: number) =>
    BOX.padY + innerH - ((v - domain.minValue) / (domain.maxValue - domain.minValue || 1)) * innerH
  const ticks = [0, 1, 2, 3].map((i) =>
    domain.minValue + ((domain.maxValue - domain.minValue) * i) / 3)

  return (
    <figure className="chart">
      <div className="chart__ranges" role="toolbar" aria-label="選擇比較圖區間">
        {CHART_RANGES.map((r, i) => (
          <button key={r.label} type="button" aria-pressed={i === rangeIdx}
                  onClick={() => setRangeIdx(i)}>{r.label}</button>
        ))}
      </div>

      <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} className="chart__svg" role="img"
           aria-label={`${model.lines.map((l) => l.name).join('、')}的走勢比較,皆標準化為起點 100`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart__grid" x1={BOX.padX} x2={BOX.width - BOX.padX}
                  y1={yOf(t)} y2={yOf(t)} />
            <text className="chart__tick" x={BOX.padX - 6} y={yOf(t) + 4} textAnchor="end">
              {t.toFixed(0)}
            </text>
          </g>
        ))}
        {model.lines.map((l, i) => (
          <path key={l.code} className={`chart__line chart__line--s${i}`}
                strokeDasharray={DASHES[i] === 'none' ? undefined : DASHES[i]}
                d={toPath(l.points, BOX, domain)} />
        ))}
      </svg>

      <figcaption className="chart__legend">
        {model.lines.map((l, i) => (
          <span key={l.code} className={`chart__key chart__key--s${i}`}>
            {l.name} {formatPercent(lastValue(l.points) / 100 - 1)}
          </span>
        ))}
        <span className="chart__note">
          自 {formatDate(dayToIso(model.from))} 起標準化為 100
        </span>
      </figcaption>
    </figure>
  )
}

/** 絕對日數轉回 ISO 日期,供軸標籤與說明文字使用。 */
function dayToIso(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10)
}

function lastValue(points: ChartPoint[]): number {
  return points[points.length - 1]?.value ?? 100
}
