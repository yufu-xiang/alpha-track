/**
 * 指標說明彈出視窗。規格 §5.7。
 *
 * 刻意用點擊觸發而非 hover:手機沒有 hover,用 hover 等於在手機上
 * 完全無法閱讀說明,而排行榜的手機使用比重不低。
 */
import { useState } from 'react'
import { GLOSSARY } from '../content/glossary'

interface Props {
  termId: string
}

export function MetricInfo({ termId }: Props) {
  const [open, setOpen] = useState(false)
  const entry = GLOSSARY[termId]

  if (!entry) return null

  return (
    <span className="metric-info">
      <button
        type="button"
        className="metric-info__trigger"
        aria-label={`${entry.term}說明`}
        aria-expanded={open}
        onClick={(e) => {
          // 這顆鈕長在可排序的表頭裡。不擋住冒泡的話,想讀一下說明
          // 就會順手把整張表翻掉,而使用者不會意識到是自己按出來的。
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        ⓘ
      </button>
      {open && (
        <div className="metric-info__popover" role="dialog" aria-label={`${entry.term}說明`}>
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
        </div>
      )}
    </span>
  )
}
