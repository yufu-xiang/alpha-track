import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureMeta, fixtureRankings } from '../data/fixture'
import { Portfolio } from './Portfolio'

const KEY = 'alpha-track:portfolio'
const buy = {
  id: 'a', type: 'buy' as const, code: '0050', date: '2025-01-01',
  shares: 1000, price: 100, fee: 142, tax: 0,
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.includes('meta') ? fixtureMeta : fixtureRankings),
  })))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function renderLoaded() {
  render(<Portfolio />)
  await waitFor(() => expect(screen.getByRole('heading', { name: '我的組合' })).toBeInTheDocument())
}

describe('Portfolio', () => {
  it('可從詳情頁預填 ETF 代號', async () => {
    render(<Portfolio initialCode="0050" />)
    expect(await screen.findByLabelText('代號')).toHaveValue('0050')
    expect(screen.getByRole('status')).toHaveTextContent('0050')
  })

  it('一律提示紀錄只存在本機 —— 規格要求必須明示這個風險', async () => {
    await renderLoaded()
    expect(screen.getByText(/清除瀏覽器資料、換裝置/)).toBeInTheDocument()
  })

  it('沒有交易時不提醒匯出', async () => {
    await renderLoaded()
    expect(screen.queryByText(/建議現在匯出備份/)).not.toBeInTheDocument()
  })

  it('有交易但從未匯出就提醒 —— 那是風險最高的狀態', async () => {
    localStorage.setItem(KEY, JSON.stringify({ transactions: [buy], lastExport: null }))
    await renderLoaded()
    expect(screen.getByText(/從未匯出/)).toBeInTheDocument()
  })

  it('剛匯出過不提醒', async () => {
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem(KEY, JSON.stringify({ transactions: [buy], lastExport: today }))
    await renderLoaded()
    expect(screen.queryByText(/建議現在匯出備份/)).not.toBeInTheDocument()
  })

  it('依交易算出總覽數字', async () => {
    localStorage.setItem(KEY, JSON.stringify({ transactions: [buy], lastExport: null }))
    await renderLoaded()
    // fixture 的 0050 現價 195.5,持股 1000 -> 市值 195,500
    const summary = screen.getByRole('heading', { name: '組合總覽' }).closest('section')!
    expect(within(summary).getByText('195,500')).toBeInTheDocument()
  })

  it('新增交易後立即反映並寫入 localStorage', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await user.type(screen.getByLabelText('代號'), '0050')
    await user.type(screen.getByLabelText('股數'), '1000')
    await user.type(screen.getByLabelText('價格'), '100')
    await user.click(screen.getByRole('button', { name: '新增' }))

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(KEY)!)
      expect(stored.transactions).toHaveLength(1)
    })
    const activity = screen.getByRole('heading', { name: '交易紀錄' }).closest('section')!
    expect(within(activity).getByRole('table')).toHaveTextContent('0050')
  })

  it('賣出時自動帶入證交稅,且可覆寫', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await user.selectOptions(screen.getByLabelText('類型'), 'sell')
    await user.type(screen.getByLabelText('代號'), '0050')
    await user.type(screen.getByLabelText('股數'), '1000')
    await user.type(screen.getByLabelText('價格'), '100')
    // 100,000 × 0.1% = 100
    await waitFor(() => expect(screen.getByLabelText('交易稅')).toHaveValue(100))

    await user.clear(screen.getByLabelText('交易稅'))
    await user.type(screen.getByLabelText('交易稅'), '95')
    expect(screen.getByLabelText('交易稅')).toHaveValue(95)
  })

  it('債券 ETF 賣出的證交稅在免徵期內為 0', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await user.selectOptions(screen.getByLabelText('類型'), 'sell')
    await user.type(screen.getByLabelText('代號'), '00679B')
    await user.type(screen.getByLabelText('股數'), '1000')
    await user.type(screen.getByLabelText('價格'), '30')
    await waitFor(() => expect(screen.getByLabelText('交易稅')).toHaveValue(0))
  })

  it('可刪除交易', async () => {
    const user = userEvent.setup()
    localStorage.setItem(KEY, JSON.stringify({ transactions: [buy], lastExport: null }))
    await renderLoaded()
    await user.click(screen.getByRole('button', { name: /刪除/ }))
    await waitFor(() => expect(screen.getByText(/還沒有交易紀錄/)).toBeInTheDocument())
  })

  it('配置圓餅可切換依標的或依分類', async () => {
    const user = userEvent.setup()
    localStorage.setItem(KEY, JSON.stringify({ transactions: [buy], lastExport: null }))
    await renderLoaded()
    expect(screen.getByRole('img', { name: /依標的/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '依分類' }))
    expect(screen.getByRole('img', { name: /依分類/ })).toBeInTheDocument()
  })

  it('查不到現價的持股會被明確回報,而不是靜默短少總市值', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      transactions: [{ ...buy, code: '09999' }], lastExport: null }))
    await renderLoaded()
    await waitFor(() =>
      expect(screen.getByText(/查不到 09999 的現價/)).toBeInTheDocument())
  })

  it('持倉明細顯示占比、成本與報酬', async () => {
    localStorage.setItem(KEY, JSON.stringify({ transactions: [buy], lastExport: null }))
    await renderLoaded()
    const section = screen.getByRole('heading', { name: '持倉明細與再平衡' }).closest('section')!
    expect(within(section).getAllByText('100.00%')).toHaveLength(2)
    expect(within(section).getByText('+95.22%')).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: '0050' }))
      .toHaveAttribute('href', '#/etf/0050')
  })

  it('可設定等權目標並把買賣估算保存到組合資料', async () => {
    const user = userEvent.setup()
    const second = { ...buy, id: 'b', code: '0056', price: 40 }
    localStorage.setItem(KEY, JSON.stringify({
      transactions: [buy, second], lastExport: null,
    }))
    await renderLoaded()
    await user.click(screen.getByRole('button', { name: '設定等權目標' }))

    expect(screen.getByLabelText('0050 目標配置')).toHaveValue(50)
    expect(screen.getByLabelText('0056 目標配置')).toHaveValue(50)
    const section = screen.getByRole('heading', { name: '持倉明細與再平衡' }).closest('section')!
    expect(within(section).getByText('賣出')).toBeInTheDocument()
    expect(within(section).getByText('買進')).toBeInTheDocument()
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(KEY)!)
      expect(stored.targets).toEqual({ '0050': 0.5, '0056': 0.5 })
    })
  })

  it('新增持倉後若缺少目標比例，明確指出尚未設定的檔數', async () => {
    const second = { ...buy, id: 'b', code: '0056', price: 40 }
    localStorage.setItem(KEY, JSON.stringify({
      transactions: [buy, second], targets: { '0050': 1 }, lastExport: null,
    }))
    await renderLoaded()
    expect(screen.getAllByText(/1 檔.*未設定/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/請調整至 100%/)).not.toBeInTheDocument()
  })
})

describe('推估配息的標記(規格 §6.4)', () => {
  it('交易紀錄表把推估的配息標出來 —— 只在記錄前標示等於沒標示', async () => {
    const est = {
      id: 'e1', type: 'dividend' as const, code: '0050', date: '2026-08-10',
      shares: 40_000, price: 0.6, fee: 506.4, tax: 0, estimated: true,
    }
    localStorage.setItem(KEY, JSON.stringify({ transactions: [est], lastExport: null }))
    await renderLoaded()
    const row = screen.getByRole('row', { name: /2026\/08\/10/ })
    expect(within(row).getByText('推估')).toBeInTheDocument()
  })

  it('自己記的配息不標推估', async () => {
    const manual = {
      id: 'm1', type: 'dividend' as const, code: '0050', date: '2026-08-10',
      shares: 40_000, price: 0.6, fee: 520, tax: 0,
    }
    localStorage.setItem(KEY, JSON.stringify({ transactions: [manual], lastExport: null }))
    await renderLoaded()
    const row = screen.getByRole('row', { name: /2026\/08\/10/ })
    expect(within(row).queryByText('推估')).not.toBeInTheDocument()
  })
})
