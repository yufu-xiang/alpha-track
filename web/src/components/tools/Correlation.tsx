/**
 * 報酬相關性矩陣。
 *
 * 這是規格 §7.2「ETF 成分股重疊度分析」的**替代**,不是等價實作 ——
 * 成分股明細沒有任何公開的統一來源(見 docs/data-sources.md 的勘查紀錄)。
 * 差別必須寫在畫面上,不能讓使用者以為看到的是持股重疊。
 */
import { useEffect, useMemo, useState } from 'react'
import { loadData, loadDetail } from '../../data/loader'
import {
  correlationMatrix, describeCorrelation, MIN_SAMPLE,
} from '../../lib/correlation'
import { formatNumber } from '../../lib/format'
import { MAX_COMPARE } from '../../lib/compare'
import type { EtfRow, Series } from '../../types'
import { ToolPage } from './shared'

const RANGES = [
  { label: '近一年', days: 365 },
  { label: '近三年', days: 365 * 3 },
  { label: '全部重疊期間', days: null as number | null },
]

export function Correlation() {
  const [rows, setRows] = useState<EtfRow[]>([])
  const [codes, setCodes] = useState<string[]>(['0050', '006208', '0056'])
  const [draft, setDraft] = useState('')
  const [rangeIdx, setRangeIdx] = useState(0)
  const [series, setSeries] = useState<Map<string, Series>>(new Map())
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void loadData().then((r) => { if (r.ok) setRows(r.rankings.etfs) })
  }, [])

  useEffect(() => {
    if (codes.length === 0) { setSeries(new Map()); return }
    setLoading(true)
    let cancelled = false
    void Promise.all(codes.map((c) => loadDetail(c))).then((results) => {
      if (cancelled) return
      setLoading(false)
      const s = new Map<string, Series>()
      const n = new Map<string, string>()
      results.forEach((r, i) => {
        if (!r.ok) return
        s.set(codes[i]!, r.detail.series)
        n.set(codes[i]!, r.detail.name)
      })
      setSeries(s)
      setNames(n)
    })
    return () => { cancelled = true }
  }, [codes.join(',')])

  const matrix = useMemo(
    () => correlationMatrix(series, RANGES[rangeIdx]!.days),
    [series, rangeIdx],
  )
  const present = codes.filter((c) => series.has(c))

  // 最高的那一組(排除對角線)。使用者真正要的答案就是這一句。
  const highest = useMemo(() => {
    let best: { a: string; b: string; r: number } | null = null
    for (const a of present) {
      for (const b of present) {
        if (a >= b) continue
        const v = matrix.get(a)?.get(b)?.value
        if (v === null || v === undefined) continue
        if (!best || v > best.r) best = { a, b, r: v }
      }
    }
    return best
  }, [matrix, present])

  function add() {
    const code = draft.trim().toUpperCase()
    if (!code || codes.includes(code) || codes.length >= MAX_COMPARE) return
    setCodes((c) => [...c, code])
    setDraft('')
  }

  return (
    <ToolPage title="ETF 報酬相關性">
      <p role="alert" className="portfolio__remind">
        <strong>這不是成分股重疊度。</strong>
        ETF 的持股明細由各投信自行公告,沒有任何公開的統一來源,
        指數編製公司的成分股則是付費商品 —— 因此本站無法比對持股。
        這裡比的是<strong>報酬走勢</strong>:兩檔一起漲一起跌的程度。
        它看不出「我是不是重複持有同一檔股票」,但看得出「一起買能不能分散風險」。
      </p>

      <div className="tool-form">
        <label>加入標的(最多 {MAX_COMPARE} 檔)
          <input value={draft} list="corr-codes" placeholder="例如 00878"
                 onChange={(e) => setDraft(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        </label>
        <button type="button" className="tool-add"
                disabled={codes.length >= MAX_COMPARE} onClick={add}>加入</button>
      </div>
      <datalist id="corr-codes">
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

      <div className="chart__ranges" role="toolbar" aria-label="選擇計算區間">
        {RANGES.map((r, i) => (
          <button key={r.label} type="button" aria-pressed={i === rangeIdx}
                  onClick={() => setRangeIdx(i)}>{r.label}</button>
        ))}
      </div>

      {loading ? <p className="chart-empty">載入中…</p>
        : present.length < 2 ? (
          <p className="chart-empty">
            至少要兩檔才比得出相關性。
            {codes.length > present.length &&
              `(找不到 ${codes.filter((c) => !series.has(c)).join('、')} 的資料。)`}
          </p>
        ) : (
          <>
            {highest && (
              <p className="tool-mode" role="status">
                最高的一組是 {highest.a} 與 {highest.b},相關係數
                {' '}{formatNumber(highest.r)} —— {describeCorrelation(highest.r)}。
              </p>
            )}

            <div className="table-wrap">
              <table>
                <caption className="tool-caption">
                  以<strong>共同交易日</strong>的日報酬計算。兩檔的交易日不必相同,
                  取交集即可 —— 不做內插補值,補出來的價格會產生市場沒發生過的報酬,
                  而那個假報酬與另一檔的真實報酬相關,結果會系統性偏高。
                </caption>
                <thead>
                  <tr>
                    <th></th>
                    {present.map((c) => <th key={c}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {present.map((a) => (
                    <tr key={a}>
                      <th scope="row">{a} {names.get(a) ?? ''}</th>
                      {present.map((b) => {
                        const cell = matrix.get(a)?.get(b)
                        return (
                          <td key={b} className={cellClass(cell?.value ?? null, a === b)}>
                            {cell?.value === null || cell?.value === undefined
                              ? '—'
                              : formatNumber(cell.value)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="tool-note">
              樣本不足 {MIN_SAMPLE} 個共同交易日的組合顯示為「—」,不顯示一個數字 ——
              十幾天的相關係數幾乎只是雜訊。
              新掛牌的 ETF 與老標的比較時,重疊期間就是新的那一檔的全部歷史。
            </p>
          </>
        )}

      <p className="tool-note">
        相關性是<strong>回頭看</strong>的統計量,而且會隨市況改變:
        平時關聯不高的兩檔,在崩盤時往往一起跌 —— 而那正是你最需要分散的時候。
        區間換一段,數字就會不一樣,可以切上面的按鈕看看差多少。
      </p>
    </ToolPage>
  )
}

/** 高相關才上色,而且用警告色不用漲跌色 —— 這裡的「高」不是「漲」。 */
function cellClass(value: number | null, diagonal: boolean): string | undefined {
  if (diagonal) return 'corr-self'
  if (value === null) return undefined
  return value >= 0.9 ? 'corr-high' : undefined
}
