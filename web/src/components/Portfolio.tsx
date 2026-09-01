/**
 * 我的組合。規格 §6.6。
 *
 * 上方總覽數字、中段資產配置圓餅(可切依標的/依分類)、
 * 下方交易紀錄表與新增表單。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadData } from '../data/loader'
import { formatDate, formatMoney, formatNumber, formatPercent } from '../lib/format'
import { analyzePositions, summarize, type Transaction } from '../lib/portfolio'
import {
  canPersist, fromExportFile, loadPortfolio, needsExportReminder, savePortfolio,
  toExportFile, type PortfolioData,
} from '../lib/portfolioStore'
import { hashFor } from '../lib/route'
import type { EtfRow } from '../types'
import { AllocationPie } from './AllocationPie'
import { MetricInfo } from './MetricInfo'
import { DividendEstimates } from './DividendEstimates'
import { EmptyState } from './EmptyState'
import { PageShell } from './PageShell'
import { PortfolioPositions } from './PortfolioPositions'
import { SplitNotice } from './SplitNotice'
import { TransactionForm } from './TransactionForm'

const TYPE_LABEL = { buy: '買進', sell: '賣出', dividend: '配息', split: '分割' } as const

export function Portfolio({ initialCode }: { initialCode?: string }) {
  const [data, setData] = useState<PortfolioData>(() => loadPortfolio())
  const [rows, setRows] = useState<EtfRow[]>([])
  const [pieBy, setPieBy] = useState<'code' | 'category'>('code')
  const [notice, setNotice] = useState<string | null>(null)
  const persistable = useRef(canPersist())
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => { void loadData().then((r) => { if (r.ok) setRows(r.rankings.etfs) }) }, [])
  useEffect(() => { savePortfolio(data) }, [data])
  useEffect(() => {
    if (!initialCode) return
    const id = window.setTimeout(() => {
      document.getElementById('new-transaction')?.scrollIntoView?.({
        behavior: 'auto', block: 'start',
      })
    }, 120)
    return () => window.clearTimeout(id)
  }, [initialCode])

  const priceMap = useMemo(
    () => new Map(rows.map((r) => [r.code, r.close])), [rows])
  const infoMap = useMemo(
    () => new Map(rows.map((r) => [r.code, r])), [rows])

  const dayReturns = useMemo(
    () => new Map(rows.map((r) => [r.code, r.returns.D1])), [rows])

  const summary = useMemo(
    () => summarize(data.transactions, priceMap, today, dayReturns),
    [data.transactions, priceMap, today, dayReturns])
  const positions = useMemo(
    () => analyzePositions(data.transactions, priceMap, data.targets),
    [data.transactions, data.targets, priceMap])

  const slices = useMemo(() => {
    const acc = new Map<string, number>()
    for (const h of positions) {
      const px = priceMap.get(h.code)
      if (px === undefined) continue
      const key = pieBy === 'code'
        ? `${h.code} ${infoMap.get(h.code)?.name ?? ''}`.trim()
        : infoMap.get(h.code)?.category ?? '未分類'
      acc.set(key, (acc.get(key) ?? 0) + h.shares * px)
    }
    return [...acc].map(([label, value]) => ({ label, value }))
  }, [positions, priceMap, infoMap, pieBy])

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
      setData((d) => ({
        ...d, transactions: r.transactions, fees: r.fees, targets: r.targets,
      }))
      setNotice(r.skipped > 0
        ? `已匯入 ${r.transactions.length} 筆,略過 ${r.skipped} 筆無法辨識的紀錄。`
        : `已匯入 ${r.transactions.length} 筆交易。`)
    })
  }

  return (
    <PageShell
      active="portfolio"
      eyebrow="PORTFOLIO OVERVIEW"
      title="我的組合"
      description="集中查看持倉、損益、配息與交易紀錄，掌握這個投資組合現在的樣子。"
      backHref={hashFor({ name: 'rankings' })}
    >

      {initialCode && (
        <p className="portfolio-prefill" role="status">
          <span>已從 ETF 詳情頁帶入</span>
          <strong>{initialCode}</strong>
          <span>請確認日期、股數與成交價格後新增交易。</span>
        </p>
      )}

      {!persistable.current && (
        <p role="alert" className="error">
          這個瀏覽器無法儲存資料(可能是無痕模式)。交易紀錄在關閉分頁後會消失,
          請務必先匯出。
        </p>
      )}

      <div className="portfolio-backup">
        <div>
          <p className="eyebrow">LOCAL DATA</p>
          <h2>資料與備份</h2>
          <p className="portfolio-backup__copy" role="note">
            交易紀錄只存在這台裝置的瀏覽器裡。<strong>清除瀏覽器資料、換裝置、
            換瀏覽器，紀錄就會消失</strong>。匯出 JSON 是備份的唯一方式。
          </p>
        </div>
        <div className="portfolio__actions">
          <button type="button" onClick={doExport}
                  disabled={data.transactions.length === 0}>匯出備份</button>
          <label className="portfolio__import">
            匯入備份
            <input type="file" accept="application/json,.json"
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f) }} />
          </label>
          {notice && <span className="portfolio__notice" role="status">{notice}</span>}
        </div>
      </div>

      {needsExportReminder(data, today) && (
        <p role="alert" className="portfolio__remind">
          {data.lastExport
            ? `距上次匯出已超過 30 天(${formatDate(data.lastExport)})。`
            : '你有交易紀錄但從未匯出。'}
          建議現在匯出備份。
        </p>
      )}

      {summary.missingPrices.length > 0 && (
        <p className="detail__caveat" role="note">
          查不到 {summary.missingPrices.join('、')} 的現價,這幾檔未計入總市值。
        </p>
      )}

      <SplitNotice transactions={data.transactions} onAdd={addTx} />

      <section className="content-panel content-panel--summary">
        <div className="panel-heading">
          <div><p className="eyebrow">AT A GLANCE</p><h2>組合總覽</h2></div>
          <span>依最新收盤價估算</span>
        </div>
        <dl className="cards">
          <Card label="總市值" value={formatMoney(summary.marketValue)} />
          <Card label="今日損益"
                value={summary.todayChange === null
                  ? '—' : formatMoney(summary.todayChange)}
                tone={summary.todayChange} />
          <Card label="投入成本" value={formatMoney(summary.costBasis)} />
          <Card label="未實現損益" value={formatMoney(summary.unrealized)}
                tone={summary.unrealized} />
          <Card label="已實現損益" value={formatMoney(summary.realized)}
                tone={summary.realized} />
          <Card label="已領配息" value={formatMoney(summary.dividends)} />
          <Card label="含息總報酬" value={formatPercent(summary.totalReturn)}
                tone={summary.totalReturn} />
          <Card label="XIRR" term="xirr" value={formatPercent(summary.xirr)}
                tone={summary.xirr} />
        </dl>
      </section>

      {positions.length > 0 && (
        <PortfolioPositions
          positions={positions}
          names={new Map(rows.map((row) => [row.code, row.name]))}
          onTargetsChange={(targets) => setData((current) => ({ ...current, targets }))}
        />
      )}

      <div className="portfolio-grid">
      <section className="content-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">ALLOCATION</p><h2>資產配置</h2></div>
        </div>
        <div className="chart__ranges" role="toolbar" aria-label="切換配置維度">
          <button type="button" aria-pressed={pieBy === 'code'}
                  onClick={() => setPieBy('code')}>依標的</button>
          <button type="button" aria-pressed={pieBy === 'category'}
                  onClick={() => setPieBy('category')}>依分類</button>
        </div>
        <AllocationPie slices={slices}
                       title={pieBy === 'code' ? '依標的的資產配置' : '依分類的資產配置'} />
      </section>

      <section className="content-panel" id="new-transaction">
        <div className="panel-heading">
          <div><p className="eyebrow">NEW ACTIVITY</p><h2>新增交易</h2></div>
        </div>
        <TransactionForm fees={data.fees} rows={rows} onAdd={addTx}
                         initialCode={initialCode} />
      </section>
      </div>

      <section className="content-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">DIVIDEND INBOX</p><h2>應領配息推估</h2></div>
        </div>
        <DividendEstimates transactions={data.transactions} onRecord={addTx} />
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">ACTIVITY</p><h2>交易紀錄</h2></div>
          <span>{data.transactions.length} 筆</span>
        </div>
        {data.transactions.length === 0 ? (
          <EmptyState
            marker="＋"
            title="還沒有交易紀錄"
            description="從一筆買進開始，系統會自動計算持股成本、損益與配息。"
            action={<button type="button" onClick={() => {
              document.getElementById('new-transaction')?.scrollIntoView?.({
                behavior: 'smooth', block: 'start',
              })
            }}>前往新增交易</button>}
            compact
          />
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
                      {/* 推估值在紀錄表裡也要看得出來(規格 §6.4)——
                          只在記錄前標示等於沒標示,對帳時看的是這張表。 */}
                      <td>
                        {TYPE_LABEL[t.type]}
                        {t.estimated && <span className="tx-estimated">推估</span>}
                      </td>
                      <td>{t.code}</td>
                      {/* 分割沒有股數,price 欄存的是倍率 —— 照原樣印會變成
                          「0 股、單價 4.00」,那讀起來像一筆壞掉的交易。 */}
                      <td>{t.type === 'split' ? '—' : formatNumber(t.shares, 0)}</td>
                      <td>
                        {t.type === 'split'
                          ? `1:${formatNumber(t.price, t.price >= 1 ? 0 : 2)}`
                          : formatNumber(t.price, 2)}
                      </td>
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
    </PageShell>
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
