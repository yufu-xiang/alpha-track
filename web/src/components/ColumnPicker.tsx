/**
 * 欄位自選。規格 §5.2。
 *
 * 十一個期間全部顯示會爆版(尤其手機),故由使用者自選,
 * 選擇存於 localStorage 下次沿用。
 */
import { useState } from 'react'
import { DEFAULT_PREFS } from '../lib/prefs'
import { PERIODS, PERIOD_LABELS, type PeriodCode } from '../types'

interface Props {
  selected: PeriodCode[]
  onChange: (next: PeriodCode[]) => void
}

export function ColumnPicker({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false)

  function toggle(period: PeriodCode) {
    const isOn = selected.includes(period)
    // 全部取消會留下一張只有代號名稱的表,沒有意義,故至少保留一欄
    if (isOn && selected.length === 1) return
    const next = isOn
      ? selected.filter((p) => p !== period)
      : [...selected, period]
    // 依規格的期間順序排列,而非使用者的點選順序
    onChange(PERIODS.filter((p) => next.includes(p)))
  }

  return (
    <div className="column-picker">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        欄位
      </button>
      {open && (
        <div className="column-picker__menu" role="group" aria-label="選擇顯示欄位">
          {PERIODS.map((p) => (
            <label key={p}>
              <input
                type="checkbox"
                checked={selected.includes(p)}
                onChange={() => toggle(p)}
              />
              {PERIOD_LABELS[p]}
            </label>
          ))}
          <button type="button" onClick={() => onChange([...DEFAULT_PREFS.visibleColumns])}>
            回到預設
          </button>
        </div>
      )}
    </div>
  )
}
