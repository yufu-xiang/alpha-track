import { describe, expect, it } from 'vitest'
import { MAX_COMPARE, parseCodes, serializeCodes, toggleCompare } from './compare'

describe('toggleCompare', () => {
  it('未選則加入', () => {
    expect(toggleCompare(['0050'], '0056')).toEqual(['0050', '0056'])
  })

  it('已選則移除', () => {
    expect(toggleCompare(['0050', '0056'], '0050')).toEqual(['0056'])
  })

  it('額滿時忽略新選取,不悄悄踢掉先選的那一檔', () => {
    // 靜默替換會讓使用者以為自己沒點到,而且不知道少了哪一檔。
    const full = ['a', 'b', 'c', 'd', 'e']
    expect(toggleCompare(full, 'f')).toEqual(full)
  })

  it('額滿時仍可取消已選的', () => {
    expect(toggleCompare(['a', 'b', 'c', 'd', 'e'], 'c'))
      .toEqual(['a', 'b', 'd', 'e'])
  })

  it('上限為 5', () => {
    expect(MAX_COMPARE).toBe(5)
  })
})

describe('parseCodes', () => {
  it('以逗號分隔', () => {
    expect(parseCodes('0050,0056')).toEqual(['0050', '0056'])
  })

  it('轉大寫並去除空白', () => {
    expect(parseCodes(' 00679b , 0050 ')).toEqual(['00679B', '0050'])
  })

  it('去除重複', () => {
    expect(parseCodes('0050,0050,0056')).toEqual(['0050', '0056'])
  })

  it('超過上限時只取前五個 —— 網址是使用者可以手動編輯的', () => {
    expect(parseCodes('a,b,c,d,e,f,g')).toHaveLength(5)
  })

  it('濾掉不合法的片段,不讓它們變成請求路徑', () => {
    expect(parseCodes('0050,../etc,0056')).toEqual(['0050', '0056'])
  })

  it('空字串回傳空陣列', () => {
    expect(parseCodes('')).toEqual([])
  })

  it('序列化後可被解析回來', () => {
    const codes = ['0050', '0056', '00878']
    expect(parseCodes(serializeCodes(codes))).toEqual(codes)
  })
})
