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

/**
 * 金額。加千分位 —— 退休試算動輒八、九位數,`302127026` 沒有人讀得出來。
 * 預設不顯示小數:試算結果的個位數是假精確。
 */
export function formatMoney(v: number | null, digits = 0): string {
  if (v === null || Number.isNaN(v)) return DASH
  return v.toLocaleString('zh-TW', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  })
}


/**
 * 大額金額,以「億/萬」為單位。
 *
 * 基金規模動輒兆元,`2,369,444,695,000` 這串沒有人能一眼讀出量級,
 * 而規模這個欄位的用途正是判斷量級(幾十億以下要留意流動性與清算風險)。
 */
export function formatCompactMoney(v: number | null): string {
  if (v === null || Number.isNaN(v)) return DASH
  const abs = Math.abs(v)
  if (abs >= 1e8) return `${(v / 1e8).toLocaleString('zh-TW', {
    maximumFractionDigits: 0 })} 億`
  if (abs >= 1e4) return `${(v / 1e4).toLocaleString('zh-TW', {
    maximumFractionDigits: 0 })} 萬`
  return v.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
}
