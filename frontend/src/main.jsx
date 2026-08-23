import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api'
axios.defaults.withCredentials = true
axios.defaults.baseURL = API_URL

// Apply persisted settings before first render
const saved = JSON.parse(localStorage.getItem('wetalk-settings') || '{}')
const state = saved?.state || {}
document.documentElement.classList.toggle('dark', !!state.darkMode)
document.documentElement.classList.add(`font-size-${state.fontSize || 'medium'}`)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)