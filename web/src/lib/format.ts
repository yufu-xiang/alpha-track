/** 顯示格式化。null 一律呈現為破折號,絕不顯示為 0。 */

const DASH = '—'

export function formatPercent(v: number | null, digits = 2): string {
  if (v === null || Number.isNaN(v)) return DASH
  const pct = v * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(digits)}%`
}

export function formatNumber(v: number | null, digits = 2): string {
  if (v === null || Number.isNaN(v)) return DASH
  return v.toFixed(digits)
}

export function formatDate(iso: string | null): string {
  if (!iso) return DASH
  return iso.replaceAll('-', '/')
}
