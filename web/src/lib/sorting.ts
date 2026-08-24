/**
 * 排序工具。
 *
 * 規格 §4.3:資料不足(null)者不論升冪或降冪,一律排在列表最末。
 *
 * 一般比較器把 null 視為最小值,升冪時它會浮到頂端,使一整排「—」
 * 佔據榜首。這正是規格要避免的情況,故 null 的處理獨立於排序方向。
 */

export function nullsLastComparator(
  a: number | null,
  b: number | null,
  desc: boolean,
): number {
  const aNull = a === null || Number.isNaN(a)
  const bNull = b === null || Number.isNaN(b)

  if (aNull && bNull) return 0
  if (aNull) return 1 // a 永遠往後,不看 desc
  if (bNull) return -1

  return desc ? b - a : a - b
}

/**
 * 把「資料不足」轉成 undefined,供 TanStack 的 sortUndefined 處理。
 *
 * 為什麼不自己寫 sortingFn 處理 null:TanStack 在降冪時會**反轉**
 * 比較器的回傳值,所以「null 恆回傳 1」在降冪時會被翻成置頂,
 * 正好與需求相反。TanStack 對 undefined 的處理則獨立於排序方向,
 * 因此把 null 映射成 undefined 才是唯一在升降冪都正確的做法。
 *
 * 以上兩點已在實際安裝的 table-core 8.21.3 原始碼中逐行確認
 * (`utils/getSortedRowModel.js`):
 *   - 第 70–72 行:`if (sortInt !== 0) { if (isDesc) sortInt *= -1 }`
 *     —— 自寫比較器的回傳值確實會被降冪翻轉。
 *   - 第 61 行:`if (sortUndefined === 'last') return aUndefined ? 1 : -1`
 *     —— 直接 return,走不到上面那段翻轉,故與排序方向無關。
 *
 * 用法:欄位定義寫 accessor 為 `toSortable(row.returns[p])`,
 * 並**明確**設定 `sortUndefined: 'last'`。
 *
 * 不可省略這個設定而依賴預設值:預設是 `sortUndefined: 1`(數字),
 * 它走的是 `sortInt = ...` 那條路徑,**會**被降冪翻轉 ——
 * 只有字串形式的 'last' 會提前 return。
 */
export function toSortable(v: number | null): number | undefined {
  return v === null || Number.isNaN(v) ? undefined : v
}
