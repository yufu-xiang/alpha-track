/** 單筆 vs 定期定額試算。規格 §7.2,支援真實 ETF 歷史回測。 */
import { useEffect, useState } from 'react'
import { loadData, loadDetail } from '../../data/loader'
import { formatMoney, formatNumber, formatPercent } from '../../lib/format'
import { lumpVsDca } from '../../lib/invest'
import type { EtfRow } from '../../types'
import { Num, Stat, ToolPage } from './shared'

const RANGES = [
  { label: '近三年', months: 36 },
  { label: '近五年', months: 60 },
  { label: '全部', months: null as number | null },
]

export function Dca() {
  const [code, setCode] = useState('0050')
  const [total, setTotal] = useState(1_200_000)
  const [prices, setPrices] = useState<number[] | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [range, setRange] = useState(0)
  const [rows, setRows] = useState<EtfRow[]>([])

  useEffect(() => {
    void loadData().then((r) => { if (r.ok) setRows(r.rankings.etfs) })
  }, [])

  useEffect(() => {
    if (!code) return
    setLoading(true)
    void loadDetail(code).then((r) => {
      setLoading(false)
      if (!r.ok || !r.detail.series.start) { setPrices(null); return }
      setName(r.detail.name)
      // 取每月最後一筆當扣款價 —— 實際扣款一個月一次,用日資料模擬
      // 會變成「每天都扣」,那是完全不同的策略,結果也完全不同。
      const base = Date.parse(`${r.detail.series.start}T00:00:00Z`)
      const byMonth = new Map<string, number>()
      r.detail.series.days.forEach((d, i) => {
        const iso = new Date(base + d * 86_400_000).toISOString().slice(0, 7)
        byMonth.set(iso, r.detail.series.adj[i]!)
      })
      setPrices([...byMonth.values()])
    })
  }, [code])

  const months = RANGES[range]!.months
  const sliced = prices && months ? prices.slice(-months) : prices
  const result = sliced && sliced.length >= 2 ? lumpVsDca(sliced, total) : null

  return (
    <ToolPage title="單筆 vs 定期定額">
      <p className="tool-mode">
        實據模式:採用 {name || code} 的真實歷史月收盤(還原價,已含息)。
      </p>

      <div className="tool-form">
        <label>標的
          <input value={code} list="dca-codes"
                 onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </label>
        <Num label="總投入金額" value={total} step={100_000} onChange={setTotal} />
      </div>
      <datalist id="dca-codes">
        {rows.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
      </datalist>

      <div className="chart__ranges" role="toolbar" aria-label="選擇回測區間">
        {RANGES.map((r, i) => (
          <button key={r.label} type="button" aria-pressed={i === range}
                  onClick={() => setRange(i)}>{r.label}</button>
        ))}
      </div>

      {loading ? <p className="chart-empty">載入中…</p>
        : !result ? <p className="chart-empty">找不到 {code} 在這個區間的資料。</p>
        : (
          <>
            <dl className="cards">
              <Stat label="單筆投入期末" value={formatMoney(result.lumpSum)} />
              <Stat label="定期定額期末" value={formatMoney(result.dca)} />
              <Stat label="定期定額平均成本" value={formatNumber(result.dcaAvgCost)} />
              <Stat label="單筆相對定期定額"
                    value={formatPercent(result.lumpSum / result.dca - 1)} />
            </dl>
            <p className="tool-note">
              回測 {sliced!.length} 個月,每月投入 {formatMoney(total / sliced!.length)}。
            </p>
          </>
        )}

      <p className="tool-note">
        每月投入相同金額,故價格低時買到較多股數。
        <strong>過去的結果不保證未來</strong> —— 一段上漲的歷史必然讓單筆勝出,
        換一段起跌的歷史結論就反過來。這個工具能回答的是「那段期間會怎樣」,
        不是「以後會怎樣」。試著切換區間看看結論翻不翻。
      </p>
    </ToolPage>
  )
}
