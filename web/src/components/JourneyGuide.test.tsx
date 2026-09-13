import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { JourneyGuide } from './JourneyGuide'

const empty = {
  watched: false, compared: false, recorded: false, balanced: false, completed: 0,
}

describe('JourneyGuide', () => {
  it('顯示四步進度並把第一個未完成項目列為下一步', () => {
    render(<JourneyGuide progress={{ ...empty, watched: true, completed: 1 }}
                         compareCodes={[]} onExplore={() => {}} onDismiss={() => {}} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByText('建議下一步：並排比較')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '挑選 ETF 來比較' })).toBeInTheDocument()
  })

  it('可關閉導覽', async () => {
    const onDismiss = vi.fn()
    render(<JourneyGuide progress={empty} compareCodes={[]}
                         onExplore={() => {}} onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: '關閉使用導覽' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('全部完成後導向我的組合', () => {
    render(<JourneyGuide progress={{
      watched: true, compared: true, recorded: true, balanced: true, completed: 4,
    }} compareCodes={['0050', '0056']} onExplore={() => {}} onDismiss={() => {}} />)
    expect(screen.getByRole('link', { name: '查看我的組合' }))
      .toHaveAttribute('href', '#/portfolio')
  })
})
