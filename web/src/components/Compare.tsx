/**
 * 比較頁。規格 §5.2 ③:最多五檔,走勢標準化為起點 100,下方接指標對照表。
 *
 * 那張對照表不只是補充 —— 調色盤驗證器要求的 "relief"(可見標籤或表格)
 * 就是它。圖上有一條線的對比度低於 3:1,靠表格提供可讀的數值佐證。
 */
import { useEffect, useState } from 'react'
import { loadDetail } from '../data/loader'
import { formatNumber, formatPercent } from '../lib/format'
import { hashFor } from '../lib/route'
import { PERIOD_LABELS, type EtfDetail, type PeriodCode } from '../types'
import { CompareChart } from './CompareChart'
import { MetricInfo } from './MetricInfo'

const SHOWN_PERIODS: PeriodCode[] = ['M3', 'YTD', 'Y1', 'Y3', 'Y5', 'Y10']

interface Props {
  codes: string[]
}

export function Compare({ codes }: Props) {
  const [items, setItems] = useState<EtfDetail[] | null>(null)
  const [failed, setFailed] = useState<string[]>([])

  useEffect(() => {
    let live = true
    setItems(null)
    void Promise.all(codes.map((c) => loadDetail(c))).then((results) => {
      if (!live) return
      const ok: EtfDetail[] = []
      const bad: string[] = []
      results.forEach((r, i) => (r.ok ? ok.push(r.detail) : bad.push(codes[i]!)))
      setItems(ok)
      setFailed(bad)
    })
    return () => { live = false }
  }, [codes])

  if (items === null) return <main className="app"><p>載入中…</p></main>

  return (
    <main className="app detail">
      <p><a href={hashFor({ name: 'rankings' })}>← 回排行榜</a></p>
      <h1>比較 {items.length} 檔</h1>

      {failed.length > 0 && (
        <p className="detail__caveat" role="note">
          找不到 {failed.join('、')} 的資料,已自比較中略過。
        </p>
      )}

      {items.length === 0 ? (
        <p role="alert" className="error">選取的標的都沒有資料。</p>
      ) : (
        <>
          <CompareChart items={items.map((d) => ({
            code: d.code, name: d.name, series: d.series,
          }))} />

          <section>
            <h2>指標對照</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>指標</th>
                    {items.map((d) => <th key={d.code}>{d.code} {d.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {SHOWN_PERIODS.map((p) => (
                    <tr key={p}>
                      <td>{PERIOD_LABELS[p]}</td>
                      {items.map((d) => (
                        <td key={d.code}><Tone v={d.returns[p]} /></td>
                      ))}
                    </tr>
                  ))}
                  <MetricRow label="年化波動" term="volatility" items={items}
                             pick={(d) => d.risk.volatility} />
                  <MetricRow label="最大回撤" term="mdd" items={items}
                             pick={(d) => d.risk.mdd} />
                  <MetricRow label="夏普值" term="sharpe" items={items}
                             pick={(d) => d.risk.sharpe} asNumber />
                  <MetricRow label="貝他值" term="beta" items={items}
                             pick={(d) => d.risk.beta} asNumber />
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

function MetricRow({ label, term, items, pick, asNumber = false }: {
  label: string
  term: string
  items: EtfDetail[]
  pick: (d: EtfDetail) => number | null
  asNumber?: boolean
}) {
  return (
    <tr>
      <td>{label} <MetricInfo termId={term} /></td>
      {items.map((d) => (
        <td key={d.code}>
          {asNumber ? formatNumber(pick(d), 2) : formatPercent(pick(d))}
        </td>
      ))}
    </tr>
  )
}

function Tone({ v }: { v: number | null }) {
  const tone = v === null || v === 0 ? '' : v > 0 ? 'gain' : 'loss'
  return <span className={tone}>{formatPercent(v)}</span>
}
