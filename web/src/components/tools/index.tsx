/**
 * 工具分頁。規格 §7.4:理財工具集中於獨立的「工具」分頁,**每個工具一頁**。
 *
 * 一頁一工具而非長捲軸的理由不只是規格:每個工具的參數面板都不一樣,
 * 疊在同一頁時使用者會分不清哪一組輸入對應哪一組結果 ——
 * 而這些結果是拿來做財務決定的。
 */
import { useState } from 'react'
import { hashFor } from '../../lib/route'
import { PageShell } from '../PageShell'
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
  group: '退休規劃' | '投資試算' | '風險分析' | '市場觀察'
  marker: string
  Component: () => JSX.Element
}

export const TOOLS: ToolEntry[] = [
  {
    id: 'withdrawal',
    title: '退休提領計算',
    blurb: '固定報酬下,資產能撐幾年。提領金額逐年隨通膨調整。',
    group: '退休規劃', marker: '01',
    Component: Withdrawal,
  },
  {
    id: 'monte-carlo',
    title: '退休金蒙地卡羅回測',
    blurb: '以加權報酬指數的長期歷史抽樣,輸出各年餘額的百分位區間。',
    group: '退休規劃', marker: '02',
    Component: MonteCarlo,
  },
  {
    id: 'dca',
    title: '單筆 vs 定期定額',
    blurb: '用某檔 ETF 的真實歷史月收盤,回測兩種投入方式的差異。',
    group: '投資試算', marker: '03',
    Component: Dca,
  },
  {
    id: 'reinvest',
    title: '股息再投入試算',
    blurb: '用真實配息紀錄比較「再投入」與「領現金」的長期差異。',
    group: '投資試算', marker: '04',
    Component: Reinvest,
  },
  {
    id: 'margin',
    title: '融資維持率計算',
    blurb: '依持股市值與融資金額算維持率與追繳價位。',
    group: '風險分析', marker: '05',
    Component: Margin,
  },
  {
    id: 'overlap',
    title: 'ETF 成分股重疊度',
    blurb: '前十大持股的共同質量。資料來自公會月報,不是完整持股。',
    group: '風險分析', marker: '06',
    Component: Overlap,
  },
  {
    id: 'correlation',
    title: 'ETF 報酬相關性',
    blurb: '最多五檔的相關係數矩陣,看一起買到底分不分散。',
    group: '風險分析', marker: '07',
    Component: Correlation,
  },
  {
    id: 'yield',
    title: 'ETF 殖利率排行',
    blurb: '近一年實際配息 ÷ 現價,與同期總報酬並列對照。',
    group: '市場觀察', marker: '08',
    Component: YieldRanking,
  },
  {
    id: 'liquidity',
    title: 'ETF 流動性排行',
    blurb: '近月日均成交金額。排的是金額不是股數。',
    group: '市場觀察', marker: '09',
    Component: LiquidityRanking,
  },
  {
    id: 'lohas',
    title: '樂活五線譜',
    blurb: '以對數價格的回歸線與標準差通道,看目前處在這段期間的什麼位階。',
    group: '市場觀察', marker: '10',
    Component: Lohas,
  },
  {
    id: 'fire',
    title: '財務自由試算',
    blurb: '依儲蓄率與目標支出推算達成財務自由所需年數。',
    group: '退休規劃', marker: '11',
    Component: Fire,
  },
]

const GROUP_CLASS: Record<ToolEntry['group'], string> = {
  '退休規劃': 'retirement',
  '投資試算': 'investing',
  '風險分析': 'risk',
  '市場觀察': 'market',
}

const TOOL_GROUPS = ['全部', '退休規劃', '投資試算', '風險分析', '市場觀察'] as const
type ToolGroupFilter = typeof TOOL_GROUPS[number]

function ToolGroupIcon({ group }: { group: ToolEntry['group'] }) {
  if (group === '退休規劃') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" />
        <path d="M12 7.5v5l3.4 2" />
      </svg>
    )
  }
  if (group === '投資試算') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 18V12M10 18V8M15 18v-5M4 6.5l5-2 5 2 5-3" />
        <path d="m16.5 3.5 2.5 0 0 2.5" />
      </svg>
    )
  }
  if (group === '風險分析') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.5 19 6v5.2c0 4.3-2.8 7.5-7 9.3-4.2-1.8-7-5-7-9.3V6l7-2.5Z" />
        <path d="M12 8v4.5M12 16h.01" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 18.5h16M5.5 16l4-4 3 2 5.5-7" />
      <path d="m15 7 3-.2.2 3" />
    </svg>
  )
}

export function Tools({ tool }: { tool: string | null }) {
  const [group, setGroup] = useState<ToolGroupFilter>('全部')
  const entry = TOOLS.find((t) => t.id === tool)
  if (entry) return <entry.Component />

  const shownTools = group === '全部' ? TOOLS : TOOLS.filter((t) => t.group === group)

  return (
    <PageShell
      active="tools"
      eyebrow="FINANCIAL TOOLKIT"
      title="理財工具"
      description="從退休規劃到 ETF 風險分析，用實際資料與透明假設回答常見投資問題。"
      backHref={hashFor({ name: 'rankings' })}
      meta={<span className="page-stat"><strong>{TOOLS.length}</strong> 項工具</span>}
    >
      <div className="tools-disclaimer" role="note">
        <span aria-hidden="true">i</span>
        <p>
          以下工具皆為<strong>試算</strong>，不是預測，也不構成投資建議。
          本站不提供「建議提領率」等規範性建議；工具呈現計算結果，判斷由你自己做。
        </p>
      </div>

      {tool !== null && (
        <p role="alert" className="portfolio__remind">
          找不到名為「{tool}」的工具。以下是全部工具。
        </p>
      )}

      <div className="tool-browser-bar">
        <div className="tool-group-filter" role="toolbar" aria-label="篩選工具分類">
          {TOOL_GROUPS.map((value) => (
            <button key={value} type="button" aria-pressed={group === value}
                    onClick={() => setGroup(value)}>
              {value}
            </button>
          ))}
        </div>
        <span>顯示 {shownTools.length} / {TOOLS.length} 項</span>
      </div>

      <ul className="tool-list tool-grid">
        {shownTools.map((t) => (
          <li key={t.id} className={`tool-card tool-card--${GROUP_CLASS[t.group]}`}>
            <a href={hashFor({ name: 'tools', tool: t.id })} aria-label={t.title}>
              <span className="tool-card__topline">
                <span className="tool-card__marker">
                  <ToolGroupIcon group={t.group} />
                  <small>{t.marker}</small>
                </span>
                <span className="tool-card__group">{t.group}</span>
              </span>
              <strong>{t.title}</strong>
              <span className="tool-card__blurb">{t.blurb}</span>
              <span className="tool-card__cta">開啟工具 <b aria-hidden="true">→</b></span>
            </a>
          </li>
        ))}
      </ul>
    </PageShell>
  )
}
