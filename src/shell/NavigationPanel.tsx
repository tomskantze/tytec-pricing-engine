import {
  HomeOutlined,
  CheckSquareOutlined,
  DownOutlined,
  FileAddOutlined,
  FileTextOutlined,
  IdcardOutlined,
  LeftOutlined,
  RightOutlined,
  SaveOutlined,
  TableOutlined,
  TagsOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Button, Layout } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ActiveView, CustomerWorkspaceTab, QuoteBuilderTab } from '../state/appState'

const { Sider } = Layout
const collapsedNavWidth = 68

type CustomerNavEntry = {
  key: string
  name: string
  invoicesLabel: string
  showCreateJob: boolean
  showTechnicians: boolean
}

type NavChild = {
  key: string
  label: string
  icon: ReactNode
  active: boolean
  onClick: () => void
}

type NavSection = {
  key: ActiveView
  label: string
  icon: ReactNode
  active: boolean
  onClick: () => void
  children: NavChild[]
}

function customerTabs(customer: CustomerNavEntry): Array<{ key: CustomerWorkspaceTab; label: string; icon: ReactNode }> {
  return [
    { key: 'profile', label: 'Profile', icon: <IdcardOutlined /> },
    { key: 'rate-cards', label: 'Rate Cards', icon: <TagsOutlined /> },
    ...(customer.showCreateJob ? [{ key: 'create-job' as const, label: 'Job Records', icon: <FileAddOutlined /> }] : []),
    { key: 'invoices', label: customer.invoicesLabel, icon: <TableOutlined /> },
    { key: 'review-queue', label: 'Review Queue', icon: <CheckSquareOutlined /> },
    ...(customer.showTechnicians ? [{ key: 'technicians' as const, label: 'Technicians', icon: <UserOutlined /> }] : []),
  ]
}

export function NavigationPanel({
  activeView,
  customerWorkspaceTab,
  customers,
  onOpenCustomer,
  onOpenCustomerTab,
  onOpenHome,
  onOpenCustomers,
  onOpenFortnox,
  onOpenQuoteTab,
  quoteBuilderTab,
  selectedCustomerKey,
}: {
  activeView: ActiveView
  customerWorkspaceTab: CustomerWorkspaceTab
  customers: CustomerNavEntry[]
  onOpenCustomer: (customerKey: string) => void
  onOpenCustomerTab: (customerKey: string, tab: CustomerWorkspaceTab) => void
  onOpenHome: () => void
  onOpenCustomers: () => void
  onOpenFortnox: () => void
  onOpenQuoteTab: (tab: QuoteBuilderTab) => void
  quoteBuilderTab: QuoteBuilderTab
  selectedCustomerKey: string
}) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [expandedCustomerKey, setExpandedCustomerKey] = useState<string | null>(selectedCustomerKey || null)
  const [expandedSections, setExpandedSections] = useState<Record<ActiveView, boolean>>({
    home: false,
    customers: true,
    fortnox: false,
    'quote-builder': false,
  })

  useEffect(() => {
    if (selectedCustomerKey) setExpandedCustomerKey(selectedCustomerKey)
  }, [selectedCustomerKey])

  useEffect(() => {
    setExpandedSections((current) => current[activeView] ? current : { ...current, [activeView]: true })
  }, [activeView])

  const sections = useMemo<NavSection[]>(() => [
    {
      key: 'home',
      label: 'Home',
      icon: <HomeOutlined />,
      active: activeView === 'home',
      onClick: onOpenHome,
      children: [],
    },
    {
      key: 'customers',
      label: 'Customers',
      icon: <TeamOutlined />,
      active: activeView === 'customers',
      onClick: onOpenCustomers,
      children: [
        {
          key: 'customers-all',
          label: 'All Customers',
          icon: <TeamOutlined />,
          active: activeView === 'customers' && !selectedCustomerKey,
          onClick: onOpenCustomers,
        },
      ],
    },
    {
      key: 'fortnox',
      label: 'Fortnox',
      icon: <TagsOutlined />,
      active: activeView === 'fortnox',
      onClick: onOpenFortnox,
      children: [
        {
          key: 'fortnox-article-mapping',
          label: 'Article Mapping',
          icon: <TagsOutlined />,
          active: activeView === 'fortnox',
          onClick: onOpenFortnox,
        },
      ],
    },
    {
      key: 'quote-builder',
      label: 'Quote Builder',
      icon: <FileTextOutlined />,
      active: activeView === 'quote-builder',
      onClick: () => onOpenQuoteTab('builder'),
      children: [
        {
          key: 'quote-builder-builder',
          label: 'Builder',
          icon: <FileTextOutlined />,
          active: activeView === 'quote-builder' && quoteBuilderTab === 'builder',
          onClick: () => onOpenQuoteTab('builder'),
        },
        {
          key: 'quote-builder-saved',
          label: 'Saved Quotes',
          icon: <SaveOutlined />,
          active: activeView === 'quote-builder' && quoteBuilderTab === 'saved',
          onClick: () => onOpenQuoteTab('saved'),
        },
      ],
    },
  ], [activeView, onOpenCustomers, onOpenFortnox, onOpenHome, onOpenQuoteTab, quoteBuilderTab, selectedCustomerKey])

  function toggleSection(sectionKey: ActiveView) {
    setExpandedSections((current) => ({ ...current, [sectionKey]: !current[sectionKey] }))
  }

  return (
    <Sider className="erp-sidebar" collapsed={isCollapsed} collapsedWidth={collapsedNavWidth} trigger={null} width="max-content">
      <div className="brand-block" aria-label="Tytec Pricing Engine">
        <div className="brand-mark">T</div>
        <div className="brand-copy">
          <strong>TYTEC PRICING</strong>
          <span>Customer workspace</span>
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
        {sections.map((section) => {
          const showChildren = !isCollapsed && expandedSections[section.key]
          return (
            <div className={`nav-section${showChildren ? ' is-open' : ''}`} key={section.key}>
              <button
                aria-current={section.active ? 'page' : undefined}
                aria-expanded={section.children.length ? showChildren : undefined}
                className={`nav-item nav-branch${section.active ? ' is-active' : ''}${showChildren ? ' is-expanded' : ''}`}
                onClick={() => (section.children.length ? toggleSection(section.key) : section.onClick())}
                title={isCollapsed ? section.label : undefined}
                type="button"
              >
                <span className="nav-item-main">
                  <span className="nav-item-icon" aria-hidden="true">{section.icon}</span>
                  <span className="nav-item-label">{section.label}</span>
                </span>
                {!isCollapsed && section.children.length ? (
                  <span className="nav-item-caret" aria-hidden="true">
                    {showChildren ? <DownOutlined /> : <RightOutlined />}
                  </span>
                ) : null}
              </button>

              {showChildren ? (
                <div className="nav-submenu">
                  {section.children.map((child) => (
                    <button
                      aria-current={child.active ? 'page' : undefined}
                      className={`nav-subitem${child.active ? ' is-active' : ''}`}
                      key={child.key}
                      onClick={child.onClick}
                      type="button"
                    >
                      <span className="nav-subitem-icon" aria-hidden="true">{child.icon}</span>
                      <span className="nav-subitem-label">{child.label}</span>
                    </button>
                  ))}

                  {section.key === 'customers' ? customers.map((customer) => {
                    const customerActive = activeView === 'customers' && selectedCustomerKey === customer.key
                    const customerExpanded = expandedCustomerKey === customer.key
                    return (
                      <div className="nav-customer-group" key={customer.key}>
                        <button
                          aria-current={customerActive ? 'page' : undefined}
                          aria-expanded={customerExpanded}
                          className={`nav-subitem nav-branch nav-branch-sub${customerActive ? ' is-active' : ''}${customerExpanded ? ' is-expanded' : ''}`}
                          onClick={() => {
                            setExpandedCustomerKey((current) => current === customer.key ? null : customer.key)
                            if (!customerActive) onOpenCustomer(customer.key)
                          }}
                          type="button"
                        >
                          <span className="nav-subitem-icon" aria-hidden="true"><TeamOutlined /></span>
                          <span className="nav-subitem-label">{customer.name}</span>
                          <span className="nav-subitem-caret" aria-hidden="true">
                            {customerExpanded ? <DownOutlined /> : <RightOutlined />}
                          </span>
                        </button>
                        {customerExpanded ? (
                          <div className="nav-submenu nav-submenu-nested">
                            {customerTabs(customer).map((tab) => (
                              <button
                                aria-current={customerActive && customerWorkspaceTab === tab.key ? 'page' : undefined}
                                className={`nav-subitem${customerActive && customerWorkspaceTab === tab.key ? ' is-active' : ''}`}
                                key={`${customer.key}-${tab.key}`}
                                onClick={() => onOpenCustomerTab(customer.key, tab.key)}
                                type="button"
                              >
                                <span className="nav-subitem-icon" aria-hidden="true">{tab.icon}</span>
                                <span className="nav-subitem-label">{tab.label}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  }) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </nav>
    </Sider>
  )
}
