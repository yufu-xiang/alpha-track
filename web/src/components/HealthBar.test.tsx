import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fixtureMeta } from '../data/fixture'
import { HealthBar } from './HealthBar'

const NOW = new Date('2026-08-21T20:00:00+08:00')

/** 一切正常的 meta。刻意不直接用 fixtureMeta —— 它帶著一筆未分類,
 *  測試應該自己建構要測的狀態,而不是依賴 fixture 恰好乾淨。 */
const healthy = { ...fixtureMeta, unclassified: [], anomalies: [] }

describe('HealthBar', () => {
  it('一切正常時顯示更新日期與正常字樣', () => {
    render(<HealthBar meta={healthy} now={NOW} />)
    expect(screen.getByText(/2026\/08\/21/)).toBeInTheDocument()
    expect(screen.getByText(/全部正常/)).toBeInTheDocument()
  })

  it('有未分類標的時列出數量', () => {
    render(
      <HealthBar
        meta={{ ...healthy, unclassified: ['00999', '00998'] }}
        now={NOW}
      />,
    )
    expect(screen.getByText(/2 檔未分類/)).toBeInTheDocument()
  })

  it('有異常標的時列出數量', () => {
    render(
      <HealthBar
        meta={{ ...healthy, anomalies: [{ code: '0056', reason: '單日變動異常' }] }}
        now={NOW}
      />,
    )
    expect(screen.getByText(/1 檔價格異常/)).toBeInTheDocument()
  })

  it('資料標記為 stale 時顯示未更新警告', () => {
    render(<HealthBar meta={{ ...healthy, is_stale: true }} now={NOW} />)
    expect(screen.getByText(/資料未更新/)).toBeInTheDocument()
  })

  it('資料超過三天未更新時顯示顯著警告', () => {
    render(<HealthBar meta={{ ...healthy, data_date: '2026-08-10' }} now={NOW} />)
    const warning = screen.getByRole('alert')
    expect(warning).toHaveTextContent(/11 天未更新/)
  })

  it('正常狀態不使用 alert role —— 避免警告疲乏', () => {
    render(<HealthBar meta={healthy} now={NOW} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('未分類與價格異常不觸發 alert —— 那是給維護者的提示,不是給讀者的警告', () => {
    render(
      <HealthBar
        meta={{ ...healthy, unclassified: ['00999'],
                anomalies: [{ code: '0056', reason: 'x' }] }}
        now={NOW}
      />,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('HealthBar 大盤對照', () => {
  it('顯示大盤同期漲幅 —— 沒有它,整張表的數字無從判讀', () => {
    render(<HealthBar meta={{ ...healthy, benchmark_return_1y: 0.9185 }} now={NOW} />)
    expect(screen.getByText(/大盤一年 \+91\.85%/)).toBeInTheDocument()
  })

  it('沒有大盤資料時不顯示該段,而非顯示破折號', () => {
    render(<HealthBar meta={{ ...healthy, benchmark_return_1y: null }} now={NOW} />)
    expect(screen.queryByText(/大盤一年/)).not.toBeInTheDocument()
  })
})

describe('來源層級的問題(代號 *)', () => {
  // 與既有測試一致地固定 now —— 不固定的話 fixture 的 data_date 會隨
  // 真實日期變舊而觸發「已 N 天未更新」,把要驗的訊號蓋掉。
  const NOW = new Date('2026-08-21T12:00:00Z')

  const sourceIssue = {
    code: '*',
    reason: '今日完全沒有淨值資料,折溢價無法計算,而淨值來源沒有歷史、這一天補不回來',
  }

  it('把原因整句寫出來,不是計數', () => {
    // 使用者需要知道的是「哪一個來源、後果是什麼」,不是「有幾個問題」。
    render(<HealthBar meta={{ ...fixtureMeta, anomalies: [sourceIssue] }} now={NOW} />)
    expect(screen.getByText(/淨值來源沒有歷史/)).toBeInTheDocument()
  })

  it('升級成 alert —— 來源靜默回空時畫面上的數字看起來完全正常', () => {
    render(<HealthBar meta={{ ...fixtureMeta, anomalies: [sourceIssue] }} now={NOW} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('不與「N 檔價格異常」混為一談', () => {
    // 「淨值來源掛了」說成「1 檔價格異常」是完全不同的嚴重度。
    render(<HealthBar meta={{ ...fixtureMeta, anomalies: [sourceIssue] }} now={NOW} />)
    expect(screen.queryByText(/檔價格異常/)).not.toBeInTheDocument()
  })

  it('個股層級的異常仍然只計數,且不升級成 alert', () => {
    render(<HealthBar meta={{
      ...fixtureMeta,
      anomalies: [{ code: '00631L', reason: '單日變動 +40% 超過門檻' }],
    }} now={NOW} />)
    expect(screen.getByText(/1 檔價格異常/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('兩種混在一起時各自呈現', () => {
    render(<HealthBar meta={{
      ...fixtureMeta,
      anomalies: [sourceIssue, { code: '00631L', reason: '單日變動 +40%' }],
    }} now={NOW} />)
    expect(screen.getByText(/1 檔價格異常/)).toBeInTheDocument()
    expect(screen.getByText(/淨值來源沒有歷史/)).toBeInTheDocument()
  })
})
