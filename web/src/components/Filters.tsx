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
}

export function Filters({
  categories, selected, regions, selectedRegions, query, showLevered,
  onCategoriesChange, onRegionsChange, onQueryChange, onShowLeveredChange,
  watchlistCount = 0, onlyWatchlist = false, onOnlyWatchlistChange,
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
