import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, 'styles.css'), 'utf-8')

describe('樣式表', () => {
  it('在 :root 定義完整的淺色調色盤', () => {
    expect(css).toMatch(/:root\s*\{[^}]*--bg:/)
    expect(css).toMatch(/:root\s*\{[^}]*--fg:/)
  })

  it('深色主題透過 prefers-color-scheme 覆寫', () => {
    expect(css).toContain('prefers-color-scheme: dark')
  })

  it('body 有明確的背景色,不依賴瀏覽器預設', () => {
    expect(css).toMatch(/body\s*\{[^}]*background:/)
  })

  it('表格容器可橫向捲動', () => {
    expect(css).toMatch(/\.table-wrap\s*\{[^}]*overflow-x:\s*auto/)
  })

  it('表格容器有高度上限,否則 thead 的 sticky 不會生效', () => {
    // overflow-x: auto 會讓 overflow-y 一併變成 auto,於是 .table-wrap
    // 成為捲動容器 —— 這會擋掉 thead 相對於視窗的 sticky。要嘛給它高度
    // 上限讓表頭黏在容器內,要嘛 sticky 根本是裝飾。350 檔的表格滑下去
    // 看不到欄名,等於整張表沒法讀。
    expect(css).toMatch(/\.table-wrap\s*\{[^}]*max-height:/)
  })

  it('窄螢幕時凍結前兩欄', () => {
    expect(css).toContain('position: sticky')
    expect(css).toMatch(/@media[^{]*max-width/)
  })

  it('凍結第二欄的位移量與第一欄寬度綁在同一個變數,不是各寫各的魔術數字', () => {
    // 兩者只要對不上,窄螢幕的代號與名稱欄就會疊在一起。
    expect(css).toMatch(/--sticky-code-w:/)
    expect(css).toMatch(/left:\s*var\(--sticky-code-w\)/)
  })

  it('正負報酬使用不同顏色,且不只靠顏色區分', () => {
    expect(css).toMatch(/--gain:/)
    expect(css).toMatch(/--loss:/)
  })

  it('宣告的漲跌色必須真的被用到,不能是死變數', () => {
    // 只宣告不使用的話,測試看起來是綠的,畫面上卻一點顏色也沒有。
    expect(css).toMatch(/color:\s*var\(--gain\)/)
    expect(css).toMatch(/color:\s*var\(--loss\)/)
  })

  it('漲用紅、跌用綠 —— 台股慣例與歐美相反', () => {
    const gain = /--gain:\s*(#[0-9a-f]{6})/i.exec(css)![1]!
    const loss = /--loss:\s*(#[0-9a-f]{6})/i.exec(css)![1]!
    const red = (hex: string) => parseInt(hex.slice(1, 3), 16)
    const green = (hex: string) => parseInt(hex.slice(3, 5), 16)
    expect(red(gain)).toBeGreaterThan(green(gain))
    expect(green(loss)).toBeGreaterThan(red(loss))
  })
})
