import { describe, expect, it } from 'vitest'
import { hashFor, parseHash, type Route } from './route'

describe('hash 路由', () => {
  it('空的 hash 是排行榜', () => {
    expect(parseHash('')).toEqual({ name: 'rankings' })
    expect(parseHash('#/')).toEqual({ name: 'rankings' })
  })

  it('辨識個股頁', () => {
    expect(parseHash('#/etf/0050')).toEqual({ name: 'detail', code: '0050' })
  })

  it('代號一律轉大寫 —— 00679b 與 00679B 是同一檔', () => {
    expect(parseHash('#/etf/00679b')).toEqual({ name: 'detail', code: '00679B' })
  })

  it('認不得的 hash 回到排行榜,而非空白畫面', () => {
    for (const h of ['#/etf/', '#/etf/00 50', '#/nonsense', '#/etf/0050/extra']) {
      expect(parseHash(h)).toEqual({ name: 'rankings' })
    }
  })

  it('產生的連結可被自己解析回來', () => {
    const r = { name: 'detail', code: '00631L' } as const
    expect(parseHash(hashFor(r))).toEqual(r)
  })
})

describe('比較頁路由', () => {
  it('辨識比較頁', () => {
    expect(parseHash('#/compare/0050,0056'))
      .toEqual({ name: 'compare', codes: ['0050', '0056'] })
  })

  it('代號轉大寫', () => {
    expect(parseHash('#/compare/00679b')).toEqual({ name: 'compare', codes: ['00679B'] })
  })

  it('超過上限時只取前五個 —— 網址可被手動編輯', () => {
    const r = parseHash('#/compare/a,b,c,d,e,f,g')
    expect(r.name).toBe('compare')
    if (r.name === 'compare') expect(r.codes).toHaveLength(5)
  })

  it('沒有有效代號時回排行榜,而非空白比較頁', () => {
    expect(parseHash('#/compare/')).toEqual({ name: 'rankings' })
    expect(parseHash('#/compare/,,,')).toEqual({ name: 'rankings' })
  })

  it('產生的連結可被自己解析回來', () => {
    const r: Route = { name: 'compare', codes: ['0050', '00631L'] }
    expect(parseHash(hashFor(r))).toEqual(r)
  })
})

describe('工具子路由(規格 §7.4:每個工具一頁)', () => {
  it('#/tools 是工具列表', () => {
    expect(parseHash('#/tools')).toEqual({ name: 'tools', tool: null })
  })

  it('#/tools/<id> 指向單一工具', () => {
    expect(parseHash('#/tools/monte-carlo')).toEqual({
      name: 'tools', tool: 'monte-carlo',
    })
  })

  it('往返一致', () => {
    for (const r of [
      { name: 'tools', tool: null },
      { name: 'tools', tool: 'fire' },
    ] as const) {
      expect(parseHash(hashFor(r))).toEqual(r)
    }
  })

  it('工具 id 只接受小寫連字號 —— 其餘退回排行榜,不猜使用者的意思', () => {
    expect(parseHash('#/tools/Monte_Carlo')).toEqual({ name: 'rankings' })
  })
})
