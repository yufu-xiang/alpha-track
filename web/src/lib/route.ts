/**
 * 極簡 hash 路由。
 *
 * 用 hash 而非 history API:GitHub Pages 是純靜態,沒有伺服器改寫規則,
 * 直接開啟 /alpha-track/etf/0050 會 404。hash 不會送到伺服器,
 * 重新整理與分享連結都正常,而且不必多裝一個路由套件。
 */
import { useEffect, useState } from 'react'

export type Route =
  | { name: 'rankings' }
  | { name: 'detail'; code: string }

export function parseHash(hash: string): Route {
  const m = /^#\/etf\/([A-Za-z0-9]+)$/.exec(hash)
  return m ? { name: 'detail', code: m[1]!.toUpperCase() } : { name: 'rankings' }
}

export function hashFor(route: Route): string {
  return route.name === 'detail' ? `#/etf/${route.code}` : '#/'
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
