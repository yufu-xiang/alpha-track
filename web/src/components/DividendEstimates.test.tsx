/**
 * 應領配息推估的元件測試。規格 §6.4。
 *
 * 規格對這一節的要求不只是「算出來」,而是**標記為推估值**且可覆寫。
 * 那兩件事都釘在這裡 —— 少了標記,使用者會拿推估值去對帳單。
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../lib/portfolio'
import { DividendEstimates } from './DividendEstimates'

const buy: Transaction = {
  id: 'b1', type: 'buy', code: '0050', date: '2026-01-01',
  shares: 40_000, price: 50, fee: 0, tax: 0,
}

function mockDetail(dividends: { ex_date: string; pay_date: string | null; amount: number }[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.includes('benchmark')
      ? { start: null, days: [], value: [] }
      : {
          code: '0050', name: '元大台灣50', category: null, region: null,
          exchange: 'TWSE', issuer: null, tracking_index: null,
          listing_date: null, data_start: null,
          returns: {}, annualized: {}, excess: {},
          risk: { volatility: null, mdd: null, sharpe: null, beta: null },
          premium_discount: null, premium_low: null, premium_high: null,
          premium_days_ratio: null, premium_sample: 0,
          premium_series: { start: null, days: [], premium: [] },
          series: { start: null, days: [], adj: [], close: [] },
          dividends,
        }),
  })))
}

beforeEach(() => mockDetail([{ ex_date: '2026-07-21', pay_date: '2026-08-10', amount: 0.6 }]))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function renderEstimates(txs: Transaction[], onRecord = vi.fn()) {
  render(<DividendEstimates transactions={txs} onRecord={onRecord} />)
  await waitFor(() =>
    expect(screen.queryByText('查詢配息紀錄中…')).not.toBeInTheDocument())
  return onRecord
}

describe('DividendEstimates', () => {
  it('顯著標示這是推估值而非實際入帳金額', async () => {
    await renderEstimates([buy])
    expect(screen.getByRole('note')).toHaveTextContent(/推估值,不是實際入帳金額/)
  })

  it('毛額、預估補充保費、預估實收三個數字並列', async () => {
    await renderEstimates([buy])
    const row = screen.getByRole('row', { name: /0050/ })
    // 40,000 股 × 0.6 = 24,000 毛額;達門檻,扣 2.11%
    expect(within(row).getByText('24,000')).toBeInTheDocument()
    expect(within(row).getByText('506.40')).toBeInTheDocument()
    expect(within(row).getByText('23,493.60')).toBeInTheDocument()
  })

  it('未達門檻時補充保費顯示破折號,不是 0.00', async () => {
    await renderEstimates([{ ...buy, shares: 1000 }])
    const row = screen.getByRole('row', { name: /0050/ })
    expect(within(row).getByText('—')).toBeInTheDocument()
  })

  it('留空實收金額就以推估值記錄,並標記為 estimated', async () => {
    const onRecord = await renderEstimates([buy])
    await userEvent.click(screen.getByRole('button', { name: '記錄' }))
    const tx = onRecord.mock.calls[0]![0] as Transaction
    expect(tx.estimated).toBe(true)
    expect(tx.date).toBe('2026-08-10')
    expect(tx.shares * tx.price - tx.fee).toBeCloseTo(23_493.6)
  })

  it('填入實收金額後轉為確定值(規格 §6.4 要求可覆寫)', async () => {
    const onRecord = await renderEstimates([buy])
    await userEvent.type(
      screen.getByLabelText('0050 2026-07-21 的實收金額'), '23480')
    await userEvent.click(screen.getByRole('button', { name: '記錄' }))
    const tx = onRecord.mock.calls[0]![0] as Transaction
    expect(tx.estimated).toBe(false)
    expect(tx.shares * tx.price - tx.fee).toBeCloseTo(23_480)
  })

  it('列出未模擬的落差來源 —— 使用者才知道差額是不是合理', async () => {
    await renderEstimates([buy])
    expect(screen.getByText(/匯費/)).toBeInTheDocument()
    expect(screen.getByText(/合併計算/)).toBeInTheDocument()
  })

  it('沒有交易時說明原因,不留一張空表', async () => {
    await renderEstimates([])
    expect(screen.getByText(/先記錄買進交易/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('已記錄過的配息不再出現在推估清單', async () => {
    const recorded: Transaction = {
      id: 'd1', type: 'dividend', code: '0050', date: '2026-07-21',
      shares: 40_000, price: 0.6, fee: 520, tax: 0,
    }
    await renderEstimates([buy, recorded])
    expect(screen.getByText(/都已經記過了/)).toBeInTheDocument()
  })

  it('已賣光的標的仍會查配息 —— 持有期間一樣領過息', async () => {
    const sell: Transaction = {
      id: 's1', type: 'sell', code: '0050', date: '2026-08-01',
      shares: 40_000, price: 60, fee: 0, tax: 0,
    }
    await renderEstimates([buy, sell])
    expect(screen.getByRole('row', { name: /0050/ })).toBeInTheDocument()
  })
})

describe('資料畸形時的韌性', () => {
  it('detail 缺 dividends 欄位時只是沒有推估,不讓整頁崩掉', async () => {
    // 使用者的瀏覽器可能快取著舊版的 etf/*.json。CI 抓到過這個:
    // 一次 for...of 就足以讓整個「我的組合」白畫面。
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ code: '0050', name: '元大台灣50' }),
    })))
    await renderEstimates([buy])
    expect(screen.getByText(/都已經記過了|先記錄買進交易/)).toBeInTheDocument()
  })

  it('dividends 是 null 也不崩', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ code: '0050', name: 'x', dividends: null }),
    })))
    await renderEstimates([buy])
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
