/**
 * 未記錄分割的警示。
 *
 * 這是「我的組合」裡最容易無聲出錯的一項:分割前買進的紀錄若沒補上分割,
 * 市值少算四分之三而畫面上毫無異常。測試釘住的是「有問題時一定講」
 * 與「沒問題時一定不吵」——後者同樣重要,常駐的警告等於沒有警告。
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../lib/portfolio'
import { fixtureDetail } from '../data/fixture'
import { SplitNotice } from './SplitNotice'

/** 我方序列(已還原):0050 在這段期間一直是 48–52 的尺度。 */
function mockSeries(close = 48.51) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.includes('benchmark')
      ? { start: null, days: [], value: [] }
      : fixtureDetail({
          series: {
            start: '2025-01-01',
            days: Array.from({ length: 400 }, (_, i) => i),
            adj: Array.from({ length: 400 }, () => close),
            close: Array.from({ length: 400 }, () => close),
          },
        })),
  })))
}

const buy = (date: string, price: number): Transaction => ({
  id: `b${date}`, type: 'buy', code: '0050', date,
  shares: 1000, price, fee: 0, tax: 0,
})

beforeEach(() => mockSeries())
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function renderNotice(txs: Transaction[], onAdd = vi.fn()) {
  render(<SplitNotice transactions={txs} onAdd={onAdd} />)
  // 給 loadDetail 一個 tick
  await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
  return onAdd
}

describe('SplitNotice', () => {
  it('用真實的 0050 數字抓到未記錄的 1:4 分割', async () => {
    // 證交所官方 2025-01-02 收盤 194.05,我方序列 48.51
    await renderNotice([buy('2025-01-06', 194.05)])
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/可能未記錄的股票分割/)
      expect(alert).toHaveTextContent(/1:4 分割/)
    })
  })

  it('說明不補會怎樣 —— 光說「偵測到」使用者不會知道嚴重性', async () => {
    await renderNotice([buy('2025-01-06', 194.05)])
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/市值與 XIRR 都會錯/))
  })

  it('尺度相符時完全不顯示 —— 常駐的警告等於沒有警告', async () => {
    render(<SplitNotice transactions={[buy('2025-08-01', 48.51)]} onAdd={vi.fn()} />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('沒有交易時不顯示', () => {
    render(<SplitNotice transactions={[]} onAdd={vi.fn()} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('按下「補一筆」產生一筆倍率正確的分割交易', async () => {
    const onAdd = await renderNotice([buy('2025-01-06', 194.05)])
    await waitFor(() => expect(screen.getByRole('button')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button'))
    const tx = onAdd.mock.calls[0]![0] as Transaction
    expect(tx.type).toBe('split')
    expect(tx.code).toBe('0050')
    expect(tx.price).toBe(4)
    expect(tx.shares).toBe(0)
    // 建議日期是最晚一筆不符交易的隔天
    expect(tx.date).toBe('2025-01-07')
  })

  it('價格差得不像分割就不報 —— 使用者打錯數字不該被當成分割', async () => {
    render(<SplitNotice transactions={[buy('2025-01-06', 48.51 * 2.5)]} onAdd={vi.fn()} />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('舊版快取缺 series 時不崩,只是不偵測', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ code: '0050', name: 'x' }),
    })))
    render(<SplitNotice transactions={[buy('2025-01-06', 194.05)]} onAdd={vi.fn()} />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
