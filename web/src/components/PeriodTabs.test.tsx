import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PeriodTabs } from './PeriodTabs'

describe('PeriodTabs', () => {
  it('列出全部十一個期間', () => {
    render(<PeriodTabs active="Y1" onSelect={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(11)
  })

  it('標示當前作用中的期間', () => {
    render(<PeriodTabs active="Y1" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: '一年' })).toHaveAttribute(
      'aria-pressed', 'true',
    )
    expect(screen.getByRole('button', { name: '三年' })).toHaveAttribute(
      'aria-pressed', 'false',
    )
  })

  it('點擊後回報選取的期間代碼', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<PeriodTabs active="Y1" onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: '三月' }))
    expect(onSelect).toHaveBeenCalledWith('M3')
  })

  it('顯示中文期間名稱而非代碼', () => {
    render(<PeriodTabs active="Y1" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: '成立以來' })).toBeInTheDocument()
    expect(screen.queryByText('INCEPTION')).not.toBeInTheDocument()
  })

  it('active 為 null 時沒有任何按鈕處於選取狀態', () => {
    render(<PeriodTabs active={null} onSelect={vi.fn()} />)
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toHaveAttribute('aria-pressed', 'false')
    }
  })
})
