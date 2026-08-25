/**
 * 使用者偏好儲存。
 *
 * 所有 localStorage 存取都包 try/catch:無痕模式下 getItem/setItem
 * 會直接拋例外,未攔截會讓整頁白畫面。
 */
import { PERIODS, RISK_COLUMNS, type PeriodCode, type RiskColumn } from '../types'

const KEY = 'alpha-track:prefs'

export interface Prefs {
  visibleColumns: PeriodCode[]
  visibleRisk: RiskColumn[]
  showLevered: boolean
}

export const DEFAULT_PREFS: Prefs = {
  visibleColumns: ['D1', 'M1', 'M3', 'Y1', 'Y3'],
  // 折溢價預設關閉:查不到免費的淨值來源,整欄一律是「—」(規格 §4.5 的降級)。
  // 佔一欄卻零資訊,但仍留在選單裡讓使用者知道它存在、日後接上來源就能打開。
  // 貝他值預設開啟 —— 它一直有算,只是先前根本沒有欄位可以顯示。
  visibleRisk: ['excess', 'volatility', 'mdd', 'sharpe', 'beta'],
  showLevered: false,
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<Prefs>
    // 存進來的東西不保證是陣列:可能是舊版格式、可能被手動改過。
    // 不先擋下來,filter 會對字串拋 TypeError 而讓整頁白畫面。
    const stored = Array.isArray(parsed.visibleColumns) ? parsed.visibleColumns : []
    const valid = stored.filter(
      (c): c is PeriodCode => (PERIODS as readonly string[]).includes(c),
    )
    const storedRisk = Array.isArray(parsed.visibleRisk) ? parsed.visibleRisk : null
    return {
      visibleColumns: valid.length > 0 ? valid : DEFAULT_PREFS.visibleColumns,
      // 風險欄位允許全部關閉(不像期間至少要留一欄)——
      // 只看報酬是合理的用法,所以 null 才回退預設,空陣列照用。
      visibleRisk: storedRisk
        ? storedRisk.filter(
            (c): c is RiskColumn => (RISK_COLUMNS as readonly string[]).includes(c),
          )
        : DEFAULT_PREFS.visibleRisk,
      showLevered: parsed.showLevered ?? DEFAULT_PREFS.showLevered,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // 無痕模式或配額已滿。偏好遺失不影響功能,靜默忽略。
  }
}
