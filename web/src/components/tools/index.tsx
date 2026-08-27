/**
 * 工具分頁。規格 §7.4:理財工具集中於獨立的「工具」分頁,**每個工具一頁**。
 *
 * 一頁一工具而非長捲軸的理由不只是規格:每個工具的參數面板都不一樣,
 * 疊在同一頁時使用者會分不清哪一組輸入對應哪一組結果 ——
 * 而這些結果是拿來做財務決定的。
 */
import { hashFor } from '../../lib/route'
import { Correlation } from './Correlation'
import { Dca } from './Dca'
import { Fire } from './Fire'
import { Lohas } from './Lohas'
import { Margin } from './Margin'
import { MonteCarlo } from './MonteCarlo'
import { Overlap } from './Overlap'
import { LiquidityRanking, YieldRanking } from './Ranking'
import { Reinvest } from './Reinvest'
import { Withdrawal } from './Withdrawal'

interface ToolEntry {
  id: string
  title: string
  blurb: string
  Component: () => JSX.Element
}

export const TOOLS: ToolEntry[] = [
  {
    id: 'withdrawal',
    title: '退休提領計算',
    blurb: '固定報酬下,資產能撐幾年。提領金額逐年隨通膨調整。',
    Component: Withdrawal,
  },
  {
    id: 'monte-carlo',
    title: '退休金蒙地卡羅回測',
    blurb: '以加權報酬指數的長期歷史抽樣,輸出各年餘額的百分位區間。',
    Component: MonteCarlo,
  },
  {
    id: 'dca',
    title: '單筆 vs 定期定額',
    blurb: '用某檔 ETF 的真實歷史月收盤,回測兩種投入方式的差異。',
    Component: Dca,
  },
  {
    id: 'reinvest',
    title: '股息再投入試算',
    blurb: '用真實配息紀錄比較「再投入」與「領現金」的長期差異。',
    Component: Reinvest,
  },
  {
    id: 'margin',
    title: '融資維持率計算',
    blurb: '依持股市值與融資金額算維持率與追繳價位。',
    Component: Margin,
  },
  {
    id: 'overlap',
    title: 'ETF 成分股重疊度',
    blurb: '前十大持股的共同質量。資料來自公會月報,不是完整持股。',
    Component: Overlap,
  },
  {
    id: 'correlation',
    title: 'ETF 報酬相關性',
    blurb: '最多五檔的相關係數矩陣,看一起買到底分不分散。',
    Component: Correlation,
  },
  {
    id: 'yield',
    title: 'ETF 殖利率排行',
    blurb: '近一年實際配息 ÷ 現價,與同期總報酬並列對照。',
    Component: YieldRanking,
  },
  {
    id: 'liquidity',
    title: 'ETF 流動性排行',
    blurb: '近月日均成交金額。排的是金額不是股數。',
    Component: LiquidityRanking,
  },
  {
    id: 'lohas',
    title: '樂活五線譜',
    blurb: '以對數價格的回歸線與標準差通道,看目前處在這段期間的什麼位階。',
    Component: Lohas,
  },
  {
    id: 'fire',
    title: '財務自由試算',
    blurb: '依儲蓄率與目標支出推算達成財務自由所需年數。',
    Component: Fire,
  },
]

export function Tools({ tool }: { tool: string | null }) {
  const entry = TOOLS.find((t) => t.id === tool)
  if (entry) return <entry.Component />

  return (
    <main className="app detail">
      <p className="app__nav">
        <a href={hashFor({ name: 'rankings' })}>← 回排行榜</a>
      </p>
      <h1>理財工具</h1>
      <p className="detail__caveat" role="note">
        以下工具皆為<strong>試算</strong>,不是預測,也不構成投資建議。
        本站不提供「建議提領率」這類規範性建議 —— 工具呈現計算結果,
        判斷由你自己做。
      </p>

      {tool !== null && (
        <p role="alert" className="portfolio__remind">
          找不到名為「{tool}」的工具。以下是全部工具。
        </p>
      )}

      <ul className="tool-list">
        {TOOLS.map((t) => (
          <li key={t.id}>
            <a href={hashFor({ name: 'tools', tool: t.id })}>{t.title}</a>
            <span>{t.blurb}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
