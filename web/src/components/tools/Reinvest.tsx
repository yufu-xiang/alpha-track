/** 股息再投入試算。規格 §7.2,使用實際配息資料。 */
import { useEffect, useState } from 'react'
import { loadData, loadDetail } from '../../data/loader'
import { compareReinvestment, type DividendEvent, type PricePoint } from '../../lib/dividend'
import { formatMoney, formatNumber, formatPercent } from '../../lib/format'
import type { EtfRow } from '../../types'
import { Num, Stat, ToolPage } from './shared'

export function Reinvest() {
  const [code, setCode] = useState('0056')
  const [initial, setInitial] = useState(1_000_000)
  const [rows, setRows] = useState<EtfRow[]>([])
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<
    { name: string; prices: PricePoint[]; dividends: DividendEvent[] } | null
  >(null)

  useEffect(() => {
    void loadData().then((r) => { if (r.ok) setRows(r.rankings.etfs) })
  }, [])

  useEffect(() => {
    if (!code) return
    setLoading(true)
    void loadDetail(code).then((r) => {
      setLoading(false)
      if (!r.ok || !r.detail.series.start) { setData(null); return }
      const base = Date.parse(`${r.detail.series.start}T00:00:00Z`)
      setData({
        name: r.detail.name,
        // 未還原收盤價。用 adj 會把配息算兩次,見 lib/dividend.ts。
        prices: r.detail.series.days.map((d, i) => ({
          date: new Date(base + d * 86_400_000).toISOString().slice(0, 10),
          close: r.detail.series.close[i]!,
        })),
        dividends: r.detail.dividends.map((d) => ({
          ex_date: d.ex_date, amount: d.amount,
        })),
      })
    })
  }, [code])

  // 配息紀錄的涵蓋期間通常比價格短(0056 的價格自 2008 年、配息只到 2015 年)。
  // 直接用整段價格會把早年的配息當成沒發生過,期末金額因此系統性低估,
  // 而畫面上「涵蓋 2008 年起」又正好在暗示相反的事。
  // 因此把試算區間收斂到**配息資料真正涵蓋得到**的範圍,並說明原因。
  const firstDiv = data && data.dividends.length > 0
    ? data.dividends.reduce((m, d) => (d.ex_date < m ? d.ex_date : m), data.dividends[0]!.ex_date)
    : null
  const priceStart = data?.prices[0]?.date ?? null
  const truncated = firstDiv !== null && priceStart !== null && firstDiv > priceStart
  const prices = data
    ? (truncated ? data.prices.filter((p) => p.date >= firstDiv!) : data.prices)
    : []

  const result = data ? compareReinvestment(prices, data.dividends, initial) : null
  const gap = result && result.cashOut > 0 ? result.reinvested / result.cashOut - 1 : null

  return (
    <ToolPage title="股息再投入試算">
      <p className="tool-mode">
        實據模式:採用 {data?.name || code} 的<strong>真實配息紀錄</strong>與
        未還原收盤價。
      </p>

      <div className="tool-form">
        <label>標的
          <input value={code} list="ri-codes"
                 onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </label>
        <Num label="起始投入" value={initial} step={100_000} onChange={setInitial} />
      </div>
      <datalist id="ri-codes">
        {rows.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
      </datalist>

      {truncated && (
        <p role="alert" className="portfolio__remind">
          {code} 的價格資料自 {priceStart} 起,但配息紀錄只回溯到 {firstDiv}。
          若從 {priceStart} 起算,{priceStart!.slice(0, 4)}–{firstDiv!.slice(0, 4)} 年間的配息
          會被當成沒發生過,期末金額將系統性低估。
          <strong>因此以下從 {firstDiv} 起算</strong>,而不是從最早的價格起算。
        </p>
      )}

      {loading ? <p className="chart-empty">載入中…</p>
        : !result ? <p className="chart-empty">找不到 {code} 的價格資料。</p>
        : result.events === 0 ? (
          <p className="chart-empty">
            {code} 在資料涵蓋的期間內沒有配息紀錄,兩種做法沒有差別。
            {result.skipped > 0 && `(有 ${result.skipped} 筆配息落在持有期間之外。)`}
          </p>
        ) : (
          <>
            <dl className="cards">
              <Stat label="配息再投入期末" value={formatMoney(result.reinvested)} />
              <Stat label="配息領現金期末" value={formatMoney(result.cashOut)} />
              <Stat label="差異" value={gap === null ? '—' : formatPercent(gap)} />
              <Stat label="累積領到的配息" value={formatMoney(result.totalDividends)} />
              <Stat label="股數變化"
                    value={`${formatNumber(result.initialShares, 0)} → ${
                      formatNumber(result.finalShares, 0)}`} />
            </dl>
            <p className="tool-note">
              涵蓋 {prices[0]!.date} 至 {prices[prices.length - 1]!.date},
              共 {result.events} 次配息。
              {result.skipped > 0 && ` 另有 ${result.skipped} 筆配息落在這段期間之外,未納入。`}
            </p>
          </>
        )}

      <p className="tool-note">
        「配息領現金」假設現金<strong>就放著不動</strong>,不投入任何其他標的、
        也不計利息。真實情況多半不是這樣 —— 這條線是對照組,不是一個選項。
        再投入以除息日當日收盤價買進,不計手續費、匯費與零股限制;
        這些在長期尺度上是雜訊,但短期或小額時比例並不低。
      </p>
      <p className="tool-note">
        本頁用的是<strong>未還原</strong>收盤價。站上其他走勢圖用的是還原價 ——
        還原價本身就已假設配息再投入,拿它來做這個比較會把配息算兩次,
        兩條線會完全重疊。
      </p>
    </ToolPage>
  )
}
