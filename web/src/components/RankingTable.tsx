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
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatNumber, formatPercent } from '../lib/format'
import { toSortable } from '../lib/sorting'
import {
  PERIOD_LABELS, RISK_LABELS, RISK_TERMS,
  type EtfRow, type PeriodCode, type RiskColumn,
} from '../types'
import { MetricInfo } from './MetricInfo'
import { EmptyState } from './EmptyState'

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
  /** 要顯示哪些風險指標。規格 §5.2:由欄位選單控制,勾選即顯示。 */
  visibleRisk?: RiskColumn[]
  /** 已選入比較的代號。未提供則不顯示選取欄。 */
  compareSelected?: string[]
  onCompareToggle?: (code: string) => void
  /** 篩選後沒有結果時，提供回到完整市場的明確出口。 */
  onClearFilters?: () => void
  /** 自選清單。提供時在代號旁顯示收藏按鈕。 */
  watchlist?: string[]
  onWatchlistToggle?: (code: string) => void
}

export function RankingTable({
  rows, visibleColumns, sortBy, onSortChange, visibleRisk = [],
  compareSelected, onCompareToggle, onClearFilters,
  watchlist, onWatchlistToggle,
}: Props) {
  const picking = compareSelected !== undefined && onCompareToggle !== undefined
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const [horizontalNav, setHorizontalNav] = useState({
    canLeft: false, canRight: true, progress: 0,
  })
  const visibleColumnsKey = visibleColumns.join(',')
  const visibleRiskKey = visibleRisk.join(',')
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
        // 連結而非 onClick:可以中鍵開新分頁、可以複製網址、鍵盤能 Tab 到,
        // 而 onClick 綁在 <td> 上這三件事都做不到。
        cell: (c) => {
          const code = c.getValue()
          const watched = watchlist?.includes(code) ?? false
          return (
            <span className="rank-code">
              <a href={`#/etf/${code}`}>{code}</a>
              {onWatchlistToggle && (
                <button type="button" className="watchlist-mini"
                        aria-label={`${watched ? '移除' : '加入'}自選 ${code}`}
                        aria-pressed={watched}
                        title={watched ? '從自選移除' : '加入自選'}
                        onClick={() => onWatchlistToggle(code)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
                  </svg>
                </button>
              )}
            </span>
          )
        },
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

    // 每個風險指標各自可開關(規格 §5.2)。超額報酬只取「當前選取期間」的
    // 那一個:十一個期間各加一欄會爆版,而使用者一次也只關心正在看的那一期。
    const riskHeader = (c: RiskColumn, suffix = '') => () => (
      <span>{RISK_LABELS[c]}{suffix} <MetricInfo termId={RISK_TERMS[c]} /></span>
    )
    const riskCols = visibleRisk.flatMap((c) => {
      if (c === 'excess') {
        if (!sortBy) return []   // 沒有選期間就沒有對應的超額報酬
        return [helper.accessor((row) => toSortable(row.excess[sortBy]), {
          id: 'excess',
          header: riskHeader('excess', `(${PERIOD_LABELS[sortBy]})`),
          cell: (v) => <ReturnCell value={v.getValue() ?? null} />,
          sortUndefined: 'last',
        })]
      }
      const pick = (row: EtfRow) =>
        c === 'premium_discount' ? row.premium_discount : row.risk[c]
      // 貝他值是倍數不是百分比;其餘四個都是比率。
      const asNumber = c === 'beta' || c === 'sharpe'
      return [helper.accessor((row) => toSortable(pick(row)), {
        id: c,
        header: riskHeader(c),
        cell: (v) => (asNumber
          ? formatNumber(v.getValue() ?? null, 2)
          : formatPercent(v.getValue() ?? null)),
        sortUndefined: 'last',
      })]
    })

    return [...base, ...periodCols, ...riskCols]
  }, [visibleColumns, visibleRisk, sortBy, watchlist, onWatchlistToggle])

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  useEffect(() => {
    const node = tableWrapRef.current
    if (!node) return
    const sync = () => {
      const max = Math.max(0, node.scrollWidth - node.clientWidth)
      const left = Math.max(0, node.scrollLeft)
      setHorizontalNav({
        canLeft: left > 4,
        canRight: max > 4 && left < max - 4,
        progress: max > 0 ? Math.min(1, left / max) : 1,
      })
    }
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [rows.length, visibleColumnsKey, visibleRiskKey, picking])

  function scrollHorizontally(direction: -1 | 1) {
    const node = tableWrapRef.current
    if (!node) return
    const max = Math.max(0, node.scrollWidth - node.clientWidth)
    const next = Math.max(0, Math.min(max,
      node.scrollLeft + direction * Math.max(180, node.clientWidth * 0.68)))
    if (typeof node.scrollTo === 'function') node.scrollTo({ left: next, behavior: 'smooth' })
    else node.scrollLeft = next
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        marker="⌕"
        title="沒有符合條件的 ETF"
        description="目前的分類、地區或關鍵字組合沒有結果，可以清除條件重新探索。"
        action={onClearFilters && (
          <button type="button" onClick={onClearFilters}>清除所有篩選</button>
        )}
      />
    )
  }

  // 名次是**排序的結果**,不是一個資料欄位 —— 所以不做成 TanStack 欄位,
  // 直接依顯示順序算。規格 §4.3:資料不足者不參與排名,那些顯示「—」而
  // 不是編號 —— 依十年排序時,沒有十年資料的不是「第 300 名」,是沒有排名。
  const sortedId = sorting[0]?.id
  const displayRows = table.getRowModel().rows
  const ranks = new Map<string, number>()
  let nextRank = 1
  for (const row of displayRows) {
    if (!sortedId) continue                       // 沒有排序就沒有名次可言
    if (row.getValue(sortedId) === undefined) continue   // toSortable 把 null 映成 undefined
    ranks.set(row.id, nextRank++)
  }

  return (
    <div className="ranking-table-shell">
      <div className="ranking-table-guide" role="toolbar" aria-label="排行榜水平導覽">
        <span>
          <b>名次與代號已固定</b>
          {horizontalNav.canLeft
            ? horizontalNav.canRight ? '左右滑動切換欄位' : '已到最右側'
            : horizontalNav.canRight ? '向右滑看完整績效' : '所有欄位皆已顯示'}
        </span>
        <i aria-hidden="true"><b style={{ width: `${horizontalNav.progress * 100}%` }} /></i>
        <div>
          <button type="button" aria-label="向左瀏覽排行榜"
                  disabled={!horizontalNav.canLeft}
                  onClick={() => scrollHorizontally(-1)}>←</button>
          <button type="button" aria-label="向右瀏覽排行榜"
                  disabled={!horizontalNav.canRight}
                  onClick={() => scrollHorizontally(1)}>→</button>
        </div>
      </div>
      <div className="table-wrap ranking-table-wrap" ref={tableWrapRef}
           onScroll={() => {
             const node = tableWrapRef.current
             if (!node) return
             const max = Math.max(0, node.scrollWidth - node.clientWidth)
             const left = Math.max(0, node.scrollLeft)
             setHorizontalNav({
               canLeft: left > 4,
               canRight: max > 4 && left < max - 4,
               progress: max > 0 ? Math.min(1, left / max) : 1,
             })
           }}>
      <table className={picking ? 'is-picking' : undefined}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {picking && <th className="col-pick"><span className="sr-only">比較</span></th>}
              <th className="col-rank">名次</th>
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort()
                const isPeriod = (visibleColumns as string[]).includes(header.column.id)
                const sorted = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    className={[
                      canSort ? 'is-sortable' : '',
                      sorted ? 'is-sorted' : '',
                      `col-${header.column.id}`,
                    ].filter(Boolean).join(' ')}
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
          {displayRows.map((row) => (
            <tr key={row.id}>
              {picking && (
                <td className="col-pick">
                  <input
                    type="checkbox"
                    aria-label={`比較 ${row.original.code}`}
                    checked={compareSelected!.includes(row.original.code)}
                    onChange={() => onCompareToggle!(row.original.code)}
                  />
                </td>
              )}
              <td className="col-rank">{ranks.get(row.id) ?? '—'}</td>
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={[
                    ['code', 'name', 'category', 'close'].includes(cell.column.id)
                      ? `col-${cell.column.id}`
                      : '',
                    cell.column.id === sortedId ? 'is-sorted' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
