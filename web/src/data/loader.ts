/**
 * 資料載入。
 *
 * 規格 §8.2:載入失敗時顯示明確錯誤,絕不呈現空白表格 ——
 * 空表格會被誤讀為「今天沒有任何 ETF」。
 */
import type { MetaData, RankingsData } from '../types'

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
      fetchJson<RankingsData>('rankings.json'),
      fetchJson<MetaData>('meta.json'),
    ])
    return { ok: true, rankings, meta }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `資料載入失敗:${detail}` }
  }
}

export function daysSince(iso: string, now: Date = new Date()): number {
  const then = new Date(`${iso}T00:00:00+08:00`)
  const diff = now.getTime() - then.getTime()
  return Math.floor(diff / 86_400_000)
}
