import { describe, expect, it } from 'vitest'
import { GLOSSARY } from './glossary'

describe('指標詞典', () => {
  it('涵蓋階段 1 顯示的全部指標', () => {
    expect(Object.keys(GLOSSARY).sort()).toEqual([
      'annualized', 'beta', 'cagr', 'excess', 'mdd', 'premium_discount',
      'sharpe', 'total_return', 'volatility',
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

  it('夏普值的「怎麼算」必須說明分子與分母的取樣期間不同', () => {
    // 後端刻意讓分子取近一年報酬、分母取全歷史波動度(見 1a 的 compute.py):
    // 規格 §7 要求使用者能拿畫面上的三個數字自行驗算,而畫面上的波動度欄位
    // 就是全歷史的那一個。詞典若只寫教科書公式,使用者算出來對不起來,
    // 只會結論「這網站的數字有問題」。
    expect(GLOSSARY.sharpe!.how).toMatch(/一年|近一年/)
    expect(GLOSSARY.sharpe!.how).toMatch(/全部歷史|全歷史|整段/)
  })

  it('最大回撤的陷阱必須提到歷史起點可能晚於掛牌日', () => {
    // 0050 掛牌於 2003,但本站的資料只回溯到 2014(1a 的 R24)。
    // MDD 是最容易被截短歷史誤導的指標 —— 少掉的那幾年可能正好含著最深的那次跌。
    expect(GLOSSARY.mdd!.pitfall).toMatch(/起點|涵蓋|資料自/)
  })
})
