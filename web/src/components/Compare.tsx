/**
 * 比較頁。規格 §5.2 ③:最多五檔,走勢標準化為起點 100,下方接指標對照表。
 *
 * 那張對照表不只是補充 —— 調色盤驗證器要求的 "relief"(可見標籤或表格)
 * 就是它。圖上有一條線的對比度低於 3:1,靠表格提供可讀的數值佐證。
 */
import { useEffect, useMemo, useState } from 'react'
import { loadData, loadDetail } from '../data/loader'
import { MAX_COMPARE } from '../lib/compare'
import { formatNumber, formatPercent } from '../lib/format'
import { saveCompareBasket } from '../lib/personalLists'
import { hashFor } from '../lib/route'
import { PERIOD_LABELS, type EtfDetail, type EtfRow, type PeriodCode } from '../types'
import { CompareChart } from './CompareChart'
import { MetricInfo } from './MetricInfo'
import { PageShell } from './PageShell'
import { PageLoading } from './LoadingSkeleton'

const SHOWN_PERIODS: PeriodCode[] = ['M3', 'YTD', 'Y1', 'Y3', 'Y5', 'Y10']

interface Props {
  codes: string[]
}

export function Compare({ codes }: Props) {
  const [selectedCodes, setSelectedCodes] = useState(codes)
  const [items, setItems] = useState<EtfDetail[] | null>(null)
  const [failed, setFailed] = useState<string[]>([])
  const [catalog, setCatalog] = useState<EtfRow[] | null>(null)
  const [catalogError, setCatalogError] = useState(false)
  const [query, setQuery] = useState('')
  const [builderStatus, setBuilderStatus] = useState('')
  const codesKey = codes.join(',')

  useEffect(() => {
    setSelectedCodes(codes)
  }, [codesKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true
    void loadData().then((result) => {
      if (!live) return
      if (result.ok) setCatalog(result.rankings.etfs)
      else setCatalogError(true)
    })
    return () => { live = false }
  }, [])

  useEffect(() => {
    let live = true
    setItems(null)
    void Promise.all(selectedCodes.map((c) => loadDetail(c))).then((results) => {
      if (!live) return
      const ok: EtfDetail[] = []
      const bad: string[] = []
      results.forEach((r, i) => (r.ok ? ok.push(r.detail) : bad.push(selectedCodes[i]!)))
      setItems(ok)
      setFailed(bad)
    })
    return () => { live = false }
  }, [selectedCodes])

  const candidates = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-Hant')
    if (!needle || !catalog) return []
    return catalog
      .filter((row) => !selectedCodes.includes(row.code))
      .filter((row) => row.code.toLowerCase().includes(needle)
        || row.name.toLocaleLowerCase('zh-Hant').includes(needle))
      .slice(0, 6)
  }, [catalog, query, selectedCodes])

  function updateSelection(next: string[], message: string) {
    setSelectedCodes(next)
    saveCompareBasket(next)
    setBuilderStatus(message)
    window.location.hash = hashFor({ name: 'compare', codes: next })
  }

  function addCode(code: string) {
    if (selectedCodes.length >= MAX_COMPARE) {
      setBuilderStatus(`最多比較 ${MAX_COMPARE} 檔，請先移除一檔。`)
      return
    }
    updateSelection([...selectedCodes, code], `已加入 ${code}`)
    setQuery('')
  }

  function removeCode(code: string) {
    if (selectedCodes.length <= 1) {
      setBuilderStatus('比較頁至少保留一檔；若要重新選擇，可先回排行榜。')
      return
    }
    updateSelection(selectedCodes.filter((item) => item !== code), `已移除 ${code}`)
  }

  function moveCode(index: number, offset: -1 | 1) {
    const target = index + offset
    if (target < 0 || target >= selectedCodes.length) return
    const next = [...selectedCodes]
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    updateSelection(next, `已調整 ${selectedCodes[index]} 的順序`)
  }

  if (items === null) return <PageLoading />

  return (
    <PageShell
      eyebrow="ETF COMPARISON"
      title={`比較 ${items.length} 檔`}
      description="把走勢標準化到共同起點，再並排比較報酬與風險，避免只看價格高低。"
      backHref={hashFor({ name: 'rankings' })}
      meta={items.length > 0 && (
        <div className="compare-chips">
          {items.map((d) => <span key={d.code}>{d.code} · {d.name}</span>)}
        </div>
      )}
    >
      <section className="content-panel compare-builder" aria-labelledby="compare-builder-title">
        <div className="panel-heading compare-builder__heading">
          <div>
            <p className="eyebrow">BUILD YOUR COMPARISON</p>
            <h2 id="compare-builder-title">調整比較清單</h2>
          </div>
          <span>{selectedCodes.length} / {MAX_COMPARE} 檔</span>
        </div>

        <div className="compare-builder__layout">
          <div className="compare-builder__search">
            <label htmlFor="compare-search">搜尋並加入 ETF</label>
            <div className="compare-searchbox">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input id="compare-search" type="search" value={query}
                     placeholder="輸入代號或名稱"
                     aria-describedby="compare-search-hint"
                     onChange={(event) => {
                       setQuery(event.target.value)
                       setBuilderStatus('')
                     }} />
            </div>
            <p id="compare-search-hint" className="compare-builder__hint">
              {selectedCodes.length >= MAX_COMPARE
                ? '已達五檔上限，移除一檔後即可新增。'
                : '輸入關鍵字，從市場 ETF 清單中新增。'}
            </p>

            {query.trim() && (
              <div className="compare-results" aria-label="ETF 搜尋結果">
                {catalog === null && !catalogError && <p>正在載入 ETF 清單…</p>}
                {catalogError && <p>目前無法載入 ETF 清單，仍可查看既有比較。</p>}
                {catalog !== null && candidates.length === 0 && (
                  <p>找不到尚未加入且符合「{query.trim()}」的 ETF。</p>
                )}
                {candidates.map((row) => (
                  <button key={row.code} type="button"
                          disabled={selectedCodes.length >= MAX_COMPARE}
                          onClick={() => addCode(row.code)}>
                    <span><strong>{row.code}</strong>{row.name}</span>
                    <small>{row.category ?? '未分類'} · {row.region ?? '地區未分類'}</small>
                    <b aria-hidden="true">＋</b>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="compare-builder__selection">
            <p className="compare-builder__label">目前順序</p>
            <ol>
              {selectedCodes.map((code, index) => {
                const item = items?.find((detail) => detail.code === code)
                const row = catalog?.find((candidate) => candidate.code === code)
                return (
                  <li key={code}>
                    <i className={`compare-swatch compare-swatch--s${index}`} aria-hidden="true" />
                    <span><strong>{code}</strong><small>{item?.name ?? row?.name ?? '載入中'}</small></span>
                    <div className="compare-builder__actions">
                      <button type="button" aria-label={`將 ${code} 向左移`}
                              disabled={index === 0}
                              onClick={() => moveCode(index, -1)}>←</button>
                      <button type="button" aria-label={`將 ${code} 向右移`}
                              disabled={index === selectedCodes.length - 1}
                              onClick={() => moveCode(index, 1)}>→</button>
                      <button type="button" className="compare-builder__remove"
                              aria-label={`移除 ${code}`}
                              onClick={() => removeCode(code)}>移除</button>
                    </div>
                  </li>
                )
              })}
            </ol>
            <p className="compare-builder__hint">此順序會同步套用到曲線顏色與下方指標欄位。</p>
          </div>
        </div>
        <p className="compare-builder__status" role="status" aria-live="polite">
          {builderStatus}
        </p>
      </section>

      {failed.length > 0 && (
        <p className="detail__caveat" role="note">
          找不到 {failed.join('、')} 的資料,已自比較中略過。
        </p>
      )}

      {items.length === 0 ? (
        <p role="alert" className="error">選取的標的都沒有資料。</p>
      ) : (
        <>
          <section className="content-panel content-panel--chart">
            <div className="panel-heading">
              <div><p className="eyebrow">NORMALIZED GROWTH</p><h2>共同區間走勢</h2></div>
              <span>共同起點 = 100</span>
            </div>
            <CompareChart items={items.map((d) => ({
              code: d.code, name: d.name, series: d.series,
            }))} />
          </section>

          <section className="content-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">SIDE BY SIDE</p><h2>指標對照</h2></div>
            </div>
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
    </PageShell>
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
