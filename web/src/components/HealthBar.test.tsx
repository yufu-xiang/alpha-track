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
