import { describe, expect, it } from 'vitest'
import {
  estimateDividends, NHI_PREMIUM_RATE, NHI_SINGLE_PAYMENT_THRESHOLD, toTransaction,
} from './dividendEstimate'
import type { Transaction } from './portfolio'

function buy(date: string, shares: number, code = '0050'): Transaction {
  return { id: `b${date}${shares}`, type: 'buy', code, date, shares, price: 100, fee: 0, tax: 0 }
}
function sell(date: string, shares: number, code = '0050'): Transaction {
  return { id: `s${date}${shares}`, type: 'sell', code, date, shares, price: 100, fee: 0, tax: 0 }
}
const ev = (ex_date: string, amount: number, code = '0050') =>
  ({ code, ex_date, pay_date: null, amount })

describe('estimateDividends', () => {
  it('依除息日當時的持股計算應領配息', () => {
    const r = estimateDividends([buy('2026-01-01', 5000)], [ev('2026-07-21', 0.6)])
    expect(r).toHaveLength(1)
    expect(r[0]!.shares).toBe(5000)
    expect(r[0]!.gross).toBeCloseTo(3000)
  })

  it('除息日當天才買進不算 —— 台股要在前一交易日收盤就持有', () => {
    // 用 <= 的話這筆會被算進去,但那筆錢實際不會入帳,
    // 對不上對帳單正是這個功能最該避免的事。
    const r = estimateDividends([buy('2026-07-21', 5000)], [ev('2026-07-21', 0.6)])
    expect(r).toEqual([])
  })

  it('除息日前一天買進算得到', () => {
    const r = estimateDividends([buy('2026-07-20', 5000)], [ev('2026-07-21', 0.6)])
    expect(r[0]!.shares).toBe(5000)
  })

  it('除息前賣掉的部分不計入', () => {
    const r = estimateDividends(
      [buy('2026-01-01', 5000), sell('2026-06-01', 3000)], [ev('2026-07-21', 0.6)])
    expect(r[0]!.shares).toBe(2000)
  })

  it('除息日之後才賣不影響 —— 那時已經領到了', () => {
    const r = estimateDividends(
      [buy('2026-01-01', 5000), sell('2026-08-01', 5000)], [ev('2026-07-21', 0.6)])
    expect(r[0]!.shares).toBe(5000)
  })

  it('除息日沒有持股就不產生推估', () => {
    const r = estimateDividends(
      [buy('2026-01-01', 5000), sell('2026-06-01', 5000)], [ev('2026-07-21', 0.6)])
    expect(r).toEqual([])
  })

  it('已自己記過同一檔同一除息日的配息就不再推估 —— 否則重複計算', () => {
    const recorded: Transaction = {
      id: 'd1', type: 'dividend', code: '0050', date: '2026-07-21',
      shares: 5000, price: 0.6, fee: 10, tax: 0,
    }
    const r = estimateDividends([buy('2026-01-01', 5000), recorded], [ev('2026-07-21', 0.6)])
    expect(r).toEqual([])
  })

  it('不同標的的配息各自獨立', () => {
    const r = estimateDividends(
      [buy('2026-01-01', 5000, '0050'), buy('2026-01-01', 1000, '0056')],
      [ev('2026-07-21', 0.6, '0050'), ev('2026-07-15', 0.8, '0056')])
    expect(r.map((x) => x.code)).toEqual(['0050', '0056'])
    expect(r.find((x) => x.code === '0056')!.gross).toBeCloseTo(800)
  })

  it('新到舊排序 —— 最近一次是最常要對帳的那筆', () => {
    const r = estimateDividends([buy('2020-01-01', 1000)],
      [ev('2024-07-01', 1), ev('2026-07-01', 1), ev('2025-07-01', 1)])
    expect(r.map((x) => x.ex_date)).toEqual(['2026-07-01', '2025-07-01', '2024-07-01'])
  })
})

describe('二代健保補充保費(2026-08-26 查證)', () => {
  it('單次給付達 2 萬元才扣 2.11%', () => {
    const r = estimateDividends([buy('2026-01-01', 40_000)], [ev('2026-07-21', 0.6)])!
    expect(r[0]!.gross).toBeCloseTo(24_000)
    expect(r[0]!.nhiPremium).toBeCloseTo(24_000 * NHI_PREMIUM_RATE)
    expect(r[0]!.net).toBeCloseTo(24_000 * (1 - NHI_PREMIUM_RATE))
  })

  it('未達門檻不扣,而不是扣一個小數字', () => {
    const r = estimateDividends([buy('2026-01-01', 30_000)], [ev('2026-07-21', 0.6)])
    expect(r[0]!.gross).toBeCloseTo(18_000)
    expect(r[0]!.nhiPremium).toBe(0)
    expect(r[0]!.net).toBeCloseTo(r[0]!.gross)
  })

  it('恰好等於門檻要扣 —— 規定是「達」不是「超過」', () => {
    const shares = NHI_SINGLE_PAYMENT_THRESHOLD
    const r = estimateDividends([buy('2026-01-01', shares)], [ev('2026-07-21', 1)])
    expect(r[0]!.gross).toBe(NHI_SINGLE_PAYMENT_THRESHOLD)
    expect(r[0]!.nhiPremium).toBeGreaterThan(0)
  })

  it('是單次給付制,不是全年累計 —— 兩次各一萬八不扣', () => {
    const r = estimateDividends([buy('2026-01-01', 30_000)],
      [ev('2026-01-21', 0.6), ev('2026-07-21', 0.6)])
    expect(r).toHaveLength(2)
    expect(r.every((x) => x.nhiPremium === 0)).toBe(true)
  })
})

describe('toTransaction', () => {
  const est = {
    code: '0050', ex_date: '2026-07-21', pay_date: '2026-08-10',
    amountPerShare: 0.6, shares: 40_000,
    gross: 24_000, nhiPremium: 506.4, net: 23_493.6,
  }

  it('記在發放日,不是除息日 —— 那才是錢入帳的日子,XIRR 要的是這個', () => {
    expect(toTransaction(est, null, 'x').date).toBe('2026-08-10')
  })

  it('沒有發放日時退回除息日,不留空', () => {
    expect(toTransaction({ ...est, pay_date: null }, null, 'x').date).toBe('2026-07-21')
  })

  it('未填實收金額時標記為推估值', () => {
    const tx = toTransaction(est, null, 'x')
    expect(tx.estimated).toBe(true)
    expect(tx.shares * tx.price - tx.fee).toBeCloseTo(est.net)
  })

  it('填入實收金額後轉為確定值(規格 §6.4)', () => {
    const tx = toTransaction(est, 23_480, 'x')
    expect(tx.estimated).toBe(false)
    expect(tx.shares * tx.price - tx.fee).toBeCloseTo(23_480)
  })

  it('實收金額為 0 也視為確定 —— 0 與「還沒填」是兩回事', () => {
    expect(toTransaction(est, 0, 'x').estimated).toBe(false)
  })
})

describe('金額精度', () => {
  it('費用取到分為止 —— 浮點殘渣會原封不動進到匯出檔', () => {
    const est = {
      code: '0056', ex_date: '2026-07-21', pay_date: '2026-08-10',
      amountPerShare: 1.35, shares: 40_000,
      gross: 54_000, nhiPremium: 54_000 * NHI_PREMIUM_RATE,
      net: 54_000 * (1 - NHI_PREMIUM_RATE),
    }
    const tx = toTransaction(est, null, 'x')
    expect(tx.fee).toBe(1139.4)
  })
})
