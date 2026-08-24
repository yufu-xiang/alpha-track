/** 期間快速排序按鈕列。規格 §5.2。 */
import { PERIODS, PERIOD_LABELS, type PeriodCode } from '../types'

interface Props {
  active: PeriodCode | null
  onSelect: (period: PeriodCode) => void
}

export function PeriodTabs({ active, onSelect }: Props) {
  return (
    <div className="period-tabs" role="toolbar" aria-label="選擇排序期間">
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={active === p}
          onClick={() => onSelect(p)}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  )
}
