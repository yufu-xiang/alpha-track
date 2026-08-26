import { describe, expect, it } from 'vitest'
import { hashFor, parseHash } from './route'

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
