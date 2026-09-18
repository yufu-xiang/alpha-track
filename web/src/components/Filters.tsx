/** 篩選列:分類 chips、搜尋、槓桿反向開關。規格 §5.2。 */
interface Props {
  categories: string[]
  selected: string[]
  regions: string[]
  selectedRegions: string[]
  onRegionsChange: (next: string[]) => void
  query: string
  showLevered: boolean
  onCategoriesChange: (next: string[]) => void
  onQueryChange: (next: string) => void
  onShowLeveredChange: (next: boolean) => void
  watchlistCount?: number
  onlyWatchlist?: boolean
  onOnlyWatchlistChange?: (next: boolean) => void
  minListingYears?: number
  minTurnoverMillions?: number | null
  maxDrawdownPercent?: number | null
  onMinListingYearsChange?: (next: number) => void
  onMinTurnoverMillionsChange?: (next: number | null) => void
  onMaxDrawdownPercentChange?: (next: number | null) => void
}

export function Filters({
  categories, selected, regions, selectedRegions, query, showLevered,
  onCategoriesChange, onRegionsChange, onQueryChange, onShowLeveredChange,
  watchlistCount = 0, onlyWatchlist = false, onOnlyWatchlistChange,
  minListingYears = 0, minTurnoverMillions = null, maxDrawdownPercent = null,
  onMinListingYearsChange, onMinTurnoverMillionsChange, onMaxDrawdownPercentChange,
}: Props) {
  function toggle(category: string) {
    onCategoriesChange(
      selected.includes(category)
        ? selected.filter((c) => c !== category)
        : [...selected, category],
    )
  }

  function toggleRegion(region: string) {
    onRegionsChange(
      selectedRegions.includes(region)
        ? selectedRegions.filter((r) => r !== region)
        : [...selectedRegions, region],
    )
  }

  return (
    <div className="filters">
      {categories.length > 0 && (
        <div className="filters__group">
          <span className="filters__label">類型</span>
          <div className="filters__chips">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={selected.includes(c)}
                onClick={() => toggle(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {regions.length > 0 && (
        <div className="filters__group" role="group" aria-label="依地區篩選">
          <span className="filters__label">市場</span>
          <div className="filters__chips filters__chips--region">
            {regions.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={selectedRegions.includes(r)}
                onClick={() => toggleRegion(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="filters__criteria" role="group" aria-label="量化篩選條件">
        <label>
          <span>掛牌至少</span>
          <select value={minListingYears}
                  onChange={(event) => onMinListingYearsChange?.(Number(event.target.value))}>
            <option value={0}>不限</option>
            <option value={1}>1 年</option>
            <option value={3}>3 年</option>
            <option value={5}>5 年</option>
          </select>
        </label>
        <label>
          <span>日均成交額至少（百萬元）</span>
          <input type="number" min="0" step="1" placeholder="不限"
                 value={minTurnoverMillions ?? ''}
                 onChange={(event) => {
                   const raw = event.target.value
                   onMinTurnoverMillionsChange?.(raw === '' ? null : Math.max(0, Number(raw)))
                 }} />
        </label>
        <label>
          <span>最大回撤不超過（%）</span>
          <input type="number" min="0" max="100" step="1" placeholder="不限"
                 value={maxDrawdownPercent ?? ''}
                 onChange={(event) => {
                   const raw = event.target.value
                   onMaxDrawdownPercentChange?.(raw === '' ? null
                     : Math.min(100, Math.max(0, Number(raw))))
                 }} />
        </label>
        <p>資料不足的標的不會通過對應門檻；掛牌年限以本次資料日期計算。</p>
      </div>

      <div className="filters__utility">
        {onOnlyWatchlistChange && (
          <button type="button" className="filters__watchlist"
                  aria-pressed={onlyWatchlist}
                  disabled={watchlistCount === 0}
                  title={watchlistCount === 0 ? '可在排行榜或 ETF 詳情頁加入自選' : undefined}
                  onClick={() => onOnlyWatchlistChange(!onlyWatchlist)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
            </svg>
            只看自選 <span>{watchlistCount}</span>
          </button>
        )}
        <label className="filters__search">
          <span className="filters__label">搜尋</span>
          <input
            type="search"
            placeholder="輸入代號或名稱"
            aria-label="搜尋代號或名稱"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </label>

        <label className="filters__toggle">
          <input
            type="checkbox"
            checked={showLevered}
            onChange={(e) => onShowLeveredChange(e.target.checked)}
          />
          <span className="switch-track" aria-hidden="true" />
          <span>顯示槓桿與反向 ETF</span>
        </label>
      </div>
    </div>
  )
}
