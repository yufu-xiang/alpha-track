/**
 * 比較清單的選取邏輯。規格 §5.2 ③:最多同時選 5 檔。
 *
 * 上限不只是版面考量。dataviz 的調色盤驗證器實測:參考調色盤的 8 個插槽
 * 取 5,**56 組全部無法在兩種主題下通過 all-pairs 可辨識檢查**;取 4 也
 * 只有 2 組通過。最後採用 Okabe-Ito(色覺障礙友善調色盤)並為深色模式
 * 重新取階,才湊到 5 個可用顏色 —— 且仍需搭配不同虛線樣式才合規。
 * 超過 5 條就不是調色的問題,是疊圖這個形式本身失效。
 */
export const MAX_COMPARE = 5

export function toggleCompare(selected: string[], code: string): string[] {
  if (selected.includes(code)) return selected.filter((c) => c !== code)
  if (selected.length >= MAX_COMPARE) return selected   // 已滿:忽略,不悄悄踢掉別人
  return [...selected, code]
}

export function parseCodes(raw: string): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const code = part.trim().toUpperCase()
    if (/^[A-Z0-9]+$/.test(code) && !seen.has(code)) seen.add(code)
    if (seen.size >= MAX_COMPARE) break
  }
  return [...seen]
}

export function serializeCodes(codes: string[]): string {
  return codes.join(',')
}
