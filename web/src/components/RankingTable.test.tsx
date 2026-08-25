import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fixtureRankings } from '../data/fixture'
import { RankingTable } from './RankingTable'

const ROWS = fixtureRankings.etfs

/** 從資料本身推導,而不是把代號寫死 —— 動 fixture 時測試才不會莫名變紅。 */
function codesWithoutData(period: 'Y1' | 'Y5' | 'Y10'): string[] {
  return ROWS.filter((r) => r.returns[period] === null).map((r) => r.code).sort()
}

function renderTable(props: Partial<Parameters<typeof RankingTable>[0]> = {}) {
  return render(
    <RankingTable
      rows={ROWS}
      visibleColumns={['D1', 'M1', 'Y1', 'Y10']}
      sortBy="Y1"
      onSortChange={vi.fn()}
      {...props}
    />,
  )
}

function bodyRowCodes(): string[] {
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
  return rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent!.trim())
}

describe('RankingTable', () => {
  it('每一列都渲染出來', () => {
    renderTable()
    expect(bodyRowCodes()).toHaveLength(ROWS.length)
  })

  it('只顯示指定的期間欄位', () => {
    renderTable({ visibleColumns: ['D1', 'Y1'] })
    expect(screen.getByRole('columnheader', { name: /當日/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /一年/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /十年/ })).not.toBeInTheDocument()
  })

  it('預設依指定欄位降冪排序', () => {
    renderTable({ sortBy: 'Y1' })
    // fixture 中 Y1 最高者為 00631L(+38.22%)
    expect(bodyRowCodes()[0]).toBe('00631L')
  })

  it('資料不足的欄位顯示破折號而非 0', () => {
    renderTable({ visibleColumns: ['Y10'], sortBy: 'Y10' })
    const row = within(screen.getByRole('table'))
      .getAllByRole('row')
      .find((r) => within(r).queryByText('00929'))!
    expect(within(row).getAllByRole('cell').at(-1)).toHaveTextContent('—')
  })

  it('依 Y10 降冪時,資料不足者排在最末', () => {
    renderTable({ sortBy: 'Y10' })
    const missing = codesWithoutData('Y10')
    expect(bodyRowCodes().slice(-missing.length).sort()).toEqual(missing)
  })

  it('依 Y10 升冪時,資料不足者仍排在最末 —— 這是與一般表格最關鍵的差異', async () => {
    const user = userEvent.setup()
    renderTable({ sortBy: 'Y10' })
    const header = screen.getByRole('columnheader', { name: /十年/ })
    await user.click(header)
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    const missing = codesWithoutData('Y10')
    expect(bodyRowCodes().slice(-missing.length).sort()).toEqual(missing)
  })

  it('點擊欄位標頭會通知外部排序變更', async () => {
    const onSortChange = vi.fn()
    const user = userEvent.setup()
    renderTable({ onSortChange })
    await user.click(screen.getByRole('columnheader', { name: /當日/ }))
    expect(onSortChange).toHaveBeenCalledWith('D1')
  })

  it('風險欄位標頭附帶指標說明按鈕', () => {
    renderTable({ visibleColumns: [], showRisk: true, sortBy: null })
    expect(screen.getByRole('button', { name: /夏普值.*說明/ })).toBeInTheDocument()
  })

  it('點擊標頭裡的說明鈕不會順便把表格重新排序', async () => {
    // 說明鈕就長在可排序的 th 裡面。事件冒泡上去的話,想讀一下說明
    // 就會把整張表翻掉,而使用者不會意識到是自己按出來的。
    const onSortChange = vi.fn()
    const user = userEvent.setup()
    renderTable({ visibleColumns: [], showRisk: true, sortBy: null, onSortChange })
    const before = bodyRowCodes()
    await user.click(screen.getByRole('button', { name: /夏普值.*說明/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(bodyRowCodes()).toEqual(before)
    expect(onSortChange).not.toHaveBeenCalled()
  })

  it('說明彈窗不得渲染在表格容器內 —— 那個容器的 overflow 會把它裁掉', async () => {
    // 實測:就地 absolute 定位時,說明文字會從中間被切斷。
    // 說明看不完整等於這個功能不存在,而這件事只有真的打開瀏覽器才看得到,
    // 所以在這裡把「必須在容器外」這個結構條件釘住。
    const user = userEvent.setup()
    const { container } = renderTable({ visibleColumns: [], showRisk: true, sortBy: null })
    await user.click(screen.getByRole('button', { name: /夏普值.*說明/ }))
    const dialog = screen.getByRole('dialog')
    expect(container.querySelector('.table-wrap')!.contains(dialog)).toBe(false)
  })

  it('外部改變 sortBy 時,表格要跟著重新排序', () => {
    // 期間分頁切換時 App 會改 sortBy。只用 useState 初始值的話,
    // 這個 prop 變了表格卻不動,使用者會看到「換了分頁但榜單沒變」。
    const { rerender } = renderTable({ sortBy: 'Y1' })
    expect(bodyRowCodes()[0]).toBe('00631L') // Y1 最高
    rerender(
      <RankingTable
        rows={ROWS}
        visibleColumns={['D1', 'M1', 'Y1', 'Y10']}
        sortBy="D1"
        onSortChange={vi.fn()}
      />,
    )
    expect(bodyRowCodes()[0]).toBe('00929') // D1 最高
  })

  it('sortBy 指向未顯示的欄位時不排序,而非崩潰', () => {
    // TanStack 會把「對應欄位不存在」的排序狀態濾掉,結果是回到原始順序。
    // 這裡把行為記錄下來:避免的責任在 App —— 選了某期間就該讓該欄可見
    // (見 App 的 ensureSortedColumnVisible)。
    renderTable({ sortBy: 'M6', visibleColumns: ['D1', 'Y1'] })
    expect(bodyRowCodes()).toEqual(ROWS.map((r) => r.code))
  })

  it('空資料時顯示提示而非空白表格', () => {
    renderTable({ rows: [] })
    expect(screen.getByText(/沒有符合條件的 ETF/)).toBeInTheDocument()
  })

  it('正報酬標成 gain、負報酬標成 loss,資料不足兩者皆無', () => {
    // 樣式表只驗得到 CSS 文字裡有 var(--gain);真正決定畫面上有沒有顏色的
    // 是這裡有沒有吐出對應的 class。少了它,CSS 測試全綠而畫面一片灰。
    renderTable({ visibleColumns: ['D1', 'Y10'], sortBy: 'D1' })
    const table = within(screen.getByRole('table'))
    const rowOf = (code: string) =>
      table.getAllByRole('row').find((r) => within(r).queryByText(code))!

    expect(within(rowOf('0050')).getByText('+0.52%')).toHaveClass('gain')
    expect(within(rowOf('0056')).getByText('-0.21%')).toHaveClass('loss')

    const missing = within(rowOf('00999')).getAllByRole('cell').at(-1)!
    expect(missing).toHaveTextContent('—')
    expect(missing.querySelector('.gain, .loss')).toBeNull()
  })

  it('零報酬不著色 —— 沒漲沒跌不是漲也不是跌', () => {
    const flat = ROWS.map((r) => ({ ...r, returns: { ...r.returns, D1: 0 } }))
    renderTable({ rows: flat, visibleColumns: ['D1'], sortBy: 'D1' })
    const cell = within(screen.getByRole('table')).getAllByRole('row')[1]!
    expect(within(cell).getByText('0.00%').className).toBe('')
  })

  it('風險欄位不著色 —— 最大回撤恆為負、波動度高也不代表糟', () => {
    renderTable({ visibleColumns: [], showRisk: true, sortBy: null })
    const row = within(screen.getByRole('table'))
      .getAllByRole('row')
      .find((r) => within(r).queryByText('0050'))!
    expect(within(row).getByText('-34.21%').className).toBe('')
  })

  it('報酬以百分比呈現並帶正負號', () => {
    renderTable({ visibleColumns: ['D1'], sortBy: 'D1' })
    const row = within(screen.getByRole('table'))
      .getAllByRole('row')
      .find((r) => within(r).queryByText('0050'))!
    expect(within(row).getByText('+0.52%')).toBeInTheDocument()
  })
})

describe('RankingTable 超額報酬', () => {
  it('顯示當前排序期間的超額報酬,表頭標明是哪一期', () => {
    // 規格 §4.5b:「這檔有沒有贏大盤」。每個期間各加一欄會爆版,
    // 所以只顯示當前選取期間的那一個,並在表頭寫清楚是哪一期。
    renderTable({ visibleColumns: ['Y1'], sortBy: 'Y1', showExcess: true })
    expect(screen.getByRole('columnheader', { name: /超額.*一年/ })).toBeInTheDocument()
    const row = within(screen.getByRole('table'))
      .getAllByRole('row')
      .find((r) => within(r).queryByText('0050'))!
    expect(within(row).getByText('+4.21%')).toBeInTheDocument()
  })

  it('切換期間時超額報酬跟著換', () => {
    renderTable({ visibleColumns: ['D1'], sortBy: 'D1', showExcess: true })
    expect(screen.getByRole('columnheader', { name: /超額.*當日/ })).toBeInTheDocument()
    const row = within(screen.getByRole('table'))
      .getAllByRole('row')
      .find((r) => within(r).queryByText('0050'))!
    expect(within(row).getByText('+0.12%')).toBeInTheDocument()
  })

  it('大盤資料涵蓋不到的期間顯示破折號', () => {
    renderTable({ visibleColumns: ['Y10'], sortBy: 'Y10', showExcess: true })
    const row = within(screen.getByRole('table'))
      .getAllByRole('row')
      .find((r) => within(r).queryByText('00929'))!
    expect(within(row).getAllByRole('cell').at(-1)).toHaveTextContent('—')
  })

  it('贏大盤標成 gain、輸大盤標成 loss', () => {
    renderTable({ visibleColumns: ['Y1'], sortBy: 'Y1', showExcess: true })
    const table = within(screen.getByRole('table'))
    const rowOf = (c: string) => table.getAllByRole('row').find((r) => within(r).queryByText(c))!
    expect(within(rowOf('0050')).getByText('+4.21%')).toHaveClass('gain')
    expect(within(rowOf('0056')).getByText('-1.68%')).toHaveClass('loss')
  })

  it('sortBy 為 null 時不渲染超額報酬欄 —— 沒有期間就沒有對應的超額', () => {
    renderTable({ visibleColumns: [], sortBy: null, showExcess: true })
    expect(screen.queryByRole('columnheader', { name: /超額/ })).not.toBeInTheDocument()
  })
})

describe('RankingTable 排序指示', () => {
  it('目前排序中的欄位顯示方向箭頭', () => {
    renderTable({ visibleColumns: ['D1', 'Y1'], sortBy: 'Y1' })
    const sorted = screen.getByRole('columnheader', { name: /^一年/ })
    expect(sorted.querySelector('.sort-caret')).toHaveTextContent('▼')
  })

  it('切成升冪時箭頭跟著反過來', async () => {
    const user = userEvent.setup()
    renderTable({ visibleColumns: ['D1', 'Y1'], sortBy: 'Y1' })
    const sorted = screen.getByRole('columnheader', { name: /^一年/ })
    await user.click(sorted)
    expect(sorted).toHaveAttribute('aria-sort', 'ascending')
    expect(sorted.querySelector('.sort-caret')).toHaveTextContent('▲')
  })

  it('未排序的欄位沒有箭頭 —— 否則等於沒有指示', () => {
    renderTable({ visibleColumns: ['D1', 'Y1'], sortBy: 'Y1' })
    const other = screen.getByRole('columnheader', { name: /^當日/ })
    expect(other.querySelector('.sort-caret')).toBeNull()
  })

  it('箭頭對螢幕閱讀器隱藏 —— aria-sort 已經表達了同一件事', () => {
    renderTable({ visibleColumns: ['Y1'], sortBy: 'Y1' })
    const caret = screen.getByRole('columnheader', { name: /^一年/ })
      .querySelector('.sort-caret')!
    expect(caret).toHaveAttribute('aria-hidden', 'true')
  })

  it('不可排序的欄位不標成可排序 —— 游標說可以點卻沒反應是騙人', () => {
    renderTable({ visibleColumns: ['Y1'], sortBy: 'Y1' })
    expect(screen.getByRole('columnheader', { name: '代號' }))
      .not.toHaveClass('is-sortable')
    expect(screen.getByRole('columnheader', { name: /^一年/ }))
      .toHaveClass('is-sortable')
  })
})
