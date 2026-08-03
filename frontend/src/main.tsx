import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { migrateVdStorage } from './utils/vdStorage'

migrateVdStorage()

createRoot(document.getElementById('root')!).render(
  <App />
)
