import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MetricInfo } from './MetricInfo'

describe('MetricInfo', () => {
  it('預設不顯示說明內容', () => {
    render(<MetricInfo termId="sharpe" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('點擊後顯示四段說明', async () => {
    const user = userEvent.setup()
    render(<MetricInfo termId="sharpe" />)
    await user.click(screen.getByRole('button', { name: /說明/ }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('是什麼')
    expect(dialog).toHaveTextContent('怎麼算')
    expect(dialog).toHaveTextContent('怎麼看')
    expect(dialog).toHaveTextContent('陷阱')
  })

  it('再次點擊可關閉', async () => {
    const user = userEvent.setup()
    render(<MetricInfo termId="sharpe" />)
    const btn = screen.getByRole('button', { name: /說明/ })
    await user.click(btn)
    await user.click(btn)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('用點擊而非 hover 觸發 —— 手機沒有 hover', async () => {
    const user = userEvent.setup()
    render(<MetricInfo termId="mdd" />)
    await user.hover(screen.getByRole('button', { name: /說明/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('未知的指標代碼不渲染任何東西,不讓整頁崩潰', () => {
    const { container } = render(<MetricInfo termId="不存在的指標" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('觸發鈕以 aria-expanded 反映開闔狀態', async () => {
    const user = userEvent.setup()
    render(<MetricInfo termId="beta" />)
    const btn = screen.getByRole('button', { name: /說明/ })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    await user.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
  })
})
