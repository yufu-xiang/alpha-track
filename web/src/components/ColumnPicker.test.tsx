import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ColumnPicker } from './ColumnPicker'

describe('ColumnPicker', () => {
  it('預設收合,點擊後展開', async () => {
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1']} onChange={vi.fn()} />)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    expect(screen.getByRole('group')).toBeInTheDocument()
  })

  it('已選欄位顯示為勾選狀態', async () => {
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1', 'Y3']} onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    expect(screen.getByRole('checkbox', { name: '一年' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '一週' })).not.toBeChecked()
  })

  it('勾選新欄位會加入選取清單', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('checkbox', { name: '十年' }))
    expect(onChange).toHaveBeenCalledWith(['Y1', 'Y10'])
  })

  it('取消勾選會自清單移除', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1', 'Y3']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('checkbox', { name: '一年' }))
    expect(onChange).toHaveBeenCalledWith(['Y3'])
  })

  it('回到預設會還原成規格指定的五個期間', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y10']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('button', { name: /回到預設/ }))
    expect(onChange).toHaveBeenCalledWith(['D1', 'M1', 'M3', 'Y1', 'Y3'])
  })

  it('不允許取消到一個欄位都不剩', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('checkbox', { name: '一年' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('最後一欄的勾選框維持勾選,不得看起來像取消成功了', async () => {
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1']} onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    const box = screen.getByRole('checkbox', { name: '一年' })
    await user.click(box)
    expect(box).toBeChecked()
  })

  it('選取結果依規格的期間順序排列,而非點選順序', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y10']} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('checkbox', { name: '當日' }))
    expect(onChange).toHaveBeenCalledWith(['D1', 'Y10'])
  })
})
