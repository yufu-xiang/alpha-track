/**
 * ETF 成分股重疊度。規格 §7.2。
 *
 * 這一頁最重要的不是矩陣,是**資料範圍的說明**:公會的月報每檔只公布
 * 前十大,0050 的前十大合計 80.4%、高股息型更低。把「前十大重疊 30%」
 * 讀成「這兩檔有三成一樣」是錯的,而那個誤讀完全看不出來 ——
 * 所以涵蓋率與資料月份必須和數字擺在一起,不是放在頁尾的小字。
 */
import { useEffect, useMemo, useState } from 'react'
import { loadData, loadDetail } from '../../data/loader'
import { MAX_COMPARE } from '../../lib/compare'
import { formatNumber, formatPercent } from '../../lib/format'
import { describeOverlap, overlap } from '../../lib/overlap'
import type { EtfRow, Holdings } from '../../types'
import { ToolPage } from './shared'

const pct = (v: number) => formatPercent(v, 1).replace('+', '')

export function Overlap() {
  const [rows, setRows] = useState<EtfRow[]>([])
  const [codes, setCodes] = useState<string[]>(['0050', '006208', '0056'])
  const [draft, setDraft] = useState('')
  const [data, setData] = useState<Map<string, { name: string; h: Holdings }>>(new Map())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void loadData().then((r) => { if (r.ok) setRows(r.rankings.etfs) })
  }, [])

  useEffect(() => {
    if (codes.length === 0) { setData(new Map()); return }
    setLoading(true)
    let cancelled = false
    void Promise.all(codes.map((c) => loadDetail(c))).then((results) => {
      if (cancelled) return
      setLoading(false)
      const next = new Map<string, { name: string; h: Holdings }>()
      results.forEach((r, i) => {
        if (!r.ok) return
        next.set(codes[i]!, {
          name: r.detail.name,
          h: r.detail.holdings ?? { year_month: null, items: [] },
        })
      })
      setData(next)
    })
    return () => { cancelled = true }
  }, [codes.join(',')])

  const present = codes.filter((c) => data.get(c)?.h.items.length)
  const missing = codes.filter((c) => data.has(c) && !data.get(c)!.h.items.length)

  const months = useMemo(
    () => [...new Set(present.map((c) => data.get(c)!.h.year_month).filter(Boolean))],
    [present, data],
  )

  const highest = useMemo(() => {
    let best: { a: string; b: string; w: number; cov: number } | null = null
    for (const a of present) {
      for (const b of present) {
        if (a >= b) continue
        const r = overlap(data.get(a)!.h, data.get(b)!.h)
        if (r.weight === null) continue
        const cov = Math.min(r.coverageA, r.coverageB)
        if (!best || r.weight > best.w) best = { a, b, w: r.weight, cov }
      }
    }
    return best
  }, [present, data])

  function add() {
    const code = draft.trim().toUpperCase()
    if (!code || codes.includes(code) || codes.length >= MAX_COMPARE) return
    setCodes((c) => [...c, code])
    setDraft('')
  }

  return (
    <ToolPage title="ETF 成分股重疊度">
      <p role="alert" className="portfolio__remind">
        <strong>這是「前十大持股」之間的重疊,不是整體重疊。</strong>
        資料來自投信投顧公會的月報,每檔只公布前十大 ——
        0050 的前十大合計約八成,高股息型更低。
        因此「重疊 30%」的意思是「同時買這兩檔時,有三成的錢押在
        兩邊前十大共同的股票上」,不是「這兩檔有三成一樣」。
        前十大以外的部分,沒有人公開,本站也算不出來。
      </p>

      <div className="tool-form">
        <label>加入標的(最多 {MAX_COMPARE} 檔)
          <input value={draft} list="ov-codes" placeholder="例如 00878"
                 onChange={(e) => setDraft(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        </label>
        <button type="button" className="tool-add"
                disabled={codes.length >= MAX_COMPARE} onClick={add}>加入</button>
      </div>
      <datalist id="ov-codes">
        {rows.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
      </datalist>

      <div className="compare-bar">
        <span className="compare-bar__codes">
          {codes.length === 0 ? '尚未選擇標的' : codes.join('、')}
        </span>
        {codes.map((c) => (
          <button key={c} type="button" className="is-ghost"
                  onClick={() => setCodes((x) => x.filter((y) => y !== c))}>
            移除 {c}
          </button>
        ))}
      </div>

      {missing.length > 0 && (
        <p className="detail__caveat" role="note">
          查不到 {missing.join('、')} 的成分股。公會的基金名稱與證券代號
          之間沒有官方對照,目前 356 檔中對得上 183 檔 ——
          債券型與上櫃檔的名稱差距最大。
        </p>
      )}

      {loading ? <p className="chart-empty">載入中…</p>
        : present.length < 2 ? (
          <p className="chart-empty">至少要兩檔有成分股資料才比得出重疊度。</p>
        ) : (
          <>
            {highest && (
              <p className="tool-mode" role="status">
                最高的一組是 {highest.a} 與 {highest.b},前十大重疊
                {' '}{pct(highest.w)} —— {describeOverlap(highest.w, highest.cov)}。
              </p>
            )}

            <div className="table-wrap">
              <table>
                <caption className="tool-caption">
                  數字為<strong>共同質量</strong>:每一檔共同持股取兩邊權重的
                  較小值再相加。只數「共同持有幾檔」會誤導 ——
                  兩檔都持有台積電、一檔 60% 一檔 2%,資金重疊其實只有 2%。
                  {months.length > 0 && ` 資料月份:${months.join('、')}。`}
                </caption>
                <thead>
                  <tr>
                    <th></th>
                    {present.map((c) => <th key={c}>{c}</th>)}
                    <th>前十大合計</th>
                  </tr>
                </thead>
                <tbody>
                  {present.map((a) => {
                    const self = overlap(data.get(a)!.h, data.get(a)!.h)
                    return (
                      <tr key={a}>
                        <th scope="row">{a} {data.get(a)!.name}</th>
                        {present.map((b) => {
                          if (a === b) return <td key={b} className="corr-self">—</td>
                          const r = overlap(data.get(a)!.h, data.get(b)!.h)
                          return (
                            <td key={b}
                                className={r.weight !== null && r.weight >= 0.5
                                  ? 'corr-high' : undefined}>
                              {r.weight === null ? '—' : pct(r.weight)}
                            </td>
                          )
                        })}
                        {/* 涵蓋率與重疊度擺在同一列 —— 分開放的話,
                            使用者會拿一個沒有分母的數字下結論。 */}
                        <td className="corr-self">{pct(self.coverageA)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {highest && <SharedTable
              a={highest.a} b={highest.b}
              rows={overlap(data.get(highest.a)!.h, data.get(highest.b)!.h).shared}
              nameA={data.get(highest.a)!.name} nameB={data.get(highest.b)!.name} />}
          </>
        )}

      <p className="tool-note">
        成分股是<strong>月報</strong>,不是當日持股。季度換股之後,
        舊的成分股會與現況有落差 —— 表格上方標了資料月份。
        另外重疊度高不代表不該同時持有:兩檔都重押台積電是台股的結構性事實,
        本站不對此下判斷,只把數字算給你看。
      </p>
    </ToolPage>
  )
}

function SharedTable({ a, b, nameA, nameB, rows }: {
  a: string; b: string; nameA: string; nameB: string
  rows: { code: string; name: string; weightA: number; weightB: number }[]
}) {
  if (rows.length === 0) return null
  return (
    <>
      <h2>{a} 與 {b} 的共同持股</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>代號</th><th>名稱</th>
              <th>{a} {nameA}</th><th>{b} {nameB}</th><th>重疊貢獻</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td>{r.code}</td>
                <td>{r.name}</td>
                <td>{pct(r.weightA)}</td>
                <td>{pct(r.weightB)}</td>
                <td>{pct(Math.min(r.weightA, r.weightB))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
