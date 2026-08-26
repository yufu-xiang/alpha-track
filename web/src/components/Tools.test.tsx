/**
 * 工具頁測試。
 *
 * 這裡刻意把規格 §7.3 的**強制揭露**釘死:「本模擬基於 N 年歷史資料」、
 * N < 10 的警告、結果以百分位區間呈現、以及不給規範性建議。
 * 這幾條是規格明文要求的,不是樣式偏好 —— 沒有測試釘住的話,
 * 日後任何一次版面調整都可能無聲地把它們刪掉。
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureMeta, fixtureRankings } from '../data/fixture'
import { Tools } from './Tools'

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

async function renderLoaded() {
  render(<Tools />)
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: '退休金蒙地卡羅回測' })).toBeInTheDocument())
}

describe('Tools', () => {
  it('開宗明義說明這些是試算而非建議 —— 規格 §7.3 禁止規範性建議', async () => {
    await renderLoaded()
    expect(screen.getByRole('note')).toHaveTextContent(/不構成投資建議/)
    expect(screen.getByRole('note')).toHaveTextContent(/建議提領率/)
  })

  it('蒙地卡羅顯示「本模擬基於 N 年歷史資料」的 N', async () => {
    await renderLoaded()
    await waitFor(() => expect(screen.getByText(/20 個年度報酬/)).toBeInTheDocument())
  })

  it('歷史不足 10 年時發出顯著警告', async () => {
    mockFetch(6)
    await renderLoaded()
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/僅有 6 年歷史資料/)
      expect(alert).toHaveTextContent(/不足以支撐/)
    })
  })

  it('歷史足夠時不發警告 —— 警告若常駐就等於沒有警告', async () => {
    await renderLoaded()
    await waitFor(() => expect(screen.getByText(/20 個年度報酬/)).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('結果以第 10/50/90 百分位區間呈現,不給單一數字', async () => {
    await renderLoaded()
    await waitFor(() => expect(screen.getByText('第 10 百分位')).toBeInTheDocument())
    expect(screen.getByText('中位數')).toBeInTheDocument()
    expect(screen.getByText('第 90 百分位')).toBeInTheDocument()
  })

  it('切到參數化模式時明確標示這是假設而非實據(規格 §7.1)', async () => {
    await renderLoaded()
    await waitFor(() => expect(screen.getByText(/20 個年度報酬/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: '參數化假設' }))
    const mode = screen.getByRole('status')
    expect(mode).toHaveTextContent(/假設模式/)
    expect(mode).toHaveTextContent(/不是預測/)
    // 歷史不足的警告屬於 bootstrap,切走後不該還掛著
    expect(screen.queryByText(/僅有/)).not.toBeInTheDocument()
  })

  it('餘額歸零時寫「已耗盡」,不在一整欄大數字裡印一個 0', async () => {
    await renderLoaded()
    await waitFor(() => expect(screen.getByText(/20 個年度報酬/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: '參數化假設' }))
    const section = screen.getByRole('heading', { name: '退休金蒙地卡羅回測' })
      .closest('section')!
    const rate = within(section).getByLabelText('提領率(%)')
    await userEvent.clear(rate)
    await userEvent.type(rate, '30')
    await waitFor(() =>
      expect(within(section).getAllByText('已耗盡').length).toBeGreaterThan(0))
    expect(within(section).queryByText('0')).not.toBeInTheDocument()
  })

  it('提領試算會隨參數變動 —— 提領率翻倍,可支撐年數必須變短', async () => {
    await renderLoaded()
    const section = screen.getByRole('heading', { name: '退休提領試算' })
      .closest('section')!
    const before = within(section).getByText(/年後耗盡|撐過/).textContent
    const rate = within(section).getByLabelText('提領率(%)')
    await userEvent.clear(rate)
    await userEvent.type(rate, '12')
    const after = within(section).getByText(/年後耗盡|撐過/).textContent
    expect(after).not.toBe(before)
    expect(after).toMatch(/年後耗盡/)
  })

  it('FIRE 在參數不可能達成時說「達不到」,不給一個很大的年數', async () => {
    await renderLoaded()
    const section = screen.getByRole('heading', { name: '財務自由試算' })
      .closest('section')!
    // 不存錢、且資產不成長 —— 這才是真正到不了。只把存款歸零並不夠,
    // 現有資產靠複利仍會在數十年後抵達目標,而那個年數是對的答案。
    const savings = within(section).getByLabelText('每年可存')
    await userEvent.clear(savings)
    await userEvent.type(savings, '0')
    const ret = within(section).getByLabelText('年化報酬(%)')
    await userEvent.clear(ret)
    await userEvent.type(ret, '0')
    expect(within(section).getByText('這組參數下達不到')).toBeInTheDocument()
  })
})
