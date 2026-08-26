import { describe, expect, it } from 'vitest'
import { BOND_ETF_TAX_EXEMPTION_UNTIL, commission, DEFAULT_FEE_CONFIG, sellTaxRate } from './fees'

const ctx = (over: Partial<Parameters<typeof sellTaxRate>[0]> = {}) => ({
  category: '市值型', isLeveraged: false, isInverse: false,
  date: '2026-08-26', ...over,
})

describe('證交稅', () => {
  it('一般 ETF 賣出 0.1%', () => {
    expect(sellTaxRate(ctx())).toBe(0.001)
  })

  it('債券 ETF 在免徵期內為 0', () => {
    expect(sellTaxRate(ctx({ category: '債券型' }))).toBe(0)
  })

  it('免徵到期後回到 0.1% —— 寫死 0 會在隔天靜默算錯每一筆賣出', () => {
    expect(sellTaxRate(ctx({ category: '債券型', date: '2027-01-01' }))).toBe(0.001)
  })

  it('免徵最後一天仍為 0', () => {
    expect(sellTaxRate(ctx({ category: '債券型', date: BOND_ETF_TAX_EXEMPTION_UNTIL })))
      .toBe(0)
  })

  it('槓桿與反向的債券 ETF 不在免徵範圍', () => {
    expect(sellTaxRate(ctx({ category: '債券型', isLeveraged: true }))).toBe(0.001)
    expect(sellTaxRate(ctx({ category: '債券型', isInverse: true }))).toBe(0.001)
  })
})

describe('手續費', () => {
  it('法定費率 0.1425%', () => {
    expect(DEFAULT_FEE_CONFIG.commissionRate).toBe(0.001425)
  })

  it('預設不打折 —— 折扣因人而異,不能替使用者假設', () => {
    expect(DEFAULT_FEE_CONFIG.commissionDiscount).toBe(1)
  })

  it('大額交易按比例', () => {
    expect(commission(1_000_000, DEFAULT_FEE_CONFIG)).toBe(1425)
  })

  it('小額交易收最低 20 元 —— 少了這條,小額定期定額的成本會被嚴重低估', () => {
    expect(commission(5000, DEFAULT_FEE_CONFIG)).toBe(20)
  })

  it('折扣套用在費率上,但最低收費仍成立', () => {
    const cfg = { ...DEFAULT_FEE_CONFIG, commissionDiscount: 0.2 }
    expect(commission(1_000_000, cfg)).toBe(285)
    expect(commission(50_000, cfg)).toBe(20)
  })

  it('金額為零或負時不收費', () => {
    expect(commission(0, DEFAULT_FEE_CONFIG)).toBe(0)
    expect(commission(-100, DEFAULT_FEE_CONFIG)).toBe(0)
  })
})
