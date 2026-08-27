/**
 * 工具頁測試。
 *
 * 這裡刻意把規格 §7.3 的**強制揭露**釘死:「本模擬基於 N 年歷史資料」、
 * N < 10 的警告、結果以百分位區間呈現、以及不給規範性建議。
 * 這幾條是規格明文要求,不是樣式偏好 —— 沒有測試釘住的話,
 * 日後任何一次版面調整都可能無聲地把它們刪掉。
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureDetail, fixtureMeta, fixtureRankings } from '../../data/fixture'
import { Tools, TOOLS } from './index'

/**
 * 產生 n 個**完整年度**的基準線:每年 12/31 一筆,固定漲 10%。
 *
 * 日期必須真的落在 12 月 —— annualReturnsFrom 只採計收滿到 12 月的年度,
 * 用 365 天等距產生的假資料會逐年漂移出 12 月,於是一個年度報酬都算不出來。
 */
function benchmark(years: number) {
  const first = Date.UTC(2025 - years, 11, 31)
  const days: number[] = []
  const value: number[] = []
  for (let y = 0; y <= years; y += 1) {
    days.push(Math.round((Date.UTC(2025 - years + y, 11, 31) - first) / 86_400_000))
    value.push(100 * 1.1 ** y)
  }
  return { start: new Date(first).toISOString().slice(0, 10), days, value }
}

function mockFetch(years: number) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body =
      url.includes('meta') ? fixtureMeta
      : url.includes('benchmark') ? benchmark(years)
      : url.includes('etf/') ? fixtureDetail({
          exchange: 'TWSE', issuer: null, tracking_index: null, listing_date: null,
          dividends: [],
          series: { start: '2024-01-01', days: [0, 31, 60, 91],
                    adj: [100, 90, 110, 120], close: [100, 90, 110, 120] },
        })
      : fixtureRankings
    return { ok: true, json: async () => body }
  }))
}

beforeEach(() => mockFetch(20))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('工具列表(規格 §7.4:每個工具一頁)', () => {
  it('列表列出全部工具,各自連到自己的頁面', () => {
    render(<Tools tool={null} />)
    for (const t of TOOLS) {
      expect(screen.getByRole('link', { name: t.title }))
        .toHaveAttribute('href', `#/tools/${t.id}`)
    }
  })

  it('列表開宗明義說明不構成建議 —— 規格 §7.3 禁止規範性建議', () => {
    render(<Tools tool={null} />)
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent(/不構成投資建議/)
    expect(note).toHaveTextContent(/建議提領率/)
  })

  it('未知的工具 id 明說找不到,不靜默退回列表', () => {
    render(<Tools tool="nope" />)
    expect(screen.getByRole('alert')).toHaveTextContent(/找不到.*nope/)
    // 仍然把全部工具列出來,不讓使用者卡在死路上
    expect(screen.getByRole('link', { name: TOOLS[0]!.title })).toBeInTheDocument()
  })
})

describe('蒙地卡羅(規格 §7.3)', () => {
  async function renderMc() {
    render(<Tools tool="monte-carlo" />)
    // 等**確切的年數**,不是 /個年度報酬/ —— 後者在基準線載入前就會match
    // 到「0 個年度報酬」,測試因此會在資料還沒到的時候就往下跑。
    await waitFor(() =>
      expect(screen.getByText(/20 個年度報酬/)).toBeInTheDocument())
  }

  it('顯示「本模擬基於 N 年歷史資料」的 N', async () => {
    await renderMc()
    expect(screen.getByText(/20 個年度報酬/)).toBeInTheDocument()
  })

  it('基準線載入前不謊報「僅有 0 年歷史資料」—— 那是還沒到,不是不足', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<Tools tool="monte-carlo" />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/載入/)
  })

  it('歷史不足 10 年時發出顯著警告', async () => {
    mockFetch(6)
    render(<Tools tool="monte-carlo" />)
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/僅有 6 年歷史資料/)
      expect(alert).toHaveTextContent(/不足以支撐/)
    })
  })

  it('歷史足夠時不發警告 —— 警告若常駐就等於沒有警告', async () => {
    await renderMc()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('結果以第 10/50/90 百分位區間呈現,不給單一數字', async () => {
    await renderMc()
    expect(screen.getByText('第 10 百分位')).toBeInTheDocument()
    expect(screen.getByText('中位數')).toBeInTheDocument()
    expect(screen.getByText('第 90 百分位')).toBeInTheDocument()
  })

  it('切到參數化模式時明確標示這是假設而非實據(規格 §7.1)', async () => {
    await renderMc()
    await userEvent.click(screen.getByRole('button', { name: '參數化假設' }))
    const mode = screen.getByRole('status')
    expect(mode).toHaveTextContent(/假設模式/)
    expect(mode).toHaveTextContent(/不是預測/)
    expect(screen.queryByText(/僅有/)).not.toBeInTheDocument()
  })

  it('餘額歸零時寫「已耗盡」,不在一整欄大數字裡印一個 0', async () => {
    await renderMc()
    await userEvent.click(screen.getByRole('button', { name: '參數化假設' }))
    const rate = screen.getByLabelText('提領率(%)')
    await userEvent.clear(rate)
    await userEvent.type(rate, '30')
    await waitFor(() =>
      expect(screen.getAllByText('已耗盡').length).toBeGreaterThan(0))
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('bootstrap 抽的是大盤,選定 ETF 只用來調整 Beta(規格 §7.3 模式一)', async () => {
    await renderMc()
    const code = screen.getByLabelText('調整為某檔 ETF 的特性(可留空)')
    await userEvent.type(code, fixtureRankings.etfs[0]!.code)
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/Beta/))
    expect(screen.getByRole('status')).toHaveTextContent(/加權報酬指數/)
  })
})

describe('退休提領', () => {
  it('提領率調高則可支撐年數變短', async () => {
    render(<Tools tool="withdrawal" />)
    const before = screen.getByText(/年後耗盡|撐過/).textContent
    const rate = screen.getByLabelText('提領率(%)')
    await userEvent.clear(rate)
    await userEvent.type(rate, '12')
    const after = screen.getByText(/年後耗盡|撐過/).textContent
    expect(after).not.toBe(before)
    expect(after).toMatch(/年後耗盡/)
  })

  it('明說提領率是使用者填的參數,不是本站建議值', () => {
    render(<Tools tool="withdrawal" />)
    expect(screen.getByText(/不是本站的建議值/)).toBeInTheDocument()
  })
})

describe('融資維持率', () => {
  async function renderMargin() {
    render(<Tools tool="margin" />)
    await waitFor(() => expect(screen.getByLabelText('股數')).toBeInTheDocument())
  }

  it('查證過的實例:100 元 1000 股、融資六成,追繳價位是 78', async () => {
    await renderMargin()
    expect(screen.getByText('78.00')).toBeInTheDocument()
  })

  it('顯著說明門檻看的是整戶而非單一部位 —— 誤解會造成不必要的恐慌賣出', async () => {
    await renderMargin()
    expect(screen.getByText(/本工具算的是單一部位,而券商看的是整戶/))
      .toBeInTheDocument()
  })

  it('融資成數為 0 時顯示「未使用融資」,不是維持率 0%', async () => {
    await renderMargin()
    const ratio = screen.getByLabelText('融資成數(%)')
    await userEvent.clear(ratio)
    await userEvent.type(ratio, '0')
    expect(screen.getByText('未使用融資')).toBeInTheDocument()
  })
})

describe('FIRE', () => {
  it('參數不可能達成時說「達不到」,不給一個很大的年數', async () => {
    render(<Tools tool="fire" />)
    const savings = screen.getByLabelText('每年可存')
    await userEvent.clear(savings)
    await userEvent.type(savings, '0')
    const ret = screen.getByLabelText('年化報酬(%)')
    await userEvent.clear(ret)
    await userEvent.type(ret, '0')
    expect(screen.getByText('這組參數下達不到')).toBeInTheDocument()
  })

  it('每年可存超過收支差額時警告 —— 那組數字自相矛盾', async () => {
    render(<Tools tool="fire" />)
    const savings = screen.getByLabelText('每年可存')
    await userEvent.clear(savings)
    await userEvent.type(savings, '900000')
    expect(screen.getByRole('alert')).toHaveTextContent(/自相矛盾/)
  })
})

describe('股息再投入', () => {
  /** 價格自 2008 年、配息只回溯到 2015 年 —— 0056 的真實情況。 */
  function mockPartialDividends() {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body =
        url.includes('meta') ? fixtureMeta
        : url.includes('benchmark') ? benchmark(20)
        : url.includes('etf/') ? fixtureDetail({
            exchange: 'TWSE', issuer: null, tracking_index: null, listing_date: null,
            dividends: [{
              ex_date: '2015-01-01', pay_date: null,
              amount: 1, amount_adj: 1, scale_known: true,
            }],
            series: {
              start: '2008-01-01',
              days: [0, 2557, 3653],
              adj: [10, 20, 30],
              close: [10, 20, 30],
            },
          })
        : fixtureRankings
      return { ok: true, json: async () => body }
    }))
  }

  it('配息紀錄比價格短時顯著警告,並改從配息起算', async () => {
    mockPartialDividends()
    render(<Tools tool="reinvest" />)
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/配息紀錄只回溯到 2015-01-01/)
      expect(alert).toHaveTextContent(/系統性低估/)
    })
    // 起算日改用配息的起點,而不是最早的價格
    expect(screen.getByText(/涵蓋 2015-01-01 至/)).toBeInTheDocument()
  })

  it('用 amount_adj 而非 amount —— 用錯不會報錯,只會安靜地錯', async () => {
    // 0050 的真實數字:2024-01-17 配 3.000(分割前),換算後 0.750
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body =
        url.includes('meta') ? fixtureMeta
        : url.includes('benchmark') ? benchmark(20)
        : url.includes('etf/') ? fixtureDetail({
            exchange: 'TWSE', issuer: null, tracking_index: null, listing_date: null,
            dividends: [{
              ex_date: '2024-01-01', pay_date: null,
              amount: 3.0, amount_adj: 0.75, scale_known: true,
            }],
            series: {
              start: '2024-01-01', days: [0, 30, 60],
              adj: [30, 31, 32], close: [30, 31, 32],
            },
          })
        : fixtureRankings
      return { ok: true, json: async () => body }
    }))
    render(<Tools tool="reinvest" />)
    await waitFor(() =>
      expect(screen.getByText('累積領到的配息')).toBeInTheDocument())
    // 100 萬 ÷ 30 = 33,333 股 × 0.75 = 25,000(用 amount 會是 100,000)
    const row = screen.getByText('累積領到的配息').closest('.card')!
    expect(row.textContent).toMatch(/25,000/)
  })

  it('尺度不確定時顯著警告 —— 不靜靜地用一個猜的數字', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body =
        url.includes('meta') ? fixtureMeta
        : url.includes('benchmark') ? benchmark(20)
        : url.includes('etf/') ? fixtureDetail({
            exchange: 'TWSE', issuer: null, tracking_index: null, listing_date: null,
            dividends: [{
              ex_date: '2024-01-01', pay_date: null,
              amount: 3.0, amount_adj: 3.0, scale_known: false,
            }],
            series: {
              start: '2024-01-01', days: [0, 30, 60],
              adj: [30, 31, 32], close: [30, 31, 32],
            },
          })
        : fixtureRankings
      return { ok: true, json: async () => body }
    }))
    render(<Tools tool="reinvest" />)
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/無法確定尺度/)
      expect(alert).toHaveTextContent(/結果會偏高/)
    })
  })

  it('沒有配息的標的直說兩種做法沒有差別,不印一組看似有意義的數字', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body =
        url.includes('meta') ? fixtureMeta
        : url.includes('benchmark') ? benchmark(20)
        : url.includes('etf/') ? fixtureDetail({
            exchange: 'TWSE', issuer: null, tracking_index: null, listing_date: null,
            dividends: [],
            series: { start: '2024-01-01', days: [0, 1], adj: [10, 20], close: [10, 20] },
          })
        : fixtureRankings
      return { ok: true, json: async () => body }
    }))
    render(<Tools tool="reinvest" />)
    await waitFor(() =>
      expect(screen.getByText(/沒有配息紀錄,兩種做法沒有差別/)).toBeInTheDocument())
  })
})

describe('殖利率與流動性排行', () => {
  it('殖利率排行由高到低,並列出同期總報酬 —— 高殖利率不等於高報酬', async () => {
    render(<Tools tool="yield" />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    const cells = screen.getAllByRole('row').slice(1)
      .map((r) => within(r).getAllByRole('cell')[3]!.textContent!)
    const nums = cells.map((c) => parseFloat(c))
    expect(nums).toEqual([...nums].sort((a, b) => b - a))
    expect(screen.getByRole('columnheader', { name: '近一年總報酬' }))
      .toBeInTheDocument()
  })

  it('沒有配息資料的標的不列入排名,並說明有幾檔被排除', async () => {
    render(<Tools tool="yield" />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    // fixture 裡有數檔 dividend_yield 為 null
    expect(screen.getByText(/沒有這項資料,未列入排名/)).toBeInTheDocument()
    expect(screen.queryByText('00999')).not.toBeInTheDocument()
  })

  it('流動性排的是金額不是股數,而且兩欄並列', async () => {
    render(<Tools tool="liquidity" />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.getByRole('columnheader', { name: '近月日均成交金額' }))
      .toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '日均成交股數' }))
      .toBeInTheDocument()
    // fixture 的 0056 成交股數多於 0050,成交金額卻較少 —— 正是這個工具
    // 要凸顯的差別。金額排序下 0050 必須在 0056 之前。
    const codes = screen.getAllByRole('row').slice(1)
      .map((r) => within(r).getAllByRole('cell')[1]!.textContent!)
    expect(codes.indexOf('0050')).toBeLessThan(codes.indexOf('0056'))
  })

  it('殖利率排行不含「該買」這類規範性字眼,而是指出陷阱', async () => {
    render(<Tools tool="yield" />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.getByText(/高殖利率不等於高報酬/)).toBeInTheDocument()
  })
})

describe('排行的涵蓋率', () => {
  it('資料涵蓋率偏低時明說「這不是全市場排行」', async () => {
    // 用專屬資料驗門檻:五檔裡只有一檔查得到殖利率。
    // 這正是配息逐日分批回補期間的真實狀態(上線初期是 14 / 351)。
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body = url.includes('meta') ? {
        ...fixtureMeta,
        data_date: '2026-08-25',
        etf_count: 5,
      } : {
        data_date: '2026-08-25',
        etfs: fixtureRankings.etfs.slice(0, 5).map((r, i) => ({
          ...r, is_leveraged: false, is_inverse: false,
          dividend_yield: i === 0 ? 0.05 : null,
        })),
      }
      return { ok: true, json: async () => body }
    }))
    render(<Tools tool="yield" />)
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/這不是全市場排行/)
      expect(alert).toHaveTextContent(/目前查得到的最高/)
    })
  })

  it('涵蓋率足夠時不發警告 —— 常駐的警告等於沒有警告', async () => {
    render(<Tools tool="liquidity" />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('報酬相關性', () => {
  /** 造兩檔幾乎同步、一檔反向的資料。 */
  function mockSeries() {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const m = /etf\/([A-Z0-9]+)\.json/.exec(url)
      if (!m) {
        return { ok: true, json: async () => (url.includes('meta') ? fixtureMeta : fixtureRankings) }
      }
      const code = m[1]!
      const sign = code === '0056' ? -1 : 1
      const scale = code === '006208' ? 1.02 : 1
      const adj = [100]
      for (let i = 0; i < 300; i += 1) {
        adj.push(adj[adj.length - 1]! * (1 + sign * scale * Math.sin(i / 4) / 100))
      }
      return {
        ok: true,
        json: async () => fixtureDetail({
          code, name: `測試${code}`,
          exchange: 'TWSE', issuer: null, tracking_index: null, listing_date: null,
          dividends: [],
          premium_low: null, premium_high: null, premium_days_ratio: null,
          premium_sample: 0, premium_series: { start: null, days: [], premium: [] },
          series: { start: '2025-01-01', days: adj.map((_, i) => i), adj, close: adj },
        }),
      }
    }))
  }

  beforeEach(() => mockSeries())

  async function renderCorr() {
    render(<Tools tool="correlation" />)
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
  }

  it('指路到成分股重疊度,並說明兩者為何會給出不同答案', async () => {
    // 這兩個工具並存,而差異本身就是資訊。讓使用者以為它們該一致
    // 才是誤導 —— 0050 與 0056 前十大只重疊 1.2%,相關性卻有 0.82。
    await renderCorr()
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent(/成分股重疊度/)
    expect(note).toHaveTextContent(/不同的答案/)
    expect(within(note).getByRole('link', { name: '成分股重疊度' }))
      .toHaveAttribute('href', '#/tools/overlap')
  })

  it('對角線為 1,矩陣對稱', async () => {
    await renderCorr()
    const rows = screen.getAllByRole('row').slice(1)
    const grid = rows.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent!))
    expect(grid[0]![0]).toBe('1.00')
    expect(grid[1]![1]).toBe('1.00')
    expect(grid[0]![1]).toBe(grid[1]![0])
  })

  it('同向的兩檔接近 1,反向的接近 -1', async () => {
    await renderCorr()
    const rows = screen.getAllByRole('row').slice(1)
    const grid = rows.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent!))
    // 0050 vs 006208 同向、0050 vs 0056 反向
    expect(Number(grid[0]![1])).toBeGreaterThan(0.99)
    expect(Number(grid[0]![2])).toBeLessThan(-0.99)
  })

  it('點出最高的一組 —— 那是使用者真正要的答案', async () => {
    await renderCorr()
    expect(screen.getByRole('status')).toHaveTextContent(/最高的一組是/)
    expect(screen.getByRole('status')).toHaveTextContent(/分散/)
  })

  it('可移除標的,少於兩檔時說明原因', async () => {
    await renderCorr()
    await userEvent.click(screen.getByRole('button', { name: '移除 0056' }))
    await userEvent.click(screen.getByRole('button', { name: '移除 006208' }))
    await waitFor(() =>
      expect(screen.getByText(/至少要兩檔才比得出相關性/)).toBeInTheDocument())
  })

  it('說明相關性會隨市況改變 —— 崩盤時往往一起跌', async () => {
    await renderCorr()
    expect(screen.getByText(/崩盤時往往一起跌/)).toBeInTheDocument()
  })
})

describe('成分股重疊度', () => {
  function mockHoldings(map: Record<string, [string, number][]>) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const m = /etf\/([A-Z0-9]+)\.json/.exec(url)
      if (!m) {
        return { ok: true, json: async () =>
          (url.includes('meta') ? fixtureMeta : fixtureRankings) }
      }
      const code = m[1]!
      return {
        ok: true,
        json: async () => fixtureDetail({
          code, name: `測試${code}`,
          exchange: 'TWSE', issuer: null, tracking_index: null, listing_date: null,
          dividends: [],
          premium_series: { start: null, days: [], premium: [] },
          series: { start: null, days: [], adj: [], close: [] },
          holdings: {
            year_month: '202607',
            items: (map[code] ?? []).map(([c, w]) =>
              ({ code: c, name: `名稱${c}`, weight: w })),
          },
        }),
      }
    }))
  }

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('顯著說明這是前十大之間的重疊,不是整體重疊', async () => {
    mockHoldings({ '0050': [['2330', 0.6]], '006208': [['2330', 0.6]], '0056': [] })
    render(<Tools tool="overlap" />)
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/不是整體重疊/)
      expect(alert).toHaveTextContent(/前十大以外的部分/)
    })
  })

  it('用真實比例算共同質量:同追蹤指數的兩檔應該極高', async () => {
    mockHoldings({
      '0050': [['2330', 0.606], ['2454', 0.053]],
      '006208': [['2330', 0.606], ['2454', 0.053]],
      '0056': [['2891', 0.05]],
    })
    render(<Tools tool="overlap" />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/最高的一組/))
    expect(screen.getByRole('status')).toHaveTextContent(/幾乎是同一批股票/)
  })

  it('把涵蓋率與重疊度放在同一列 —— 沒有分母的數字會被誤讀', async () => {
    mockHoldings({ '0050': [['2330', 0.6]], '006208': [['2330', 0.6]], '0056': [] })
    render(<Tools tool="overlap" />)
    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: '前十大合計' }))
        .toBeInTheDocument())
  })

  it('沒有成分股的標的明說查不到,並解釋原因', async () => {
    mockHoldings({ '0050': [['2330', 0.6]], '006208': [['2330', 0.6]], '0056': [] })
    render(<Tools tool="overlap" />)
    await waitFor(() =>
      expect(screen.getByRole('note')).toHaveTextContent(/查不到 0056 的成分股/))
  })

  it('列出共同持股,依重疊貢獻排序', async () => {
    mockHoldings({
      '0050': [['A', 0.1], ['B', 0.5]],
      '006208': [['A', 0.4], ['B', 0.2]],
      '0056': [],
    })
    render(<Tools tool="overlap" />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /共同持股/ })).toBeInTheDocument())
    const tables = screen.getAllByRole('table')
    const rows = within(tables[tables.length - 1]!).getAllByRole('row').slice(1)
    // min(0.1,0.4)=0.1 對 min(0.5,0.2)=0.2 → B 在前
    expect(within(rows[0]!).getAllByRole('cell')[0]!.textContent).toBe('B')
  })

  it('說明這是月報而非當日持股', async () => {
    mockHoldings({ '0050': [['2330', 0.6]], '006208': [['2330', 0.6]], '0056': [] })
    render(<Tools tool="overlap" />)
    await waitFor(() =>
      expect(screen.getByText(/資料月份:202607/)).toBeInTheDocument())
    // 「月報」被 <strong> 包起來,所以比對不含它的那一段
    expect(screen.getByText(/不是當日持股/)).toBeInTheDocument()
  })
})
