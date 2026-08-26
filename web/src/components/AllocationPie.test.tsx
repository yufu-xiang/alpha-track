import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AllocationPie } from './AllocationPie'

describe('AllocationPie', () => {
  it('每一塊各一條路徑', () => {
    const { container } = render(
      <AllocationPie title="依標的" slices={[
        { label: '0050', value: 60 }, { label: '0056', value: 40 }]} />)
    expect(container.querySelectorAll('.pie__slice')).toHaveLength(2)
  })

  it('圖例標出佔比', () => {
    render(<AllocationPie title="依標的" slices={[
      { label: '0050', value: 75 }, { label: '0056', value: 25 }]} />)
    expect(screen.getByText('75.00%')).toBeInTheDocument()
  })

  it('依佔比由大到小排列', () => {
    render(<AllocationPie title="依標的" slices={[
      { label: '小', value: 10 }, { label: '大', value: 90 }]} />)
    const items = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(items[0]).toContain('大')
  })

  it('超過六塊併成「其他」—— 再多的扇形人眼分不出大小', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ label: `E${i}`, value: 10 - i }))
    render(<AllocationPie title="依標的" slices={many} />)
    expect(screen.getByText('其他')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
  })

  it('剛好六塊時不出現「其他」', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ label: `E${i}`, value: 1 }))
    render(<AllocationPie title="依標的" slices={six} />)
    expect(screen.queryByText('其他')).not.toBeInTheDocument()
  })

  it('只有一檔時畫成完整的圓,不是一條線', () => {
    const { container } = render(
      <AllocationPie title="依標的" slices={[{ label: '0050', value: 100 }]} />)
    const d = container.querySelector('.pie__slice')!.getAttribute('d')!
    expect(d).toContain('A')
    expect(d).not.toContain('NaN')
  })

  it('沒有持股時說明,不畫一個空圓', () => {
    render(<AllocationPie title="依標的" slices={[]} />)
    expect(screen.getByText(/沒有持股/)).toBeInTheDocument()
  })

  it('忽略零與負值', () => {
    const { container } = render(<AllocationPie title="依標的" slices={[
      { label: 'a', value: 100 }, { label: 'b', value: 0 }, { label: 'c', value: -5 }]} />)
    expect(container.querySelectorAll('.pie__slice')).toHaveLength(1)
  })

  it('圖有描述文字 —— 圓餅對螢幕閱讀器是無意義的圖形', () => {
    render(<AllocationPie title="依分類配置" slices={[{ label: 'a', value: 1 }]} />)
    expect(screen.getByRole('img', { name: '依分類配置' })).toBeInTheDocument()
  })
})
