import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureDetail, fixtureMeta, fixtureRankings } from '../data/fixture'
import { Compare } from './Compare'

function detailFor(code: string, name: string, y1: number) {
  const nulls = { W1: null, M1: null, M6: null, INCEPTION: null }
  return fixtureDetail({
    code, name, category: '市值型', region: '台灣', exchange: 'TWSE',
    issuer: null, tracking_index: null, listing_date: '2020-01-01',
    data_start: '2020-01-01',
    returns: { ...nulls, D1: 0.01, M3: 0.02, YTD: 0.3, Y1: y1, Y3: 1.2, Y5: 2.0, Y10: null },
    annualized: { ...nulls, D1: null, M3: null, YTD: null, Y1: null, Y3: 0.3, Y5: 0.24, Y10: null },
    excess: { ...nulls, D1: null, M3: null, YTD: null, Y1: 0.05, Y3: null, Y5: null, Y10: null },
    risk: { volatility: 0.28, mdd: -0.34, sharpe: 3.4, beta: 1.05 },
    premium_discount: null, premium_low: null, premium_high: null,
    premium_days_ratio: null, premium_sample: 0,
    series: {
      start: '2020-01-01', days: [0, 1, 2, 3],
      adj: [100, 105, 103, 110], close: [100, 105, 103, 110],
    },
  })
}

function mockFor(codes: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('benchmark')) return { ok: true, json: async () => ({ start: null, days: [], value: [] }) }
    if (url.includes('rankings')) return { ok: true, json: async () => fixtureRankings }
    if (url.includes('meta')) return { ok: true, json: async () => fixtureMeta }
    const m = /etf\/([^.]+)\.json/.exec(url)
    const code = m?.[1] ?? ''
    if (!(code in codes)) return { ok: false, status: 404 }
    return { ok: true, json: async () => codes[code] }
  }))
}

beforeEach(() => {
  window.history.replaceState(null, '', '#/')
  localStorage.clear()
  mockFor({
    '0050': detailFor('0050', '元大台灣50', 0.98),
    '0056': detailFor('0056', '元大高股息', 0.63),
    '00929': detailFor('00929', '復華台灣科技優息', 0.2),
  })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Compare', () => {
  it('標題顯示比較的檔數', async () => {
    render(<Compare codes={['0050', '0056']} />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }))
      .toHaveTextContent('比較 2 檔'))
  })

  it('每一檔一條線,並在圖例標示', async () => {
    const { container } = render(<Compare codes={['0050', '0056']} />)
    await waitFor(() => expect(container.querySelectorAll('.chart__line')).toHaveLength(2))
    expect(container.querySelector('.chart__line--s0')).toBeInTheDocument()
    expect(container.querySelector('.chart__line--s1')).toBeInTheDocument()
  })

  it('每條線的虛線樣式不同 —— 那是調色盤驗證要求的第二重編碼,不是裝飾', async () => {
    const { container } = render(<Compare codes={['0050', '0056']} />)
    await waitFor(() => expect(container.querySelectorAll('.chart__line')).toHaveLength(2))
    const dashes = [...container.querySelectorAll('.chart__line')]
      .map((el) => el.getAttribute('stroke-dasharray'))
    expect(new Set(dashes).size).toBe(dashes.length)
  })

  it('下方的指標對照表逐檔並列 —— 那也是低對比線條的可讀性佐證', async () => {
    render(<Compare codes={['0050', '0056']} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: '指標對照' })).toBeInTheDocument())
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: /0050/ })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /0056/ })).toBeInTheDocument()
    expect(within(table).getByText('+98.00%')).toBeInTheDocument()
  })

  it('部分代號抓不到時略過並說明,不讓整頁失敗', async () => {
    render(<Compare codes={['0050', '00999']} />)
    await waitFor(() => expect(screen.getByRole('note')).toHaveTextContent('00999'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('比較 1 檔')
  })

  it('全部抓不到時顯示錯誤', async () => {
    render(<Compare codes={['00998', '00999']} />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('保留回排行榜的路徑', async () => {
    render(<Compare codes={['0050']} />)
    await waitFor(() => expect(screen.getByRole('link', { name: /回排行榜/ })).toBeInTheDocument())
  })

  it('可在頁內搜尋並加入 ETF，同步網址與比較清單', async () => {
    const user = userEvent.setup()
    render(<Compare codes={['0050', '0056']} />)
    await user.type(await screen.findByRole('searchbox', { name: '搜尋並加入 ETF' }), '00929')
    await user.click(await screen.findByRole('button', { name: /00929.*復華台灣科技優息/ }))

    await waitFor(() => expect(screen.getByText('已加入 00929')).toBeInTheDocument())
    expect(window.location.hash).toBe('#/compare/0050,0056,00929')
    expect(JSON.parse(localStorage.getItem('alpha-track:compare')!))
      .toEqual(['0050', '0056', '00929'])
  })

  it('可移除與調整順序，且順序會持久化', async () => {
    const user = userEvent.setup()
    render(<Compare codes={['0050', '0056', '00929']} />)
    await waitFor(() => expect(screen.getByText('3 / 5 檔')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '將 0056 向左移' }))
    expect(window.location.hash).toBe('#/compare/0056,0050,00929')
    expect(JSON.parse(localStorage.getItem('alpha-track:compare')!))
      .toEqual(['0056', '0050', '00929'])

    await user.click(screen.getByRole('button', { name: '移除 0050' }))
    expect(window.location.hash).toBe('#/compare/0056,00929')
    expect(JSON.parse(localStorage.getItem('alpha-track:compare')!))
      .toEqual(['0056', '00929'])
  })

  it('五檔已滿時停用搜尋結果，不會默默替換既有標的', async () => {
    const user = userEvent.setup()
    render(<Compare codes={['0050', '0056', '00929', '00679B', '00631L']} />)
    await user.type(await screen.findByRole('searchbox', { name: '搜尋並加入 ETF' }), '00632R')
    expect(await screen.findByRole('button', { name: /00632R/ })).toBeDisabled()
    expect(screen.getByText(/已達五檔上限/)).toBeInTheDocument()
  })
})

describe('Compare 共同區間', () => {
  it('掛牌日不同的兩檔,自共同起點一起從 100 出發', async () => {
    mockFor({
      '0050': { ...detailFor('0050', '老牌', 1.0),
                series: { start: '2020-01-01', days: [0, 366, 731, 1096, 1461],
                          adj: [100, 105, 110, 120, 130],
                          close: [100, 105, 110, 120, 130] } },
      '00929': { ...detailFor('00929', '新掛牌', 0.2),
                 series: { start: '2023-01-01', days: [0, 365], adj: [50, 60], close: [50, 60] } },
    })
    render(<Compare codes={['0050', '00929']} />)
    await waitFor(() => expect(screen.getByText(/起標準化為 100/)).toBeInTheDocument())
    // 老牌自 2023-01-01 起只漲 120->130,新掛牌漲 50->60
    expect(screen.getByText(/老牌 \+8\.33%/)).toBeInTheDocument()
    expect(screen.getByText(/新掛牌 \+20\.00%/)).toBeInTheDocument()
  })

  it('說明標準化的起始日 —— 不說的話使用者不知道比較的是哪一段', async () => {
    render(<Compare codes={['0050', '0056']} />)
    await waitFor(() => expect(screen.getByText(/自 2020\/01\/01 起標準化為 100/))
      .toBeInTheDocument())
  })

  it('完全沒有共同區間時說明原因,而不是畫一張錯的圖', async () => {
    mockFor({
      '0050': { ...detailFor('0050', '早', 1.0),
                series: { start: '2010-01-01', days: [0, 1], adj: [1, 2], close: [1, 2] } },
      '0056': { ...detailFor('0056', '晚', 1.0),
                series: { start: '2026-01-01', days: [0, 1], adj: [1, 2], close: [1, 2] } },
    })
    render(<Compare codes={['0050', '0056']} />)
    await waitFor(() => expect(screen.getByText(/沒有共同的資料區間/)).toBeInTheDocument())
  })
})
