/**
 * 資料健康狀態列。規格 §5.5。
 *
 * 存在理由:資料來自四個免費來源、其中兩個非官方。個人工具最大的隱患
 * 是「不知道今天的數字能不能信」,這條狀態列讓每次看到的數字可被信任。
 */
import { daysSince } from '../data/loader'
import { formatDate, formatPercent } from '../lib/format'
import type { MetaData } from '../types'

const STALE_WARNING_DAYS = 3

interface Props {
  meta: MetaData
  now?: Date
}

export function HealthBar({ meta, now = new Date() }: Props) {
  const age = daysSince(meta.data_date, now)
  const isOld = age > STALE_WARNING_DAYS

  const notes: string[] = []
  if (meta.is_stale) notes.push('資料未更新(來源驗證未通過)')
  if (isOld) notes.push(`已 ${age} 天未更新`)
  if (meta.unclassified.length > 0) {
    notes.push(`${meta.unclassified.length} 檔未分類`)
  }
  if (meta.anomalies.length > 0) {
    notes.push(`${meta.anomalies.length} 檔價格異常`)
  }

  // 只有「資料本身不可信」才升級成 alert。未分類與價格異常是給維護者的
  // 提示,天天出現;把它們也做成警告,真正該注意的那天就沒人會看了。
  const hasProblem = meta.is_stale || isOld
  const summary = notes.length > 0 ? notes.join(' · ') : '全部正常'

  return (
    <div
      className={`health-bar ${hasProblem ? 'health-bar--warning' : ''}`}
      role={hasProblem ? 'alert' : undefined}
    >
      <span>資料更新至 {formatDate(meta.data_date)}</span>
      <span aria-hidden="true"> · </span>
      <span>{summary}</span>
      {/* 大盤同期漲幅是整張表的判讀基準,不是健康狀態 —— 大盤漲九成的
          年份,連平庸的標的都會有漂亮的報酬與夏普值。沒有資料時整段不顯示,
          而不是顯示破折號:那會被誤讀成「大盤沒漲」。 */}
      {meta.benchmark_return_1y !== null && (
        <>
          <span aria-hidden="true"> · </span>
          <span className="health-bar__benchmark">
            大盤一年 {formatPercent(meta.benchmark_return_1y)}
          </span>
        </>
      )}
    </div>
  )
}
