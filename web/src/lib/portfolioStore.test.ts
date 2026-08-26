import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_PORTFOLIO, EXPORT_REMINDER_DAYS, canPersist, daysSinceExport, fromExportFile,
  loadPortfolio, needsExportReminder, savePortfolio, toExportFile,
} from './portfolioStore'
import { DEFAULT_FEE_CONFIG } from './fees'
import type { Transaction } from './portfolio'

const good: Transaction = {
  id: 'a', type: 'buy', code: '0050', date: '2025-01-01',
  shares: 1000, price: 100, fee: 142, tax: 0,
}

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('讀寫', () => {
  it('沒存過時回傳空的組合', () => {
    expect(loadPortfolio()).toEqual(EMPTY_PORTFOLIO)
  })

  it('存檔後讀得回來', () => {
    savePortfolio({ transactions: [good], fees: DEFAULT_FEE_CONFIG, lastExport: null })
    expect(loadPortfolio().transactions).toEqual([good])
  })

  it('毀損的內容回退成空的,不讓整頁崩潰', () => {
    localStorage.setItem('alpha-track:portfolio', '{ 不是 JSON')
    expect(loadPortfolio()).toEqual(EMPTY_PORTFOLIO)
  })

  it('一筆壞資料只丟那一筆,不連累其他幾百筆', () => {
    localStorage.setItem('alpha-track:portfolio', JSON.stringify({
      transactions: [good, { id: 'x' }, { ...good, id: 'b', date: '壞日期' }],
    }))
    expect(loadPortfolio().transactions).toEqual([good])
  })

  it('缺少的費用設定補上預設值', () => {
    localStorage.setItem('alpha-track:portfolio',
      JSON.stringify({ transactions: [], fees: { commissionDiscount: 0.3 } }))
    const f = loadPortfolio().fees
    expect(f.commissionDiscount).toBe(0.3)
    expect(f.commissionRate).toBe(DEFAULT_FEE_CONFIG.commissionRate)
  })

  it('canPersist 在寫入被拒時回報 false —— 交易紀錄存不進去是嚴重的事', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(canPersist()).toBe(false)
  })
})

describe('匯出與匯入', () => {
  it('匯出檔帶版本號 —— 日後改結構時匯入端才知道怎麼轉換', () => {
    const parsed = JSON.parse(toExportFile({
      transactions: [good], fees: DEFAULT_FEE_CONFIG, lastExport: null }))
    expect(parsed.version).toBe(1)
    expect(parsed.transactions).toHaveLength(1)
  })

  it('匯出再匯入得到相同的交易', () => {
    const text = toExportFile({
      transactions: [good], fees: DEFAULT_FEE_CONFIG, lastExport: null })
    const r = fromExportFile(text)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.transactions).toEqual([good])
  })

  it('非 JSON 的檔案給出可讀的錯誤', () => {
    const r = fromExportFile('這不是 JSON')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('JSON')
  })

  it('沒有交易紀錄欄位時說明,而不是匯入成空的', () => {
    const r = fromExportFile('{"foo":1}')
    expect(r.ok).toBe(false)
  })

  it('回報略過的筆數 —— 靜默丟掉別人的交易紀錄不可接受', () => {
    const r = fromExportFile(JSON.stringify({
      transactions: [good, { id: 'bad' }, { nope: true }] }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.transactions).toHaveLength(1)
      expect(r.skipped).toBe(2)
    }
  })
})

describe('匯出提醒', () => {
  const withTx = (lastExport: string | null) => ({
    transactions: [good], fees: DEFAULT_FEE_CONFIG, lastExport,
  })

  it('有交易但從未匯出就要提醒 —— 那是風險最高的狀態', () => {
    expect(needsExportReminder(withTx(null), '2026-08-26')).toBe(true)
  })

  it('沒有交易時不提醒', () => {
    expect(needsExportReminder(EMPTY_PORTFOLIO, '2026-08-26')).toBe(false)
  })

  it('剛匯出過不提醒', () => {
    expect(needsExportReminder(withTx('2026-08-20'), '2026-08-26')).toBe(false)
  })

  it('超過 30 天要提醒', () => {
    expect(needsExportReminder(withTx('2026-07-01'), '2026-08-26')).toBe(true)
    expect(EXPORT_REMINDER_DAYS).toBe(30)
  })

  it('剛好第 30 天就提醒', () => {
    expect(daysSinceExport(withTx('2026-07-27'), '2026-08-26')).toBe(30)
    expect(needsExportReminder(withTx('2026-07-27'), '2026-08-26')).toBe(true)
  })
})
