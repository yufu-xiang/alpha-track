/**
 * 交易紀錄的儲存。規格 §6.5。
 *
 * **已知風險必須向使用者明示**:存在 localStorage,清除瀏覽器資料、換裝置、
 * 換瀏覽器,紀錄即遺失。因此匯出是必需品而非加分項 —— 超過 30 天未匯出
 * 就提醒。
 *
 * 日後要跨裝置同步,只需替換這一層,交易紀錄的資料模型不變。
 */
import type { Transaction } from './portfolio'
import { DEFAULT_FEE_CONFIG, type FeeConfig } from './fees'

const KEY = 'alpha-track:portfolio'
export const EXPORT_REMINDER_DAYS = 30
/** 匯出檔的格式版本。日後改結構時,匯入端才知道怎麼轉換。 */
export const EXPORT_VERSION = 1

export interface PortfolioData {
  transactions: Transaction[]
  fees: FeeConfig
  /** 最後一次匯出的日期(ISO)。從未匯出為 null。 */
  lastExport: string | null
}

export const EMPTY_PORTFOLIO: PortfolioData = {
  transactions: [],
  fees: DEFAULT_FEE_CONFIG,
  lastExport: null,
}

const TYPES = new Set(['buy', 'sell', 'dividend', 'split'])
/**
 * 新增交易類型時**必須同步這一行**。漏掉的話,那個類型會在存檔後
 * 被靜默濾掉:畫面上加得進去、重新整理就消失,而且不會有任何錯誤 ——
 * 使用者只會覺得「剛剛加的東西不見了」。分割就發生過這件事。
 */

/** 逐筆檢查。匯入的檔案可能來自舊版本或被手動編輯過。 */
function isTransaction(v: unknown): v is Transaction {
  if (typeof v !== 'object' || v === null) return false
  const t = v as Record<string, unknown>
  return typeof t.id === 'string'
    && typeof t.type === 'string' && TYPES.has(t.type)
    && typeof t.code === 'string' && t.code.length > 0
    && typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date)
    && typeof t.shares === 'number' && Number.isFinite(t.shares)
    && typeof t.price === 'number' && Number.isFinite(t.price)
    && typeof t.fee === 'number' && Number.isFinite(t.fee)
    && typeof t.tax === 'number' && Number.isFinite(t.tax)
}

export function loadPortfolio(): PortfolioData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY_PORTFOLIO
    const parsed = JSON.parse(raw) as Partial<PortfolioData>
    return {
      // 逐筆過濾而非整批放棄:一筆壞掉不該讓其他幾百筆交易一起消失。
      transactions: Array.isArray(parsed.transactions)
        ? parsed.transactions.filter(isTransaction)
        : [],
      fees: { ...DEFAULT_FEE_CONFIG, ...(parsed.fees ?? {}) },
      lastExport: typeof parsed.lastExport === 'string' ? parsed.lastExport : null,
    }
  } catch {
    return EMPTY_PORTFOLIO
  }
}

export function savePortfolio(data: PortfolioData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // 無痕模式或配額已滿。這裡靜默失敗比拋例外好,但**呼叫端必須另外
    // 提醒使用者**:交易紀錄存不進去是嚴重的事,不能像偏好設定那樣算了。
  }
}

/** 寫入 localStorage 是否真的成功。交易紀錄比偏好設定重要,值得驗證。 */
export function canPersist(): boolean {
  try {
    localStorage.setItem(`${KEY}:probe`, '1')
    localStorage.removeItem(`${KEY}:probe`)
    return true
  } catch {
    return false
  }
}

export function toExportFile(data: PortfolioData): string {
  return JSON.stringify(
    { version: EXPORT_VERSION, exportedAt: new Date().toISOString(),
      transactions: data.transactions, fees: data.fees },
    null, 2)
}

export type ImportResult =
  | { ok: true; transactions: Transaction[]; fees: FeeConfig; skipped: number }
  | { ok: false; error: string }

export function fromExportFile(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: '檔案不是有效的 JSON。' }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: '檔案格式無法辨識。' }
  }
  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj.transactions)) {
    return { ok: false, error: '檔案裡沒有交易紀錄。' }
  }
  const all = obj.transactions
  const transactions = all.filter(isTransaction)
  // 略過幾筆要說出來 —— 靜默丟掉別人的交易紀錄是不可接受的
  return {
    ok: true,
    transactions,
    fees: { ...DEFAULT_FEE_CONFIG, ...(obj.fees as Partial<FeeConfig> ?? {}) },
    skipped: all.length - transactions.length,
  }
}

/** 距上次匯出幾天;從未匯出回傳 null。 */
export function daysSinceExport(data: PortfolioData, today: string): number | null {
  if (!data.lastExport) return null
  const d = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${data.lastExport}T00:00:00Z`))
    / 86_400_000
  return Math.floor(d)
}

/** 是否該提醒匯出。有交易但從未匯出、或超過 30 天沒匯出。 */
export function needsExportReminder(data: PortfolioData, today: string): boolean {
  if (data.transactions.length === 0) return false
  const days = daysSinceExport(data, today)
  return days === null || days >= EXPORT_REMINDER_DAYS
}
