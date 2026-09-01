import { formatMoney, formatNumber, formatPercent } from '../lib/format'
import type { PositionAnalysis } from '../lib/portfolio'
import { hashFor } from '../lib/route'

interface Props {
  positions: PositionAnalysis[]
  names: Map<string, string>
  onTargetsChange: (targets: Record<string, number>) => void
}

export function PortfolioPositions({ positions, names, onTargetsChange }: Props) {
  const activeTargets = Object.fromEntries(
    positions.flatMap((position) => position.targetWeight === null
      ? [] : [[position.code, position.targetWeight]]),
  )
  const targetTotal = Object.values(activeTargets).reduce((sum, weight) => sum + weight, 0)
  const allTargeted = positions.length > 0
    && positions.every((position) => position.targetWeight !== null)
  const untargeted = positions.filter((position) => position.targetWeight === null).length
  const allocationReady = allTargeted && Math.abs(targetTotal - 1) < 0.0005
  const pricesReady = positions.every((position) => position.marketValue !== null)
  const targetsReady = allocationReady && pricesReady
  const largest = [...positions]
    .filter((position) => position.weight !== null)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0]
  const adjustments = targetsReady
    ? positions.filter((position) => Math.abs(position.rebalanceAmount ?? 0) >= 1).length
    : null

  function setTarget(code: string, raw: string) {
    const next = { ...activeTargets }
    if (raw === '') delete next[code]
    else {
      const percent = Number(raw)
      if (!Number.isFinite(percent)) return
      next[code] = Math.max(0, Math.min(100, percent)) / 100
    }
    onTargetsChange(next)
  }

  function useCurrentWeights() {
    onTargetsChange(Object.fromEntries(positions.flatMap((position) =>
      position.weight === null ? [] : [[position.code, position.weight]])))
  }

  function useEqualWeights() {
    if (positions.length === 0) return
    const weight = 1 / positions.length
    onTargetsChange(Object.fromEntries(positions.map((position) => [position.code, weight])))
  }

  return (
    <section className="content-panel portfolio-positions">
      <div className="panel-heading portfolio-positions__heading">
        <div><p className="eyebrow">POSITIONS & REBALANCING</p><h2>持倉明細與再平衡</h2></div>
        <span>{positions.length} 檔持倉</span>
      </div>

      <div className="portfolio-position-summary" aria-label="持倉洞察">
        <div><span>持有標的</span><strong>{positions.length}</strong><small>檔 ETF</small></div>
        <div>
          <span>最大部位</span>
          <strong>{largest?.code ?? '—'}</strong>
          <small>{largest ? cleanPercent(largest.weight) : '尚無資料'}</small>
        </div>
        <div className={targetsReady ? 'is-ready' : ''}>
          <span>目標配置</span>
          <strong>{Object.keys(activeTargets).length === 0
            ? '待設定' : cleanPercent(targetTotal)}</strong>
          <small>{targetsReady
            ? adjustments === 0 ? '目前符合目標' : `${adjustments} 檔需要調整`
            : untargeted > 0 && Object.keys(activeTargets).length > 0
              ? `${untargeted} 檔尚未設定`
              : allocationReady && !pricesReady ? '部分現價缺失' : '合計需為 100%'}</small>
        </div>
      </div>

      <div className="rebalance-toolbar">
        <div>
          <strong>設定目標比例</strong>
          <span>先建立配置目標，再查看各檔應調整的估算金額。</span>
        </div>
        <div className="rebalance-toolbar__actions">
          <button type="button" onClick={useCurrentWeights}>帶入目前比例</button>
          <button type="button" onClick={useEqualWeights}>設定等權目標</button>
          <button type="button" className="is-ghost"
                  disabled={Object.keys(activeTargets).length === 0}
                  onClick={() => onTargetsChange({})}>清除目標</button>
        </div>
      </div>

      {!targetsReady && Object.keys(activeTargets).length > 0 && (
        <p className="rebalance-warning" role="status">
          {untargeted > 0
            ? `目前目標合計為 ${cleanPercent(targetTotal)}，尚有 ${untargeted} 檔未設定。`
            : allocationReady && !pricesReady
              ? '部分持倉缺少現價，暫時無法估算再平衡金額。'
              : `目前目標合計為 ${cleanPercent(targetTotal)}，請調整至 100%。`}
        </p>
      )}

      <div className="table-wrap">
        <table className="positions-table">
          <thead>
            <tr>
              <th>標的</th><th>持有股數</th><th>平均成本</th><th>現價</th>
              <th>市值</th><th>目前占比</th><th>未實現損益</th><th>報酬率</th>
              <th>目標比例</th><th>配置偏差</th><th>調整估算</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => {
              const drift = position.weight === null || position.targetWeight === null
                ? null : position.weight - position.targetWeight
              return (
                <tr key={position.code}>
                  <td>
                    <a href={hashFor({ name: 'detail', code: position.code })}>{position.code}</a>
                    <small>{names.get(position.code) ?? '名稱未提供'}</small>
                  </td>
                  <td>{formatNumber(position.shares, 0)}</td>
                  <td>{formatMoney(position.avgCost, 2)}</td>
                  <td>{formatMoney(position.price, 2)}</td>
                  <td>{formatMoney(position.marketValue)}</td>
                  <td>{cleanPercent(position.weight)}</td>
                  <td className={tone(position.unrealized)}>{formatMoney(position.unrealized)}</td>
                  <td className={tone(position.returnRate)}>{formatPercent(position.returnRate)}</td>
                  <td>
                    <label className="target-input">
                      <span className="sr-only">{position.code} 目標配置</span>
                      <input type="number" min="0" max="100" step="0.1"
                             aria-label={`${position.code} 目標配置`}
                             value={targetValue(position.targetWeight)}
                             onChange={(event) => setTarget(position.code, event.target.value)} />
                      <b aria-hidden="true">%</b>
                    </label>
                  </td>
                  <td className={Math.abs(drift ?? 0) >= 0.05 ? 'rebalance-drift' : ''}>
                    {drift === null ? '—' : formatPercent(drift)}
                  </td>
                  <td><RebalanceAction ready={targetsReady} amount={position.rebalanceAmount} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="rebalance-note" role="note">
        調整估算以目前總市值與最新收盤價計算，不含手續費、交易稅與盤中價格變動；
        這是配置規劃工具，不會自動下單。
      </p>
    </section>
  )
}

function RebalanceAction({ ready, amount }: { ready: boolean; amount: number | null }) {
  if (!ready || amount === null) return <span className="rebalance-action">設定目標後顯示</span>
  if (Math.abs(amount) < 1) return <span className="rebalance-action is-hold">維持</span>
  return (
    <span className={`rebalance-action ${amount > 0 ? 'is-buy' : 'is-sell'}`}>
      <b>{amount > 0 ? '買進' : '賣出'}</b>
      {formatMoney(Math.abs(amount))}
    </span>
  )
}

function targetValue(value: number | null): string {
  if (value === null) return ''
  return String(Number((value * 100).toFixed(2)))
}

function cleanPercent(value: number | null): string {
  return formatPercent(value).replace('+', '')
}

function tone(value: number | null): string {
  return value === null || value === 0 ? '' : value > 0 ? 'gain' : 'loss'
}
