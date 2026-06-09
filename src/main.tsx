import 'antd/dist/reset.css'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/main.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('App root was not found.')
}

createRoot(root).render(<App />)
