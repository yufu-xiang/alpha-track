/**
 * 排行榜頁面組裝。規格 §5.2。
 *
 * 連帶規則:排序中的期間必須看得見。兩個方向都要顧到 ——
 * 點選未顯示的期間會自動加入該欄位;隱藏正在排序的欄位則把排序
 * 移到仍看得見的欄位。任一方向漏掉,使用者都會看到榜單莫名亂掉
 * (TanStack 會把對應欄位不存在的排序狀態直接濾掉)。
 */
import { useEffect, useMemo, useState } from 'react'
import { ColumnPicker } from './components/ColumnPicker'
import { Filters } from './components/Filters'
import { HealthBar } from './components/HealthBar'
import { PeriodTabs } from './components/PeriodTabs'
import { RankingTable } from './components/RankingTable'
import { loadData, type LoadResult } from './data/loader'
import { applyFilters, collectCategories } from './lib/filtering'
import { formatPercent } from './lib/format'
import { loadPrefs, savePrefs } from './lib/prefs'
import { PERIODS, type PeriodCode } from './types'

export function App() {
  const [result, setResult] = useState<LoadResult | null>(null)
  const [prefs, setPrefs] = useState(() => loadPrefs())
  const [sortBy, setSortBy] = useState<PeriodCode>('Y1')
  const [categories, setCategories] = useState<string[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    void loadData().then(setResult)
  }, [])

  useEffect(() => {
    savePrefs(prefs)
  }, [prefs])

  function handlePeriodSelect(period: PeriodCode) {
    setSortBy(period)
    // 連帶規則(方向一):排序看不見的欄位會造成困惑,故自動加入顯示
    if (!prefs.visibleColumns.includes(period)) {
      setPrefs((p) => ({
        ...p,
        visibleColumns: PERIODS.filter(
          (x) => p.visibleColumns.includes(x) || x === period,
        ),
      }))
    }
  }

  function handleColumnsChange(next: PeriodCode[]) {
    setPrefs((p) => ({ ...p, visibleColumns: next }))
    // 連帶規則(方向二):使用者明確要隱藏這一欄就照做,但排序不能因此
    // 靜默停擺 —— 那會讓榜單看起來莫名回到未排序的順序。改排第一個
    // 仍看得見的欄位。ColumnPicker 保證至少留一欄,故 next[0] 必定存在。
    if (!next.includes(sortBy) && next[0]) setSortBy(next[0])
  }

  const allRows = result?.ok ? result.rankings.etfs : []

  // 分類清單只從「當前開關下看得到的列」推導。否則開關關著時仍會出現
  // 槓桿型/反向型的按鈕,而按下去必然是空表 —— 那是個死路,
  // 使用者只會以為壞了。
  const visibleRows = useMemo(
    () => applyFilters(allRows, { categories: [], query: '', showLevered: prefs.showLevered }),
    [allRows, prefs.showLevered],
  )
  const availableCategories = useMemo(
    () => collectCategories(visibleRows), [visibleRows],
  )
  const rows = useMemo(
    () => applyFilters(allRows, { categories, query, showLevered: prefs.showLevered }),
    [allRows, categories, query, prefs.showLevered],
  )

  if (result === null) {
    return <main className="app"><p>載入中…</p></main>
  }

  if (!result.ok) {
    return (
      <main className="app">
        <p role="alert" className="error">
          {result.error}
          <br />
          請確認 pipeline 已執行過,且 <code>public/data/</code> 下有 JSON 檔。
        </p>
      </main>
    )
  }

  return (
    <main className="app">
      <header>
        <h1>台股 ETF 績效排行</h1>
        <HealthBar meta={result.meta} />
      </header>

      <PeriodTabs active={sortBy} onSelect={handlePeriodSelect} />

      <div className="controls">
        <Filters
          categories={availableCategories}
          selected={categories}
          query={query}
          showLevered={prefs.showLevered}
          onCategoriesChange={setCategories}
          onQueryChange={setQuery}
          onShowLeveredChange={(v) => setPrefs((p) => ({ ...p, showLevered: v }))}
        />
        <ColumnPicker
          selected={prefs.visibleColumns}
          onChange={handleColumnsChange}
        />
      </div>

      <RankingTable
        rows={rows}
        visibleColumns={prefs.visibleColumns}
        sortBy={sortBy}
        onSortChange={setSortBy}
        showRisk
        showExcess
      />

      <footer>
        {/* 組成單一字串:拆成多個 JSX 節點會讓 getByText 的正則比對不到,
            而且螢幕閱讀器也會把它讀成斷開的片段。 */}
        <p>
          {`報酬皆為含息總報酬 · 夏普值使用無風險利率 ${
            formatPercent(result.meta.risk_free_rate).replace('+', '')
          } · 「—」代表該期間資料不足`}
        </p>
      </footer>
    </main>
  )
}
