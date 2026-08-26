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
import { fixtureMeta, fixtureRankings } from '../../data/fixture'
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
      : url.includes('etf/') ? {
          ...fixtureRankings.etfs[0],
          exchange: 'TWSE', issuer: null, tracking_index: null, listing_date: null,
          annualized: {}, excess: {}, dividends: [],
          series: { start: '2024-01-01', days: [0, 31, 60, 91], adj: [100, 90, 110, 120] },
        }
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
    await waitFor(() =>
      expect(screen.getByText(/個年度報酬/)).toBeInTheDocument())
  }

  it('顯示「本模擬基於 N 年歷史資料」的 N', async () => {
    await renderMc()
    expect(screen.getByText(/20 個年度報酬/)).toBeInTheDocument()
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
