/**
 * 應領配息推估。規格 §6.4。
 *
 * 規格對這一節的要求不只是「算出來」,而是**標記為推估值**並提供編輯:
 * 實際入帳會扣匯費與二代健保補充保費,金額與對帳單不符。
 * 因此這裡把毛額、預估扣繳、預估實收三個數字並列 ——
 * 只給一個淨額的話,使用者無從判斷差額是不是合理。
 */
import { useEffect, useMemo, useState } from 'react'
import { loadDetail } from '../data/loader'
import {
  estimateDividends, NHI_PREMIUM_RATE, NHI_SINGLE_PAYMENT_THRESHOLD,
  toTransaction, type DividendEstimate, type DividendEvent,
} from '../lib/dividendEstimate'
import { formatDate, formatMoney, formatNumber } from '../lib/format'
import type { Transaction } from '../lib/portfolio'

interface Props {
  transactions: Transaction[]
  onRecord: (tx: Transaction) => void
}

export function DividendEstimates({ transactions, onRecord }: Props) {
  const [events, setEvents] = useState<DividendEvent[] | null>(null)
  const [actual, setActual] = useState<Record<string, string>>({})

  // 曾經持有過的代號都要查,不只是現在還持有的 —— 早就賣掉的標的
  // 在持有期間一樣領過息,漏掉會讓歷史對不上。
  const codes = useMemo(
    () => [...new Set(transactions.filter((t) => t.type !== 'dividend').map((t) => t.code))],
    [transactions],
  )

  useEffect(() => {
    if (codes.length === 0) { setEvents([]); return }
    let cancelled = false
    void Promise.all(codes.map((c) => loadDetail(c))).then((results) => {
      if (cancelled) return
      const all: DividendEvent[] = []
      results.forEach((r, i) => {
        // dividends 不保證是陣列:使用者的瀏覽器可能快取著舊版的
        // etf/*.json,或那一檔根本沒有配息欄位。少一檔的配息推估是小事,
        // 整個組合頁因為一次 for...of 而崩掉不是。
        if (!r.ok || !Array.isArray(r.detail.dividends)) return
        for (const d of r.detail.dividends) {
          all.push({ code: codes[i]!, ex_date: d.ex_date, pay_date: d.pay_date, amount: d.amount })
        }
      })
      setEvents(all)
    })
    return () => { cancelled = true }
  }, [codes.join(',')])

  const estimates = useMemo(
    () => (events === null ? [] : estimateDividends(transactions, events)),
    [transactions, events],
  )

  function record(est: DividendEstimate) {
    const key = `${est.code}@${est.ex_date}`
    const raw = actual[key]?.trim()
    const parsed = raw ? Number(raw) : NaN
    onRecord(toTransaction(
      est,
      Number.isFinite(parsed) ? parsed : null,
      `${key}-${Date.now()}`,
    ))
    setActual((a) => { const next = { ...a }; delete next[key]; return next })
  }

  if (events === null) return <p className="chart-empty">查詢配息紀錄中…</p>

  if (estimates.length === 0) {
    return (
      <p className="detail__caveat">
        {transactions.length === 0
          ? '先記錄買進交易,這裡才推估得出應領配息。'
          : '沒有尚未記錄的配息 —— 持有期間內的除息日都已經記過了。'}
      </p>
    )
  }

  return (
    <>
      <p className="detail__caveat" role="note">
        以下是<strong>推估值,不是實際入帳金額</strong>。依除息日當天的持股
        與公告配息計算,並扣除預估的二代健保補充保費。
        確認對帳單之後,把實收金額填進去再記錄,就會轉為確定值。
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>除息日</th><th>發放日</th><th>代號</th>
              <th>股數</th><th>每股</th><th>應領(毛額)</th>
              <th>預估補充保費</th><th>預估實收</th>
              <th>實收金額(可留空)</th><th></th>
            </tr>
          </thead>
          <tbody>
            {estimates.map((e) => {
              const key = `${e.code}@${e.ex_date}`
              return (
                <tr key={key}>
                  <td>{formatDate(e.ex_date)}</td>
                  <td>{formatDate(e.pay_date)}</td>
                  <td>{e.code}</td>
                  <td>{formatMoney(e.shares)}</td>
                  <td>{formatNumber(e.amountPerShare, 3)}</td>
                  <td>{formatMoney(e.gross)}</td>
                  <td>{e.nhiPremium === 0 ? '—' : formatMoney(e.nhiPremium, 2)}</td>
                  <td>{formatMoney(e.net, 2)}</td>
                  <td>
                    <input type="number" step="0.01" min="0"
                           aria-label={`${e.code} ${e.ex_date} 的實收金額`}
                           value={actual[key] ?? ''}
                           onChange={(ev) =>
                             setActual((a) => ({ ...a, [key]: ev.target.value }))} />
                  </td>
                  <td>
                    <button type="button" onClick={() => record(e)}>記錄</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="tool-note">
        補充保費以現行規定推估:費率 {(NHI_PREMIUM_RATE * 100).toFixed(2)}%,
        <strong>單次給付</strong>達 {formatMoney(NHI_SINGLE_PAYMENT_THRESHOLD)} 元才扣。
        以下三項<strong>未模擬</strong>,是推估與對帳單會有落差的主要原因:
      </p>
      <ul className="tool-note">
        <li>匯費(各券商與股務代理不同,通常十元上下)。</li>
        <li>
          同一標的同年度分次配息,健保署可能<strong>合併計算</strong>是否達門檻。
          月配型 ETF 每次金額小、全年加總大,受這一點影響最深。
        </li>
        <li>零股與盤中零股的股數認定、以及除息日前後的交割日差異。</li>
      </ul>
    </>
  )
}
