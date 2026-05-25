// src/main.js - Versión OPTIMIZADA (sin duplicar showPage)
import './supabase-config.js'
import './utils.js'
import './members.js'
import './app.js'

document.addEventListener('DOMContentLoaded', () => {
  const userRole = localStorage.getItem('userRole')
  const user = localStorage.getItem('user')
  
  console.log('🔍 main.js verificando:', { userRole, tieneUser: !!user })

  if (userRole === 'admin' && user) {
    console.log('👑 Admin detectado correctamente')
    setTimeout(() => {
      if (typeof window.showMainApp === 'function') window.showMainApp()
      if (typeof window.checkAuth === 'function') window.checkAuth()
      if (typeof window.initializeAppData === 'function') window.initializeAppData()
    }, 300)
  } 
  else if (userRole === 'member') {
    window.location.href = 'client-dashboard.html'
  } 
  else {
    window.location.href = 'login.html'
  }
})

// Nota: showPage ya está definida en app.js y exportada como window.showPage
// No es necesario redefinirla aquí