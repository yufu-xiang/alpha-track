/** 財務自由試算(FIRE)。規格 §7.2。 */
import { useState } from 'react'
import { formatMoney, formatPercent } from '../../lib/format'
import { yearsToFire } from '../../lib/invest'
import { Num, Pct, Stat, ToolPage } from './shared'

export function Fire() {
  const [spending, setSpending] = useState(600_000)
  const [assets, setAssets] = useState(1_000_000)
  const [income, setIncome] = useState(1_000_000)
  const [savings, setSavings] = useState(500_000)
  const [ret, setRet] = useState(0.06)
  const [rate, setRate] = useState(0.04)

  const r = yearsToFire({
    annualSpending: spending, currentAssets: assets,
    annualSavings: savings, annualReturn: ret, withdrawalRate: rate,
  })
  const savingsRate = income > 0 ? savings / income : null

  return (
    <ToolPage title="財務自由試算(FIRE)">
      <p className="tool-mode">
        假設模式:報酬率固定、收支不變。這兩個假設在三十年的尺度上都不成立,
        所以請把結果當成「照這個步調大概是這個量級」,不是一個到達日期。
      </p>

      <div className="tool-form">
        <Num label="年支出" value={spending} step={50_000} onChange={setSpending} />
        <Num label="年收入" value={income} step={50_000} onChange={setIncome} />
        <Num label="每年可存" value={savings} step={50_000} onChange={setSavings} />
        <Num label="目前資產" value={assets} step={100_000} onChange={setAssets} />
        <Pct label="年化報酬" value={ret} onChange={setRet} />
        <Pct label="提領率" value={rate} onChange={setRate} />
      </div>

      <dl className="cards">
        <Stat label="所需資產" value={formatMoney(r.target)} />
        <Stat label="儲蓄率"
              value={savingsRate === null ? '—'
                   : formatPercent(savingsRate, 1).replace('+', '')} />
        <Stat label="還需年數"
              value={r.years === null ? '這組參數下達不到'
                   : r.years === 0 ? '已達成' : `${r.years} 年`}
              tone={r.years === null ? 'warn' : undefined} />
      </dl>

      {savings > income - spending && income > 0 && (
        <p role="alert" className="portfolio__remind">
          「每年可存」超過了年收入減年支出({formatMoney(income - spending)})。
          這組數字自相矛盾,算出來的年數會過度樂觀。
        </p>
      )}

      <p className="tool-note">
        所需資產 = 年支出 ÷ 提領率。提領率是<strong>你填的參數</strong>,
        不是本站的建議值 —— 4% 出自 1990 年代對美國市場的歷史研究,
        不必然適用於台股、也不必然適用於你的退休年期。
        想看這筆錢在有波動的市場裡撐不撐得住,請用
        <a href="#/tools/monte-carlo">蒙地卡羅回測</a>。
      </p>
    </ToolPage>
  )
}
