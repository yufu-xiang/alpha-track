import { useEffect, useState } from 'react'

const KEY = 'alpha-track:theme'
type Theme = 'light' | 'dark'

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export function initializeTheme() {
  applyTheme(savedTheme() ?? systemTheme())
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => savedTheme() ?? systemTheme())

  useEffect(() => {
    applyTheme(theme)
    try { localStorage.setItem(KEY, theme) } catch { /* 瀏覽器拒絕儲存時仍可切換 */ }
  }, [theme])

  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`切換為${next === 'dark' ? '深色' : '淺色'}模式`}
      title={`切換為${next === 'dark' ? '深色' : '淺色'}模式`}
      aria-pressed={theme === 'dark'}
      onClick={() => setTheme(next)}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19.2 15.1A8 8 0 0 1 8.9 4.8 8 8 0 1 0 19.2 15.1Z" />
        </svg>
      )}
    </button>
  )
}
