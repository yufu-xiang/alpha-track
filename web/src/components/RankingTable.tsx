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

interface Props {
  rows: EtfRow[]
  visibleColumns: PeriodCode[]
  sortBy: PeriodCode | null
  onSortChange: (period: PeriodCode) => void
  showRisk?: boolean
}

export function RankingTable({
  rows, visibleColumns, sortBy, onSortChange, showRisk = false,
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
        cell: (c) => formatPercent(c.getValue() ?? null),
        sortUndefined: 'last',
      }),
    )

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

    return [...base, ...periodCols, ...riskCols]
  }, [visibleColumns, showRisk])

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
                return (
                  <th
                    key={header.id}
                    onClick={
                      canSort
                        ? () => {
                            header.column.toggleSorting()
                            if (isPeriod) onSortChange(header.column.id as PeriodCode)
                          }
                        : undefined
                    }
                    aria-sort={
                      header.column.getIsSorted() === 'asc'
                        ? 'ascending'
                        : header.column.getIsSorted() === 'desc'
                          ? 'descending'
                          : undefined
                    }
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
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
