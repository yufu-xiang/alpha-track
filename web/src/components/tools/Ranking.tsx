/**
 * 殖利率排行與流動性排行。規格 §7.2 的「採納的股市工具」。
 *
 * 兩者結構相同(依某個欄位排序、列出前 N 名),故共用一個元件 ——
 * 差別只在取哪個欄位、怎麼格式化、以及需要說明哪個陷阱。
 */
import { useEffect, useMemo, useState } from 'react'
import { loadData } from '../../data/loader'
import { applyFilters, collectCategories } from '../../lib/filtering'
import { formatMoney, formatPercent } from '../../lib/format'
import { hashFor } from '../../lib/route'
import type { EtfRow } from '../../types'
import { ToolPage } from './shared'

const TOP_N = 30

/**
 * 涵蓋率低於此值就顯著警告。
 *
 * 配息資料自 FinMind 逐日分批回補(每日 40 檔,全站 351 檔約需九天),
 * 因此殖利率排行在初期只涵蓋一小部分。一個只涵蓋十幾檔的榜單長得
 * 和全市場排行一模一樣 —— 那正是規格 §7.3 說的「自信但錯誤」:
 * 使用者會以為榜首是全市場最高,實際上只是「目前查得到的」最高。
 */
const LOW_COVERAGE = 0.5

interface Spec {
  title: string
  /** 取用的欄位;回傳 null 代表這一檔沒有資料,不列入排名 */
  value: (r: EtfRow) => number | null
  format: (v: number) => string
  columnLabel: string
  /** 併列顯示的第二欄,幫使用者看出主欄可能誤導的地方 */
  secondary?: { label: string; render: (r: EtfRow) => string }
  intro: React.ReactNode
  caveat: React.ReactNode
  /** 涵蓋率偏低時補充「為什麼還不齊」 */
  coverageNote: React.ReactNode
}

const YIELD: Spec = {
  title: 'ETF 殖利率排行',
  value: (r) => r.dividend_yield,
  format: (v) => formatPercent(v).replace('+', ''),
  columnLabel: '近一年殖利率',
  secondary: {
    label: '近一年總報酬',
    render: (r) => formatPercent(r.returns.Y1),
  },
  intro: <>近一年<strong>實際配息</strong>總額 ÷ 現價。不年化、不推估未來配息。</>,
  coverageNote: <>配息資料自外部來源逐日分批回補,全站補齊約需一週,之後這個涵蓋率會提高。</>,
  caveat: (
    <>
      <strong>高殖利率不等於高報酬。</strong>配息是把你自己的資產從左口袋
      移到右口袋 —— 除息當天股價會扣掉配息金額。真正該看的是右邊那欄的
      總報酬(已含息)。一檔配息 9% 但股價跌 12% 的 ETF,殖利率排行上很好看,
      實際上你賠了 3%。
      <br />
      殖利率也會因為股價下跌而「變高」:分母變小,分子沒變。
      榜首有時只是跌得最多的那一檔。
    </>
  ),
}

const LIQUIDITY: Spec = {
  title: 'ETF 流動性排行',
  value: (r) => r.avg_turnover,
  format: (v) => formatMoney(v),
  columnLabel: '近月日均成交金額',
  secondary: {
    label: '日均成交股數',
    render: (r) => (r.avg_volume === null ? '—' : formatMoney(r.avg_volume)),
  },
  intro: <>近 20 個交易日的平均成交<strong>金額</strong>(股數 × 收盤價)。</>,
  coverageNote: <>成交資料隨每日行情一併取得,涵蓋率偏低通常代表當日抓取不完整。</>,
  caveat: (
    <>
      排的是<strong>金額</strong>不是股數。10 元與 100 元的 ETF 成交同樣股數,
      實際換手的資金差十倍 —— 只排成交量會讓低價 ETF 系統性看起來比較熱門。
      兩欄並列,你可以自己看到這個差別。
      <br />
      流動性影響的是<strong>買賣價差</strong>與大額進出的衝擊成本,
      不代表這檔標的比較好。冷門不是缺點,只是下單時要多留意掛單深度。
    </>
  ),
}

export function YieldRanking() { return <Ranking spec={YIELD} /> }
export function LiquidityRanking() { return <Ranking spec={LIQUIDITY} /> }

function Ranking({ spec }: { spec: Spec }) {
  const [rows, setRows] = useState<EtfRow[]>([])
  const [category, setCategory] = useState('')
  const [showLevered, setShowLevered] = useState(false)

  useEffect(() => {
    void loadData().then((r) => { if (r.ok) setRows(r.rankings.etfs) })
  }, [])

  const pool = useMemo(
    () => applyFilters(rows, {
      categories: category ? [category] : [], regions: [], query: '', showLevered,
    }),
    [rows, category, showLevered],
  )
  const categories = useMemo(
    () => collectCategories(applyFilters(rows, {
      categories: [], regions: [], query: '', showLevered,
    })),
    [rows, showLevered],
  )

  // 沒有資料的一律排除,而不是當成 0 排到最後 —— 0 是一個值,
  // 「不知道」不是。混在一起會讓榜尾看起來像是「這些都沒在配息」。
  const ranked = useMemo(() => {
    const withValue = pool
      .map((r) => ({ row: r, v: spec.value(r) }))
      .filter((x): x is { row: EtfRow; v: number } => x.v !== null)
    withValue.sort((a, b) => b.v - a.v)
    return withValue.slice(0, TOP_N)
  }, [pool, spec])

  const withData = pool.filter((r) => spec.value(r) !== null).length
  const missing = pool.length - withData
  const coverage = pool.length > 0 ? withData / pool.length : 1

  return (
    <ToolPage title={spec.title}>
      <p className="tool-mode">實據模式:{spec.intro}</p>

      <div className="tool-form">
        <label>分類
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">全部</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="tool-check">
          <input type="checkbox" checked={showLevered}
                 onChange={(e) => setShowLevered(e.target.checked)} />
          納入槓桿/反向型
        </label>
      </div>

      {coverage < LOW_COVERAGE && pool.length > 0 && (
        <p role="alert" className="portfolio__remind">
          目前只有 {withData} / {pool.length} 檔有這項資料,
          <strong>這不是全市場排行</strong> —— 榜首是「目前查得到的最高」,
          不是「全市場最高」。{spec.coverageNote}
        </p>
      )}

      {ranked.length === 0 ? (
        <p className="chart-empty">這個條件下沒有可排名的資料。</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>名次</th><th>代號</th><th>名稱</th>
                <th>{spec.columnLabel}</th>
                {spec.secondary && <th>{spec.secondary.label}</th>}
              </tr>
            </thead>
            <tbody>
              {ranked.map((x, i) => (
                <tr key={x.row.code}>
                  <td>{i + 1}</td>
                  <td>
                    <a href={hashFor({ name: 'detail', code: x.row.code })}>{x.row.code}</a>
                  </td>
                  <td>{x.row.name}</td>
                  <td>{spec.format(x.v)}</td>
                  {spec.secondary && <td>{spec.secondary.render(x.row)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {missing > 0 && (
        <p className="tool-note">
          另有 {missing} 檔沒有這項資料,未列入排名 —— 沒有資料不是 0,
          把它們排在榜尾會看起來像是「這些都掛零」。
        </p>
      )}

      <p className="tool-note">{spec.caveat}</p>
    </ToolPage>
  )
}
