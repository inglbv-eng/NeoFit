// supabase-config.js - VERSIÓN CORREGIDA
const SUPABASE_URL = 'https://ojlhnmvmwxxipicfkpul.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qbGhubXZtd3h4aXBpY2ZrcHVsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTU1NjUyMCwiZXhwIjoyMDk1MTMyNTIwfQ.16Rq-oJhEw5JAQqGcwC2hTUP39XXtd2x-V6gpPipAJ8';

// Inicializar Supabase (variable global)
let supabaseClient = null;
let supabaseReady = false;
let pendingCallbacks = [];

function initSupabase() {
  return new Promise((resolve, reject) => {
    try {
      if (typeof supabase !== 'undefined' && supabase.createClient) {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase inicializado correctamente');
        
        // Verificar conexión
        supabaseClient.auth.getSession().then(({ data, error }) => {
          if (error) {
            console.warn('⚠️ Error de conexión con Supabase:', error.message);
            reject(error);
          } else {
            console.log('✅ Conexión con Supabase establecida');
            supabaseReady = true;
            // Ejecutar callbacks pendientes
            pendingCallbacks.forEach(cb => cb());
            pendingCallbacks = [];
            resolve();
          }
        });
      } else {
        console.error('❌ Supabase JS no cargado - reintentando...');
        setTimeout(() => initSupabase().then(resolve).catch(reject), 1000);
      }
    } catch (error) {
      console.error('❌ Error inicializando Supabase:', error);
      reject(error);
    }
  });
}

// Función para esperar que Supabase esté listo
function onSupabaseReady(callback) {
  if (supabaseReady && supabaseClient) {
    callback();
  } else {
    pendingCallbacks.push(callback);
  }
}

// Hacer disponible globalmente
window.supabaseClient = () => supabaseClient;
window.onSupabaseReady = onSupabaseReady;
window.supabaseReady = () => supabaseReady;

// Inicializar automáticamente
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initSupabase());
} else {
  initSupabase();
}

// Exportar para uso en otros archivos (si es necesario)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { supabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY, onSupabaseReady };
}