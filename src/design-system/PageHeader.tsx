import { Space, Typography } from 'antd'
import type { ReactNode } from 'react'

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: string
  eyebrow?: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow ? <span className="page-header-eyebrow">{eyebrow}</span> : null}
        <Typography.Title level={1}>{title}</Typography.Title>
        {description ? <span className="page-description">{description}</span> : null}
      </div>
      {actions ? <Space>{actions}</Space> : null}
    </header>
  )
}
