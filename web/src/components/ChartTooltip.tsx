import type { TooltipContentProps } from 'recharts'

interface ChartTooltipProps extends Partial<TooltipContentProps<number, string>> {
  formatLabel?: (label: string | number) => string
  formatValue?: (value: number, name: string) => string
}

/**
 * 全站圖表共用的 HTML tooltip。
 *
 * Recharts 預設 tooltip 使用固定白底，在深色模式會顯得像外來元件；
 * 這層同時統一數字格式、色標與鍵盤巡覽時的可讀狀態。
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatLabel = String,
  formatValue = (value) => value.toFixed(2),
}: ChartTooltipProps) {
  if (!active || !payload?.length || label === undefined) return null

  return (
    <div className="chart-popover" role="status">
      <p className="chart-popover__date">{formatLabel(label)}</p>
      <ul>
        {payload.map((entry) => {
          const value = Number(entry.value)
          const name = String(entry.name ?? '')
          if (!Number.isFinite(value)) return null
          return (
            <li key={`${String(entry.dataKey)}-${name}`}>
              <span className="chart-popover__marker"
                    style={{ background: String(entry.color ?? entry.stroke ?? 'currentColor') }} />
              <span>{name}</span>
              <strong>{formatValue(value, name)}</strong>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
