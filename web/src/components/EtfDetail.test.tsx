import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EtfDetail } from './EtfDetail'

const detail = {
  code: '0050', name: '元大台灣50', category: '市值型', region: '台灣',
  exchange: 'TWSE', issuer: '元大投信', tracking_index: '臺灣50指數',
  listing_date: '2003-06-30', data_start: '2014-01-02',
  returns: { D1: 0.01, W1: null, M1: null, M3: null, M6: null, YTD: null,
             Y1: 0.9883, Y3: null, Y5: null, Y10: 7.2, INCEPTION: null },
  annualized: { D1: null, W1: null, M1: null, M3: null, M6: null, YTD: null,
                Y1: null, Y3: null, Y5: null, Y10: 0.23, INCEPTION: null },
  excess: { D1: null, W1: null, M1: null, M3: null, M6: null, YTD: null,
            Y1: 0.1105, Y3: null, Y5: null, Y10: null, INCEPTION: null },
  risk: { volatility: 0.2864, mdd: -0.3383, sharpe: 3.4, beta: 1.0495 },
  premium_discount: null,
  series: { start: '2014-01-02', days: [0, 1, 2], adj: [100, 105, 110] },
  dividends: [{ ex_date: '2026-07-21', pay_date: '2026-08-10', amount: 0.6 }],
}

function mockOk(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.includes('benchmark')
      ? { start: '2016-08-01', days: [0], value: [1000] }
      : { ...detail, ...overrides }),
  })))
}

beforeEach(() => mockOk())
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function renderLoaded(code = '0050') {
  render(<EtfDetail code={code} />)
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument())
}

describe('EtfDetail', () => {
  it('標題含代號與名稱', async () => {
    await renderLoaded()
    expect(screen.getByRole('heading', { level: 1 }))
      .toHaveTextContent('0050 元大台灣50')
  })

  it('列出全部十一個期間的報酬', async () => {
    await renderLoaded()
    const table = screen.getAllByRole('table')[0]!
    expect(within(table).getAllByRole('row')).toHaveLength(12)   // 表頭 + 11
  })

  it('資料起點晚於掛牌日時說明原因 —— 否則沒人知道「成立以來」為何空白', async () => {
    await renderLoaded()
    expect(screen.getByRole('note')).toHaveTextContent(/2014\/01\/02/)
    expect(screen.getByRole('note')).toHaveTextContent(/成立以來/)
  })

  it('資料起點等於掛牌日時不顯示那段說明', async () => {
    mockOk({ data_start: '2003-06-30' })
    await renderLoaded()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('顯示風險指標卡片', async () => {
    await renderLoaded()
    expect(screen.getByText('-33.83%')).toBeInTheDocument()   // MDD
    expect(screen.getByText('1.05')).toBeInTheDocument()      // Beta
  })

  it('顯示配息紀錄', async () => {
    await renderLoaded()
    expect(screen.getByText('2026/07/21')).toBeInTheDocument()
    expect(screen.getByText('0.600')).toBeInTheDocument()
  })

  it('沒有配息時說明,而不是留一張空表', async () => {
    mockOk({ dividends: [] })
    await renderLoaded()
    expect(screen.getByText(/目前沒有配息紀錄/)).toBeInTheDocument()
  })

  it('顯示基本資料', async () => {
    await renderLoaded()
    expect(screen.getByText('元大投信')).toBeInTheDocument()
    expect(screen.getByText('臺灣50指數')).toBeInTheDocument()
  })

  it('載入失敗時顯示錯誤並保留回排行榜的路徑', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    render(<EtfDetail code="00999" />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('00999'))
    expect(screen.getByRole('link', { name: /回排行榜/ })).toBeInTheDocument()
  })

  it('正報酬標 gain、負報酬標 loss', async () => {
    await renderLoaded()
    expect(screen.getByText('+98.83%')).toHaveClass('gain')
  })
})
