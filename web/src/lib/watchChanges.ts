import type { EtfRow, MetaData } from '../types'

const KEY = 'alpha-track:watch-history:v1'

interface WatchValue {
  oneYearReturn: number | null
  premium: number | null
}

export interface WatchSnapshot {
  date: string
  values: Record<string, WatchValue>
  anomalyCodes: string[]
}

export interface WatchHistory {
  current: WatchSnapshot
  previous: WatchSnapshot | null
}

export interface WatchChange {
  code: string
  name: string
  hasPrevious: boolean
  oneYearReturnChange: number | null
  premiumChange: number | null
  anomaly: string | null
  newAnomaly: boolean
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function readSnapshot(value: unknown): WatchSnapshot | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (!isDate(raw.date) || typeof raw.values !== 'object' || raw.values === null) return null
  const values: WatchSnapshot['values'] = {}
  for (const [code, entry] of Object.entries(raw.values)) {
    if (!/^[A-Z0-9]+$/.test(code) || typeof entry !== 'object' || entry === null) continue
    const v = entry as Record<string, unknown>
    const finiteOrNull = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? n : null
    values[code] = { oneYearReturn: finiteOrNull(v.oneYearReturn), premium: finiteOrNull(v.premium) }
  }
  return {
    date: raw.date, values,
    anomalyCodes: Array.isArray(raw.anomalyCodes)
      ? raw.anomalyCodes.filter((code): code is string => typeof code === 'string' && /^[A-Z0-9]+$/.test(code))
      : [],
  }
}

export function normalizeWatchHistory(value: unknown): WatchHistory | null {
  if (typeof value !== 'object' || value === null) return null
  const parsed = value as Record<string, unknown>
  const current = readSnapshot(parsed.current)
  if (!current) return null
  const previous = readSnapshot(parsed.previous)
  return { current, previous: previous && previous.date < current.date ? previous : null }
}

export function loadWatchHistory(): WatchHistory | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? normalizeWatchHistory(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function saveWatchHistory(history: WatchHistory | null): void {
  try {
    if (history) localStorage.setItem(KEY, JSON.stringify(history))
    else localStorage.removeItem(KEY)
  } catch { /* 無痕模式 */ }
}

export function buildWatchSnapshot(
  date: string, rows: EtfRow[], codes: string[], anomalies: MetaData['anomalies'],
): WatchSnapshot {
  const watched = new Set(codes)
  const values: WatchSnapshot['values'] = {}
  for (const row of rows) {
    if (!watched.has(row.code)) continue
    values[row.code] = { oneYearReturn: row.returns.Y1, premium: row.premium_discount }
  }
  return {
    date, values,
    anomalyCodes: anomalies.filter((a) => watched.has(a.code)).map((a) => a.code),
  }
}

export function advanceWatchHistory(
  history: WatchHistory | null, next: WatchSnapshot,
): WatchHistory {
  if (!history) return { current: next, previous: null }
  if (next.date < history.current.date) return history
  if (next.date === history.current.date) {
    return { ...history, current: {
      ...next,
      // 同日新增自選標的時保留原本快照，不讓其意外消失。
      values: { ...history.current.values, ...next.values },
      anomalyCodes: [...new Set([...history.current.anomalyCodes, ...next.anomalyCodes])],
    } }
  }
  return { current: next, previous: history.current }
}

export function getWatchChanges(
  history: WatchHistory | null, date: string, rows: EtfRow[],
  codes: string[], anomalies: MetaData['anomalies'],
): WatchChange[] {
  if (!history || history.current.date !== date) return []
  const catalog = new Map(rows.map((row) => [row.code, row]))
  const issues = new Map(anomalies.map((a) => [a.code, a.reason]))
  return codes.flatMap((code) => {
    const row = catalog.get(code)
    if (!row) return []
    const old = history.previous?.values[code]
    const latest = history.current.values[code]
    const change = (a: number | null | undefined, b: number | null | undefined) =>
      a == null || b == null ? null : a - b
    return [{
      code, name: row.name, hasPrevious: old !== undefined,
      oneYearReturnChange: change(latest?.oneYearReturn, old?.oneYearReturn),
      premiumChange: change(latest?.premium, old?.premium),
      anomaly: issues.get(code) ?? null,
      newAnomaly: Boolean(history.previous) && issues.has(code)
        && !history.previous?.anomalyCodes.includes(code),
    }]
  })
}
