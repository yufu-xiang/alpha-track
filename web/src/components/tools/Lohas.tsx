/**
 * 樂活五線譜。規格 §7.2:以回歸線與標準差通道判斷相對位階。
 *
 * 五條帶狀線是**序數**而非類別:+2σ 到 −2σ 之間有順序關係。
 * 因此不配五個類別色 —— 那會暗示它們是五個互不相干的東西。
 * 改以單一中性色搭配線型(實線/虛線)與粗細承載層級,
 * 價格線是唯一有顏色的一條,識別因此不必依賴顏色辨別能力。
 */
import { useEffect, useMemo, useState } from 'react'
import { loadData, loadDetail } from '../../data/loader'
import { formatDate, formatNumber } from '../../lib/format'
import {
  describePosition, fiveLines, type LohasBands, type LohasPoint,
} from '../../lib/lohas'
import type { EtfRow } from '../../types'
import { Stat, ToolPage } from './shared'

const BOX = { width: 760, height: 320, padX: 52, padY: 16 }

const RANGES = [
  { label: '三年', days: 365 * 3 },
  { label: '五年', days: 365 * 5 },
  { label: '全部', days: null as number | null },
]

export function Lohas() {
  const [code, setCode] = useState('0050')
  const [rangeIdx, setRangeIdx] = useState(0)
  const [rows, setRows] = useState<EtfRow[]>([])
  const [loading, setLoading] = useState(false)
  const [raw, setRaw] = useState<
    { name: string; start: string; days: number[]; adj: number[] } | null
  >(null)

  useEffect(() => {
    void loadData().then((r) => { if (r.ok) setRows(r.rankings.etfs) })
  }, [])

  useEffect(() => {
    if (!code) return
    setLoading(true)
    void loadDetail(code).then((r) => {
      setLoading(false)
      if (!r.ok || !r.detail.series.start) { setRaw(null); return }
      setRaw({
        name: r.detail.name,
        start: r.detail.series.start,
        days: r.detail.series.days,
        adj: r.detail.series.adj,
      })
    })
  }, [code])

  const model = useMemo(() => {
    if (!raw || raw.days.length === 0) return null
    const cutoff = RANGES[rangeIdx]!.days
    const last = raw.days[raw.days.length - 1]!
    const points: LohasPoint[] = []
    raw.days.forEach((d, i) => {
      if (cutoff === null || d >= last - cutoff) points.push({ day: d, price: raw.adj[i]! })
    })
    const bands = fiveLines(points)
    if (!bands) return null
    return { points, bands }
  }, [raw, rangeIdx])

  return (
    <ToolPage title="樂活五線譜">
      <p className="tool-mode">
        實據模式:採用 {raw?.name || code} 的真實還原價,對<strong>對數價格</strong>
        做時間的線性回歸。
      </p>

      <div className="tool-form">
        <label>標的
          <input value={code} list="lohas-codes"
                 onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </label>
      </div>
      <datalist id="lohas-codes">
        {rows.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
      </datalist>

      <div className="chart__ranges" role="toolbar" aria-label="選擇回歸區間">
        {RANGES.map((r, i) => (
          <button key={r.label} type="button" aria-pressed={i === rangeIdx}
                  onClick={() => setRangeIdx(i)}>{r.label}</button>
        ))}
      </div>

      {loading ? <p className="chart-empty">載入中…</p>
        : !model ? <p className="chart-empty">{code} 在這個區間沒有足夠的價格資料。</p>
        : (
          <>
            <LohasChart model={model} name={raw!.name} start={raw!.start} />
            <dl className="cards">
              <Stat label="目前位階"
                    value={`${model.bands.position >= 0 ? '+' : ''}${
                      formatNumber(model.bands.position)}σ`} />
              <Stat label="趨勢線"
                    value={formatNumber(model.bands.tl[model.bands.tl.length - 1]!)} />
              <Stat label="配適期間" value={`${formatNumber(model.bands.years, 1)} 年`} />
            </dl>
            <p className="tool-note">{describePosition(model.bands.position)}。</p>
          </>
        )}

      <p className="tool-note">
        回歸建立在<strong>對數價格</strong>上,因為長期價格是幾何成長的。
        在原始價格上配直線會讓同樣的百分比波動在高價區看起來比低價區大,
        通道右半邊被撐寬、左半邊被壓窄,「現在偏高還偏低」的判斷因此
        系統性偏向早期。
      </p>
      <p className="tool-note">
        <strong>這是統計描述,不是預測。</strong>
        價格回到通道中線沒有任何機制保證 —— 一檔長期走弱的標的會一路
        沿著下傾的趨勢線滑下去,而它在五線譜上始終「不算貴」。
        通道也會隨著你選的區間改變:換一個起點,同一天的位階就不一樣。
      </p>
    </ToolPage>
  )
}

interface Model {
  points: LohasPoint[]
  bands: LohasBands
}

function LohasChart(
  { model, name, start }: { model: Model; name: string; start: string },
) {
  const { points, bands } = model
  const days = points.map((p) => p.day)
  const minDay = days[0]!
  const maxDay = days[days.length - 1]!
  const all = [...points.map((p) => p.price), ...bands.lines.flatMap((l) => l.values)]
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const pad = (hi - lo) * 0.04 || 1
  const minValue = lo - pad
  const maxValue = hi + pad

  const innerW = BOX.width - BOX.padX * 2
  const innerH = BOX.height - BOX.padY * 2
  const xOf = (d: number) =>
    BOX.padX + ((d - minDay) / (maxDay - minDay || 1)) * innerW
  const yOf = (v: number) =>
    BOX.padY + innerH - ((v - minValue) / (maxValue - minValue || 1)) * innerH

  const path = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(days[i]!).toFixed(2)} ${yOf(v).toFixed(2)}`)
      .join(' ')

  const base = Date.parse(`${start}T00:00:00Z`)
  const dateAt = (d: number) => new Date(base + d * 86_400_000).toISOString().slice(0, 10)

  // ±1σ 之間填淡色。填色承擔「常態區間」的意思,省下兩個圖例項目。
  const bandFill = [...bands.lines[1]!.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${
    xOf(days[i]!).toFixed(2)} ${yOf(v).toFixed(2)}`),
    ...[...bands.lines[3]!.values].reverse().map((v, i) => {
      const idx = days.length - 1 - i
      return `L${xOf(days[idx]!).toFixed(2)} ${yOf(v).toFixed(2)}`
    }), 'Z'].join(' ')

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${BOX.width} ${BOX.height}`} className="chart__svg" role="img"
           aria-label={`${name}的樂活五線譜,目前位階 ${bands.position.toFixed(2)} 個標準差`}>
        <path className="lohas__band" d={bandFill} />
        {bands.lines.map((l) => (
          <path key={l.label} d={path(l.values)}
                className={`lohas__line lohas__line--${
                  l.sigma === 0 ? 'tl' : Math.abs(l.sigma) === 1 ? 'one' : 'two'}`} />
        ))}
        <path className="chart__line chart__line--main" d={path(points.map((p) => p.price))} />

        {bands.lines.map((l) => (
          <text key={l.label} className="chart__tick" x={BOX.width - BOX.padX + 4}
                y={yOf(l.values[l.values.length - 1]!) + 4}>
            {l.sigma === 0 ? 'TL' : `${l.sigma > 0 ? '+' : '−'}${Math.abs(l.sigma)}σ`}
          </text>
        ))}

        <text className="chart__tick" x={BOX.padX} y={BOX.height - 2}>
          {formatDate(dateAt(minDay))}
        </text>
        <text className="chart__tick" x={BOX.width - BOX.padX} y={BOX.height - 2}
              textAnchor="end">
          {formatDate(dateAt(maxDay))}
        </text>
      </svg>
      <figcaption className="chart__legend">
        <span className="chart__key chart__key--main">{name} 還原價</span>
        <span className="chart__note">
          趨勢線為對數價格的線性回歸;帶狀為殘差的 ±1σ,虛線為 ±2σ
        </span>
      </figcaption>
    </figure>
  )
}
