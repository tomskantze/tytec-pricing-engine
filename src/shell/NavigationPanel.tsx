import { CalculatorOutlined, CheckSquareOutlined, LeftOutlined, RightOutlined, TagsOutlined, TeamOutlined } from '@ant-design/icons'
import { Button, Layout } from 'antd'
import type { ReactNode } from 'react'
import { useState } from 'react'
import type { ActiveView } from '../state/appState'

const { Sider } = Layout
const collapsedNavWidth = 68

const navigationItems: Array<{ key: ActiveView; label: string; icon: ReactNode }> = [
  { key: 'customers', label: 'Customers', icon: <TeamOutlined /> },
  { key: 'fortnox', label: 'Fortnox', icon: <TagsOutlined /> },
  { key: 'invoice-prep', label: 'Invoice Prep', icon: <CalculatorOutlined /> },
  { key: 'review-queue', label: 'Review Queue', icon: <CheckSquareOutlined /> },
]

export function NavigationPanel({
  activeView,
  onNavigate,
}: {
  activeView: ActiveView
  onNavigate: (view: ActiveView) => void
}) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <Sider className="erp-sidebar" collapsed={isCollapsed} collapsedWidth={collapsedNavWidth} trigger={null} width="max-content">
      <div className="brand-block" aria-label="Tytec Pricing Engine">
        <div className="brand-mark">T</div>
        <div className="brand-copy">
          <strong>TYTEC PRICING</strong>
          <span>Telesol workspace</span>
        </div>
        <Button
          aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="sidebar-collapse-button"
          icon={isCollapsed ? <RightOutlined /> : <LeftOutlined />}
          onClick={() => setIsCollapsed((current) => !current)}
          type="text"
        />
      </div>

      <nav className="nav-menu" aria-label="Primary">
        {navigationItems.map((item) => (
          <button
            aria-current={activeView === item.key ? 'page' : undefined}
            className={`nav-item${activeView === item.key ? ' is-active' : ''}`}
            key={item.key}
            onClick={() => onNavigate(item.key)}
            title={isCollapsed ? item.label : undefined}
            type="button"
          >
            <span className="nav-item-icon" aria-hidden="true">{item.icon}</span>
            <span className="nav-item-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </Sider>
  )
}
