import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PriceChart } from './PriceChart'

const series = {
  start: '2020-01-01',
  days: Array.from({ length: 2000 }, (_, i) => i),
  adj: Array.from({ length: 2000 }, (_, i) => 100 + i * 0.05),
}
const benchmark = {
  start: '2020-01-01',
  days: Array.from({ length: 2000 }, (_, i) => i),
  value: Array.from({ length: 2000 }, (_, i) => 100000 + i * 20),
}

describe('PriceChart', () => {
  it('畫出標的的折線', () => {
    const { container } = render(<PriceChart series={series} name="元大台灣50" />)
    expect(container.querySelector('.chart__line--main')).toBeInTheDocument()
  })

  it('有基準線時一併疊加,並在圖例標示', () => {
    const { container } = render(
      <PriceChart series={series} benchmark={benchmark} name="元大台灣50" />)
    expect(container.querySelector('.chart__line--bench')).toBeInTheDocument()
    expect(screen.getByText('加權報酬指數')).toBeInTheDocument()
  })

  it('沒有基準線時不畫也不放圖例 —— 空的圖例會讓人以為線不見了', () => {
    const { container } = render(<PriceChart series={series} name="元大台灣50" />)
    expect(container.querySelector('.chart__line--bench')).toBeNull()
    expect(screen.queryByText('加權報酬指數')).not.toBeInTheDocument()
  })

  it('註明起點標準化為 100 —— 不說的話 y 軸的數字沒有意義', () => {
    render(<PriceChart series={series} benchmark={benchmark} name="元大台灣50" />)
    expect(screen.getByText(/起點標準化為 100/)).toBeInTheDocument()
  })

  it('提供區間切換', () => {
    render(<PriceChart series={series} name="元大台灣50" />)
    const bar = screen.getByRole('toolbar', { name: /區間/ })
    for (const l of ['一年', '三年', '五年', '全部']) {
      expect(screen.getByRole('button', { name: l })).toBeInTheDocument()
    }
    expect(bar).toBeInTheDocument()
  })

  it('切換區間會改變 x 軸的起始日期', async () => {
    const user = userEvent.setup()
    render(<PriceChart series={series} name="元大台灣50" />)
    // 起訖兩個日期都符合這個樣式,取第一個(起始日)
    const before = screen.getAllByText(/^2\d{3}\/\d{2}\/\d{2}$/)[0]!.textContent
    await user.click(screen.getByRole('button', { name: '全部' }))
    expect(screen.getAllByText(/^2\d{3}\/\d{2}\/\d{2}$/)[0]).toHaveTextContent('2020/01/01')
    expect(before).not.toBe('2020/01/01')
  })

  it('svg 有描述文字 —— 圖片對螢幕閱讀器不能是空的', () => {
    render(<PriceChart series={series} benchmark={benchmark} name="元大台灣50" />)
    expect(screen.getByRole('img', { name: /元大台灣50.*走勢/ })).toBeInTheDocument()
  })

  it('沒有資料時說明原因,而不是畫一張空圖', () => {
    render(<PriceChart series={{ start: null, days: [], adj: [] }} name="X" />)
    expect(screen.getByText(/沒有足夠的價格資料/)).toBeInTheDocument()
  })

  it('起點價為零時不畫出 NaN 的路徑', () => {
    const { container } = render(
      <PriceChart series={{ start: '2026-01-01', days: [0, 1], adj: [0, 10] }} name="X" />)
    expect(container.querySelector('.chart__line--main')).toBeNull()
  })
})
