export function PageLoading({ variant = 'page' }: { variant?: 'page' | 'rankings' }) {
  return (
    <main className={`app loading-page loading-page--${variant}`} role="status">
      <span className="sr-only">載入中…</span>
      <div className="skeleton skeleton--header">
        <span className="skeleton__line skeleton__line--eyebrow" />
        <span className="skeleton__line skeleton__line--title" />
        <span className="skeleton__line skeleton__line--copy" />
      </div>
      <div className="skeleton-grid" aria-hidden="true">
        <div className="skeleton skeleton--panel" />
        <div className="skeleton skeleton--panel" />
        {variant === 'rankings' && <div className="skeleton skeleton--table" />}
      </div>
    </main>
  )
}

export function InlineLoading({
  label = '載入中…', announce = true,
}: { label?: string; announce?: boolean }) {
  return (
    <div className="inline-loading" role={announce ? 'status' : undefined}
         aria-hidden={announce ? undefined : true}>
      {announce && <span className="sr-only">{label}</span>}
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </div>
  )
}
