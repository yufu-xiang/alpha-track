import type { JourneyProgress } from '../lib/journey'
import { hashFor } from '../lib/route'

interface Props {
  progress: JourneyProgress
  compareCodes: string[]
  onExplore: () => void
  onDismiss: () => void
}

export function JourneyGuide({ progress, compareCodes, onExplore, onDismiss }: Props) {
  const steps = [
    {
      id: 'watch', title: '收藏標的', description: '先留下感興趣的 ETF',
      done: progress.watched,
    },
    {
      id: 'compare', title: '並排比較', description: '至少選兩檔看報酬與風險',
      done: progress.compared,
    },
    {
      id: 'record', title: '建立組合', description: '記錄第一筆實際交易',
      done: progress.recorded,
    },
    {
      id: 'balance', title: '設定目標', description: '用配置差異規劃再平衡',
      done: progress.balanced,
    },
  ]
  const next = steps.findIndex((step) => !step.done)
  const nextIndex = next < 0 ? steps.length : next
  const portfolioHref = hashFor({ name: 'portfolio' })

  let action = <a href={portfolioHref}>查看我的組合</a>
  if (nextIndex === 0) {
    action = <button type="button" onClick={onExplore}>開始收藏 ETF</button>
  } else if (nextIndex === 1) {
    action = progress.compared
      ? <a href={hashFor({ name: 'compare', codes: compareCodes })}>查看比較結果</a>
      : <button type="button" onClick={onExplore}>挑選 ETF 來比較</button>
  } else if (nextIndex === 2) {
    action = <a href={portfolioHref}>建立第一筆交易</a>
  } else if (nextIndex === 3) {
    action = <a href={portfolioHref}>設定目標配置</a>
  }

  return (
    <section className={`journey-guide${next < 0 ? ' is-complete' : ''}`}
             aria-labelledby="journey-title">
      <div className="journey-guide__heading">
        <div>
          <p className="eyebrow">QUICK START</p>
          <h2 id="journey-title">把研究變成可執行的投資流程</h2>
          <p>資料會自動保留在這台裝置，下次可接著完成。</p>
        </div>
        <div className="journey-guide__meta">
          <span>{progress.completed} / {steps.length} 完成</span>
          <button type="button" aria-label="關閉使用導覽" onClick={onDismiss}>×</button>
        </div>
      </div>

      <div className="journey-progress" role="progressbar" aria-label="投資流程完成度"
           aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={progress.completed}>
        <i style={{ width: `${progress.completed / steps.length * 100}%` }} />
      </div>

      <ol className="journey-steps">
        {steps.map((step, index) => (
          <li key={step.id}
              className={`${step.done ? 'is-done' : ''}${index === next ? ' is-next' : ''}`}>
            <span aria-hidden="true">{step.done ? '✓' : index + 1}</span>
            <div><strong>{step.title}</strong><small>{step.description}</small></div>
          </li>
        ))}
      </ol>

      <div className="journey-guide__next">
        <span>{next < 0 ? '流程已完成，可以定期回來檢查配置。' : `建議下一步：${steps[next]!.title}`}</span>
        {action}
      </div>
    </section>
  )
}
