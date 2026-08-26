/** 融資維持率計算。規格 §7.2。規則的查證見 lib/margin.ts。 */
import { useEffect, useState } from 'react'
import { loadData } from '../../data/loader'
import { formatMoney, formatPercent } from '../../lib/format'
import { MAINTENANCE_THRESHOLD, MARGIN_RATIOS, marginPosition } from '../../lib/margin'
import type { EtfRow } from '../../types'
import { Num, Pct, Stat, ToolPage } from './shared'

export function Margin() {
  const [code, setCode] = useState('')
  const [shares, setShares] = useState(1000)
  const [buyPrice, setBuyPrice] = useState(100)
  const [currentPrice, setCurrentPrice] = useState(100)
  const [ratio, setRatio] = useState<number>(MARGIN_RATIOS.etf)
  const [rows, setRows] = useState<EtfRow[]>([])

  useEffect(() => {
    void loadData().then((r) => { if (r.ok) setRows(r.rankings.etfs) })
  }, [])

  const etf = rows.find((r) => r.code === code) ?? null
  // 選到標的就用今天的真實收盤價當現價(規格 §7.1 的實據模式)。
  useEffect(() => {
    if (etf) setCurrentPrice(etf.close)
  }, [etf?.code, etf?.close])

  const r = marginPosition({ shares, buyPrice, marginRatio: ratio, currentPrice })
  const breached = r.ratio !== null && r.ratio < MAINTENANCE_THRESHOLD

  return (
    <ToolPage title="融資維持率計算">
      <p className="tool-mode">
        {etf
          ? `實據模式:現價採用 ${etf.name} 今日收盤 ${etf.close}。`
          : '假設模式:現價由你自填。輸入代號即可改用今日真實收盤價。'}
      </p>

      {etf && (etf.is_leveraged || etf.is_inverse) && (
        <p role="alert" className="portfolio__remind">
          {etf.code} 是槓桿/反向型 ETF。這類標的本身已內含槓桿,
          <strong>多數券商不開放融資</strong> —— 下面的數字只是算術,
          不代表這筆交易做得成。
        </p>
      )}

      <div className="tool-form">
        <label>標的(可留空)
          <input value={code} list="margin-codes" placeholder="例如 0050"
                 onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </label>
        <Num label="股數" value={shares} step={1000} onChange={setShares} />
        <Num label="買進價" value={buyPrice} step={0.05} onChange={setBuyPrice} />
        <Num label="現價" value={currentPrice} step={0.05} onChange={setCurrentPrice} />
        <Pct label="融資成數" value={ratio} onChange={setRatio} step={5} />
      </div>
      <datalist id="margin-codes">
        {rows.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
      </datalist>

      <dl className="cards">
        <Stat label="融資金額" value={formatMoney(r.loan)} />
        <Stat label="自備款" value={formatMoney(r.ownFunds)} />
        {/* 安全的狀態不上色。本站的綠色是「跌」的意思(台股慣例漲紅跌綠),
            拿它來表示「安全」會被讀成完全相反的訊息。只有跌破門檻才標色,
            而且用的是警告色,不是漲跌色。 */}
        <Stat label="目前維持率"
              value={r.ratio === null ? '未使用融資'
                   : formatPercent(r.ratio, 1).replace('+', '')}
              tone={breached ? 'warn' : undefined} />
        <Stat label="追繳價位"
              value={r.marginCallPrice === null ? '—'
                   : formatMoney(r.marginCallPrice, 2)} />
        <Stat label={breached ? '需漲回' : '還可跌'}
              value={r.bufferToCall === null ? '—' : formatPercent(r.bufferToCall)} />
      </dl>

      <p className="tool-note">
        <strong>本工具算的是單一部位,而券商看的是整戶。</strong>
        追繳門檻是<strong>整戶擔保維持率
        {formatPercent(MAINTENANCE_THRESHOLD, 0).replace('+', '')}</strong>
        (2015 年起,在那之前是 120%),判斷基準是帳戶內所有擔保品市值對融資總額。
        某一檔跌破 130% 不必然被追繳 —— 若你還有其他部位撐著,整戶可能仍安全。
        反過來也成立:這一檔看起來沒事,整戶仍可能已經跌破。
        會在帳戶其實安全時嚇到自己賣出的,正是把單一部位當成整戶來看。
      </p>
      <p className="tool-note">
        融資成數上限:上市股 {formatPercent(MARGIN_RATIOS.listed, 0).replace('+', '')}、
        上櫃股 {formatPercent(MARGIN_RATIOS.otc, 0).replace('+', '')}、
        ETF {formatPercent(MARGIN_RATIOS.etf, 0).replace('+', '')}。
        實際成數依券商與標的當時狀態而定,可能更低。
      </p>
    </ToolPage>
  )
}
