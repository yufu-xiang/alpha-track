import { useState } from 'react'
import { MAX_FILTER_PRESETS, type FilterPreset } from '../lib/filterPresets'

interface Props {
  presets: FilterPreset[]
  onSave: (name: string) => void
  onApply: (preset: FilterPreset) => void
  onDelete: (name: string) => void
}

export function FilterPresets({ presets, onSave, onApply, onDelete }: Props) {
  const [name, setName] = useState('')
  const trimmed = name.trim()
  const exists = presets.some((preset) => preset.name === trimmed)
  return (
    <details className="filter-presets">
      <summary>我的篩選組合 <span>{presets.length} / {MAX_FILTER_PRESETS}</span></summary>
      <p>儲存目前的篩選條件與排序期間，之後可一鍵套用。</p>
      <form onSubmit={(event) => {
        event.preventDefault()
        if (!trimmed || (!exists && presets.length >= MAX_FILTER_PRESETS)) return
        onSave(trimmed)
        setName('')
      }}>
        <label htmlFor="filter-preset-name">組合名稱</label>
        <input id="filter-preset-name" value={name} maxLength={30}
               placeholder="例如：長期、流動性高"
               onChange={(event) => setName(event.target.value)} />
        <button type="submit" disabled={!trimmed || (!exists && presets.length >= MAX_FILTER_PRESETS)}>
          {exists ? '更新組合' : '儲存組合'}
        </button>
      </form>
      {presets.length > 0 && (
        <ul>
          {presets.map((preset) => (
            <li key={preset.name}>
              <button type="button" onClick={() => onApply(preset)}>{preset.name}</button>
              <button type="button" aria-label={`刪除篩選組合 ${preset.name}`}
                      onClick={() => onDelete(preset.name)}>×</button>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
