/**
 * 極簡 hash 路由。
 *
 * 用 hash 而非 history API:GitHub Pages 是純靜態,沒有伺服器改寫規則,
 * 直接開啟 /alpha-track/etf/0050 會 404。hash 不會送到伺服器,
 * 重新整理與分享連結都正常,而且不必多裝一個路由套件。
 */
import { useEffect, useState } from 'react'
import { parseCodes, serializeCodes } from './compare'

export type Route =
  | { name: 'rankings' }
  | { name: 'detail'; code: string }
  | { name: 'compare'; codes: string[] }
  | { name: 'portfolio'; code?: string }
  | { name: 'tools'; tool: string | null }
  | { name: 'glossary' }

export function parseHash(hash: string): Route {
  const detail = /^#\/etf\/([A-Za-z0-9]+)$/.exec(hash)
  if (detail) return { name: 'detail', code: detail[1]!.toUpperCase() }

  if (hash === '#/portfolio') return { name: 'portfolio' }
  const portfolio = /^#\/portfolio\?code=([A-Za-z0-9]+)$/.exec(hash)
  if (portfolio) return { name: 'portfolio', code: portfolio[1]!.toUpperCase() }
  if (hash === '#/glossary') return { name: 'glossary' }
  // 規格 §7.4「每個工具一頁」。無 id 時是工具列表;id 不存在時由 Tools
  // 顯示「找不到」再列出全部,不是靜默退回列表 —— 舊書籤失效時使用者
  // 需要知道發生了什麼,而不是納悶自己是不是點錯了。
  if (hash === '#/tools') return { name: 'tools', tool: null }
  const tool = /^#\/tools\/([a-z0-9-]+)$/.exec(hash)
  if (tool) return { name: 'tools', tool: tool[1]! }

  const compare = /^#\/compare\/([A-Za-z0-9,]+)$/.exec(hash)
  if (compare) {
    const codes = parseCodes(compare[1]!)
    if (codes.length > 0) return { name: 'compare', codes }
  }
  return { name: 'rankings' }
}

export function hashFor(route: Route): string {
  if (route.name === 'detail') return `#/etf/${route.code}`
  if (route.name === 'compare') return `#/compare/${serializeCodes(route.codes)}`
  if (route.name === 'portfolio') {
    return route.code ? `#/portfolio?code=${route.code}` : '#/portfolio'
  }
  if (route.name === 'glossary') return '#/glossary'
  if (route.name === 'tools') return route.tool ? `#/tools/${route.tool}` : '#/tools'
  return '#/'
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const sync = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  return route
}
