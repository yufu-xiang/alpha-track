import { PERIODS, type PeriodCode } from '../types'

const KEY = 'alpha-track:filter-presets'
export const MAX_FILTER_PRESETS = 12

export interface SavedFilters {
  categories: string[]
  regions: string[]
  query: string
  showLevered: boolean
  onlyWatchlist: boolean
  minListingYears: number
  minTurnoverMillions: number | null
  maxDrawdownPercent: number | null
  sortBy: PeriodCode
}

export interface FilterPreset {
  name: string
  filters: SavedFilters
}

function cleanNumber(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    && value >= 0 && value <= max ? value : null
}

export function normalizeFilterPresets(value: unknown): FilterPreset[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: FilterPreset[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const raw = item as Record<string, unknown>
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 30) : ''
    if (!name || seen.has(name) || typeof raw.filters !== 'object' || raw.filters === null) continue
    const f = raw.filters as Record<string, unknown>
    const strings = (v: unknown) => Array.isArray(v)
      ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length < 80))]
      : []
    const years = cleanNumber(f.minListingYears, 5)
    out.push({ name, filters: {
      categories: strings(f.categories), regions: strings(f.regions),
      query: typeof f.query === 'string' ? f.query.slice(0, 100) : '',
      showLevered: f.showLevered === true,
      onlyWatchlist: f.onlyWatchlist === true,
      minListingYears: years !== null && [0, 1, 3, 5].includes(years) ? years : 0,
      minTurnoverMillions: cleanNumber(f.minTurnoverMillions, 1_000_000),
      maxDrawdownPercent: cleanNumber(f.maxDrawdownPercent, 100),
      sortBy: typeof f.sortBy === 'string' && (PERIODS as readonly string[]).includes(f.sortBy)
        ? f.sortBy as PeriodCode : 'Y1',
    } })
    seen.add(name)
    if (out.length >= MAX_FILTER_PRESETS) break
  }
  return out
}

export function loadFilterPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? normalizeFilterPresets(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

export function saveFilterPresets(presets: FilterPreset[]): FilterPreset[] {
  const clean = normalizeFilterPresets(presets)
  try { localStorage.setItem(KEY, JSON.stringify(clean)) } catch { /* 無痕模式 */ }
  return clean
}

export function upsertFilterPreset(presets: FilterPreset[], preset: FilterPreset): FilterPreset[] {
  return saveFilterPresets([
    ...presets.filter((item) => item.name !== preset.name), preset,
  ])
}
