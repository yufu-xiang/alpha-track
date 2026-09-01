/**
 * 排行榜頁面組裝。規格 §5.2。
 *
 * 連帶規則:排序中的期間必須看得見。兩個方向都要顧到 ——
 * 點選未顯示的期間會自動加入該欄位;隱藏正在排序的欄位則把排序
 * 移到仍看得見的欄位。任一方向漏掉,使用者都會看到榜單莫名亂掉
 * (TanStack 會把對應欄位不存在的排序狀態直接濾掉)。
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { ColumnPicker } from './components/ColumnPicker'
import { Filters } from './components/Filters'
import { HealthBar } from './components/HealthBar'
import { PeriodTabs } from './components/PeriodTabs'
import { RankingTable } from './components/RankingTable'
import { PageLoading } from './components/LoadingSkeleton'
import { ThemeToggle } from './components/ThemeToggle'
import { loadData, type LoadResult } from './data/loader'
import { applyFilters, collectCategories, collectRegions } from './lib/filtering'
import { formatPercent } from './lib/format'
import { loadPrefs, savePrefs } from './lib/prefs'
import { MAX_COMPARE, toggleCompare } from './lib/compare'
import {
  loadCompareBasket, loadWatchlist, saveCompareBasket, toggleWatchlist,
} from './lib/personalLists'
import { hashFor, useRoute } from './lib/route'
import { PERIODS, PERIOD_LABELS, type PeriodCode } from './types'

// 排行榜是首屏；個股、比較、組合與工具頁依路由載入，避免使用者只看排行
// 時也下載十一個試算工具和所有圖表程式。
const EtfDetail = lazy(() => import('./components/EtfDetail')
  .then((m) => ({ default: m.EtfDetail })))
const Compare = lazy(() => import('./components/Compare')
  .then((m) => ({ default: m.Compare })))
const Portfolio = lazy(() => import('./components/Portfolio')
  .then((m) => ({ default: m.Portfolio })))
const Glossary = lazy(() => import('./components/Glossary')
  .then((m) => ({ default: m.Glossary })))
const Tools = lazy(() => import('./components/tools')
  .then((m) => ({ default: m.Tools })))

export function App() {
  const route = useRoute()
  if (route.name !== 'rankings') {
    const page = route.name === 'detail' ? <EtfDetail code={route.code} />
      : route.name === 'compare' ? <Compare codes={route.codes} />
      : route.name === 'portfolio' ? <Portfolio initialCode={route.code} />
      : route.name === 'glossary' ? <Glossary />
      : <Tools tool={route.tool} />
    return <Suspense fallback={<PageLoading />}>{page}</Suspense>
  }
  return <Rankings />
}

function Rankings() {
  const [result, setResult] = useState<LoadResult | null>(null)
  const [prefs, setPrefs] = useState(() => loadPrefs())
  const [sortBy, setSortBy] = useState<PeriodCode>('Y1')
  const [categories, setCategories] = useState<string[]>([])
  const [regions, setRegions] = useState<string[]>([])
  const [compare, setCompare] = useState<string[]>(() => loadCompareBasket())
  const [watchlist, setWatchlist] = useState<string[]>(() => loadWatchlist())
  const [onlyWatchlist, setOnlyWatchlist] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    void loadData().then(setResult)
  }, [])

  useEffect(() => {
    savePrefs(prefs)
  }, [prefs])

  useEffect(() => {
    saveCompareBasket(compare)
  }, [compare])

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
    () => applyFilters(allRows, {
      categories: [], regions: [], query: '', showLevered: prefs.showLevered,
    }),
    [allRows, prefs.showLevered],
  )
  const availableCategories = useMemo(
    () => collectCategories(visibleRows), [visibleRows],
  )
  const availableRegions = useMemo(
    () => collectRegions(visibleRows), [visibleRows],
  )
  const filteredRows = useMemo(
    () => applyFilters(allRows, {
      categories, regions, query, showLevered: prefs.showLevered,
    }),
    [allRows, categories, regions, query, prefs.showLevered],
  )
  const rows = useMemo(
    () => onlyWatchlist
      ? filteredRows.filter((row) => watchlist.includes(row.code))
      : filteredRows,
    [filteredRows, onlyWatchlist, watchlist],
  )
  const activeFilters = categories.length + regions.length + (query.trim() ? 1 : 0)
    + (onlyWatchlist ? 1 : 0)

  function handleWatchlistToggle(code: string) {
    setWatchlist((current) => toggleWatchlist(current, code))
  }

  if (result === null) {
    return <PageLoading variant="rankings" />
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
      <header className="app__header">
        <div className="app__hero">
          <img
            className="brand-mark"
            src={`${import.meta.env.BASE_URL}icon.png`}
            alt=""
            aria-hidden="true"
            draggable="false"
          />
          <div className="app__intro">
            <p className="eyebrow">ALPHA TRACK · TAIWAN ETF</p>
            <h1>ETF Rankings</h1>
            <p className="app__subtitle">把全市場報酬、風險與相對強弱，整理成一張可比較的表。</p>
          </div>
          <nav className="app__nav" aria-label="主要功能">
            <a href={hashFor({ name: 'portfolio' })}>
              <span aria-hidden="true">◎</span> 我的組合
            </a>
            <a href={hashFor({ name: 'tools', tool: null })}>
              <span aria-hidden="true">◇</span> 理財工具
            </a>
            <a href={hashFor({ name: 'glossary' })}>
              <span aria-hidden="true">?</span> 指標詞典
            </a>
            <ThemeToggle />
          </nav>
        </div>

        <div className="market-summary" aria-label="市場摘要">
          <div className="market-summary__item">
            <span>市場標的</span>
            <strong>{result.meta.etf_count}</strong>
            <small>檔 ETF</small>
          </div>
          <div className="market-summary__item">
            <span>目前顯示</span>
            <strong>{rows.length}</strong>
            <small>檔結果</small>
          </div>
          <div className="market-summary__item market-summary__item--accent">
            <span>排序依據</span>
            <strong>{PERIOD_LABELS[sortBy]}</strong>
            <small>含息總報酬</small>
          </div>
        </div>

        <HealthBar meta={result.meta} />
      </header>

      <section className="dashboard-controls" aria-label="排行榜控制">
        <div className="dashboard-controls__section dashboard-controls__section--period">
          <div className="section-heading">
            <div>
              <p className="eyebrow">PERFORMANCE WINDOW</p>
              <h2>選擇排序期間</h2>
            </div>
            <span className="section-heading__hint">點擊表頭可切換升冪／降冪</span>
          </div>
          <PeriodTabs active={sortBy} onSelect={handlePeriodSelect} />
        </div>

        <div className="dashboard-controls__section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">REFINE RESULTS</p>
              <h2>篩選市場</h2>
            </div>
            <div className="controls__actions">
              {activeFilters > 0 && (
                <button
                  type="button"
                  className="clear-filters"
                  onClick={() => {
                  setCategories([])
                  setRegions([])
                  setQuery('')
                  setOnlyWatchlist(false)
                  }}
                >
                  清除 {activeFilters} 項篩選
                </button>
              )}
              <ColumnPicker
                selected={prefs.visibleColumns}
                onChange={handleColumnsChange}
                selectedRisk={prefs.visibleRisk}
                onRiskChange={(next) => setPrefs((p) => ({ ...p, visibleRisk: next }))}
              />
            </div>
          </div>
          <Filters
            categories={availableCategories}
            selected={categories}
            regions={availableRegions}
            selectedRegions={regions}
            onRegionsChange={setRegions}
            query={query}
            showLevered={prefs.showLevered}
            onCategoriesChange={setCategories}
            onQueryChange={setQuery}
            onShowLeveredChange={(v) => setPrefs((p) => ({ ...p, showLevered: v }))}
            watchlistCount={watchlist.length}
            onlyWatchlist={onlyWatchlist}
            onOnlyWatchlistChange={setOnlyWatchlist}
          />
        </div>
      </section>

      <div className="ranking-heading">
        <div>
          <p className="eyebrow">MARKET RANKING</p>
          <h2>{PERIOD_LABELS[sortBy]}績效排行榜</h2>
        </div>
        <p><strong>{rows.length}</strong> / {allRows.length} 檔</p>
      </div>

      <RankingTable
        rows={rows}
        visibleColumns={prefs.visibleColumns}
        sortBy={sortBy}
        onSortChange={setSortBy}
        visibleRisk={prefs.visibleRisk}
        compareSelected={compare}
        onCompareToggle={(code) => setCompare((s) => toggleCompare(s, code))}
        watchlist={watchlist}
        onWatchlistToggle={handleWatchlistToggle}
        onClearFilters={() => {
          setCategories([])
          setRegions([])
          setQuery('')
          setOnlyWatchlist(false)
        }}
      />

      {compare.length > 0 && (
        <div className="compare-bar">
          <span className="compare-bar__codes">
            已選 {compare.length} / {MAX_COMPARE}:{compare.join('、')}
            {compare.length >= MAX_COMPARE && '(已達上限)'}
          </span>
          {compare.length >= 2 ? (
            <a href={hashFor({ name: 'compare', codes: compare })}>比較這 {compare.length} 檔</a>
          ) : (
            <span className="compare-bar__codes">再選一檔即可比較</span>
          )}
          <button type="button" className="is-ghost" onClick={() => setCompare([])}>
            清除
          </button>
        </div>
      )}

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
