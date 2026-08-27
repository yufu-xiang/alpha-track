/**
 * 名詞解釋頁。規格 §5.7 要求「兩種呈現,**同一份資料源**」。
 *
 * 詞條內容本身的品質守門在 content/glossary.test.ts,這裡只測頁面:
 * 它必須列出**全部**條目、四個欄位都呈現、而且直接讀同一份資料源。
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GLOSSARY } from '../content/glossary'
import { Glossary } from './Glossary'

describe('Glossary 頁', () => {
  it('列出全部詞條,並顯示四個欄位', () => {
    render(<Glossary />)
    const n = Object.keys(GLOSSARY).length
    expect(screen.getAllByRole('definition')).toHaveLength(n)
    expect(screen.getAllByText('怎麼看')).toHaveLength(n)
    expect(screen.getAllByText('怎麼算')).toHaveLength(n)
    expect(screen.getAllByText('陷阱')).toHaveLength(n)
  })

  it('目錄涵蓋每一個詞條', () => {
    render(<Glossary />)
    const toc = screen.getByRole('navigation', { name: '詞條目錄' })
    expect(within(toc).getAllByRole('link'))
      .toHaveLength(Object.keys(GLOSSARY).length)
  })

  it('直接讀 GLOSSARY,不複製內容 —— 複製一份就會有一份先過期', () => {
    render(<Glossary />)
    // 隨便挑一條驗證文字確實來自同一份資料
    const entry = GLOSSARY.sharpe!
    expect(screen.getByText(entry.what)).toBeInTheDocument()
    expect(screen.getByText(entry.read, { exact: false })).toBeInTheDocument()
  })

  it('說明這一頁與 ⓘ 是同一份說明', () => {
    render(<Glossary />)
    expect(screen.getByRole('note')).toHaveTextContent(/同一份說明/)
  })
})
