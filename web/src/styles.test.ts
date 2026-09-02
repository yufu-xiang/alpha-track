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

  it('比較、名次與代號的凍結位移共用欄寬變數,不依賴會位移的 nth-child', () => {
    // 開啟比較功能會多一欄；若用 nth-child，實際凍結的欄位會整體錯位。
    expect(css).toMatch(/--sticky-pick-w:/)
    expect(css).toMatch(/--sticky-rank-w:/)
    expect(css).toMatch(/left:\s*var\(--sticky-rank-w\)/)
    expect(css).toMatch(/--sticky-code-w:/)
    expect(css).toMatch(/left:\s*calc\(var\(--sticky-pick-w\) \+ var\(--sticky-rank-w\)\)/)
    expect(css).toContain('.ranking-table-wrap .col-code')
  })

  it('排序中的欄位有視覺區隔,不只靠 aria-sort', () => {
    // aria-sort 只有螢幕閱讀器讀得到。用眼睛看的人也要能一眼看出
    // 目前依哪一欄排序 —— 那是這張表的核心互動。
    expect(css).toMatch(/th\[aria-sort\]/)
    expect(css).toMatch(/\.sort-caret/)
  })

  it('只有可排序的欄位是手指游標', () => {
    // 對不可排序的欄位給 pointer,等於告訴使用者可以點、點了卻沒反應。
    expect(css).toMatch(/th\.is-sortable\s*\{[^}]*cursor:\s*pointer/)
    expect(css).not.toMatch(/thead th\s*\{[^}]*cursor:\s*pointer/)
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
