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
  series: {
    start: '2014-01-02', days: [0, 1, 2],
    adj: [100, 105, 110], close: [90, 94, 99],
  },
  fund_size: 2_369_444_695_000,
  premium_low: -0.003, premium_high: 0.004,
  premium_days_ratio: 0.55, premium_sample: 60,
  premium_series: {
    start: '2026-06-01', days: [0, 1, 2], premium: [0.001, -0.002, 0.003],
  },
  holdings: { year_month: null, items: [] },
  dividends: [{
    ex_date: '2026-07-21', pay_date: '2026-08-10',
    amount: 0.6, amount_adj: 0.6, scale_known: true,
  }],
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

describe('折溢價(規格 §5.2 ②、§4.4)', () => {
  async function renderDetail(overrides: Record<string, unknown> = {}) {
    mockOk(overrides)
    await renderLoaded()
  }

  it('顯示折溢價走勢圖與近 60 日統計', async () => {
    await renderDetail()
    expect(screen.getByRole('heading', { name: '折溢價走勢' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /折溢價走勢/ })).toBeInTheDocument()
    expect(screen.getByText('溢價天數佔比')).toBeInTheDocument()
  })

  it('明示採用的是預估淨值而非正式結算淨值', async () => {
    await renderDetail()
    expect(screen.getByText(/預估淨值/)).toBeInTheDocument()
  })

  it('樣本不足時說明原因,不留一個沒有理由的破折號', async () => {
    await renderDetail({
      premium_low: null, premium_high: null,
      premium_days_ratio: null, premium_sample: 3,
    })
    expect(screen.getByText(/需要 20 個交易日的樣本,目前累積 3 天/))
      .toBeInTheDocument()
  })

  it('樣本足夠時不顯示那段說明 —— 常駐的說明等於雜訊', async () => {
    await renderDetail()
    expect(screen.queryByText(/需要 20 個交易日的樣本/)).not.toBeInTheDocument()
  })

  it('完全沒有折溢價資料時說明是逐日累積,不是壞掉', async () => {
    await renderDetail({
      premium_series: { start: null, days: [], premium: [] },
      premium_days_ratio: null, premium_sample: 0,
    })
    expect(screen.getByText(/還沒有折溢價資料/)).toBeInTheDocument()
  })

  it('舊版快取缺 premium_series 時顯示明確契約錯誤,不渲染半殘頁面', async () => {
    mockOk({ premium_series: undefined })
    render(<EtfDetail code="0050" />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/premium_series/)
    })
  })
})

describe('基本資料(規格 §5.2 ②)', () => {
  it('顯示規模,並以億為單位 —— 兆元的原始數字讀不出量級', async () => {
    await renderLoaded()
    expect(screen.getByText('23,694 億')).toBeInTheDocument()
  })

  it('沒有淨值資料時規模顯示破折號,不是 0', async () => {
    mockOk({ fund_size: null })
    await renderLoaded()
    const dl = screen.getByRole('heading', { name: '基本資料' })
      .parentElement!.querySelector('dl')!
    expect(dl.textContent).toContain('—')
  })

  it('內扣費用率整欄保留,並由 ⓘ 說明去哪裡查', async () => {
    // 沒有公開的統一來源。整欄拿掉的話,使用者不會知道這個資訊存在。
    await renderLoaded()
    expect(screen.getByText('內扣費用率')).toBeInTheDocument()
  })
})
