/**
 * 欄位自選。規格 §5.2。
 *
 * 十一個期間加六個風險指標全部顯示會爆版(尤其手機),故由使用者自選,
 * 選擇存於 localStorage 下次沿用。
 */
import { useState } from 'react'
import { DEFAULT_PREFS } from '../lib/prefs'
import {
  PERIODS, PERIOD_LABELS, RISK_COLUMNS, RISK_LABELS,
  type PeriodCode, type RiskColumn,
} from '../types'

interface Props {
  selected: PeriodCode[]
  onChange: (next: PeriodCode[]) => void
  selectedRisk: RiskColumn[]
  onRiskChange: (next: RiskColumn[]) => void
}

export function ColumnPicker({
  selected, onChange, selectedRisk, onRiskChange,
}: Props) {
  const [open, setOpen] = useState(false)

  function togglePeriod(period: PeriodCode) {
    const isOn = selected.includes(period)
    // 全部取消會留下一張只有代號名稱的表,沒有意義,故至少保留一欄
    if (isOn && selected.length === 1) return
    const next = isOn
      ? selected.filter((p) => p !== period)
      : [...selected, period]
    // 依規格的期間順序排列,而非使用者的點選順序
    onChange(PERIODS.filter((p) => next.includes(p)))
  }

  function toggleRisk(col: RiskColumn) {
    // 風險指標允許全部關閉 —— 只看報酬是合理的用法。
    const next = selectedRisk.includes(col)
      ? selectedRisk.filter((c) => c !== col)
      : [...selectedRisk, col]
    onRiskChange(RISK_COLUMNS.filter((c) => next.includes(c)))
  }

  return (
    <div className="column-picker">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        欄位
      </button>
      {open && (
        <div className="column-picker__menu">
          <div role="group" aria-label="選擇顯示的期間">
            <p className="column-picker__heading">期間</p>
            {PERIODS.map((p) => (
              <label key={p}>
                <input
                  type="checkbox"
                  checked={selected.includes(p)}
                  onChange={() => togglePeriod(p)}
                />
                {PERIOD_LABELS[p]}
              </label>
            ))}
          </div>

          <div role="group" aria-label="選擇顯示的風險指標">
            <p className="column-picker__heading">風險指標</p>
            {RISK_COLUMNS.map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  checked={selectedRisk.includes(c)}
                  onChange={() => toggleRisk(c)}
                />
                {RISK_LABELS[c]}
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              onChange([...DEFAULT_PREFS.visibleColumns])
              onRiskChange([...DEFAULT_PREFS.visibleRisk])
            }}
          >
            回到預設
          </button>
        </div>
      )}
    </div>
  )
}
