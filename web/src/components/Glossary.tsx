/**
 * 名詞解釋頁。規格 §5.7 的第二種呈現。
 *
 * 規格要求「**兩種呈現,同一份資料源**」:指標旁的 ⓘ popover 用於
 * 當下查一個詞,這一頁用於整份讀過。兩者都直接讀 GLOSSARY,
 * 不複製內容 —— 複製一份就會有一份先過期。
 *
 * 版面刻意把「怎麼看」放在最顯眼的位置:規格說那是這份詞典的重點,
 * 因為知道公式沒有用,知道數值落在什麼區間算好才能做決定。
 */
import { GLOSSARY } from '../content/glossary'
import { hashFor } from '../lib/route'
import { PageShell } from './PageShell'

export function Glossary() {
  const entries = Object.entries(GLOSSARY)

  return (
    <PageShell
      active="glossary"
      eyebrow="INVESTMENT GLOSSARY"
      title="指標詞典"
      description="把報酬、風險與 ETF 常見指標翻成可以直接用來判讀的語言。"
      backHref={hashFor({ name: 'rankings' })}
      meta={<span className="page-stat"><strong>{entries.length}</strong> 個詞條</span>}
    >
      <p className="detail__caveat" role="note">
        排行榜與個股頁上的每個指標名稱旁邊都有 ⓘ,點開會顯示同一份說明。
        這一頁是完整版,共 {entries.length} 個詞條。
      </p>

      <nav className="glossary__toc" aria-label="詞條目錄">
        {entries.map(([id, e]) => (
          <a key={id} href={`#/glossary#${id}`} onClick={(ev) => {
            // 同一頁內的錨點:hash 路由會把 #/glossary#id 整段當成路由,
            // 所以自己捲,不交給瀏覽器的預設行為。
            ev.preventDefault()
            document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
          }}>{e.term}</a>
        ))}
      </nav>

      <dl className="glossary content-panel">
        {entries.map(([id, e]) => (
          <div key={id} id={id} className="glossary__entry">
            <dt>{e.term}</dt>
            <dd>
              <p className="glossary__what">{e.what}</p>
              {/* 「怎麼看」擺在「怎麼算」前面 —— 規格說那才是重點,
                  而讀者的注意力是由上而下遞減的。 */}
              <p className="glossary__read">
                <strong>怎麼看</strong>{e.read}
              </p>
              <p className="glossary__how">
                <strong>怎麼算</strong>{e.how}
              </p>
              <p className="glossary__pitfall">
                <strong>陷阱</strong>{e.pitfall}
              </p>
            </dd>
          </div>
        ))}
      </dl>
    </PageShell>
  )
}
