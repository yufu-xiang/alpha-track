/** 工具頁共用元件。規格 §7.4:共用參數輸入面板、模式切換、結果呈現。 */
import type { ReactNode } from 'react'
import { hashFor } from '../../lib/route'

export function ToolPage(
  { title, children }: { title: string; children: ReactNode },
) {
  return (
    <main className="app detail">
      <p className="app__nav">
        <a href={hashFor({ name: 'tools', tool: null })}>← 回工具列表</a>
        <a href={hashFor({ name: 'rankings' })}>排行榜</a>
      </p>
      <h1>{title}</h1>
      {children}
    </main>
  )
}

/**
 * 假設/實據模式切換。規格 §7.1 要求 UI 明確標示當前使用哪一種 ——
 * 光有切換鈕不夠,離開切換鈕視線之後就看不出結果是算出來的還是猜出來的,
 * 所以模式說明一律緊跟在結果之前。
 */
export function ModeSwitch<T extends string>({ value, options, onChange }: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="chart__ranges" role="toolbar" aria-label="切換參數來源">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id}
                onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Num({ label, value, step, onChange }: {
  label: string; value: number; step: number; onChange: (v: number) => void
}) {
  return (
    <label>{label}
      <input type="number" value={value} step={step} min={0}
             onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
  )
}

export function Pct({ label, value, onChange, step = 0.5 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number
}) {
  return (
    <label>{label}(%)
      {/* 內部一律存小數(0.04),輸入框顯示百分比(4)。四捨五入到小數點後
          兩位是為了避免 0.07 → 7.000000000000001 這種浮點殘渣出現在輸入框裡。 */}
      <input type="number" value={+(value * 100).toFixed(2)} step={step} min={0}
             onChange={(e) => onChange((Number(e.target.value) || 0) / 100)} />
    </label>
  )
}

/**
 * 結果數字。tone 只有 'warn' 一種 —— 刻意沒有「安全」的顏色:
 * 本站的紅綠是台股的漲跌語意,拿綠色表示「安全」會被讀成「下跌」。
 */
export function Stat({ label, value, tone }: {
  label: string; value: string; tone?: 'warn'
}) {
  return (
    <div className="card">
      <dt>{label}</dt>
      <dd className={tone ? `is-${tone}` : undefined}>{value}</dd>
    </div>
  )
}
