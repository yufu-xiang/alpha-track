import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { fixtureMeta, fixtureRankings } from './data/fixture'

function mockFetchOk() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.includes('meta') ? fixtureMeta : fixtureRankings),
  })))
}

beforeEach(() => {
  localStorage.clear()
  mockFetchOk()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function renderLoaded() {
  render(<App />)
  await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
}

function tabs() {
  return screen.getByRole('toolbar', { name: /排序期間/ })
}

describe('App', () => {
  it('載入中顯示提示', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<App />)
    expect(screen.getByText(/載入中/)).toBeInTheDocument()
  })

  it('載入完成後顯示表格與健康狀態列', async () => {
    await renderLoaded()
    expect(screen.getByText(/資料更新至/)).toBeInTheDocument()
  })

  it('載入失敗時顯示錯誤訊息,不顯示空表格', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))
    render(<App />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/載入失敗/))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('預設顯示規格指定的五個期間欄位', async () => {
    await renderLoaded()
    for (const label of ['當日', '一月', '三月', '一年', '三年']) {
      // 錨定完整字串:超額報酬欄的表頭是「超額報酬(一年)」,
      // 用不錨定的 /一年/ 會同時命中兩欄而查詢失敗。
      expect(screen.getByRole('columnheader', { name: new RegExp(`^${label}$`) }))
        .toBeInTheDocument()
    }
    expect(screen.queryByRole('columnheader', { name: /^十年/ })).not.toBeInTheDocument()
  })

  it('點擊未顯示的期間按鈕會自動把該欄位加入顯示', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    expect(screen.queryByRole('columnheader', { name: /^十年/ })).not.toBeInTheDocument()
    await user.click(within(tabs()).getByRole('button', { name: '十年' }))
    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: /^十年/ })).toBeInTheDocument(),
    )
  })

  it('欄位選擇會存入 localStorage', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await user.click(within(tabs()).getByRole('button', { name: '十年' }))
    await waitFor(() => {
      expect(localStorage.getItem('alpha-track:prefs')).toContain('Y10')
    })
  })

  it('隱藏當前排序中的欄位時,排序改落到仍看得見的欄位', async () => {
    // 使用者明確要求隱藏這一欄,就該照做;但排序不能因此靜默停擺
    // (TanStack 會把對應欄位不存在的排序狀態濾掉,結果是回到原始順序,
    // 使用者只會看到榜單莫名亂掉)。
    const user = userEvent.setup()
    await renderLoaded()
    expect(within(tabs()).getByRole('button', { name: '一年' }))
      .toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('checkbox', { name: '一年' }))

    await waitFor(() => {
      expect(screen.queryByRole('columnheader', { name: /^一年/ })).not.toBeInTheDocument()
    })
    expect(within(tabs()).getByRole('button', { name: '一年' }))
      .toHaveAttribute('aria-pressed', 'false')
    // 新的排序欄位必須是仍看得見的其中之一
    const active = within(tabs()).getAllByRole('button')
      .find((b) => b.getAttribute('aria-pressed') === 'true')!
    expect(screen.getByRole('columnheader', { name: new RegExp(`^${active.textContent}`) }))
      .toBeInTheDocument()
  })

  it('分類篩選會即時縮減表格列數', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    const before = within(screen.getByRole('table')).getAllByRole('row').length
    await user.click(screen.getByRole('button', { name: '高股息' }))
    await waitFor(() => {
      const after = within(screen.getByRole('table')).getAllByRole('row').length
      expect(after).toBeLessThan(before)
    })
  })

  it('槓桿反向標的預設不出現在表格中', async () => {
    await renderLoaded()
    expect(within(screen.getByRole('table')).queryByText('00631L')).not.toBeInTheDocument()
  })

  it('槓桿開關關著時,不提供只會篩出空表的槓桿分類按鈕', async () => {
    // 那種按鈕按下去必然是空的,是個死路 —— 使用者會以為壞了。
    await renderLoaded()
    expect(screen.queryByRole('button', { name: '槓桿型' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '反向型' })).not.toBeInTheDocument()
  })

  it('開啟槓桿開關後,槓桿分類按鈕才出現', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await user.click(screen.getByRole('checkbox', { name: /槓桿|反向/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '槓桿型' })).toBeInTheDocument()
    })
  })

  it('顯示無風險利率,使夏普值可被檢驗', async () => {
    await renderLoaded()
    expect(screen.getByText(/無風險利率 1\.50%/)).toBeInTheDocument()
  })
})

describe('App 超額報酬', () => {
  it('表格含當前期間的超額報酬欄', async () => {
    await renderLoaded()
    expect(screen.getByRole('columnheader', { name: /超額.*一年/ })).toBeInTheDocument()
  })

  it('切換期間分頁時超額報酬欄跟著換', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await user.click(within(tabs()).getByRole('button', { name: '三年' }))
    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: /超額.*三年/ })).toBeInTheDocument())
  })
})

describe('App 風險欄位自選', () => {
  it('預設顯示貝他值 —— 它一直有算,先前根本沒有欄位', async () => {
    await renderLoaded()
    expect(screen.getByRole('columnheader', { name: /貝他值/ })).toBeInTheDocument()
  })

  it('折溢價預設關閉 —— 目前整欄都是破折號', async () => {
    await renderLoaded()
    expect(screen.queryByRole('columnheader', { name: /折溢價/ })).not.toBeInTheDocument()
  })

  it('勾掉風險指標後該欄消失,並存入 localStorage', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    expect(screen.getByRole('columnheader', { name: /夏普值/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('checkbox', { name: '夏普值' }))

    await waitFor(() =>
      expect(screen.queryByRole('columnheader', { name: /夏普值/ })).not.toBeInTheDocument())
    expect(localStorage.getItem('alpha-track:prefs')).toContain('visibleRisk')
  })

  it('勾選折溢價後該欄出現', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await user.click(screen.getByRole('button', { name: /欄位/ }))
    await user.click(screen.getByRole('checkbox', { name: '折溢價' }))
    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: /折溢價/ })).toBeInTheDocument())
  })
})

describe('App 地區篩選', () => {
  it('列出地區按鈕,台灣在前', async () => {
    await renderLoaded()
    const group = screen.getByRole('group', { name: /地區/ })
    const names = within(group).getAllByRole('button').map((b) => b.textContent)
    expect(names[0]).toBe('台灣')
    expect(names).toContain('美國')
  })

  it('選地區會縮減表格列數', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    const before = within(screen.getByRole('table')).getAllByRole('row').length
    const group = screen.getByRole('group', { name: /地區/ })
    await user.click(within(group).getByRole('button', { name: '台灣' }))
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getAllByRole('row').length)
        .toBeLessThan(before)
    })
  })
})

describe('App 比較選取', () => {
  it('每一列都有比較用的勾選框', async () => {
    await renderLoaded()
    expect(screen.getByRole('checkbox', { name: '比較 0050' })).toBeInTheDocument()
  })

  it('選一檔時提示還要再選,選兩檔才給比較連結', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await user.click(screen.getByRole('checkbox', { name: '比較 0050' }))
    expect(screen.getByText(/再選一檔即可比較/)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: '比較 0056' }))
    const link = await screen.findByRole('link', { name: /比較這 2 檔/ })
    expect(link).toHaveAttribute('href', '#/compare/0050,0056')
  })

  it('達到上限時明確告知,而不是靜默忽略點擊', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    for (const c of ['0050', '0056', '00929', '00679B', '00999']) {
      const box = screen.queryByRole('checkbox', { name: `比較 ${c}` })
      if (box) await user.click(box)
    }
    expect(screen.getByText(/已達上限/)).toBeInTheDocument()
  })

  it('清除會收起比較列', async () => {
    const user = userEvent.setup()
    await renderLoaded()
    await user.click(screen.getByRole('checkbox', { name: '比較 0050' }))
    await user.click(screen.getByRole('button', { name: '清除' }))
    expect(screen.queryByText(/已選/)).not.toBeInTheDocument()
  })
})
