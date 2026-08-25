/**
 * 績效排行表格。規格 §5.2。
 *
 * 排序關鍵:資料不足(null)者不論升冪降冪都排在最末。做法是把 null 經
 * toSortable 映射成 undefined,再交給 TanStack 的 sortUndefined: 'last'
 * —— 那條路徑會提前 return,不經過降冪反轉,故與排序方向無關
 * (詳見 lib/sorting.ts 的註解,含 table-core 原始碼行號)。
 */
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
import { formatNumber, formatPercent } from '../lib/format'
import { toSortable } from '../lib/sorting'
import { PERIOD_LABELS, type EtfRow, type PeriodCode } from '../types'
import { MetricInfo } from './MetricInfo'

const helper = createColumnHelper<EtfRow>()

/**
 * 報酬儲存格。依正負套上 gain / loss,交給樣式表決定顏色。
 *
 * 只用在報酬欄。最大回撤恆為負、波動度越高也不代表越糟,
 * 替風險指標上紅綠只會誤導 —— 那些欄位維持中性色。
 * 顏色之外一律保留 +/− 符號(formatPercent 的行為),
 * 不讓色盲使用者只能靠顏色判讀。
 */
function ReturnCell({ value }: { value: number | null }) {
  const tone = value === null || value === 0 ? '' : value > 0 ? 'gain' : 'loss'
  return <span className={tone}>{formatPercent(value)}</span>
}

interface Props {
  rows: EtfRow[]
  visibleColumns: PeriodCode[]
  sortBy: PeriodCode | null
  onSortChange: (period: PeriodCode) => void
  showRisk?: boolean
  showExcess?: boolean
}

export function RankingTable({
  rows, visibleColumns, sortBy, onSortChange, showRisk = false,
  showExcess = false,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>(
    sortBy ? [{ id: sortBy, desc: true }] : [],
  )

  // useState 的初始值只在掛載時生效。切換期間分頁時 App 會改 sortBy,
  // 沒有這個同步的話 prop 變了而表格不動,使用者看到的是
  // 「換了分頁但榜單沒變」。同一個期間內的升降冪切換不受影響 ——
  // 那時 sortBy 的值沒變,effect 不會重跑。
  useEffect(() => {
    setSorting(sortBy ? [{ id: sortBy, desc: true }] : [])
  }, [sortBy])

  const columns = useMemo(() => {
    const base = [
      helper.accessor('code', {
        header: '代號',
        cell: (c) => c.getValue(),
        enableSorting: false,
      }),
      helper.accessor('name', {
        header: '名稱',
        cell: (c) => c.getValue(),
        enableSorting: false,
      }),
      helper.accessor('category', {
        header: '分類',
        cell: (c) => c.getValue() ?? '—',
        enableSorting: false,
      }),
      helper.accessor('close', {
        header: '現價',
        cell: (c) => formatNumber(c.getValue(), 2),
      }),
    ]

    const periodCols = visibleColumns.map((p) =>
      helper.accessor((row) => toSortable(row.returns[p]), {
        id: p,
        header: PERIOD_LABELS[p],
        cell: (c) => <ReturnCell value={c.getValue() ?? null} />,
        sortUndefined: 'last',
      }),
    )

    // 超額報酬只顯示「當前選取期間」的那一個:十一個期間各加一欄會爆版,
    // 而使用者一次也只關心正在看的那一期(規格 §4.5b)。
    const excessCols = showExcess && sortBy
      ? [
          helper.accessor((row) => toSortable(row.excess[sortBy]), {
            id: 'excess',
            header: () => (
              <span>超額報酬({PERIOD_LABELS[sortBy]}) <MetricInfo termId="excess" /></span>
            ),
            cell: (c) => <ReturnCell value={c.getValue() ?? null} />,
            sortUndefined: 'last',
          }),
        ]
      : []

    const riskCols = showRisk
      ? [
          helper.accessor((row) => toSortable(row.risk.volatility), {
            id: 'volatility',
            header: () => (<span>年化波動 <MetricInfo termId="volatility" /></span>),
            cell: (c) => formatPercent(c.getValue() ?? null),
            sortUndefined: 'last',
          }),
          helper.accessor((row) => toSortable(row.risk.mdd), {
            id: 'mdd',
            header: () => (<span>最大回撤 <MetricInfo termId="mdd" /></span>),
            cell: (c) => formatPercent(c.getValue() ?? null),
            sortUndefined: 'last',
          }),
          helper.accessor((row) => toSortable(row.risk.sharpe), {
            id: 'sharpe',
            header: () => (<span>夏普值 <MetricInfo termId="sharpe" /></span>),
            cell: (c) => formatNumber(c.getValue() ?? null, 2),
            sortUndefined: 'last',
          }),
          helper.accessor((row) => toSortable(row.premium_discount), {
            id: 'premium_discount',
            header: () => (<span>折溢價 <MetricInfo termId="premium_discount" /></span>),
            cell: (c) => formatPercent(c.getValue() ?? null),
            sortUndefined: 'last',
          }),
        ]
      : []

    return [...base, ...periodCols, ...excessCols, ...riskCols]
  }, [visibleColumns, showRisk, showExcess, sortBy])

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (rows.length === 0) {
    return <p className="empty-state">沒有符合條件的 ETF。試著放寬篩選條件。</p>
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort()
                const isPeriod = (visibleColumns as string[]).includes(header.column.id)
                const sorted = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    className={canSort ? 'is-sortable' : undefined}
                    onClick={
                      canSort
                        ? () => {
                            header.column.toggleSorting()
                            if (isPeriod) onSortChange(header.column.id as PeriodCode)
                          }
                        : undefined
                    }
                    aria-sort={
                      sorted === 'asc'
                        ? 'ascending'
                        : sorted === 'desc'
                          ? 'descending'
                          : undefined
                    }
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {/* 箭頭給眼睛看,aria-sort 給螢幕閱讀器 —— 同一件事講兩次
                        會讓語音把「一年 降冪 向下三角形」整串念出來。 */}
                    {sorted && (
                      <span className="sort-caret" aria-hidden="true">
                        {sorted === 'desc' ? '▼' : '▲'}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
