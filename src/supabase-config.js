// supabase-config.js - VERSIÓN VITE
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabaseClient = null
let supabaseReady = false
let pendingCallbacks = []

function initSupabase() {
  return new Promise((resolve, reject) => {
    try {
      supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      console.log('✅ Supabase inicializado correctamente')
      
      supabaseClient.auth.getSession().then(({ data, error }) => {
        if (error) {
          console.warn('⚠️ Error de conexión:', error.message)
          reject(error)
        } else {
          console.log('✅ Conexión con Supabase establecida')
          supabaseReady = true
          pendingCallbacks.forEach(cb => cb())
          pendingCallbacks = []
          resolve()
        }
      })
    } catch (error) {
      console.error('❌ Error:', error)
      reject(error)
    }
  })
}

function onSupabaseReady(callback) {
  if (supabaseReady && supabaseClient) {
    callback()
  } else {
    pendingCallbacks.push(callback)
  }
}

window.supabaseClient = () => supabaseClient
window.onSupabaseReady = onSupabaseReady
window.supabaseReady = () => supabaseReady

initSupabase()

export { supabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY, onSupabaseReady }