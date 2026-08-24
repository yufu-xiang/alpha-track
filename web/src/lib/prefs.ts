/**
 * 使用者偏好儲存。
 *
 * 所有 localStorage 存取都包 try/catch:無痕模式下 getItem/setItem
 * 會直接拋例外,未攔截會讓整頁白畫面。
 */
import { PERIODS, type PeriodCode } from '../types'

const KEY = 'alpha-track:prefs'

export interface Prefs {
  visibleColumns: PeriodCode[]
  showLevered: boolean
}

export const DEFAULT_PREFS: Prefs = {
  visibleColumns: ['D1', 'M1', 'M3', 'Y1', 'Y3'],
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
    return {
      visibleColumns: valid.length > 0 ? valid : DEFAULT_PREFS.visibleColumns,
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
