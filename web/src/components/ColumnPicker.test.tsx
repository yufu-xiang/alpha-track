import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ColumnPicker } from './ColumnPicker'

describe('ColumnPicker', () => {
  it('預設收合,點擊後展開', async () => {
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1']} onChange={vi.fn()} selectedRisk={[]} onRiskChange={vi.fn()} />)
    expect(screen.queryByRole('group', { name: /期間/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    expect(screen.getByRole('group', { name: /期間/ })).toBeInTheDocument()
  })

  it('已選欄位顯示為勾選狀態', async () => {
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1', 'Y3']} onChange={vi.fn()} selectedRisk={[]} onRiskChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    expect(screen.getByRole('checkbox', { name: '一年' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '一週' })).not.toBeChecked()
  })

  it('勾選新欄位會加入選取清單', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1']} onChange={onChange} selectedRisk={[]} onRiskChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('checkbox', { name: '十年' }))
    expect(onChange).toHaveBeenCalledWith(['Y1', 'Y10'])
  })

  it('取消勾選會自清單移除', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1', 'Y3']} onChange={onChange} selectedRisk={[]} onRiskChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('checkbox', { name: '一年' }))
    expect(onChange).toHaveBeenCalledWith(['Y3'])
  })

  it('回到預設會還原成規格指定的五個期間', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y10']} onChange={onChange} selectedRisk={[]} onRiskChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('button', { name: /回到預設/ }))
    expect(onChange).toHaveBeenCalledWith(['D1', 'M1', 'M3', 'Y1', 'Y3'])
  })

  it('不允許取消到一個欄位都不剩', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1']} onChange={onChange} selectedRisk={[]} onRiskChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('checkbox', { name: '一年' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('最後一欄的勾選框維持勾選,不得看起來像取消成功了', async () => {
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y1']} onChange={vi.fn()} selectedRisk={[]} onRiskChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    const box = screen.getByRole('checkbox', { name: '一年' })
    await user.click(box)
    expect(box).toBeChecked()
  })

  it('選取結果依規格的期間順序排列,而非點選順序', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ColumnPicker selected={['Y10']} onChange={onChange} selectedRisk={[]} onRiskChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('checkbox', { name: '當日' }))
    expect(onChange).toHaveBeenCalledWith(['D1', 'Y10'])
  })
})

describe('ColumnPicker 風險指標', () => {
  const P = {
    selected: ['Y1'] as const, onChange: vi.fn(),
    selectedRisk: ['sharpe'] as const, onRiskChange: vi.fn(),
  }
  const open = async (props = {}) => {
    const user = userEvent.setup()
    render(<ColumnPicker {...P} selected={['Y1']} selectedRisk={['sharpe']} {...props} />)
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    return user
  }

  it('選單同時列出期間與風險指標,分成兩組', async () => {
    await open()
    expect(screen.getByRole('group', { name: /期間/ })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /風險/ })).toBeInTheDocument()
  })

  it('列出規格指定的全部風險指標,含先前根本沒有欄位的貝他值', async () => {
    await open()
    for (const label of ['超額報酬', '年化波動', '最大回撤', '夏普值', '貝他值', '折溢價']) {
      expect(screen.getByRole('checkbox', { name: label })).toBeInTheDocument()
    }
  })

  it('勾選風險指標會回報', async () => {
    const onRiskChange = vi.fn()
    const user = await open({ onRiskChange })
    await user.click(screen.getByRole('checkbox', { name: '折溢價' }))
    expect(onRiskChange).toHaveBeenCalledWith(['sharpe', 'premium_discount'])
  })

  it('風險指標可以全部取消 —— 只看報酬是合理的用法', async () => {
    const onRiskChange = vi.fn()
    const user = await open({ onRiskChange })
    await user.click(screen.getByRole('checkbox', { name: '夏普值' }))
    expect(onRiskChange).toHaveBeenCalledWith([])
  })

  it('回到預設會同時還原兩組', async () => {
    const onChange = vi.fn()
    const onRiskChange = vi.fn()
    const user = await open({ onChange, onRiskChange })
    await user.click(screen.getByRole('button', { name: /回到預設/ }))
    expect(onChange).toHaveBeenCalledWith(['D1', 'M1', 'M3', 'Y1', 'Y3'])
    expect(onRiskChange).toHaveBeenCalledWith(
      ['excess', 'volatility', 'mdd', 'sharpe', 'beta'])
  })
})
