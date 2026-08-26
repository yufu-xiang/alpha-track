/**
 * 我的組合。規格 §6.6。
 *
 * 上方總覽數字、中段資產配置圓餅(可切依標的/依分類)、
 * 下方交易紀錄表與新增表單。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadData } from '../data/loader'
import { formatDate, formatNumber, formatPercent } from '../lib/format'
import { buildHoldings, summarize, type Transaction } from '../lib/portfolio'
import {
  canPersist, fromExportFile, loadPortfolio, needsExportReminder, savePortfolio,
  toExportFile, type PortfolioData,
} from '../lib/portfolioStore'
import { hashFor } from '../lib/route'
import type { EtfRow } from '../types'
import { AllocationPie } from './AllocationPie'
import { MetricInfo } from './MetricInfo'
import { TransactionForm } from './TransactionForm'

const TYPE_LABEL = { buy: '買進', sell: '賣出', dividend: '配息' } as const

export function Portfolio() {
  const [data, setData] = useState<PortfolioData>(() => loadPortfolio())
  const [rows, setRows] = useState<EtfRow[]>([])
  const [pieBy, setPieBy] = useState<'code' | 'category'>('code')
  const [notice, setNotice] = useState<string | null>(null)
  const persistable = useRef(canPersist())
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => { void loadData().then((r) => { if (r.ok) setRows(r.rankings.etfs) }) }, [])
  useEffect(() => { savePortfolio(data) }, [data])

  const priceMap = useMemo(
    () => new Map(rows.map((r) => [r.code, r.close])), [rows])
  const infoMap = useMemo(
    () => new Map(rows.map((r) => [r.code, r])), [rows])

  const summary = useMemo(
    () => summarize(data.transactions, priceMap, today),
    [data.transactions, priceMap, today])
  const holdings = useMemo(
    () => [...buildHoldings(data.transactions).values()].filter((h) => h.shares > 0),
    [data.transactions])

  const slices = useMemo(() => {
    const acc = new Map<string, number>()
    for (const h of holdings) {
      const px = priceMap.get(h.code)
      if (px === undefined) continue
      const key = pieBy === 'code'
        ? `${h.code} ${infoMap.get(h.code)?.name ?? ''}`.trim()
        : infoMap.get(h.code)?.category ?? '未分類'
      acc.set(key, (acc.get(key) ?? 0) + h.shares * px)
    }
    return [...acc].map(([label, value]) => ({ label, value }))
  }, [holdings, priceMap, infoMap, pieBy])

  function addTx(tx: Transaction) {
    setData((d) => ({ ...d, transactions: [...d.transactions, tx] }))
  }

  function removeTx(id: string) {
    setData((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }))
  }

  function doExport() {
    const blob = new Blob([toExportFile(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `alpha-track-portfolio-${today}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setData((d) => ({ ...d, lastExport: today }))
    setNotice('已匯出。建議存到雲端硬碟或另一台裝置。')
  }

  function doImport(file: File) {
    void file.text().then((text) => {
      const r = fromExportFile(text)
      if (!r.ok) { setNotice(`匯入失敗:${r.error}`); return }
      setData((d) => ({ ...d, transactions: r.transactions, fees: r.fees }))
      setNotice(r.skipped > 0
        ? `已匯入 ${r.transactions.length} 筆,略過 ${r.skipped} 筆無法辨識的紀錄。`
        : `已匯入 ${r.transactions.length} 筆交易。`)
    })
  }

  return (
    <main className="app detail">
      <p><a href={hashFor({ name: 'rankings' })}>← 回排行榜</a></p>
      <h1>我的組合</h1>

      {!persistable.current && (
        <p role="alert" className="error">
          這個瀏覽器無法儲存資料(可能是無痕模式)。交易紀錄在關閉分頁後會消失,
          請務必先匯出。
        </p>
      )}

      <p className="detail__caveat" role="note">
        交易紀錄只存在這台裝置的瀏覽器裡。<strong>清除瀏覽器資料、換裝置、
        換瀏覽器,紀錄就會消失</strong> —— 匯出是備份的唯一方式。
      </p>

      {needsExportReminder(data, today) && (
        <p role="alert" className="portfolio__remind">
          {data.lastExport
            ? `距上次匯出已超過 30 天(${formatDate(data.lastExport)})。`
            : '你有交易紀錄但從未匯出。'}
          建議現在匯出備份。
        </p>
      )}

      <div className="portfolio__actions">
        <button type="button" onClick={doExport}
                disabled={data.transactions.length === 0}>匯出 JSON</button>
        <label className="portfolio__import">
          匯入 JSON
          <input type="file" accept="application/json,.json"
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f) }} />
        </label>
        {notice && <span className="portfolio__notice" role="status">{notice}</span>}
      </div>

      {summary.missingPrices.length > 0 && (
        <p className="detail__caveat" role="note">
          查不到 {summary.missingPrices.join('、')} 的現價,這幾檔未計入總市值。
        </p>
      )}

      <section>
        <h2>總覽</h2>
        <dl className="cards">
          <Card label="總市值" value={formatNumber(summary.marketValue, 0)} />
          <Card label="投入成本" value={formatNumber(summary.costBasis, 0)} />
          <Card label="未實現損益" value={formatNumber(summary.unrealized, 0)}
                tone={summary.unrealized} />
          <Card label="已實現損益" value={formatNumber(summary.realized, 0)}
                tone={summary.realized} />
          <Card label="已領配息" value={formatNumber(summary.dividends, 0)} />
          <Card label="含息總報酬" value={formatPercent(summary.totalReturn)}
                tone={summary.totalReturn} />
          <Card label="XIRR" term="xirr" value={formatPercent(summary.xirr)}
                tone={summary.xirr} />
        </dl>
      </section>

      <section>
        <h2>資產配置</h2>
        <div className="chart__ranges" role="toolbar" aria-label="切換配置維度">
          <button type="button" aria-pressed={pieBy === 'code'}
                  onClick={() => setPieBy('code')}>依標的</button>
          <button type="button" aria-pressed={pieBy === 'category'}
                  onClick={() => setPieBy('category')}>依分類</button>
        </div>
        <AllocationPie slices={slices}
                       title={pieBy === 'code' ? '依標的的資產配置' : '依分類的資產配置'} />
      </section>

      <section>
        <h2>新增交易</h2>
        <TransactionForm fees={data.fees} rows={rows} onAdd={addTx} />
      </section>

      <section>
        <h2>交易紀錄</h2>
        {data.transactions.length === 0 ? (
          <p className="detail__caveat">還沒有交易紀錄。用上面的表單新增第一筆。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>日期</th><th>類型</th><th>代號</th><th>股數</th>
                  <th>價格</th><th>手續費</th><th>交易稅</th><th></th>
                </tr>
              </thead>
              <tbody>
                {[...data.transactions]
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .map((t) => (
                    <tr key={t.id}>
                      <td>{formatDate(t.date)}</td>
                      <td>{TYPE_LABEL[t.type]}</td>
                      <td>{t.code}</td>
                      <td>{formatNumber(t.shares, 0)}</td>
                      <td>{formatNumber(t.price, 2)}</td>
                      <td>{formatNumber(t.fee, 0)}</td>
                      <td>{formatNumber(t.tax, 0)}</td>
                      <td>
                        <button type="button" className="tx-del"
                                aria-label={`刪除 ${formatDate(t.date)} 的 ${t.code}`}
                                onClick={() => removeTx(t.id)}>刪除</button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

function Card({ label, term, value, tone }: {
  label: string; term?: string; value: string; tone?: number | null
}) {
  const cls = tone === undefined || tone === null || tone === 0
    ? '' : tone > 0 ? 'gain' : 'loss'
  return (
    <div className="card">
      <dt>{label}{term && <> <MetricInfo termId={term} /></>}</dt>
      <dd className={cls}>{value}</dd>
    </div>
  )
}
