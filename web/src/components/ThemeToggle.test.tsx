import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from './ThemeToggle'

const KEY = 'alpha-track:theme'

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  document.documentElement.style.colorScheme = ''
})

afterEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  document.documentElement.style.colorScheme = ''
})

describe('ThemeToggle', () => {
  it('可手動切換主題並記住選擇', async () => {
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole('button', { name: '切換為深色模式' }))

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark')
      expect(localStorage.getItem(KEY)).toBe('dark')
    })
    expect(screen.getByRole('button', { name: '切換為淺色模式' })).toBeInTheDocument()
  })

  it('重新載入時採用先前儲存的主題', async () => {
    localStorage.setItem(KEY, 'dark')
    render(<ThemeToggle />)

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    expect(screen.getByRole('button', { name: '切換為淺色模式' })).toBeInTheDocument()
  })
})
