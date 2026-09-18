import { useState } from 'react'
import { formatDate } from '../lib/format'
import { hashFor } from '../lib/route'
import type { WatchChange } from '../lib/watchChanges'

function points(value: number | null): string {
  if (value === null) return '資料不足'
  const n = value * 100
  return `${n > 0 ? '+' : ''}${n.toFixed(2)} 個百分點`
}

interface Props {
  changes: WatchChange[]
  previousDate: string | null
  currentDate: string
}

export function WatchlistChanges({ changes, previousDate, currentDate }: Props) {
  const [expanded, setExpanded] = useState(false)
  if (changes.length === 0) return null
  const visible = expanded ? changes : changes.slice(0, 6)
  return (
    <section className="watch-changes" aria-labelledby="watch-changes-title">
      <div className="watch-changes__heading">
        <div>
          <p className="eyebrow">MY WATCHLIST</p>
          <h2 id="watch-changes-title">自選標的變化</h2>
          <p>{previousDate
            ? `比較 ${formatDate(previousDate)} 與 ${formatDate(currentDate)} 的資料；一年報酬是兩次滾動區間數值的差。`
            : `已記錄 ${formatDate(currentDate)} 的基準值；下一個資料日即可比較變化。`}</p>
        </div>
        <span>{changes.length} 檔自選</span>
      </div>
      <ul className="watch-changes__list">
        {visible.map((item) => (
          <li key={item.code}>
            <div className="watch-changes__item-heading">
              <a href={hashFor({ name: 'detail', code: item.code })}>{item.code} {item.name}</a>
              {item.anomaly && <strong title={item.anomaly}>
                {item.newAnomaly ? '新增資料異常' : '資料異常'}
              </strong>}
            </div>
            {item.hasPrevious ? (
              <dl>
                <div><dt>一年含息報酬變動</dt><dd>{points(item.oneYearReturnChange)}</dd></div>
                <div><dt>折溢價變動</dt><dd>{points(item.premiumChange)}</dd></div>
              </dl>
            ) : <p>首次追蹤，待下次資料更新後比較。</p>}
            {item.anomaly && <p className="watch-changes__anomaly">{item.anomaly}</p>}
          </li>
        ))}
      </ul>
      {changes.length > 6 && (
        <button type="button" className="watch-changes__more"
                onClick={() => setExpanded((value) => !value)}>
          {expanded ? '收起' : `查看全部 ${changes.length} 檔`}
        </button>
      )}
    </section>
  )
}
