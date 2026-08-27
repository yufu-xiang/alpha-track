import { describe, expect, it } from 'vitest'
import { detectSplits, RATIO_TOLERANCE, snapToSplitRatio } from './splitDetect'

const tx = (date: string, price: number, type = 'buy', code = '0050') =>
  ({ type, code, date, price })

/** 我方序列(已還原)。0050 在 2025-06-11 做 1:4 分割。 */
const priceOn = (code: string, date: string) => {
  if (code !== '0050') return null
  // 分割前後我方序列都是「還原後」的尺度,所以是連續的
  return date < '2025-06-11' ? 48.51 : 52.0
}

describe('snapToSplitRatio', () => {
  it('對到乾淨的整數倍率', () => {
    expect(snapToSplitRatio(4.0)).toBe(4)
    expect(snapToSplitRatio(3.98)).toBe(4)
    expect(snapToSplitRatio(2.01)).toBe(2)
  })

  it('倒數對應反分割', () => {
    expect(snapToSplitRatio(0.25)).toBeCloseTo(0.25)
    expect(snapToSplitRatio(1 / 7)).toBeCloseTo(1 / 7)
  })

  it('對不到整數倍率就回 null —— 使用者打錯價格不該被當成分割', () => {
    expect(snapToSplitRatio(1.6)).toBeNull()
    expect(snapToSplitRatio(4.5)).toBeNull()
    expect(snapToSplitRatio(1.0)).toBeNull()
  })

  it('容差之外不接受', () => {
    expect(snapToSplitRatio(4 * (1 + RATIO_TOLERANCE * 0.9))).toBe(4)
    expect(snapToSplitRatio(4 * (1 + RATIO_TOLERANCE * 3))).toBeNull()
  })

  it('0 與負數回 null', () => {
    expect(snapToSplitRatio(0)).toBeNull()
    expect(snapToSplitRatio(-4)).toBeNull()
  })
})

describe('detectSplits', () => {
  it('用真實的 0050 數字抓到 1:4', () => {
    // 證交所官方 2025-01-02 收盤 194.05,我方序列 48.5125,比值 4.000
    const hints = detectSplits([tx('2025-01-06', 194.05)], priceOn)
    expect(hints).toHaveLength(1)
    expect(hints[0]!.ratio).toBe(4)
    expect(hints[0]!.code).toBe('0050')
  })

  it('建議日期是最晚一筆不符交易的隔天', () => {
    const hints = detectSplits(
      [tx('2025-01-06', 194.05), tx('2025-03-10', 194.05)], priceOn)
    expect(hints[0]!.lastMismatch).toBe('2025-03-10')
    expect(hints[0]!.suggestedDate).toBe('2025-03-11')
    expect(hints[0]!.count).toBe(2)
  })

  it('尺度相符的交易不觸發', () => {
    expect(detectSplits([tx('2025-08-01', 52.0)], priceOn)).toEqual([])
  })

  it('分割後的交易不觸發,只有分割前的會', () => {
    const hints = detectSplits(
      [tx('2025-01-06', 194.05), tx('2025-08-01', 52.0)], priceOn)
    expect(hints).toHaveLength(1)
    // 建議日期仍落在兩筆之間 —— 分割必定發生在這個區間
    expect(hints[0]!.suggestedDate > '2025-01-06').toBe(true)
    expect(hints[0]!.suggestedDate <= '2025-08-01').toBe(true)
  })

  it('配息與分割紀錄本身不參與偵測', () => {
    expect(detectSplits([
      { type: 'dividend', code: '0050', date: '2025-01-17', price: 2.7 },
      { type: 'split', code: '0050', date: '2025-06-11', price: 4 },
    ], priceOn)).toEqual([])
  })

  it('查不到價格的日期略過,不猜', () => {
    expect(detectSplits([tx('2025-01-06', 194.05, 'buy', '9999')], priceOn)).toEqual([])
  })

  it('賣出也算 —— 分割前賣出的價格同樣是舊尺度', () => {
    const hints = detectSplits([tx('2025-01-06', 194.05, 'sell')], priceOn)
    expect(hints).toHaveLength(1)
  })

  it('價格差得不像分割就不報 —— 例如記錯成兩倍半', () => {
    expect(detectSplits([tx('2025-01-06', 48.51 * 2.5)], priceOn)).toEqual([])
  })
})

describe('已記錄的分割', () => {
  const split = (date: string, ratio: number) =>
    ({ type: 'split', code: '0050', date, price: ratio })

  it('補上分割之後警告消失 —— 否則補完還一直掛著', () => {
    const txs = [tx('2025-01-06', 194.05), split('2025-01-07', 4)]
    expect(detectSplits(txs, priceOn)).toEqual([])
  })

  it('分割記在交易**之前**不算數 —— 那解釋不了這筆的尺度', () => {
    const txs = [tx('2025-03-01', 194.05), split('2025-01-07', 4)]
    expect(detectSplits(txs, priceOn)).toHaveLength(1)
  })

  it('補錯倍率的話仍然會報 —— 而且報的是剩下沒解釋的部分', () => {
    const txs = [tx('2025-01-06', 194.05), split('2025-01-07', 2)]
    const hints = detectSplits(txs, priceOn)
    expect(hints).toHaveLength(1)
    expect(hints[0]!.ratio).toBe(2)
  })

  it('兩次分割各補一筆之後才完全消失', () => {
    // 記錄價格是 8 倍(先 1:2 再 1:4)
    const txs = [tx('2025-01-06', 48.51 * 8)]
    expect(detectSplits(txs, priceOn)).toHaveLength(1)
    const one = [...txs, split('2025-01-07', 2)]
    expect(detectSplits(one, priceOn)).toHaveLength(1)
    const two = [...one, split('2025-02-07', 4)]
    expect(detectSplits(two, priceOn)).toEqual([])
  })
})
