/** 篩選列:分類 chips、搜尋、槓桿反向開關。規格 §5.2。 */
interface Props {
  categories: string[]
  selected: string[]
  query: string
  showLevered: boolean
  onCategoriesChange: (next: string[]) => void
  onQueryChange: (next: string) => void
  onShowLeveredChange: (next: boolean) => void
}

export function Filters({
  categories, selected, query, showLevered,
  onCategoriesChange, onQueryChange, onShowLeveredChange,
}: Props) {
  function toggle(category: string) {
    onCategoriesChange(
      selected.includes(category)
        ? selected.filter((c) => c !== category)
        : [...selected, category],
    )
  }

  return (
    <div className="filters">
      {categories.length > 0 && (
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
      )}

      <input
        type="search"
        placeholder="搜尋代號或名稱"
        aria-label="搜尋代號或名稱"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />

      <label className="filters__toggle">
        <input
          type="checkbox"
          checked={showLevered}
          onChange={(e) => onShowLeveredChange(e.target.checked)}
        />
        顯示槓桿與反向 ETF
      </label>
    </div>
  )
}
