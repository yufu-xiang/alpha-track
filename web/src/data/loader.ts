/**
 * 資料載入。
 *
 * 規格 §8.2:載入失敗時顯示明確錯誤,絕不呈現空白表格 ——
 * 空表格會被誤讀為「今天沒有任何 ETF」。
 */
import type { BenchmarkSeries, EtfDetail, MetaData, RankingsData } from '../types'
import { validateBenchmark, validateDetail, validateMeta, validateRankings } from './contract'

const BASE = import.meta.env.BASE_URL ?? '/'

export type LoadResult =
  | { ok: true; rankings: RankingsData; meta: MetaData }
  | { ok: false; error: string }

async function fetchJson<T>(path: string): Promise<T> {
  const resp = await fetch(`${BASE}data/${path}`)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return (await resp.json()) as T
}

export async function loadData(): Promise<LoadResult> {
  try {
    // 兩份都要成功才算成功:只有 meta 而沒有 rankings 會渲染成一張空表,
    // 而空表會被讀成「今天沒有任何 ETF」。
    const [rankings, meta] = await Promise.all([
      fetchJson<unknown>('rankings.json'),
      fetchJson<unknown>('meta.json'),
    ])
    const checkedRankings = validateRankings(rankings)
    const checkedMeta = validateMeta(meta)
    if (checkedRankings.data_date !== checkedMeta.data_date) {
      throw new Error(
        `資料版本不一致:rankings=${checkedRankings.data_date},meta=${checkedMeta.data_date}`,
      )
    }
    if (checkedRankings.etfs.length !== checkedMeta.etf_count) {
      throw new Error(
        `ETF 數量不一致:rankings=${checkedRankings.etfs.length},meta=${checkedMeta.etf_count}`,
      )
    }
    return { ok: true, rankings: checkedRankings, meta: checkedMeta }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `資料載入失敗:${detail}` }
  }
}

export type DetailResult =
  | { ok: true; detail: EtfDetail; benchmark: BenchmarkSeries | null }
  | { ok: false; error: string }

/**
 * 個股頁資料。基準線失敗不影響主體 —— 少一條疊加線,不是少一頁。
 */
export async function loadDetail(code: string): Promise<DetailResult> {
  let detail: EtfDetail
  try {
    detail = validateDetail(
      await fetchJson<unknown>(`etf/${encodeURIComponent(code)}.json`),
    )
  } catch (err) {
    const detailMsg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `找不到 ${code} 的資料:${detailMsg}` }
  }
  let benchmark: BenchmarkSeries | null = null
  try {
    benchmark = validateBenchmark(await fetchJson<unknown>('benchmark.json'))
  } catch {
    // 基準線是加分項,拿不到就不疊加,不要因此讓整頁失敗。
  }
  return { ok: true, detail, benchmark }
}

export function daysSince(iso: string, now: Date = new Date()): number {
  const then = new Date(`${iso}T00:00:00+08:00`)
  const diff = now.getTime() - then.getTime()
  return Math.floor(diff / 86_400_000)
}
