/**
 * 未記錄的股票分割警示。
 *
 * 這是「我的組合」裡最容易無聲出錯的一項:0050 在 2025-06-11 做過 1:4 分割,
 * 分割前買進的紀錄若沒補上分割,持股數會停在舊值 —— 那一檔的市值少算四分之三,
 * 而畫面上不會有任何異常。錯得完全看不出來,所以必須主動抓出來講。
 */
import { useEffect, useMemo, useState } from 'react'
import { loadDetail } from '../data/loader'
import { formatDate, formatNumber } from '../lib/format'
import type { Transaction } from '../lib/portfolio'
import { detectSplits, type SplitHint } from '../lib/splitDetect'

interface Props {
  transactions: Transaction[]
  onAdd: (tx: Transaction) => void
}

export function SplitNotice({ transactions, onAdd }: Props) {
  const [priceIndex, setPriceIndex] = useState<Map<string, Map<string, number>> | null>(null)

  const codes = useMemo(
    () => [...new Set(transactions
      .filter((t) => t.type === 'buy' || t.type === 'sell')
      .map((t) => t.code))],
    [transactions],
  )

  useEffect(() => {
    if (codes.length === 0) { setPriceIndex(new Map()); return }
    let cancelled = false
    void Promise.all(codes.map((c) => loadDetail(c))).then((results) => {
      if (cancelled) return
      const idx = new Map<string, Map<string, number>>()
      results.forEach((r, i) => {
        // series 與其欄位都不保證存在:使用者可能快取著舊版的 etf/*.json。
        // 少一檔的分割偵測是小事,整個組合頁崩掉不是。
        const series = r.ok ? r.detail.series : null
        if (!series?.start || !Array.isArray(series.days)) return
        const base = Date.parse(`${series.start}T00:00:00Z`)
        const m = new Map<string, number>()
        series.days.forEach((d, j) => {
          const px = series.close?.[j] ?? series.adj?.[j]
          if (px === undefined) return
          m.set(new Date(base + d * 86_400_000).toISOString().slice(0, 10), px)
        })
        idx.set(codes[i]!, m)
      })
      setPriceIndex(idx)
    })
    return () => { cancelled = true }
  }, [codes.join(',')])

  const hints = useMemo(() => {
    if (priceIndex === null) return []
    return detectSplits(transactions, (code, date) => {
      const m = priceIndex.get(code)
      if (!m) return null
      // 當天可能不是交易日(補登、或記成假日)。往前找最多七天,
      // 找不到就放棄 —— 硬拿一個月前的價格來比,比值毫無意義。
      let t = Date.parse(`${date}T00:00:00Z`)
      for (let i = 0; i <= 7; i += 1) {
        const v = m.get(new Date(t).toISOString().slice(0, 10))
        if (v !== undefined) return v
        t -= 86_400_000
      }
      return null
    })
  }, [transactions, priceIndex])

  if (hints.length === 0) return null

  function add(h: SplitHint) {
    onAdd({
      id: `split-${h.code}-${h.suggestedDate}`,
      type: 'split',
      code: h.code,
      date: h.suggestedDate,
      shares: 0,
      price: h.ratio,
      fee: 0,
      tax: 0,
    })
  }

  return (
    <div role="alert" className="portfolio__remind">
      <p>
        <strong>偵測到可能未記錄的股票分割。</strong>
        沒補上的話,分割前買進的持股數會停在舊值 ——
        那一檔的市值與 XIRR 都會錯,而畫面上不會有任何異常。
      </p>
      <ul>
        {hints.map((h) => (
          <li key={h.code}>
            {h.code}:你在 {formatDate(h.lastMismatch)} 記錄的價格是
            {' '}{formatNumber(h.recordedPrice)},本站同日的價格是
            {' '}{formatNumber(h.seriesPrice)},相差{' '}
            {h.ratio >= 1
              ? `${formatNumber(h.ratio, 0)} 倍,推測做過 1:${formatNumber(h.ratio, 0)} 分割`
              : `${formatNumber(1 / h.ratio, 0)} 分之一,推測做過 ${formatNumber(1 / h.ratio, 0)}:1 反分割`}。
            {' '}
            <button type="button" onClick={() => add(h)}>
              補一筆({formatDate(h.suggestedDate)})
            </button>
          </li>
        ))}
      </ul>
      <p className="tool-note">
        建議日期是最晚一筆尺度不符的交易的隔天 —— 分割必定發生在那之後,
        也必定在下一筆尺度相符的交易之前。知道確切日期的話,
        補完後可以在交易紀錄裡刪掉重記。
      </p>
    </div>
  )
}
