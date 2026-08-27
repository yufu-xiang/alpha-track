/**
 * ETF 成分股重疊度。規格 §7.2。
 *
 * ## 這份資料是「前十大」,不是完整持股
 *
 * 來源是投信投顧公會的月報,每檔只公布前十大。0050 的前十大合計 80.4%,
 * 高股息型更低。因此本模組算出來的一切都是**前十大之間**的重疊,
 * 而不是整體重疊 —— UI 必須把這件事寫在數字旁邊,否則
 * 「重疊 30%」會被讀成「這兩檔有三成一樣」,而真實值可能更高也可能更低。
 *
 * ## 為什麼用權重取小值相加
 *
 * 重疊度 = Σ min(w_a(i), w_b(i))。這是兩個分布的**共同質量**,
 * 直觀意義是「同時買這兩檔時,有多少比例的錢押在同一批股票上」。
 *
 * 只數「共同持有幾檔」是不夠的:兩檔都持有台積電,一檔 60% 一檔 2%,
 * 用檔數算是「重疊一檔」,但實際的資金重疊只有 2%。
 */
import type { Holdings } from '../types'

export interface OverlapResult {
  /** 共同質量,小數。null 代表任一邊沒有資料。 */
  weight: number | null
  /** 兩邊都持有的標的數 */
  sharedCount: number
  /** 兩邊各自的前十大權重合計 —— 讓 UI 說得出「這是多少涵蓋率下的重疊」 */
  coverageA: number
  coverageB: number
  /** 貢獻最大的共同持股,由大到小 */
  shared: { code: string; name: string; weightA: number; weightB: number }[]
}

export function overlap(a: Holdings, b: Holdings): OverlapResult {
  const mapA = toMap(a)
  const mapB = toMap(b)
  const coverageA = sum(mapA)
  const coverageB = sum(mapB)

  if (mapA.size === 0 || mapB.size === 0) {
    return { weight: null, sharedCount: 0, coverageA, coverageB, shared: [] }
  }

  const shared: OverlapResult['shared'] = []
  let weight = 0
  for (const [code, entry] of mapA) {
    const other = mapB.get(code)
    if (!other) continue
    weight += Math.min(entry.weight, other.weight)
    shared.push({
      code,
      // 兩邊的名稱應該一樣;不一樣時取 A 的,並不做「哪個比較對」的判斷。
      name: entry.name || other.name,
      weightA: entry.weight,
      weightB: other.weight,
    })
  }
  shared.sort((x, y) =>
    Math.min(y.weightA, y.weightB) - Math.min(x.weightA, x.weightB))

  return { weight, sharedCount: shared.length, coverageA, coverageB, shared }
}

function toMap(h: Holdings): Map<string, { name: string; weight: number }> {
  const m = new Map<string, { name: string; weight: number }>()
  for (const item of h?.items ?? []) {
    // 權重不明的持股不能當成 0 —— 那會讓它靜靜地不參與重疊計算,
    // 而結果看起來像「這兩檔沒有共同持有它」。整筆略過並反映在涵蓋率上。
    if (!item.code || item.weight === null || item.weight === undefined) continue
    m.set(item.code, { name: item.name ?? '', weight: item.weight })
  }
  return m
}

function sum(m: Map<string, { weight: number }>): number {
  let total = 0
  for (const v of m.values()) total += v.weight
  return total
}

/** 把重疊度轉成一句話。刻意不含「該買/不該買」。 */
export function describeOverlap(weight: number, coverage: number): string {
  const relative = coverage > 0 ? weight / coverage : 0
  if (relative >= 0.8) return '前十大幾乎是同一批股票'
  if (relative >= 0.5) return '前十大有一半以上重疊'
  if (relative >= 0.2) return '前十大部分重疊'
  if (relative > 0) return '前十大重疊很少'
  return '前十大沒有共同持股'
}
