/** 外部 JSON 的執行期契約。TypeScript 型別在網路邊界不會自動驗證資料。 */
import {
  PERIODS, type BenchmarkSeries, type EtfDetail, type EtfRow,
  type MetaData, type RankingsData,
} from '../types'

type Obj = Record<string, unknown>

function obj(v: unknown, label: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`${label} 不是物件`)
  }
  return v as Obj
}

function str(v: unknown, label: string): string {
  if (typeof v !== 'string') throw new Error(`${label} 不是字串`)
  return v
}

function bool(v: unknown, label: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`${label} 不是布林值`)
  return v
}

function num(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${label} 不是有限數字`)
  return v
}

function nullableNum(v: unknown, label: string): number | null {
  return v === null ? null : num(v, label)
}

function nullableStr(v: unknown, label: string): string | null {
  return v === null ? null : str(v, label)
}

function isoDate(v: unknown, label: string): string {
  const value = str(v, label)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const parsed = match ? new Date(`${value}T00:00:00Z`) : null
  if (!match || !parsed || Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== Number(match[1])
    || parsed.getUTCMonth() + 1 !== Number(match[2])
    || parsed.getUTCDate() !== Number(match[3])) {
    throw new Error(`${label} 不是 ISO 日期`)
  }
  return value
}

function nullableIsoDate(v: unknown, label: string): string | null {
  return v === null ? null : isoDate(v, label)
}

function nonNegativeInteger(v: unknown, label: string): number {
  const value = num(v, label)
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} 不是非負整數`)
  return value
}

function periodMap(v: unknown, label: string, min = -Infinity) {
  const value = obj(v, label)
  for (const period of PERIODS) {
    const n = nullableNum(value[period], `${label}.${period}`)
    if (n !== null && n < min) throw new Error(`${label}.${period} 小於 ${min}`)
  }
}

function risk(v: unknown, label: string) {
  const value = obj(v, label)
  for (const key of ['volatility', 'mdd', 'sharpe', 'beta']) {
    nullableNum(value[key], `${label}.${key}`)
  }
}

function validateEtfRow(v: unknown, index: number): asserts v is EtfRow {
  const label = `rankings.etfs[${index}]`
  const row = obj(v, label)
  str(row.code, `${label}.code`); str(row.name, `${label}.name`)
  nullableStr(row.category, `${label}.category`); nullableStr(row.region, `${label}.region`)
  bool(row.is_leveraged, `${label}.is_leveraged`)
  bool(row.is_inverse, `${label}.is_inverse`)
  num(row.close, `${label}.close`)
  nullableIsoDate(row.listing_date, `${label}.listing_date`)
  nullableIsoDate(row.data_start, `${label}.data_start`)
  periodMap(row.returns, `${label}.returns`, -1)
  periodMap(row.annualized, `${label}.annualized`, -1)
  periodMap(row.excess, `${label}.excess`)
  risk(row.risk, `${label}.risk`)
  for (const key of [
    'premium_discount', 'premium_low', 'premium_high', 'premium_days_ratio',
    'avg_volume', 'avg_turnover', 'dividend_yield',
  ]) nullableNum(row[key], `${label}.${key}`)
  nonNegativeInteger(row.premium_sample, `${label}.premium_sample`)
}

export function validateRankings(v: unknown): RankingsData {
  const value = obj(v, 'rankings')
  isoDate(value.data_date, 'rankings.data_date')
  if (!Array.isArray(value.etfs)) throw new Error('rankings.etfs 不是陣列')
  value.etfs.forEach((row, i) => validateEtfRow(row, i))
  return value as unknown as RankingsData
}

export function validateMeta(v: unknown): MetaData {
  const value = obj(v, 'meta')
  const generatedAt = str(value.generated_at, 'meta.generated_at')
  if (Number.isNaN(Date.parse(generatedAt))) throw new Error('meta.generated_at 不是 ISO 時間')
  isoDate(value.data_date, 'meta.data_date')
  bool(value.is_stale, 'meta.is_stale')
  nonNegativeInteger(value.etf_count, 'meta.etf_count')
  num(value.risk_free_rate, 'meta.risk_free_rate')
  nullableNum(value.benchmark_return_1y, 'meta.benchmark_return_1y')
  if (!Array.isArray(value.unclassified) || !value.unclassified.every((x) => typeof x === 'string')) {
    throw new Error('meta.unclassified 格式錯誤')
  }
  if (!Array.isArray(value.anomalies) || !value.anomalies.every((x) => {
    if (typeof x !== 'object' || x === null) return false
    const a = x as Obj
    return typeof a.code === 'string' && typeof a.reason === 'string'
  })) throw new Error('meta.anomalies 格式錯誤')
  return value as unknown as MetaData
}

function numericArray(v: unknown, label: string): number[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new Error(`${label} 不是有限數字陣列`)
  }
  return v
}

function validateSeries(v: unknown, label: string, valueKeys: string[]) {
  const series = obj(v, label)
  const start = nullableIsoDate(series.start, `${label}.start`)
  const days = numericArray(series.days, `${label}.days`)
  if (days.some((day, i) => !Number.isInteger(day) || day < 0
    || (i > 0 && day <= days[i - 1]!))) {
    throw new Error(`${label}.days 必須是嚴格遞增的非負整數`)
  }
  if ((days.length === 0) !== (start === null)) {
    throw new Error(`${label}.start 與 days 是否為空不一致`)
  }
  for (const key of valueKeys) {
    const values = numericArray(series[key], `${label}.${key}`)
    if (values.length !== days.length) throw new Error(`${label}.${key} 與 days 長度不一致`)
  }
}

export function validateDetail(v: unknown): EtfDetail {
  const value = obj(v, 'detail')
  for (const key of ['code', 'name', 'exchange']) str(value[key], `detail.${key}`)
  for (const key of ['category', 'region', 'issuer', 'tracking_index']) {
    nullableStr(value[key], `detail.${key}`)
  }
  nullableIsoDate(value.listing_date, 'detail.listing_date')
  nullableIsoDate(value.data_start, 'detail.data_start')
  periodMap(value.returns, 'detail.returns', -1)
  periodMap(value.annualized, 'detail.annualized', -1)
  periodMap(value.excess, 'detail.excess')
  risk(value.risk, 'detail.risk')
  for (const key of [
    'premium_discount', 'premium_low', 'premium_high', 'premium_days_ratio', 'fund_size',
  ]) nullableNum(value[key], `detail.${key}`)
  nonNegativeInteger(value.premium_sample, 'detail.premium_sample')
  validateSeries(value.series, 'detail.series', ['adj', 'close'])
  validateSeries(value.premium_series, 'detail.premium_series', ['premium'])
  if (!Array.isArray(value.dividends)) throw new Error('detail.dividends 不是陣列')
  value.dividends.forEach((raw, i) => {
    const label = `detail.dividends[${i}]`
    const dividend = obj(raw, label)
    isoDate(dividend.ex_date, `${label}.ex_date`)
    nullableIsoDate(dividend.pay_date, `${label}.pay_date`)
    num(dividend.amount, `${label}.amount`)
    num(dividend.amount_adj, `${label}.amount_adj`)
    bool(dividend.scale_known, `${label}.scale_known`)
  })
  const holdings = obj(value.holdings, 'detail.holdings')
  const yearMonth = nullableStr(holdings.year_month, 'detail.holdings.year_month')
  if (yearMonth !== null && !/^\d{6}$/.test(yearMonth)) {
    throw new Error('detail.holdings.year_month 不是 YYYYMM')
  }
  if (!Array.isArray(holdings.items)) throw new Error('detail.holdings.items 不是陣列')
  holdings.items.forEach((raw, i) => {
    const label = `detail.holdings.items[${i}]`
    const item = obj(raw, label)
    str(item.code, `${label}.code`)
    str(item.name, `${label}.name`)
    const weight = nullableNum(item.weight, `${label}.weight`)
    if (weight !== null && (weight < 0 || weight > 1)) {
      throw new Error(`${label}.weight 不在 0 到 1 之間`)
    }
  })
  return value as unknown as EtfDetail
}

export function validateBenchmark(v: unknown): BenchmarkSeries {
  validateSeries(v, 'benchmark', ['value'])
  return v as BenchmarkSeries
}
