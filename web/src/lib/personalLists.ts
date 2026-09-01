/** 自選清單與跨頁比較籃。資料只含 ETF 代號，可安全存於 localStorage。 */
import { MAX_COMPARE, toggleCompare } from './compare'

const WATCHLIST_KEY = 'alpha-track:watchlist'
const COMPARE_KEY = 'alpha-track:compare'

function normalizeCodes(value: unknown, max = Number.POSITIVE_INFINITY): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const code = item.trim().toUpperCase()
    if (/^[A-Z0-9]+$/.test(code)) seen.add(code)
    if (seen.size >= max) break
  }
  return [...seen]
}

function load(key: string, max?: number): string[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? normalizeCodes(JSON.parse(raw), max) : []
  } catch {
    return []
  }
}

function save(key: string, codes: string[], max?: number): string[] {
  const normalized = normalizeCodes(codes, max)
  try {
    localStorage.setItem(key, JSON.stringify(normalized))
  } catch {
    // 偏好資料寫不進去不應讓研究流程中斷。
  }
  return normalized
}

export function loadWatchlist(): string[] {
  return load(WATCHLIST_KEY)
}

export function saveWatchlist(codes: string[]): string[] {
  return save(WATCHLIST_KEY, codes)
}

export function toggleWatchlist(codes: string[], code: string): string[] {
  const normalized = code.trim().toUpperCase()
  return saveWatchlist(codes.includes(normalized)
    ? codes.filter((item) => item !== normalized)
    : [...codes, normalized])
}

export function loadCompareBasket(): string[] {
  return load(COMPARE_KEY, MAX_COMPARE)
}

export function saveCompareBasket(codes: string[]): string[] {
  return save(COMPARE_KEY, codes, MAX_COMPARE)
}

/** 已在籃內時維持原樣，不讓「加入比較」按鈕意外變成移除。 */
export function addToCompareBasket(code: string): string[] {
  const current = loadCompareBasket()
  const normalized = code.trim().toUpperCase()
  return current.includes(normalized)
    ? current
    : saveCompareBasket(toggleCompare(current, normalized))
}
