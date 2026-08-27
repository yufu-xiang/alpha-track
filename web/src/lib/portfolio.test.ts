import { describe, expect, it } from 'vitest'
import { buildHoldings, summarize, toCashFlows, type Transaction } from './portfolio'

let seq = 0
function tx(o: Partial<Transaction> & Pick<Transaction, 'type' | 'code' | 'date'>): Transaction {
  seq += 1
  return { id: `t${seq}`, shares: 0, price: 0, fee: 0, tax: 0, ...o }
}

describe('buildHoldings', () => {
  it('單筆買進:成本含手續費', () => {
    const h = buildHoldings([
      tx({ type: 'buy', code: '0050', date: '2025-01-01', shares: 1000, price: 100, fee: 142 }),
    ]).get('0050')!
    expect(h.shares).toBe(1000)
    expect(h.avgCost).toBeCloseTo(100.142)
  })

  it('分批買進用移動平均 —— 與台灣券商對帳單口徑一致', () => {
    const h = buildHoldings([
      tx({ type: 'buy', code: '0050', date: '2025-01-01', shares: 1000, price: 100 }),
      tx({ type: 'buy', code: '0050', date: '2025-06-01', shares: 1000, price: 120 }),
    ]).get('0050')!
    expect(h.shares).toBe(2000)
    expect(h.avgCost).toBeCloseTo(110)
  })

  it('賣出不改變平均成本,只減股數並結算已實現 —— 移動平均法的定義', () => {
    // 若改用先進先出,同一批交易會得到不同的成本與損益數字。
    const h = buildHoldings([
      tx({ type: 'buy', code: '0050', date: '2025-01-01', shares: 1000, price: 100 }),
      tx({ type: 'buy', code: '0050', date: '2025-06-01', shares: 1000, price: 120 }),
      tx({ type: 'sell', code: '0050', date: '2025-09-01', shares: 500, price: 130 }),
    ]).get('0050')!
    expect(h.avgCost).toBeCloseTo(110)
    expect(h.shares).toBe(1500)
    expect(h.realized).toBeCloseTo(500 * (130 - 110))
  })

  it('已實現損益扣掉手續費與交易稅', () => {
    const h = buildHoldings([
      tx({ type: 'buy', code: '0050', date: '2025-01-01', shares: 1000, price: 100 }),
      tx({ type: 'sell', code: '0050', date: '2025-09-01', shares: 1000, price: 110,
           fee: 156, tax: 110 }),
    ]).get('0050')!
    expect(h.realized).toBeCloseTo(1000 * 10 - 156 - 110)
  })

  it('全部賣光後平均成本歸零,不留下殘值', () => {
    const h = buildHoldings([
      tx({ type: 'buy', code: '0050', date: '2025-01-01', shares: 1000, price: 100 }),
      tx({ type: 'sell', code: '0050', date: '2025-09-01', shares: 1000, price: 110 }),
    ]).get('0050')!
    expect(h.shares).toBe(0)
    expect(h.avgCost).toBe(0)
  })

  it('賣超過持股數不產生負持股 —— 輸入錯誤不該汙染後面每一筆計算', () => {
    const h = buildHoldings([
      tx({ type: 'buy', code: '0050', date: '2025-01-01', shares: 100, price: 100 }),
      tx({ type: 'sell', code: '0050', date: '2025-09-01', shares: 999, price: 110 }),
    ]).get('0050')!
    expect(h.shares).toBe(0)
    expect(h.realized).toBeCloseTo(100 * 10)
  })

  it('配息累加,並扣掉費用', () => {
    const h = buildHoldings([
      tx({ type: 'buy', code: '0056', date: '2025-01-01', shares: 1000, price: 40 }),
      tx({ type: 'dividend', code: '0056', date: '2025-07-21', shares: 1000, price: 1.35,
           fee: 10 }),
    ]).get('0056')!
    expect(h.dividends).toBeCloseTo(1350 - 10)
  })

  it('交易依日期重放,輸入順序不影響結果', () => {
    const late = tx({ type: 'buy', code: '0050', date: '2025-06-01', shares: 1000, price: 120 })
    const early = tx({ type: 'buy', code: '0050', date: '2025-01-01', shares: 1000, price: 100 })
    const a = buildHoldings([late, early]).get('0050')!
    const b = buildHoldings([early, late]).get('0050')!
    expect(a.avgCost).toBeCloseTo(b.avgCost)
  })

  it('多檔各自獨立計算', () => {
    const m = buildHoldings([
      tx({ type: 'buy', code: '0050', date: '2025-01-01', shares: 1000, price: 100 }),
      tx({ type: 'buy', code: '0056', date: '2025-01-01', shares: 2000, price: 40 }),
    ])
    expect(m.get('0050')!.avgCost).toBeCloseTo(100)
    expect(m.get('0056')!.avgCost).toBeCloseTo(40)
  })
})

describe('summarize', () => {
  const txs = [
    tx({ type: 'buy', code: '0050', date: '2025-01-01', shares: 1000, price: 100, fee: 142 }),
    tx({ type: 'dividend', code: '0050', date: '2025-07-21', shares: 1000, price: 2 }),
  ]

  it('市值以目前價格計算', () => {
    const s = summarize(txs, new Map([['0050', 120]]), '2026-01-01')
    expect(s.marketValue).toBeCloseTo(120000)
    expect(s.unrealized).toBeCloseTo(120000 - 100142)
  })

  it('含息總報酬把已實現與已領息都算進去', () => {
    const s = summarize(txs, new Map([['0050', 120]]), '2026-01-01')
    // (120000 + 0 + 2000 − 100142) ÷ 100142
    expect(s.totalReturn).toBeCloseTo((120000 + 2000 - 100142) / 100142)
  })

  it('XIRR 有值且為正', () => {
    const s = summarize(txs, new Map([['0050', 120]]), '2026-01-01')
    expect(s.xirr).not.toBeNull()
    expect(s.xirr!).toBeGreaterThan(0)
  })

  it('查不到價格的代號會被回報,而不是靜默當成沒持股', () => {
    // 靜默略過會讓總市值悄悄短少,而畫面上完全看不出來。
    const s = summarize(txs, new Map(), '2026-01-01')
    expect(s.missingPrices).toEqual(['0050'])
    expect(s.marketValue).toBe(0)
  })

  it('沒有任何交易時總報酬為 null 而非 0', () => {
    const s = summarize([], new Map(), '2026-01-01')
    expect(s.totalReturn).toBeNull()
    expect(s.xirr).toBeNull()
  })

  it('已全部賣出時仍算得出已實現損益與 XIRR', () => {
    const closed = [
      tx({ type: 'buy', code: '0050', date: '2025-01-01', shares: 1000, price: 100 }),
      tx({ type: 'sell', code: '0050', date: '2026-01-01', shares: 1000, price: 130 }),
    ]
    const s = summarize(closed, new Map(), '2026-06-01')
    expect(s.realized).toBeCloseTo(30000)
    expect(s.xirr).toBeCloseTo(0.3, 2)
  })
})

describe('toCashFlows', () => {
  it('買入為負、賣出與配息為正、期末市值為正', () => {
    const flows = toCashFlows([
      tx({ type: 'buy', code: '0050', date: '2025-01-01', shares: 100, price: 100, fee: 20 }),
      tx({ type: 'sell', code: '0050', date: '2025-06-01', shares: 50, price: 110, fee: 20, tax: 5 }),
      tx({ type: 'dividend', code: '0050', date: '2025-07-01', shares: 50, price: 2 }),
    ], 6000, '2026-01-01')
    expect(flows[0]!.amount).toBe(-10020)
    expect(flows[1]!.amount).toBe(5475)
    expect(flows[2]!.amount).toBe(100)
    expect(flows[3]).toEqual({ date: '2026-01-01', amount: 6000 })
  })

  it('市值為零時不加期末流入 —— 那會被當成一筆真的收款', () => {
    const flows = toCashFlows([
      tx({ type: 'buy', code: '0050', date: '2025-01-01', shares: 100, price: 100 }),
    ], 0, '2026-01-01')
    expect(flows).toHaveLength(1)
  })
})

describe('股票分割(規格 §6.1 未涵蓋,但不處理會讓數字錯掉)', () => {
  const buy = {
    id: 'b1', type: 'buy' as const, code: '0050', date: '2025-01-06',
    shares: 1000, price: 194, fee: 276, tax: 0,
  }
  const split = {
    id: 's1', type: 'split' as const, code: '0050', date: '2025-06-11',
    shares: 0, price: 4, fee: 0, tax: 0,
  }

  it('股數乘上倍率,平均成本除以倍率,總成本不變', () => {
    const before = buildHoldings([buy]).get('0050')!
    const after = buildHoldings([buy, split]).get('0050')!
    expect(after.shares).toBe(4000)
    expect(after.avgCost).toBeCloseTo(before.avgCost / 4)
    expect(after.shares * after.avgCost).toBeCloseTo(before.shares * before.avgCost)
  })

  it('分割不產生已實現損益,也不動已領配息', () => {
    const h = buildHoldings([buy, split]).get('0050')!
    expect(h.realized).toBe(0)
    expect(h.dividends).toBe(0)
  })

  it('反分割(4:1)填 0.25,股數變四分之一', () => {
    const reverse = { ...split, price: 0.25 }
    const h = buildHoldings([buy, reverse]).get('0050')!
    expect(h.shares).toBe(250)
    expect(h.avgCost).toBeCloseTo((1000 * 194 + 276) / 1000 * 4)
  })

  it('分割之後賣出,依新的股數與新的平均成本結算', () => {
    const sell = {
      id: 'x', type: 'sell' as const, code: '0050', date: '2025-08-01',
      shares: 4000, price: 52, fee: 296, tax: 156,
    }
    const h = buildHoldings([buy, split, sell]).get('0050')!
    expect(h.shares).toBe(0)
    // 4000 × 52 − 原始總成本 − 費用
    expect(h.realized).toBeCloseTo(4000 * 52 - (1000 * 194 + 276) - 296 - 156)
  })

  it('分割不進 XIRR 的現金流 —— price 欄存的是倍率不是金額', () => {
    const flows = toCashFlows([buy, split], 0, '2026-08-27')
    expect(flows).toHaveLength(1)
    expect(flows[0]!.amount).toBeCloseTo(-(1000 * 194 + 276))
  })

  it('倍率為 0 或負數時不動作 —— 那會讓持股歸零或變成負的', () => {
    const h = buildHoldings([buy, { ...split, price: 0 }]).get('0050')!
    expect(h.shares).toBe(1000)
  })
})
