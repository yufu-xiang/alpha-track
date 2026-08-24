import { describe, expect, it } from 'vitest'
import { nullsLastComparator, toSortable } from './sorting'

function sortValues(values: (number | null)[], desc: boolean) {
  return [...values].sort((a, b) => nullsLastComparator(a, b, desc))
}

describe('nullsLastComparator', () => {
  it('降冪時由大到小排列', () => {
    expect(sortValues([1, 3, 2], true)).toEqual([3, 2, 1])
  })

  it('升冪時由小到大排列', () => {
    expect(sortValues([3, 1, 2], false)).toEqual([1, 2, 3])
  })

  it('降冪時 null 排在最末', () => {
    expect(sortValues([1, null, 3, null, 2], true)).toEqual([3, 2, 1, null, null])
  })

  it('升冪時 null 仍排在最末 —— 這是與一般比較器最關鍵的差異', () => {
    expect(sortValues([1, null, 3, null, 2], false)).toEqual([1, 2, 3, null, null])
  })

  it('全為 null 時不改變相對順序', () => {
    expect(sortValues([null, null, null], true)).toEqual([null, null, null])
  })

  it('負值參與正常排序,不被當成缺值', () => {
    expect(sortValues([-0.5, null, 0.2, -0.1], true)).toEqual([0.2, -0.1, -0.5, null])
  })

  it('零是有效值,不等同於 null', () => {
    expect(sortValues([0, null, 0.1], true)).toEqual([0.1, 0, null])
  })
})

describe('toSortable', () => {
  it('數值原樣通過', () => {
    expect(toSortable(0.18)).toBe(0.18)
  })

  it('零不被當成缺值', () => {
    expect(toSortable(0)).toBe(0)
  })

  it('null 轉成 undefined 交給 TanStack 的 sortUndefined 處理', () => {
    expect(toSortable(null)).toBeUndefined()
  })

  it('NaN 也視為缺值', () => {
    expect(toSortable(Number.NaN)).toBeUndefined()
  })
})
