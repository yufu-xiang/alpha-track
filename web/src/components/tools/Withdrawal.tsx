/** 退休提領計算。規格 §7.2。 */
import { useState } from 'react'
import { formatMoney } from '../../lib/format'
import { simulateWithdrawal, yearsUntilDepleted } from '../../lib/retirement'
import { Num, Pct, Stat, ToolPage } from './shared'

const YEARS = 40

export function Withdrawal() {
  const [initial, setInitial] = useState(10_000_000)
  const [rate, setRate] = useState(0.04)
  const [ret, setRet] = useState(0.05)
  const [inflation, setInflation] = useState(0.02)

  const withdrawal = initial * rate
  const input = {
    initial, annualWithdrawal: withdrawal, annualReturn: ret, inflation, years: YEARS,
  }
  const depleted = yearsUntilDepleted(input)
  const path = simulateWithdrawal(input)

  return (
    <ToolPage title="退休提領計算">
      <p className="tool-mode">
        假設模式:報酬率是固定值,不會有任何一年下跌。真實市場不是這樣 ——
        想看波動的影響請用<a href="#/tools/monte-carlo">蒙地卡羅回測</a>。
      </p>

      <div className="tool-form">
        <Num label="起始資產" value={initial} step={100_000} onChange={setInitial} />
        <Pct label="提領率" value={rate} onChange={setRate} />
        <Pct label="年化報酬" value={ret} onChange={setRet} />
        <Pct label="通膨率" value={inflation} onChange={setInflation} />
      </div>

      <dl className="cards">
        <Stat label="第一年提領" value={formatMoney(withdrawal)} />
        <Stat label={`可支撐年數(試算 ${YEARS} 年)`}
              value={depleted === null ? `撐過 ${YEARS} 年` : `${depleted} 年後耗盡`}
              tone={depleted === null ? undefined : 'warn'} />
        <Stat label={`第 ${YEARS} 年提領(已隨通膨墊高)`}
              value={formatMoney(withdrawal * (1 + inflation) ** (YEARS - 1))} />
      </dl>

      <div className="table-wrap">
        <table>
          <caption className="tool-caption">
            餘額為名目金額。提領金額逐年隨通膨墊高,所以後段的提領看起來很大 ——
            那不是變有錢,是同樣的生活水準需要更多錢。
          </caption>
          <thead>
            <tr><th>年</th><th>該年提領</th><th>年末餘額</th></tr>
          </thead>
          <tbody>
            {path.filter((_, i) => (i + 1) % 5 === 0 || i === path.length - 1)
                 .map((y) => (
              <tr key={y.year}>
                <td>第 {y.year} 年</td>
                <td>{formatMoney(y.withdrawal)}</td>
                <td>{y.balance <= 0
                  ? <span className="is-depleted">已耗盡</span>
                  : formatMoney(y.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="tool-note">
        提領發生在年初、報酬計入年末 —— 錢先離開,剩下的才參與市場。
        反過來算會系統性高估可支撐年數。
        提領率是<strong>你填的參數</strong>,不是本站的建議值。
      </p>
    </ToolPage>
  )
}
