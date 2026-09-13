const GUIDE_KEY = 'alpha-track:journey-guide-dismissed:v1'

export interface JourneyInput {
  watchlistCount: number
  compareCount: number
  transactionCount: number
  targets: Record<string, number>
}

export interface JourneyProgress {
  watched: boolean
  compared: boolean
  recorded: boolean
  balanced: boolean
  completed: number
}

/** 首頁導覽只讀既有資料，不會為了「完成任務」改動投資紀錄。 */
export function getJourneyProgress(input: JourneyInput): JourneyProgress {
  const targetTotal = Object.values(input.targets)
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((total, value) => total + value, 0)
  const progress = {
    watched: input.watchlistCount > 0,
    compared: input.compareCount >= 2,
    recorded: input.transactionCount > 0,
    // 容許輸入百分比換算造成的極小浮點誤差；沒有交易時不能只靠殘留目標完成。
    balanced: input.transactionCount > 0 && Math.abs(targetTotal - 1) <= 0.005,
  }
  return { ...progress, completed: Object.values(progress).filter(Boolean).length }
}

export function loadJourneyGuideDismissed(): boolean {
  try {
    return localStorage.getItem(GUIDE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveJourneyGuideDismissed(dismissed: boolean): void {
  try {
    if (dismissed) localStorage.setItem(GUIDE_KEY, '1')
    else localStorage.removeItem(GUIDE_KEY)
  } catch {
    // 導覽偏好寫不進去不應中斷主要研究流程。
  }
}
