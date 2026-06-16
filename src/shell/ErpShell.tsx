import { Layout } from 'antd'
import type { ReactNode } from 'react'
import type { ActiveView } from '../state/appState'
import { NavigationPanel } from './NavigationPanel'
import { WindowChrome } from './WindowChrome'

export function ErpShell({
  activeView: _activeView,
  onNavigate,
  children,
}: {
  activeView: ActiveView
  onNavigate: (view: ActiveView) => void
  children: ReactNode
}) {
  return (
    <Layout className="erp-v2-shell">
      <WindowChrome />
      <Layout className="erp-shell-body">
        <NavigationPanel activeView={_activeView} onNavigate={onNavigate} />
        <Layout className="erp-main-layout">
          <div className="erp-main-scroll">
            <div className="erp-main-content">{children}</div>
          </div>
        </Layout>
      </Layout>
    </Layout>
  )
}
