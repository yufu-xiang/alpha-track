import { describe, expect, it } from 'vitest'
import { GLOSSARY } from './glossary'

describe('指標詞典', () => {
  it('涵蓋階段 1 顯示的全部指標', () => {
    expect(Object.keys(GLOSSARY).sort()).toEqual([
      'annualized', 'beta', 'cagr', 'excess', 'mdd', 'premium_discount',
      'sharpe', 'total_return', 'volatility', 'xirr',
    ])
  })

  it('每一筆都具備四個欄位,且沒有空字串', () => {
    for (const [id, entry] of Object.entries(GLOSSARY)) {
      expect(entry.term, `${id} 缺 term`).toBeTruthy()
      expect(entry.what, `${id} 缺「是什麼」`).toBeTruthy()
      expect(entry.how, `${id} 缺「怎麼算」`).toBeTruthy()
      expect(entry.read, `${id} 缺「怎麼看」`).toBeTruthy()
      expect(entry.pitfall, `${id} 缺「陷阱」`).toBeTruthy()
    }
  })

  it('「怎麼看」必須提供可判讀的基準,而非重述定義', () => {
    // 判讀基準應含數字門檻或方向詞,否則等於沒說
    for (const [id, entry] of Object.entries(GLOSSARY)) {
      const hasGuidance = /\d|越|愈|高於|低於|接近|大於|小於/.test(entry.read)
      expect(hasGuidance, `${id} 的「怎麼看」沒有給出判讀基準`).toBe(true)
    }
  })

  it('夏普值的「怎麼算」必須指出可用畫面上的欄位自行驗算', () => {
    // 規格 §7 要求數字可被檢驗。分子分母現在同為近一年窗口,且兩者都在
    // 表格上 —— 詞典必須講明這件事,否則使用者不知道自己算得出來。
    expect(GLOSSARY.sharpe!.how).toMatch(/近一年/)
    expect(GLOSSARY.sharpe!.how).toMatch(/驗算|自己算/)
  })

  it('波動度的「怎麼算」必須說明是固定窗口,以及為何不用全歷史', () => {
    // 全歷史波動度不可比較:各基金的窗口長度與市場環境都不同。
    expect(GLOSSARY.volatility!.how).toMatch(/最近一年|250/)
    expect(GLOSSARY.volatility!.how).toMatch(/比較|對等/)
  })

  it('最大回撤的陷阱必須提到歷史起點可能晚於掛牌日', () => {
    // 0050 掛牌於 2003,但本站的資料只回溯到 2014(1a 的 R24)。
    // MDD 是最容易被截短歷史誤導的指標 —— 少掉的那幾年可能正好含著最深的那次跌。
    expect(GLOSSARY.mdd!.pitfall).toMatch(/起點|涵蓋|資料自/)
  })
})
