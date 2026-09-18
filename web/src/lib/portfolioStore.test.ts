import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_PORTFOLIO, EXPORT_REMINDER_DAYS, canPersist, daysSinceExport, fromExportFile,
  loadPortfolio, needsExportReminder, savePortfolio, toExportFile, toPortableBackup,
  mergeTransactions,
} from './portfolioStore'
import { DEFAULT_FEE_CONFIG } from './fees'
import { DEFAULT_PREFS } from './prefs'
import type { Transaction, TxType } from './portfolio'

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
    savePortfolio({ transactions: [good], fees: DEFAULT_FEE_CONFIG, targets: {}, lastExport: null })
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
  it('合併備份以交易 ID 去重，保留本機已修改的紀錄', () => {
    const local = { ...good, price: 101 }
    const incoming = { ...good, price: 100 }
    const second = { ...good, id: 'b' }
    expect(mergeTransactions([local], [incoming, second])).toEqual([local, second])
  })
  it('匯出檔帶版本號 —— 日後改結構時匯入端才知道怎麼轉換', () => {
    const parsed = JSON.parse(toExportFile({
      transactions: [good], fees: DEFAULT_FEE_CONFIG, targets: { '0050': 1 }, lastExport: null }))
    expect(parsed.version).toBe(2)
    expect(parsed.transactions).toHaveLength(1)
    expect(parsed.targets).toEqual({ '0050': 1 })
  })

  it('匯出再匯入得到相同的交易', () => {
    const text = toExportFile({
      transactions: [good], fees: DEFAULT_FEE_CONFIG, targets: { '0050': 1 }, lastExport: null })
    const r = fromExportFile(text)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.transactions).toEqual([good])
      expect(r.targets).toEqual({ '0050': 1 })
    }
  })

  it('完整備份可搬移交易、自選、比較與顯示偏好', () => {
    const data = { transactions: [good], fees: DEFAULT_FEE_CONFIG,
      targets: { '0050': 1 }, lastExport: null }
    const personal = { watchlist: ['0050'], compare: ['0050'],
      prefs: { ...DEFAULT_PREFS, showLevered: true } }
    const text = toPortableBackup(data, personal)
    expect(JSON.parse(text).version).toBe(3)
    const result = fromExportFile(text)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.transactions).toEqual([good])
      expect(result.targets).toEqual({ '0050': 1 })
      expect(result.personal).toEqual(personal)
    }
  })

  it('完整備份也可搬移已儲存的篩選組合', () => {
    const presets = [{ name: '長期', filters: {
      categories: ['市值型'], regions: ['台灣'], query: '',
      showLevered: false, onlyWatchlist: false,
      minListingYears: 5, minTurnoverMillions: 100,
      maxDrawdownPercent: 35, sortBy: 'Y3' as const,
    } }]
    const text = toPortableBackup(EMPTY_PORTFOLIO, {
      watchlist: [], compare: [], prefs: DEFAULT_PREFS, filterPresets: presets,
    })
    const result = fromExportFile(text)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.personal?.filterPresets).toEqual(presets)
  })

  it('完整備份保留自選標的上次查看的資料日', () => {
    const watchHistory = {
      current: { date: '2026-08-21', values: {
        '0050': { oneYearReturn: 0.2, premium: null },
      }, anomalyCodes: [] },
      previous: null,
    }
    const text = toPortableBackup(EMPTY_PORTFOLIO, {
      watchlist: ['0050'], compare: [], prefs: DEFAULT_PREFS, watchHistory,
    })
    const result = fromExportFile(text)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.personal?.watchHistory).toEqual(watchHistory)
  })

  it('完整備份缺少個人資料時拒絕匯入，避免誤以為已搬移', () => {
    const result = fromExportFile(JSON.stringify({ version: 3, transactions: [] }))
    expect(result.ok).toBe(false)
  })

  it('無效的期間偏好回退預設，避免匯入後沒有可見欄位', () => {
    const result = fromExportFile(JSON.stringify({
      version: 3, transactions: [], personal: {
        watchlist: [], compare: [], prefs: { visibleColumns: ['invalid'], visibleRisk: [] },
      },
    }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.personal?.prefs.visibleColumns).toEqual(DEFAULT_PREFS.visibleColumns)
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

  it('舊版備份沒有目標配置時仍可匯入', () => {
    const r = fromExportFile(JSON.stringify({ transactions: [good] }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.targets).toEqual({})
  })

  it('載入時略過超出 0 到 100% 的目標配置', () => {
    localStorage.setItem('alpha-track:portfolio', JSON.stringify({
      transactions: [], targets: { '0050': 0.6, bad: 1.2, '0056': -0.1 },
    }))
    expect(loadPortfolio().targets).toEqual({ '0050': 0.6 })
  })
})

describe('匯出提醒', () => {
  const withTx = (lastExport: string | null) => ({
    transactions: [good], fees: DEFAULT_FEE_CONFIG, targets: {}, lastExport,
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

describe('交易類型白名單', () => {
  it('分割能存活過存檔與讀取', () => {
    // 漏掉白名單的話,分割在畫面上加得進去、重新整理就消失,
    // 而且不會有任何錯誤訊息。這條測試就是為了那次而寫的。
    const split = {
      id: 's1', type: 'split' as const, code: '0050', date: '2025-06-11',
      shares: 0, price: 4, fee: 0, tax: 0,
    }
    savePortfolio({ ...loadPortfolio(), transactions: [split] })
    expect(loadPortfolio().transactions).toEqual([split])
  })

  it('白名單涵蓋 TxType 的每一個值 —— 新增類型時不會漏改', () => {
    const all: TxType[] = ['buy', 'sell', 'dividend', 'split']
    const txs = all.map((type, i) => ({
      id: `t${i}`, type, code: '0050', date: '2025-01-01',
      shares: 1, price: 1, fee: 0, tax: 0,
    }))
    savePortfolio({ ...loadPortfolio(), transactions: txs })
    expect(loadPortfolio().transactions.map((t) => t.type)).toEqual(all)
  })
})
