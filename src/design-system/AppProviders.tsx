import { ConfigProvider, theme } from 'antd'
import type { ReactNode } from 'react'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1f5974',
          colorInfo: '#1f5974',
          colorText: '#111827',
          colorTextSecondary: '#64748b',
          colorBgLayout: '#f4f3f1',
          colorBorder: '#d7dde3',
          borderRadius: 8,
          fontSize: 12,
          fontFamily: 'Aptos, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
        },
        components: {
          Button: { controlHeight: 30, borderRadius: 7, fontWeight: 700 },
          Input: { controlHeight: 30, borderRadius: 7 },
          Select: {
            controlHeight: 30,
            controlHeightSM: 28,
            borderRadius: 7,
            optionHeight: 28,
            optionFontSize: 12,
            optionPadding: '4px 9px',
            selectorBg: '#ffffff',
          },
          Table: {
            headerBg: '#f1f4f6',
            headerColor: '#64748b',
            rowHoverBg: '#f7fafc',
            borderColor: '#dfe5eb',
          },
          Tabs: {
            horizontalItemPadding: '8px 0 9px',
            itemSelectedColor: '#111827',
            inkBarColor: '#111827',
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  )
}
