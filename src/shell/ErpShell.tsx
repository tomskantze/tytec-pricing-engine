import { Layout } from 'antd'
import type { ReactNode } from 'react'
import type { ActiveView } from '../state/appState'
import { NavigationPanel } from './NavigationPanel'

const { Content } = Layout

export function ErpShell({
  activeView,
  onNavigate,
  children,
}: {
  activeView: ActiveView
  onNavigate: (view: ActiveView) => void
  children: ReactNode
}) {
  return (
    <Layout className="erp-v2-shell">
      <NavigationPanel activeView={activeView} onNavigate={onNavigate} />
      <Layout className="erp-main-layout">
        <Content className="erp-main-content">{children}</Content>
      </Layout>
    </Layout>
  )
}
