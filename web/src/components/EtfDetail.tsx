/**
 * ETF 個股頁。規格 §5.2 ②。
 *
 * 資料來自 data/etf/{代號}.json,lazy load —— 全站價格序列合計 6.3 MB,
 * 不可能隨排行榜一起載入。
 */
import { useEffect, useState } from 'react'
import { loadDetail, type DetailResult } from '../data/loader'
import {
  formatCompactMoney, formatDate, formatNumber, formatPercent,
} from '../lib/format'
import { hashFor } from '../lib/route'
import {
  addToCompareBasket, loadCompareBasket, loadWatchlist, toggleWatchlist,
} from '../lib/personalLists'
import { PERIODS, PERIOD_LABELS, RISK_LABELS, type PeriodCode } from '../types'
import { MetricInfo } from './MetricInfo'
import { EmptyState } from './EmptyState'
import { PageLoading } from './LoadingSkeleton'
import { PageShell } from './PageShell'
import { PremiumChart } from './PremiumChart'
import { PriceChart } from './PriceChart'

interface Props {
  code: string
}

export function EtfDetail({ code }: Props) {
  const [result, setResult] = useState<DetailResult | null>(null)
  const [watchlist, setWatchlist] = useState<string[]>(() => loadWatchlist())
  const [actionStatus, setActionStatus] = useState<string | null>(null)

  useEffect(() => {
    setResult(null)
    void loadDetail(code).then(setResult)
  }, [code])

  if (result === null) {
    return <PageLoading />
  }

  if (!result.ok) {
    return (
      <PageShell eyebrow="ETF PROFILE" title={code}
        description="無法載入這檔 ETF 的詳細資料。"
        backHref={hashFor({ name: 'rankings' })}>
        <p role="alert" className="error">{result.error}</p>
      </PageShell>
    )
  }

  const d = result.detail
  const watched = watchlist.includes(d.code)
  // 掛牌日與資料起點不同時要說明,否則「成立以來」為什麼空白沒人知道
  const coverageGap = d.listing_date && d.data_start && d.data_start > d.listing_date

  return (
    <PageShell
      eyebrow="ETF PROFILE"
      title={`${d.code} ${d.name}`}
      description="從價格走勢、含息績效到風險與折溢價，一頁掌握這檔 ETF 的完整輪廓。"
      backHref={hashFor({ name: 'rankings' })}
      meta={
        <div className="detail__tags">
          {d.category && <span className="tag">{d.category}</span>}
          {d.region && <span className="tag">{d.region}</span>}
          <span className="tag">{d.exchange === 'TPEX' ? '上櫃' : '上市'}</span>
        </div>
      }
    >

      <div className="detail-actions" role="group" aria-label={`${d.code} 快速操作`}>
        <div className="detail-actions__primary">
          <button type="button" aria-pressed={watched}
                  onClick={() => {
                    const next = toggleWatchlist(watchlist, d.code)
                    setWatchlist(next)
                    setActionStatus(next.includes(d.code) ? '已加入自選清單' : '已從自選清單移除')
                  }}>
            <ActionIcon name="star" filled={watched} />
            {watched ? '已收藏' : '加入自選'}
          </button>
          <button type="button" onClick={() => {
            const next = addToCompareBasket(d.code)
            if (!next.includes(d.code)) {
              setActionStatus('比較清單已滿，請先移除一檔。')
              return
            }
            window.location.hash = hashFor({ name: 'rankings' })
          }}>
            <ActionIcon name="compare" />
            加入比較
          </button>
          <a href={hashFor({ name: 'portfolio', code: d.code })}>
            <ActionIcon name="portfolio" />
            帶入我的組合
          </a>
        </div>
        <button type="button" className="detail-actions__share" onClick={() => {
          void shareCurrentPage(d.code, d.name).then((message) => {
            if (message) setActionStatus(message)
          })
        }}>
          <ActionIcon name="share" />
          分享
        </button>
        {actionStatus && <span className="detail-actions__status" role="status">{actionStatus}</span>}
      </div>

      <section className="content-panel content-panel--chart">
        <div className="panel-heading">
          <div><p className="eyebrow">TOTAL RETURN</p><h2>價格與含息走勢</h2></div>
          <span>基準：臺灣加權報酬指數</span>
        </div>
        <PriceChart series={d.series} benchmark={result.benchmark} name={d.name} />
      </section>

      {coverageGap && (
        <p className="detail__caveat" role="note">
          本站的價格資料自 <strong>{formatDate(d.data_start)}</strong> 起,
          晚於掛牌日 {formatDate(d.listing_date)} ——
          免費資料源涵蓋不足,或該日之前有未調整的分割。
          因此「成立以來」不提供,長期指標只涵蓋這之後的區間。
        </p>
      )}

      <section className="content-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">PERFORMANCE</p><h2>各期間報酬</h2></div>
          <span>含息總報酬</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>期間</th>
                <th>含息報酬 <MetricInfo termId="total_return" /></th>
                <th>年化 <MetricInfo termId="annualized" /></th>
                <th>超額報酬 <MetricInfo termId="excess" /></th>
              </tr>
            </thead>
            <tbody>
              {PERIODS.map((p: PeriodCode) => (
                <tr key={p}>
                  <td>{PERIOD_LABELS[p]}</td>
                  <td><Tone v={d.returns[p]} /></td>
                  <td>{formatPercent(d.annualized[p])}</td>
                  <td><Tone v={d.excess[p]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">RISK PROFILE</p><h2>風險指標</h2></div>
        </div>
        <dl className="cards">
          <Card label={RISK_LABELS.volatility} term="volatility"
                value={formatPercent(d.risk.volatility)} />
          <Card label={RISK_LABELS.mdd} term="mdd" value={formatPercent(d.risk.mdd)} />
          <Card label={RISK_LABELS.sharpe} term="sharpe"
                value={formatNumber(d.risk.sharpe, 2)} />
          <Card label={RISK_LABELS.beta} term="beta" value={formatNumber(d.risk.beta, 2)} />
          <Card label={RISK_LABELS.premium_discount} term="premium_discount"
                value={formatPercent(d.premium_discount)} />
        </dl>
      </section>

      <section className="content-panel content-panel--chart">
        <div className="panel-heading">
          <div><p className="eyebrow">PREMIUM / DISCOUNT</p><h2>折溢價走勢</h2></div>
          <span>近 60 個交易日</span>
        </div>
        <PremiumChart series={d.premium_series} name={d.name} sample={d.premium_sample} />
        <dl className="cards">
          {/* 三格都指向同一條詞典條目:它們是折溢價的三個面向,不是三個指標,
              而那條條目本來就把區間與佔比一起解釋了。 */}
          <Card label="近 60 日最深折價" term="premium_discount"
                value={formatPercent(d.premium_low)} />
          <Card label="近 60 日最高溢價" term="premium_discount"
                value={formatPercent(d.premium_high)} />
          <Card label="溢價天數佔比" term="premium_discount"
                value={d.premium_days_ratio === null ? '—'
                     : formatPercent(d.premium_days_ratio, 0).replace('+', '')} />
        </dl>
        {d.premium_days_ratio == null && (
          <p className="detail__caveat">
            區間統計需要 20 個交易日的樣本,目前累積 {d.premium_sample} 天。
            淨值來源只有當日快照、沒有歷史,因此只能逐日累積 ——
            這幾格會在滿二十個交易日後出現,不是資料壞了。
          </p>
        )}
        <p className="detail__caveat">
          採用的是交易所揭露的<strong>預估淨值</strong>,不是各投信盤後公告的
          正式結算淨值。兩者通常極接近,但不是同一個數字。
          當日無成交時整列不寫入 —— 沒有市價就沒有折溢價,填 0 會讓它
          看起來完美貼合淨值。
        </p>
      </section>

      <div className="detail-grid">
      <section className="content-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">DISTRIBUTIONS</p><h2>配息紀錄</h2></div>
          <span>{d.dividends.length} 筆</span>
        </div>
        {d.dividends.length === 0 ? (
          <EmptyState
            marker="—"
            title="目前沒有配息紀錄"
            description="這檔 ETF 在本站涵蓋期間內沒有可用的除息與發放資料。"
            compact
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>除息日</th><th>發放日</th><th>每股配息</th></tr>
              </thead>
              <tbody>
                {d.dividends.map((v) => (
                  <tr key={v.ex_date}>
                    <td>{formatDate(v.ex_date)}</td>
                    <td>{formatDate(v.pay_date)}</td>
                    <td>{formatNumber(v.amount, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="content-panel">
        <p className="eyebrow">FUND FACTS</p>
        <h2 className="standalone-heading">基本資料</h2>
        <dl className="facts">
          <dt>發行商</dt><dd>{d.issuer ?? '—'}</dd>
          <dt>追蹤指數</dt><dd>{d.tracking_index ?? '—'}</dd>
          <dt>規模 <MetricInfo termId="fund_size" /></dt>
          <dd>{formatCompactMoney(d.fund_size ?? null)}</dd>
          {/* 內扣費用率目前沒有任何公開的統一來源(見 docs/data-sources.md)。
              整欄拿掉的話,使用者不會知道這個資訊存在;留著並在 ⓘ 裡
              說明去哪裡查,比假裝它不重要誠實。 */}
          <dt>內扣費用率 <MetricInfo termId="expense_ratio" /></dt>
          <dd>—</dd>
          <dt>掛牌日</dt><dd>{formatDate(d.listing_date)}</dd>
          <dt>本站資料自</dt><dd>{formatDate(d.data_start)}</dd>
        </dl>
      </section>
      </div>
    </PageShell>
  )
}

async function shareCurrentPage(code: string, name: string): Promise<string | null> {
  const shareData = { title: `${code} ${name}｜ETF Rankings`, url: window.location.href }
  try {
    if (navigator.share) {
      await navigator.share(shareData)
      return '已開啟分享選單'
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareData.url)
      return '連結已複製'
    }
    return '可直接複製瀏覽器網址分享'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    return '分享失敗，請直接複製瀏覽器網址'
  }
}

function ActionIcon({ name, filled = false }: {
  name: 'star' | 'compare' | 'portfolio' | 'share'
  filled?: boolean
}) {
  if (name === 'star') {
    return <svg viewBox="0 0 24 24" aria-hidden="true" className={filled ? 'is-filled' : ''}>
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
    </svg>
  }
  if (name === 'compare') {
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4v16M17 4v16M4 8l3-3 3 3M14 16l3 3 3-3" />
    </svg>
  }
  if (name === 'portfolio') {
    return <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8.5h16v11H4zM8 8.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2.5M4 13h16" />
    </svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="6" cy="12" r="2.2" /><circle cx="18" cy="6" r="2.2" />
    <circle cx="18" cy="18" r="2.2" /><path d="m8 11 8-4M8 13l8 4" />
  </svg>
}

function Tone({ v }: { v: number | null }) {
  const tone = v === null || v === 0 ? '' : v > 0 ? 'gain' : 'loss'
  return <span className={tone}>{formatPercent(v)}</span>
}

function Card({ label, term, value }: { label: string; term: string; value: string }) {
  return (
    <div className="card">
      <dt>{label} <MetricInfo termId={term} /></dt>
      <dd>{value}</dd>
    </div>
  )
}
