import type { ReactNode } from 'react'

interface EmptyStateProps {
  marker?: string
  title: string
  description: string
  action?: ReactNode
  compact?: boolean
}

export function EmptyState({
  marker = '＋', title, description, action, compact = false,
}: EmptyStateProps) {
  return (
    <div className={`guided-empty${compact ? ' guided-empty--compact' : ''}`}>
      <span className="guided-empty__marker" aria-hidden="true">{marker}</span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {action && <div className="guided-empty__action">{action}</div>}
    </div>
  )
}
