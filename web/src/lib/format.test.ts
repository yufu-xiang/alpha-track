import { describe, expect, it } from 'vitest'
import { formatDate, formatNumber, formatPercent } from './format'

describe('formatPercent', () => {
  it('把小數轉為百分比字串', () => {
    expect(formatPercent(0.1834)).toBe('+18.34%')
  })

  it('負值帶負號', () => {
    expect(formatPercent(-0.0521)).toBe('-5.21%')
  })

  it('零顯示為 0.00% 而非帶正號', () => {
    expect(formatPercent(0)).toBe('0.00%')
  })

  it('null 顯示為破折號 —— 這是資料不足的視覺標記', () => {
    expect(formatPercent(null)).toBe('—')
  })

  it('可指定小數位數', () => {
    expect(formatPercent(0.1834, 1)).toBe('+18.3%')
  })

  it('小到會被四捨五入成零的負值仍保留負號', () => {
    // 顯示 -0.00% 讀起來確實有點怪,但它是誠實的:那天確實是跌的。
    // 抹成 0.00% 會讓「微跌」與「完全沒動」看起來一樣。
    expect(formatPercent(-0.00001)).toBe('-0.00%')
  })

  it('負零視同零,不顯示負號', () => {
    expect(formatPercent(-0)).toBe('0.00%')
  })
})

describe('formatNumber', () => {
  it('保留指定小數位', () => {
    expect(formatNumber(0.9187, 2)).toBe('0.92')
  })

  it('null 顯示為破折號', () => {
    expect(formatNumber(null)).toBe('—')
  })

  it('負值正常顯示,不加正號', () => {
    expect(formatNumber(-1.0122, 2)).toBe('-1.01')
  })

  it('零顯示為 0.00,不是破折號 —— 零與資料不足是兩件事', () => {
    expect(formatNumber(0)).toBe('0.00')
  })
})

describe('formatDate', () => {
  it('把 ISO 日期轉為本地格式', () => {
    expect(formatDate('2003-06-30')).toBe('2003/06/30')
  })

  it('null 顯示為破折號', () => {
    expect(formatDate(null)).toBe('—')
  })

  it('空字串也視為無資料', () => {
    expect(formatDate('')).toBe('—')
  })
})
