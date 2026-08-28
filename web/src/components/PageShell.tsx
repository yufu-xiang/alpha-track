import { useEffect, useRef, type ReactNode } from 'react'
import { hashFor } from '../lib/route'
import { ThemeToggle } from './ThemeToggle'

type PageKey = 'rankings' | 'portfolio' | 'tools' | 'glossary'

const NAV_ITEMS: { id: PageKey; label: string; href: string }[] = [
  { id: 'rankings', label: '排行榜', href: hashFor({ name: 'rankings' }) },
  { id: 'portfolio', label: '我的組合', href: hashFor({ name: 'portfolio' }) },
  { id: 'tools', label: '理財工具', href: hashFor({ name: 'tools', tool: null }) },
  { id: 'glossary', label: '指標詞典', href: hashFor({ name: 'glossary' }) },
]

interface PageShellProps {
  active?: PageKey
  eyebrow: string
  title: string
  description: string
  backHref?: string
  backLabel?: string
  meta?: ReactNode
  children: ReactNode
}

export function PageShell({
  active,
  eyebrow,
  title,
  description,
  backHref = hashFor({ name: 'rankings' }),
  backLabel = '回排行榜',
  meta,
  children,
}: PageShellProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = contentRef.current
    if (!root) return
    const listeners = new Map<HTMLElement, EventListener>()

    const update = () => {
      const wrappers = new Set(
        [...root.querySelectorAll<HTMLElement>('.table-wrap')],
      )
      wrappers.forEach((node) => {
        node.classList.toggle('is-scrollable', node.scrollWidth > node.clientWidth + 2)
        if (listeners.has(node)) return
        const onScroll = () => node.classList.toggle('has-scrolled', node.scrollLeft > 12)
        node.addEventListener('scroll', onScroll, { passive: true })
        listeners.set(node, onScroll)
      })
      listeners.forEach((listener, node) => {
        if (wrappers.has(node)) return
        node.removeEventListener('scroll', listener)
        listeners.delete(node)
      })
    }

    update()
    const observer = new MutationObserver(update)
    observer.observe(root, { childList: true, subtree: true })
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      listeners.forEach((listener, node) => node.removeEventListener('scroll', listener))
    }
  }, [])

  return (
    <main className="app detail page-shell">
      <header className="page-header">
        <div className="page-topbar">
          <a className="page-brand" href={hashFor({ name: 'rankings' })}
             aria-label="ETF Rankings 首頁">
            <img src={`${import.meta.env.BASE_URL}icon.png`} alt="" aria-hidden="true" />
            <span>
              <strong>ETF Rankings</strong>
              <small>ALPHA TRACK</small>
            </span>
          </a>

          <div className="page-topbar__controls">
            <nav className="page-nav" aria-label="主要功能">
              {NAV_ITEMS.map((item) => (
                <a key={item.id} href={item.href}
                   aria-current={active === item.id ? 'page' : undefined}>
                  {item.label}
                </a>
              ))}
            </nav>
            <ThemeToggle />
          </div>
        </div>

        <div className="page-heading">
          <a className="page-back" href={backHref}>← {backLabel}</a>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="page-heading__description">{description}</p>
          {meta && <div className="page-heading__meta">{meta}</div>}
        </div>
      </header>

      <div className="page-content" ref={contentRef}>{children}</div>
    </main>
  )
}
