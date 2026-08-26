/**
 * 理財工具。規格 §7。
 *
 * §7.1 的原則:每個工具提供「假設模式」與「實據模式」兩種參數來源,
 * 且 **UI 須明確標示當前使用哪一種**。實據模式幾乎不增加成本
 * (資料本就存在),但使結果有依據而非猜測。
 *
 * §7.3 對蒙地卡羅另有強制要求,見 MonteCarloTool。
 */
import { useEffect, useMemo, useState } from 'react'
import { loadData, loadDetail } from '../data/loader'
import { formatMoney, formatNumber, formatPercent } from '../lib/format'
import { lumpVsDca, yearsToFire } from '../lib/invest'
import {
  annualReturnsFrom, bootstrapSampler, monteCarlo, normalSampler, yearsUntilDepleted,
} from '../lib/retirement'
import { hashFor } from '../lib/route'
import type { BenchmarkSeries, EtfRow } from '../types'

const MIN_YEARS_FOR_LONG_TERM = 10

export function Tools() {
  const [rows, setRows] = useState<EtfRow[]>([])
  const [bench, setBench] = useState<BenchmarkSeries | null>(null)

  useEffect(() => {
    void loadData().then((r) => { if (r.ok) setRows(r.rankings.etfs) })
    // 基準線是蒙地卡羅 bootstrap 的長期歷史來源(規格 §7.3 模式一)
    void loadDetail('0050').then((r) => { if (r.ok) setBench(r.benchmark) })
  }, [])

  return (
    <main className="app detail">
      <p><a href={hashFor({ name: 'rankings' })}>← 回排行榜</a></p>
      <h1>理財工具</h1>
      <p className="detail__caveat" role="note">
        以下工具皆為<strong>試算</strong>,不是預測,也不構成投資建議。
        本站不提供「建議提領率」這類規範性建議 —— 工具呈現計算結果,
        判斷由你自己做。
      </p>

      <WithdrawalTool />
      <MonteCarloTool bench={bench} />
      <DcaTool rows={rows} />
      <FireTool />
    </main>
  )
}

/* ── 退休提領 ─────────────────────────────────────────── */

function WithdrawalTool() {
  const [initial, setInitial] = useState(10_000_000)
  const [rate, setRate] = useState(0.04)
  const [ret, setRet] = useState(0.05)
  const [inflation, setInflation] = useState(0.02)
  const years = 40

  const withdrawal = initial * rate
  const depleted = yearsUntilDepleted({
    initial, annualWithdrawal: withdrawal, annualReturn: ret, inflation, years,
  })

  return (
    <section>
      <h2>退休提領試算</h2>
      <div className="tool-form">
        <Num label="起始資產" value={initial} step={100_000} onChange={setInitial} />
        <Pct label="提領率" value={rate} onChange={setRate} />
        <Pct label="年化報酬" value={ret} onChange={setRet} />
        <Pct label="通膨率" value={inflation} onChange={setInflation} />
      </div>
      <dl className="cards">
        <Stat label="第一年提領" value={formatMoney(withdrawal)} />
        <Stat label={`可支撐年數(試算 ${years} 年)`}
              value={depleted === null ? `撐過 ${years} 年` : `${depleted} 年後耗盡`} />
      </dl>
      <p className="tool-note">
        提領發生在年初、報酬計入年末 —— 錢先離開,剩下的才參與市場。
        反過來算會系統性高估可支撐年數。提領金額逐年隨通膨調整。
      </p>
    </section>
  )
}

/* ── 蒙地卡羅 ─────────────────────────────────────────── */

function MonteCarloTool({ bench }: { bench: BenchmarkSeries | null }) {
  const [mode, setMode] = useState<'bootstrap' | 'parametric'>('bootstrap')
  const [initial, setInitial] = useState(10_000_000)
  const [rate, setRate] = useState(0.04)
  const [inflation, setInflation] = useState(0.02)
  const [mean, setMean] = useState(0.07)
  const [stdev, setStdev] = useState(0.2)
  const years = 30
  const runs = 2000

  const history = useMemo(() => {
    if (!bench?.start || bench.days.length === 0) return { returns: [], years: 0 }
    const base = Date.parse(`${bench.start}T00:00:00Z`)
    return annualReturnsFrom(bench.days.map((d, i) => ({
      date: new Date(base + d * 86_400_000).toISOString().slice(0, 10),
      value: bench.value[i]!,
    })))
  }, [bench])

  const result = useMemo(() => {
    if (mode === 'bootstrap' && history.returns.length === 0) return null
    const draw = mode === 'bootstrap'
      ? bootstrapSampler(history.returns)
      : normalSampler(mean, stdev)
    return monteCarlo({
      initial, annualWithdrawal: initial * rate, inflation, years, runs, drawReturn: draw,
    })
  }, [mode, history, initial, rate, inflation, mean, stdev])

  const thin = mode === 'bootstrap' && history.years < MIN_YEARS_FOR_LONG_TERM

  return (
    <section>
      <h2>退休金蒙地卡羅回測</h2>

      <div className="chart__ranges" role="toolbar" aria-label="切換模擬模式">
        <button type="button" aria-pressed={mode === 'bootstrap'}
                onClick={() => setMode('bootstrap')}>歷史 bootstrap</button>
        <button type="button" aria-pressed={mode === 'parametric'}
                onClick={() => setMode('parametric')}>參數化假設</button>
      </div>

      {/* 規格 §7.3 強制顯示:「本模擬基於 N 年歷史資料」 */}
      <p className="tool-mode" role="status">
        {mode === 'bootstrap'
          ? `實據模式:自加權報酬指數的 ${history.years} 個年度報酬有放回抽樣。`
          : '假設模式:依你設定的報酬與波動抽樣 —— 此為假設推演,不是預測。'}
      </p>

      {/* 規格 §7.3:N < 10 時顯著警告 */}
      {thin && (
        <p role="alert" className="portfolio__remind">
          僅有 {history.years} 年歷史資料,不足以支撐 {years} 年的長期推論。
          以短歷史模擬長期退休會產生外觀精美、實則無意義的成功率 ——
          請把下面的數字當成示意,不要據此做財務決定。
        </p>
      )}

      <div className="tool-form">
        <Num label="起始資產" value={initial} step={100_000} onChange={setInitial} />
        <Pct label="提領率" value={rate} onChange={setRate} />
        <Pct label="通膨率" value={inflation} onChange={setInflation} />
        {mode === 'parametric' && (
          <>
            <Pct label="平均年報酬" value={mean} onChange={setMean} />
            <Pct label="年化波動" value={stdev} onChange={setStdev} />
          </>
        )}
      </div>

      {result === null ? (
        <p className="chart-empty">還沒有歷史資料可供抽樣,請改用參數化假設。</p>
      ) : (
        <>
          <dl className="cards">
            <Stat label={`${years} 年後未耗盡的比率`}
                  value={formatPercent(result.successRate).replace('+', '')} />
            <Stat label="模擬次數" value={String(result.runs)} />
          </dl>
          {/* 規格 §7.3:結果一律以區間呈現,不給單一數字 */}
          <div className="table-wrap">
            <table>
              <caption className="tool-caption">
                餘額以<strong>今日購買力</strong>計 —— 已用同一個通膨率把名目金額
                折回今天。直接看名目數字會嚴重高估:30 年、2% 通膨之下,
                帳面金額大約是實質購買力的 1.8 倍。
              </caption>
              <thead>
                <tr><th>年</th><th>第 10 百分位</th><th>中位數</th><th>第 90 百分位</th></tr>
              </thead>
              <tbody>
                {[5, 10, 15, 20, 25, 30].map((y) => {
                  const p = result.percentiles[y - 1]
                  if (!p) return null
                  // 提領已隨通膨逐年墊高,餘額卻是名目值 —— 用同一個通膨率
                  // 折回今日購買力,兩邊的尺度才一致。
                  const real = (v: number) => v / (1 + inflation) ** y
                  // 餘額 0 就是「這條路徑已經沒錢了」。在一整欄七、八位數之中
                  // 印一個「0」會被當成格式壞掉,直接把意思寫出來。
                  const cell = (v: number) =>
                    v <= 0 ? <span className="is-depleted">已耗盡</span> : formatMoney(real(v))
                  return (
                    <tr key={y}>
                      <td>第 {y} 年</td>
                      <td>{cell(p.p10)}</td>
                      <td>{cell(p.p50)}</td>
                      <td>{cell(p.p90)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="tool-note">
        每一年獨立抽樣,因此模擬不出「連續數年下跌」這種真實的序列相關性 ——
        這是 bootstrap 公認的限制。參數化模式用常態分布,會低估極端情境的機率。
        兩種模式都不是預測。
      </p>
    </section>
  )
}

/* ── 單筆 vs 定期定額 ─────────────────────────────────── */

function DcaTool({ rows }: { rows: EtfRow[] }) {
  const [code, setCode] = useState('0050')
  const [total, setTotal] = useState(1_200_000)
  const [prices, setPrices] = useState<number[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [range, setRange] = useState(0)
  const RANGES = [
    { label: '近三年', months: 36 },
    { label: '近五年', months: 60 },
    { label: '全部', months: null as number | null },
  ]

  useEffect(() => {
    if (!code) return
    setLoading(true)
    void loadDetail(code).then((r) => {
      setLoading(false)
      if (!r.ok || !r.detail.series.start) { setPrices(null); return }
      // 取每月的最後一筆當作定期定額的扣款價 —— 實際扣款是每月一次,
      // 用日資料模擬會變成「每天都扣」,得到完全不同的結果。
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
  const result = sliced ? lumpVsDca(sliced, total) : null

  return (
    <section>
      <h2>單筆 vs 定期定額</h2>
      {/* 這條不隨互動改變,故不設 live region —— 同一頁兩個 role="status"
          會讓螢幕閱讀器把靜態說明也一起重播。 */}
      <p className="tool-mode">
        實據模式:採用 {code} 的真實歷史月收盤(還原價)。
      </p>
      <div className="tool-form">
        <label>標的
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                 list="tool-codes" />
        </label>
        <datalist id="tool-codes">
          {rows.slice(0, 400).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
        </datalist>
        <Num label="總投入金額" value={total} step={100_000} onChange={setTotal} />
      </div>
      <div className="chart__ranges" role="toolbar" aria-label="選擇回測區間">
        {RANGES.map((r, i) => (
          <button key={r.label} type="button" aria-pressed={i === range}
                  onClick={() => setRange(i)}>{r.label}</button>
        ))}
      </div>

      {loading ? <p className="chart-empty">載入中…</p>
        : !result ? <p className="chart-empty">找不到 {code} 的歷史資料。</p>
        : (
          <dl className="cards">
            <Stat label="單筆投入期末" value={formatMoney(result.lumpSum)} />
            <Stat label="定期定額期末" value={formatMoney(result.dca)} />
            <Stat label="定期定額平均成本" value={formatNumber(result.dcaAvgCost, 2)} />
            <Stat label="單筆相對定期定額"
                  value={formatPercent(result.lumpSum / result.dca - 1)} />
          </dl>
        )}
      <p className="tool-note">
        每月投入相同金額,故價格低時買到較多股數。
        <strong>過去的結果不保證未來</strong> —— 一段上漲的歷史必然讓單筆勝出,
        換一段起跌的歷史結論就反過來。試著切換區間看看差多少。
      </p>
    </section>
  )
}

/* ── FIRE ─────────────────────────────────────────────── */

function FireTool() {
  const [spending, setSpending] = useState(600_000)
  const [assets, setAssets] = useState(1_000_000)
  const [savings, setSavings] = useState(500_000)
  const [ret, setRet] = useState(0.06)
  const [rate, setRate] = useState(0.04)

  const r = yearsToFire({
    annualSpending: spending, currentAssets: assets,
    annualSavings: savings, annualReturn: ret, withdrawalRate: rate,
  })

  return (
    <section>
      <h2>財務自由試算</h2>
      <div className="tool-form">
        <Num label="年支出" value={spending} step={50_000} onChange={setSpending} />
        <Num label="目前資產" value={assets} step={100_000} onChange={setAssets} />
        <Num label="每年可存" value={savings} step={50_000} onChange={setSavings} />
        <Pct label="年化報酬" value={ret} onChange={setRet} />
        <Pct label="提領率" value={rate} onChange={setRate} />
      </div>
      <dl className="cards">
        <Stat label="所需資產" value={formatMoney(r.target)} />
        <Stat label="還需年數"
              value={r.years === null ? '這組參數下達不到'
                   : r.years === 0 ? '已達成' : `${r.years} 年`} />
      </dl>
      <p className="tool-note">
        提領率是<strong>你填的參數</strong>,不是本站的建議值。
        4% 出自美國市場的歷史研究,不必然適用於台股或你的情況。
      </p>
    </section>
  )
}

/* ── 共用小元件 ───────────────────────────────────────── */

function Num({ label, value, step, onChange }: {
  label: string; value: number; step: number; onChange: (v: number) => void
}) {
  return (
    <label>{label}
      <input type="number" value={value} step={step} min={0}
             onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
  )
}

function Pct({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void
}) {
  return (
    <label>{label}(%)
      <input type="number" value={+(value * 100).toFixed(2)} step={0.5} min={0}
             onChange={(e) => onChange((Number(e.target.value) || 0) / 100)} />
    </label>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
