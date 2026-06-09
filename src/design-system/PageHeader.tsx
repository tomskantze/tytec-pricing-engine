import { Space, Typography } from 'antd'
import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        <Typography.Title level={1}>{title}</Typography.Title>
        {description ? <span className="page-description">{description}</span> : null}
      </div>
      {actions ? <Space>{actions}</Space> : null}
    </header>
  )
}
