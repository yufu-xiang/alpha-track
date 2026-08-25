import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Filters } from './Filters'

const PROPS = {
  categories: ['市值型', '高股息', '債券型'],
  selected: [] as string[],
  regions: ['台灣', '美國'],
  selectedRegions: [] as string[],
  onRegionsChange: vi.fn(),
  query: '',
  showLevered: false,
  onCategoriesChange: vi.fn(),
  onQueryChange: vi.fn(),
  onShowLeveredChange: vi.fn(),
}

describe('Filters', () => {
  it('每個分類渲染成一個可切換的按鈕', () => {
    render(<Filters {...PROPS} />)
    expect(screen.getByRole('button', { name: '市值型' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '債券型' })).toBeInTheDocument()
  })

  it('點擊分類會加入選取', async () => {
    const onCategoriesChange = vi.fn()
    const user = userEvent.setup()
    render(<Filters {...PROPS} onCategoriesChange={onCategoriesChange} />)
    await user.click(screen.getByRole('button', { name: '高股息' }))
    expect(onCategoriesChange).toHaveBeenCalledWith(['高股息'])
  })

  it('再次點擊已選分類會取消', async () => {
    const onCategoriesChange = vi.fn()
    const user = userEvent.setup()
    render(<Filters {...PROPS} selected={['高股息']} onCategoriesChange={onCategoriesChange} />)
    await user.click(screen.getByRole('button', { name: '高股息' }))
    expect(onCategoriesChange).toHaveBeenCalledWith([])
  })

  it('已選分類以 aria-pressed 標示', () => {
    render(<Filters {...PROPS} selected={['高股息']} />)
    expect(screen.getByRole('button', { name: '高股息' }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '市值型' }))
      .toHaveAttribute('aria-pressed', 'false')
  })

  it('搜尋框輸入時回報內容', async () => {
    const onQueryChange = vi.fn()
    const user = userEvent.setup()
    render(<Filters {...PROPS} onQueryChange={onQueryChange} />)
    await user.type(screen.getByRole('searchbox'), '0050')
    expect(onQueryChange).toHaveBeenCalled()
  })

  it('槓桿反向開關預設為關', () => {
    render(<Filters {...PROPS} />)
    expect(screen.getByRole('checkbox', { name: /槓桿|反向/ })).not.toBeChecked()
  })

  it('切換槓桿反向開關會回報', async () => {
    const onShowLeveredChange = vi.fn()
    const user = userEvent.setup()
    render(<Filters {...PROPS} onShowLeveredChange={onShowLeveredChange} />)
    await user.click(screen.getByRole('checkbox', { name: /槓桿|反向/ }))
    expect(onShowLeveredChange).toHaveBeenCalledWith(true)
  })

  it('沒有任何分類時不渲染空的按鈕列', () => {
    render(<Filters {...PROPS} categories={[]} regions={[]} />)
    // 只剩下槓桿開關那個 checkbox,沒有任何分類或地區按鈕
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

describe('Filters 地區', () => {
  it('每個地區渲染成一個可切換的按鈕', () => {
    render(<Filters {...PROPS} />)
    const group = screen.getByRole('group', { name: /地區/ })
    expect(within(group).getByRole('button', { name: '台灣' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: '美國' })).toBeInTheDocument()
  })

  it('點擊地區會回報', async () => {
    const onRegionsChange = vi.fn()
    const user = userEvent.setup()
    render(<Filters {...PROPS} onRegionsChange={onRegionsChange} />)
    const group = screen.getByRole('group', { name: /地區/ })
    await user.click(within(group).getByRole('button', { name: '美國' }))
    expect(onRegionsChange).toHaveBeenCalledWith(['美國'])
  })

  it('沒有地區資料時不渲染空的按鈕列', () => {
    render(<Filters {...PROPS} regions={[]} />)
    expect(screen.queryByRole('group', { name: /地區/ })).not.toBeInTheDocument()
  })
})
