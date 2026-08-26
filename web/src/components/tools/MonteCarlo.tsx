/**
 * 退休金蒙地卡羅回測。規格 §7.3 —— 全站最容易產生「自信但錯誤」結果的功能。
 *
 * 因此本頁的強制揭露不是裝飾,是規格明文要求,且都有測試釘住:
 *   - 一律顯示「本模擬基於 N 年歷史資料」
 *   - N < 10 時顯著警告
 *   - 結果只給第 10/50/90 百分位,不給單一數字
 *   - 不提供「建議提領率」這類規範性建議
 */
import { useEffect, useMemo, useState } from 'react'
import { loadData, loadDetail } from '../../data/loader'
import { formatMoney, formatNumber, formatPercent } from '../../lib/format'
import {
  annualReturnsFrom, bootstrapSampler, monteCarlo, normalSampler,
} from '../../lib/retirement'
import type { BenchmarkSeries, EtfRow } from '../../types'
import { ModeSwitch, Num, Pct, Stat, ToolPage } from './shared'

const MIN_YEARS_FOR_LONG_TERM = 10
const YEARS = 30
const RUNS = 2000

type Mode = 'bootstrap' | 'parametric'

export function MonteCarlo() {
  const [mode, setMode] = useState<Mode>('bootstrap')
  const [initial, setInitial] = useState(10_000_000)
  const [rate, setRate] = useState(0.04)
  const [inflation, setInflation] = useState(0.02)
  const [mean, setMean] = useState(0.07)
  const [stdev, setStdev] = useState(0.2)
  const [code, setCode] = useState('')
  const [bench, setBench] = useState<BenchmarkSeries | null>(null)
  const [rows, setRows] = useState<EtfRow[]>([])

  useEffect(() => {
    void loadDetail('0050').then((r) => { if (r.ok) setBench(r.benchmark) })
    void loadData().then((r) => { if (r.ok) setRows(r.rankings.etfs) })
  }, [])

  const history = useMemo(() => {
    if (!bench?.start || bench.days.length === 0) return { returns: [], years: 0 }
    const base = Date.parse(`${bench.start}T00:00:00Z`)
    return annualReturnsFrom(bench.days.map((d, i) => ({
      date: new Date(base + d * 86_400_000).toISOString().slice(0, 10),
      value: bench.value[i]!,
    })))
  }, [bench])

  const etf = rows.find((r) => r.code === code) ?? null
  const beta = etf?.risk.beta ?? null
  // 超額報酬取三年期:一年期會被單一年份的市況主導,而十年期多數 ETF 沒有。
  const alpha = etf?.excess.Y3 ?? null
  const canAdjust = beta !== null

  const result = useMemo(() => {
    if (mode === 'bootstrap' && history.returns.length === 0) return null
    let draw: () => number
    if (mode === 'parametric') {
      draw = normalSampler(mean, stdev)
    } else {
      const market = bootstrapSampler(history.returns)
      // 規格 §7.3 模式一:長期歷史抽的是**大盤**,個別 ETF 只用來調整
      // 相對特性(Beta、超額報酬)。直接拿某檔 ETF 的五年歷史抽三十年,
      // 正是這一節要避免的錯誤。
      draw = canAdjust
        ? () => beta! * market() + (alpha ?? 0) / 3
        : market
    }
    return monteCarlo({
      initial, annualWithdrawal: initial * rate, inflation,
      years: YEARS, runs: RUNS, drawReturn: draw,
    })
  }, [mode, history, initial, rate, inflation, mean, stdev, beta, alpha, canAdjust])

  const thin = mode === 'bootstrap' && history.years < MIN_YEARS_FOR_LONG_TERM

  return (
    <ToolPage title="退休金蒙地卡羅回測">
      <ModeSwitch value={mode} onChange={setMode} options={[
        { id: 'bootstrap', label: '歷史 bootstrap' },
        { id: 'parametric', label: '參數化假設' },
      ]} />

      {/* 規格 §7.3 強制顯示:「本模擬基於 N 年歷史資料」 */}
      <p className="tool-mode" role="status">
        {mode === 'bootstrap'
          ? `實據模式:自加權報酬指數的 ${history.years} 個年度報酬有放回抽樣。` +
            (canAdjust
              ? `以 ${code} 的 Beta ${formatNumber(beta)} 與三年超額報酬調整相對特性。`
              : '未選標的,直接以大盤特性模擬。')
          : '假設模式:依你設定的報酬與波動抽樣 —— 此為假設推演,不是預測。'}
      </p>

      {/* 規格 §7.3:N < 10 時顯著警告 */}
      {thin && (
        <p role="alert" className="portfolio__remind">
          僅有 {history.years} 年歷史資料,不足以支撐 {YEARS} 年的長期推論。
          以短歷史模擬長期退休會產生外觀精美、實則無意義的成功率 ——
          請把下面的數字當成示意,不要據此做財務決定。
        </p>
      )}

      <div className="tool-form">
        <Num label="起始資產" value={initial} step={100_000} onChange={setInitial} />
        <Pct label="提領率" value={rate} onChange={setRate} />
        <Pct label="通膨率" value={inflation} onChange={setInflation} />
        {mode === 'parametric' ? (
          <>
            <Pct label="平均年報酬" value={mean} onChange={setMean} />
            <Pct label="年化波動" value={stdev} onChange={setStdev} />
          </>
        ) : (
          <label>調整為某檔 ETF 的特性(可留空)
            <input value={code} list="mc-codes" placeholder="例如 0050"
                   onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </label>
        )}
      </div>
      <datalist id="mc-codes">
        {rows.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
      </datalist>

      {code && !canAdjust && (
        <p className="tool-note">
          {rows.some((r) => r.code === code)
            ? `${code} 沒有 Beta(與大盤重疊的資料不足),因此無法調整相對特性,以下仍以大盤模擬。`
            : `找不到 ${code}。`}
        </p>
      )}

      {result === null ? (
        <p className="chart-empty">還沒有歷史資料可供抽樣,請改用參數化假設。</p>
      ) : (
        <>
          <dl className="cards">
            <Stat label={`${YEARS} 年後未耗盡的比率`}
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
        兩種模式都不是預測,本站也不提供「建議提領率」這類建議。
      </p>
    </ToolPage>
  )
}
