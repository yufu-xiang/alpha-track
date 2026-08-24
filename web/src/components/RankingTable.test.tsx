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
    renderTable({ visibleColumns: ['Y10'] })
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
    renderTable({ visibleColumns: [], showRisk: true })
    expect(screen.getByRole('button', { name: /夏普值.*說明/ })).toBeInTheDocument()
  })

  it('點擊標頭裡的說明鈕不會順便把表格重新排序', async () => {
    // 說明鈕就長在可排序的 th 裡面。事件冒泡上去的話,想讀一下說明
    // 就會把整張表翻掉,而使用者不會意識到是自己按出來的。
    const onSortChange = vi.fn()
    const user = userEvent.setup()
    renderTable({ visibleColumns: [], showRisk: true, onSortChange })
    const before = bodyRowCodes()
    await user.click(screen.getByRole('button', { name: /夏普值.*說明/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(bodyRowCodes()).toEqual(before)
    expect(onSortChange).not.toHaveBeenCalled()
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

  it('報酬以百分比呈現並帶正負號', () => {
    renderTable({ visibleColumns: ['D1'] })
    const row = within(screen.getByRole('table'))
      .getAllByRole('row')
      .find((r) => within(r).queryByText('0050'))!
    expect(within(row).getByText('+0.52%')).toBeInTheDocument()
  })
})
