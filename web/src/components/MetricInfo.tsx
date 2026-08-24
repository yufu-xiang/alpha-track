/**
 * 指標說明彈出視窗。規格 §5.7。
 *
 * 刻意用點擊觸發而非 hover:手機沒有 hover,用 hover 等於在手機上
 * 完全無法閱讀說明,而排行榜的手機使用比重不低。
 *
 * 用 portal 送到 document.body 並以 fixed 定位,而不是就地 absolute:
 * 觸發鈕長在 .table-wrap 裡面,那個容器為了橫向捲動而有 overflow,
 * 會把絕對定位的子元素**裁掉**。實測就地定位時「怎麼算」那段話會從
 * 中間被切斷 —— 而說明看不完整,等於這個功能不存在。
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { GLOSSARY } from '../content/glossary'

interface Props {
  termId: string
}

const WIDTH = 320
const GAP = 4
const EDGE = 8

export function MetricInfo({ termId }: Props) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const open = anchor !== null

  // 彈窗以 fixed 定位,捲動或改變視窗大小後座標就不對了。
  // 與其追著重算,不如關掉 —— 使用者再點一次即可。
  useEffect(() => {
    if (!open) return
    const close = () => setAnchor(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  const entry = GLOSSARY[termId]
  if (!entry) return null

  function toggle(e: React.MouseEvent) {
    // 這顆鈕長在可排序的表頭裡。不擋住冒泡的話,想讀一下說明
    // 就會順手把整張表翻掉,而使用者不會意識到是自己按出來的。
    e.stopPropagation()
    setAnchor(open ? null : (triggerRef.current?.getBoundingClientRect() ?? null))
  }

  // 靠右對齊觸發鈕,但夾在視窗邊界內,免得在最右邊的欄位溢出畫面。
  const style: CSSProperties = anchor
    ? {
        top: anchor.bottom + GAP,
        left: Math.max(
          EDGE,
          Math.min(anchor.right - WIDTH, window.innerWidth - WIDTH - EDGE),
        ),
      }
    : {}

  return (
    <span className="metric-info">
      <button
        ref={triggerRef}
        type="button"
        className="metric-info__trigger"
        aria-label={`${entry.term}說明`}
        aria-expanded={open}
        onClick={toggle}
      >
        ⓘ
      </button>
      {open &&
        createPortal(
          <div
            className="metric-info__popover"
            role="dialog"
            aria-label={`${entry.term}說明`}
            style={style}
            onClick={(e) => e.stopPropagation()}
          >
            <h4>{entry.term}</h4>
            <dl>
              <dt>是什麼</dt>
              <dd>{entry.what}</dd>
              <dt>怎麼算</dt>
              <dd>{entry.how}</dd>
              <dt>怎麼看</dt>
              <dd>{entry.read}</dd>
              <dt>陷阱</dt>
              <dd>{entry.pitfall}</dd>
            </dl>
          </div>,
          document.body,
        )}
    </span>
  )
}
