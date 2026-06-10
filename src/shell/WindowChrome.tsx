import {
  BorderOutlined,
  CloseOutlined,
  MinusOutlined,
  SwitcherOutlined,
} from '@ant-design/icons'
import { Button } from 'antd'
import { useEffect, useState } from 'react'

type DesktopWindowApi = {
  close: () => void
  isDesktop: boolean
  isMaximized: () => Promise<boolean>
  minimize: () => void
  onMaximizedChange: (callback: (value: boolean) => void) => () => void
  toggleMaximize: () => Promise<boolean>
}

function desktopWindow() {
  return (window as Window & { desktopWindow?: DesktopWindowApi }).desktopWindow
}

export function WindowChrome() {
  const api = desktopWindow()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (!api?.isDesktop) return
    api.isMaximized().then(setIsMaximized)
    return api.onMaximizedChange(setIsMaximized)
  }, [api])

  return (
    <div className="window-chrome">
      <div className="window-chrome-drag">
        <div className="window-chrome-brand">
          <span className="window-chrome-mark">T</span>
          <span className="window-chrome-title">Tytec Pricing Engine</span>
        </div>
      </div>
      {api?.isDesktop ? (
        <div aria-label="Window controls" className="window-chrome-controls">
          <Button className="window-control-button" icon={<MinusOutlined />} onClick={() => api.minimize()} type="text" />
          <Button
            className="window-control-button"
            icon={isMaximized ? <SwitcherOutlined rotate={90} /> : <BorderOutlined />}
            onClick={() => api.toggleMaximize().then(setIsMaximized)}
            type="text"
          />
          <Button className="window-control-button is-close" icon={<CloseOutlined />} onClick={() => api.close()} type="text" />
        </div>
      ) : null}
    </div>
  )
}
