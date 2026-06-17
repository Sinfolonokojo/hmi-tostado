import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { MachineDataProvider } from './lib/machineData.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <MachineDataProvider>
        <App />
      </MachineDataProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
