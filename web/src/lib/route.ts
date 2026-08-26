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

export function parseHash(hash: string): Route {
  const detail = /^#\/etf\/([A-Za-z0-9]+)$/.exec(hash)
  if (detail) return { name: 'detail', code: detail[1]!.toUpperCase() }

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
