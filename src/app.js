// ============ VARIABLES GLOBALES ============
let currentUser = null;
let allMembers = [];
let html5QrCode = null;
let attendanceChart = null;
let incomeChart = null;
let qrProcessing = false;
let scannerStarting = false;
let currentProfileMember = null;
let progressChart = null;
let isInitializing = false;
let isLoadingDashboard = false;
let currentView = 'table';
let lastChartsLoad = 0;
let isScannerActive = false;
let realtimeSubscription = null; // NUEVA VARIABLE
const CHARTS_REFRESH_INTERVAL = 30000; // 30 segundos

// ============ REALTIME PARA CHECK-INS INSTANTÁNEOS ============
async function setupRealtimeCheckins() {
  try {
    const client = window.supabaseClient();
    if (!client) {
      console.log('⏳ Esperando Supabase...');
      setTimeout(setupRealtimeCheckins, 1000);
      return;
    }

    // Si ya hay una suscripción activa, limpiarla primero
    if (realtimeSubscription) {
      console.log('🔄 Limpiando suscripción Realtime anterior...');
      await realtimeSubscription.unsubscribe();
      realtimeSubscription = null;
    }

    console.log('🔌 Configurando Realtime para check-ins...');

    // Crear canal para escuchar cambios en checkins
    const channel = client.channel('checkins-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',  // Solo escuchar nuevos check-ins
          schema: 'public',
          table: 'checkins'
        },
        async (payload) => {
          console.log('📡 NUEVO CHECK-IN DETECTADO EN TIEMPO REAL!', payload);
          
          const newCheckin = payload.new;
          
          if (!newCheckin || !newCheckin.member_id) {
            console.warn('⚠️ Payload inválido:', newCheckin);
            return;
          }

          // Obtener información del miembro
          try {
            const { data: member, error: memberError } = await client
              .from('members')
              .select('name, plan')
              .eq('id', newCheckin.member_id)
              .single();

            if (memberError) throw memberError;

            // Obtener el miembro completo para otras funciones
            const fullMember = allMembers.find(m => m.id === newCheckin.member_id);
            
            // Verificar la página actual
            const currentPage = getCurrentPage();
            
            // 1. Actualizar la lista de check-ins de hoy SI estamos en esa página o en dashboard
            if (currentPage === 'checkin-list' || currentPage === 'dashboard') {
              await loadTodayCheckins();
              console.log('✅ Lista de check-ins actualizada');
            }
            
            // 2. Actualizar el contador del dashboard
            if (currentPage === 'dashboard') {
              await loadDashboardData();
            }
            
            // 3. Actualizar contador en tiempo real en el botón (opcional)
            updateCheckinBadge();
            
            // 4. Mostrar notificación flotante
            showToast(`🔔 NUEVO CHECK-IN: ${member.name} (${member.plan})`, 'success', 4000);
            
            // 5. Si el perfil del miembro está abierto y es el mismo, actualizar sus check-ins
            if (currentProfileMember && currentProfileMember.id === newCheckin.member_id) {
              await loadProfileCheckins(currentProfileMember.id);
            }
            
            // 6. Actualizar el contador de check-ins en localStorage
            const today = new Date().toISOString().split('T')[0];
            const currentCount = parseInt(localStorage.getItem(`checkin_count_${today}`)) || 0;
            localStorage.setItem(`checkin_count_${today}`, (currentCount + 1).toString());
            
            // 7. Si estamos en la página de miembros, actualizar el último check-in en la tabla
            if (currentPage === 'members' && fullMember) {
              // Actualizar el miembro en allMembers
              const memberIndex = allMembers.findIndex(m => m.id === newCheckin.member_id);
              if (memberIndex !== -1) {
                allMembers[memberIndex].last_checkin = newCheckin.checkin_time;
                if (typeof updateMembersTable === 'function') {
                  await updateMembersTable();
                }
              }
            }
            
          } catch (error) {
            console.error('❌ Error procesando check-in en tiempo real:', error);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime activo - Escuchando nuevos check-ins');
        } else if (status === 'CHANNEL_ERROR') {
          // No mostrar error si es el primer intento o error de transporte temporal
          if (err?.message?.includes('transport failure') || err?.message?.includes('WebSocket')) {
            console.log('🔄 Intentando reconectar Realtime...');
          } else {
            console.warn('⚠️ Error en canal Realtime:', err?.message || err);
          }
          setTimeout(() => setupRealtimeCheckins(), 5000);
        } else if (status === 'TIMED_OUT') {
          console.log('🔄 Realtime timeout, reconectando...');
          setTimeout(() => setupRealtimeCheckins(), 3000);
        }
      });
        
    realtimeSubscription = channel;
    
    return channel;
    
  } catch (error) {
    console.error('❌ Error configurando Realtime:', error);
    // Reintentar después de 10 segundos
    setTimeout(() => setupRealtimeCheckins(), 10000);
  }
}

// Función para actualizar badge en el botón de check-ins
function updateCheckinBadge() {
  const today = new Date().toISOString().split('T')[0];
  const count = localStorage.getItem(`checkin_count_${today}`);
  const badgeElement = document.getElementById('checkinBadge');
  
  if (badgeElement && count && parseInt(count) > 0) {
    badgeElement.textContent = count;
    badgeElement.classList.remove('hidden');
  } else if (badgeElement) {
    badgeElement.classList.add('hidden');
  }
}

// Función mejorada de loadTodayCheckins con caché local
async function loadTodayCheckins() {
  try {
    const client = window.supabaseClient();
    if (!client) return;

    const todayStr = new Date().toISOString().split('T')[0];
    console.log('📅 Cargando check-ins del:', todayStr);

    // PASO 1: Traer todos los check-ins de hoy
    const { data: checkins, error: checkinsError } = await client
      .from('checkins')
      .select('*')
      .gte('checkin_time', `${todayStr} 00:00:00`)
      .lte('checkin_time', `${todayStr} 23:59:59`)
      .order('checkin_time', { ascending: false });

    if (checkinsError) throw checkinsError;

    console.log('📊 Check-ins encontrados:', checkins?.length || 0);

    // Actualizar contador
    const count = checkins?.length || 0;
    document.getElementById('todayCount').textContent = count;

    if (!checkins || checkins.length === 0) {
      document.getElementById('todayCheckinsList').innerHTML = `<div class="text-center py-12 text-zinc-400">
        <i class="fas fa-clock text-5xl mb-4 opacity-30"></i>
        <p class="text-lg">Aún no hay check-ins hoy</p>
      </div>`;
      return;
    }

    // PASO 2: Traer los nombres de los miembros (usando los IDs de los check-ins)
    const memberIds = [...new Set(checkins.map(c => c.member_id))];
    
    const { data: members, error: membersError } = await client
      .from('members')
      .select('id, name, plan')
      .in('id', memberIds);

    if (membersError) throw membersError;

    // Crear un mapa para acceso rápido
    const memberMap = {};
    members.forEach(m => { memberMap[m.id] = m; });

    // PASO 3: Mostrar en pantalla
    const container = document.getElementById('todayCheckinsList');
    container.innerHTML = checkins.map(c => {
      const member = memberMap[c.member_id];
      const date = new Date(c.checkin_time);
      const hora = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      return `
        <div class="flex items-center justify-between p-4 bg-zinc-800 rounded-2xl">
          <div>
            <p class="font-semibold text-white">${escapeHtml(member?.name || 'Desconocido')}</p>
            <p class="text-sm text-zinc-400">${member?.plan || 'Sin plan'}</p>
          </div>
          <div class="text-emerald-400 font-medium">
            <i class="fas fa-clock"></i> ${hora}
          </div>
        </div>
      `;
    }).join('');

    // Guardar en localStorage para el badge
    localStorage.setItem(`checkin_count_${todayStr}`, count.toString());
    updateCheckinBadge();

    console.log('✅ Lista actualizada con', checkins.length, 'check-ins');
    if (checkins.length > 0) {
      console.log('📝 Primer check-in:', checkins[0]);
      console.log('👤 Miembro:', memberMap[checkins[0].member_id]?.name);
    }

  } catch (error) {
    console.error('❌ Error en loadTodayCheckins:', error);
    showToast('Error al cargar los check-ins', 'error');
  }
}

// Función para verificar estado de Realtime
function checkRealtimeStatus() {
  if (realtimeSubscription) {
    console.log('📡 Realtime activo:', realtimeSubscription.state);
    return realtimeSubscription.state;
  }
  return 'DISCONNECTED';
}

// Función para reiniciar Realtime (si es necesario)
async function restartRealtime() {
  console.log('🔄 Reiniciando conexión Realtime...');
  await setupRealtimeCheckins();
}

// ============ MODIFICAR INITIALIZEAPPDATA ============
async function initializeAppData() {
  if (isInitializing) return;
  isInitializing = true;
  
  showToast('Cargando datos...', 'info');
  try {
    await loadDashboardData();
    if (typeof loadMembers === 'function') await loadMembers();
    await loadPayments();
    await loadTodayCheckins();
    
    // ✅ INICIAR REALTIME DESPUÉS DE CARGAR DATOS
    await setupRealtimeCheckins();
       
    const savedView = localStorage.getItem('membersView');
    if (savedView === 'card') { 
      currentView = 'card'; 
    } else { 
      currentView = 'table'; 
    }
    if (typeof updateViewDisplay === 'function') updateViewDisplay();
    
    showToast('Datos cargados correctamente');
    console.log('✅ Realtime listo para recibir check-ins instantáneos');
    
  } catch (error) {
    console.error('Error initializing app:', error);
    showToast('Error al cargar datos', 'error');
  } finally {
    isInitializing = false;
  }
}

// ============ MODIFICAR SHOWPAGE PARA GESTIONAR REALTIME ============
async function showPage(page) {
  console.log('📄 Cambiando a página:', page);
  
  // 1. Ocultar TODAS las páginas
  const pages = ['dashboard', 'members', 'checkin-list', 'qr-scanner', 'payments', 'whatsapp'];
  pages.forEach(p => {
    const el = document.getElementById(`page-${p}`);
    if (el) el.classList.add('hidden');
  });
  
  // 2. Mostrar SOLO la página seleccionada
  const activePage = document.getElementById(`page-${page}`);
  if (activePage) {
    activePage.classList.remove('hidden');
  } else {
    console.error('❌ Página no encontrada:', page);
    return;
  }
  
  // 3. Quitar clase activa de TODOS los botones
  const buttons = ['dashboard', 'members', 'checkin-list', 'qr-scanner', 'payments', 'whatsapp'];
  buttons.forEach(btn => {
    const btnEl = document.getElementById(`btn-${btn}`);
    if (btnEl) {
      btnEl.classList.remove('bg-sky-600', 'text-white');
      btnEl.classList.add('text-zinc-400');
    }
  });
  
  // 4. Poner clase activa SOLO al botón clickeado
  const activeBtn = document.getElementById(`btn-${page}`);
  if (activeBtn) {
    activeBtn.classList.remove('text-zinc-400');
    activeBtn.classList.add('bg-sky-600', 'text-white');
  }
  
  // 5. Manejar cámara SOLO para la página QR
  if (page === 'qr-scanner') {
    if (typeof stopQRScanner === 'function') {
      await stopQRScanner();
    }
    setTimeout(() => {
      if (typeof startQRScanner === 'function') {
        startQRScanner();
      }
    }, 200);
  } else {
    if (typeof stopQRScanner === 'function') {
      await stopQRScanner();
    }
  }
  
  // 6. Si cambiamos a check-in list, refrescar datos
  if (page === 'checkin-list') {
    await loadTodayCheckins();
  }
}

// ============ LIMPIAR REALTIME AL CERRAR SESIÓN ============
function logout() {
  const client = window.supabaseClient();
  
  // Limpiar suscripción Realtime
  if (realtimeSubscription) {
    realtimeSubscription.unsubscribe();
    realtimeSubscription = null;
  }
  
  if (client) client.auth.signOut();
  currentUser = null;
  localStorage.removeItem('user');
  localStorage.removeItem('userRole');
  localStorage.removeItem('neofit_client');
  window.location.href = 'login.html';
}

// ============ AGREGAR CSS PARA ANIMACIONES ============
function addRealtimeStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .animate-fade-in {
      animation: fadeIn 0.5s ease-out;
    }
    
    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.1);
      }
    }
    
    .new-checkin-indicator {
      animation: pulse 0.5s ease-out;
    }
    
    /* Badge de notificación */
    .notification-badge {
      position: absolute;
      top: -8px;
      right: -8px;
      background: #ef4444;
      color: white;
      border-radius: 9999px;
      padding: 2px 6px;
      font-size: 10px;
      font-weight: bold;
      min-width: 18px;
      text-align: center;
    }
  `;
  document.head.appendChild(style);
}

function showMainApp() {
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) loginScreen.classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
}

function checkAuth() {
  const user = localStorage.getItem('user');
  const userRole = localStorage.getItem('userRole');
  
  if (!user || userRole !== 'admin') {
    window.location.href = 'login.html';
    return;
  }
  
  if (!window.supabaseReady()) {
    window.onSupabaseReady(() => {
      if (localStorage.getItem('user')) {
        currentUser = JSON.parse(localStorage.getItem('user'));
        showMainApp();
        initializeAppData();
      } else {
        window.location.href = 'login.html';
      }
    });
    return;
  }
  
  if (user) {
    currentUser = JSON.parse(user);
    showMainApp();
    initializeAppData();
  }
}

// ============ DASHBOARD ============
async function loadDashboardData() {
  // Evitar llamadas simultáneas
  if (isLoadingDashboard) return;
  isLoadingDashboard = true;
  
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    // Obtener miembros activos
    const { count: activeCount } = await client
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    
    const activeMembersEl = document.getElementById('activeMembers');
    if (activeMembersEl) activeMembersEl.textContent = activeCount || 0;
    
    // Obtener ingresos del mes
    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const { data: payments } = await client
      .from('payments')
      .select('amount')
      .gte('payment_date', firstDayOfMonth);
    
    const monthlyTotal = payments?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0;
    const monthlyIncomeEl = document.getElementById('monthlyIncome');
    if (monthlyIncomeEl) monthlyIncomeEl.textContent = `$${monthlyTotal.toLocaleString()}`;
    
    // Obtener check-ins de hoy
    const today = new Date().toISOString().split('T')[0];
    const { count: checkinsCount } = await client
      .from('checkins')
      .select('*', { count: 'exact', head: true })
      .gte('checkin_time', today);
    
    const todayCheckinsEl = document.getElementById('todayCheckins');
    if (todayCheckinsEl) todayCheckinsEl.textContent = checkinsCount || 0;
    
    // Obtener miembros por vencer (7 días)
    const expiringDate = new Date();
    expiringDate.setDate(expiringDate.getDate() + 7);
    const { count: expiringCount } = await client
      .from('members')
      .select('*', { count: 'exact', head: true })
      .lte('membership_end', expiringDate.toISOString().split('T')[0])
      .gte('membership_end', new Date().toISOString().split('T')[0]);
    
    const expiringMembersEl = document.getElementById('expiringMembers');
    if (expiringMembersEl) expiringMembersEl.textContent = expiringCount || 0;
    
    // Cargar gráficos (solo si los canvas existen y ha pasado el tiempo mínimo)
    await loadCharts();
    
  } catch (error) {
    console.error('Error loading dashboard:', error);
    showToast('Error al cargar el dashboard', 'error');
  } finally {
    isLoadingDashboard = false;
  }
}

async function loadCharts() {
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    const now = Date.now();
    // Si los gráficos ya existen y no ha pasado el tiempo mínimo, solo actualizar datos
    if (attendanceChart && incomeChart && (now - lastChartsLoad) < CHARTS_REFRESH_INTERVAL) {
      await updateChartData();
      console.log('✅ Gráficos actualizados (sin recrear)');
      return;
    }
    
    lastChartsLoad = now;
    
    // Destruir gráficos existentes
    if (attendanceChart) {
      try {
        attendanceChart.destroy();
      } catch(e) {}
      attendanceChart = null;
    }
    
    if (incomeChart) {
      try {
        incomeChart.destroy();
      } catch(e) {}
      incomeChart = null;
    }
    
    // Limpiar canvas
    const attendanceCanvas = document.getElementById('attendanceChart');
    const incomeCanvas = document.getElementById('incomeChart');
    
    if (attendanceCanvas && attendanceCanvas.getContext) {
      const ctx = attendanceCanvas.getContext('2d');
      ctx.clearRect(0, 0, attendanceCanvas.width, attendanceCanvas.height);
    }
    
    if (incomeCanvas && incomeCanvas.getContext) {
      const ctx = incomeCanvas.getContext('2d');
      ctx.clearRect(0, 0, incomeCanvas.width, incomeCanvas.height);
    }
    
    // Obtener datos de los últimos 7 días
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      last7Days.push(date.toISOString().split('T')[0]);
    }
    
    const attendanceData = [];
    for (const date of last7Days) {
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const { count } = await client
        .from('checkins')
        .select('*', { count: 'exact', head: true })
        .gte('checkin_time', date)
        .lt('checkin_time', nextDay.toISOString().split('T')[0]);
      attendanceData.push(count || 0);
    }
    
    // Crear gráfico de asistencia
    if (attendanceCanvas && attendanceCanvas.getContext) {
      attendanceChart = new Chart(attendanceCanvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: last7Days.map(d => d.split('-').slice(1).join('/')),
          datasets: [{
            label: 'Check-ins',
            data: attendanceData,
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.1)',
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#0284c7',
            pointBorderColor: '#fff',
            pointRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { labels: { color: '#94a3b8' } }
          },
          scales: {
            y: { 
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: { color: '#94a3b8' }
            },
            x: { 
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: { color: '#94a3b8' }
            }
          }
        }
      });
    }
    
    // Obtener datos de ingresos por mes (últimos 6 meses)
    const months = [];
    const incomeData = [];
    const currentDate = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthStr = date.toISOString().slice(0, 7);
      months.push(date.toLocaleString('es', { month: 'short' }));
      
      const firstDay = `${monthStr}-01`;
      const lastDayDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const lastDay = `${monthStr}-${lastDayDate.getDate()}`;
      
      const { data } = await client
        .from('payments')
        .select('amount')
        .gte('payment_date', firstDay)
        .lte('payment_date', lastDay);
      
      const total = data?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0;
      incomeData.push(total);
    }
    
    // Crear gráfico de ingresos
    if (incomeCanvas && incomeCanvas.getContext) {
      incomeChart = new Chart(incomeCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: months,
          datasets: [{
            label: 'Ingresos ($)',
            data: incomeData,
            backgroundColor: '#10b981',
            borderRadius: 8,
            barPercentage: 0.7
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { labels: { color: '#94a3b8' } },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return `$${context.raw.toLocaleString()} MXN`;
                }
              }
            }
          },
          scales: {
            y: {
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: {
                color: '#94a3b8',
                callback: function(value) {
                  return '$' + value.toLocaleString();
                }
              }
            },
            x: {
              grid: { color: 'rgba(255,255,255,0.05)' },
              ticks: { color: '#94a3b8' }
            }
          }
        }
      });
    }
    
    console.log('✅ Gráficos cargados correctamente');
    
  } catch (error) {
    console.error('Error loading charts:', error);
  }
}

async function updateChartData() {
  try {
    const client = window.supabaseClient();
    if (!client) return;
    
    // Actualizar datos de asistencia (últimos 7 días)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      last7Days.push(date.toISOString().split('T')[0]);
    }
    
    const attendanceData = [];
    for (const date of last7Days) {
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const { count } = await client
        .from('checkins')
        .select('*', { count: 'exact', head: true })
        .gte('checkin_time', date)
        .lt('checkin_time', nextDay.toISOString().split('T')[0]);
      attendanceData.push(count || 0);
    }
    
    if (attendanceChart) {
      attendanceChart.data.datasets[0].data = attendanceData;
      attendanceChart.update();
    }
    
    // Actualizar datos de ingresos
    const months = [];
    const incomeData = [];
    const currentDate = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthStr = date.toISOString().slice(0, 7);
      months.push(date.toLocaleString('es', { month: 'short' }));
      
      const firstDay = `${monthStr}-01`;
      const lastDayDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const lastDay = `${monthStr}-${lastDayDate.getDate()}`;
      
      const { data } = await client
        .from('payments')
        .select('amount')
        .gte('payment_date', firstDay)
        .lte('payment_date', lastDay);
      
      const total = data?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0;
      incomeData.push(total);
    }
    
    if (incomeChart) {
      incomeChart.data.datasets[0].data = incomeData;
      incomeChart.update();
    }
    
  } catch (error) {
    console.error('Error updating chart data:', error);
  }
}

// ============ CHECK-IN QR stop ========
async function stopQRScanner() {
  console.log('📷 Deteniendo escáner QR...');
  
  if (html5QrCode && html5QrCode.isScanning) {
    try {
      await html5QrCode.stop();
      await html5QrCode.clear();
      console.log('✅ Escáner QR detenido correctamente');
      
      // Limpiar el contenedor
      const readerDiv = document.getElementById('reader');
      if (readerDiv) {
        readerDiv.innerHTML = '';
        readerDiv.style.background = '';
      }
    } catch (error) {
      console.warn('Error al detener escáner:', error);
    }
  }
  
  html5QrCode = null;
  scannerStarting = false;
  isScannerActive = false;
  qrProcessing = false;
}

// ============ CHECK-IN Y QR SCANNER ============
async function hasCheckinToday(memberId) {
  try {
    const client = window.supabaseClient();
    if (!client) return false;
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { data, error } = await client
      .from('checkins')
      .select('id')
      .eq('member_id', memberId)
      .gte('checkin_time', todayStart.toISOString())
      .lte('checkin_time', todayEnd.toISOString())
      .limit(1);
    
    if (error) throw error;
    return data && data.length > 0;
  } catch (error) {
    console.error('Error verificando check-in:', error);
    return false;
  }
}

async function processCheckin() {
  const qrInput = document.getElementById('manualQRInput')?.value?.trim() || '';
  if (!qrInput) {
    showToast('Por favor ingresa o escanea un código QR', 'error');
    return;
  }
  
  let memberId = qrInput.includes('_') ? qrInput.split('_')[1] : qrInput;
  
  if (!memberId || isNaN(parseInt(memberId))) {
    showToast('Código QR inválido', 'error');
    return;
  }

  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    const { data: member, error: memberError } = await client
      .from('members')
      .select('*')
      .eq('id', parseInt(memberId))
      .single();
    
    if (memberError || !member) {
      showToast('Miembro no encontrado', 'error');
      return;
    }
    
    // Verificar si la membresía está vencida
    const today = new Date();
    const expiryDate = new Date(member.membership_end);
    if (expiryDate < today) {
      showToast(`⚠️ Membresía vencida desde ${formatDate(member.membership_end)}. Por favor renueva.`, 'error');
      return;
    }
    
    // Verificar si ya hizo check-in hoy
    const alreadyCheckedIn = await hasCheckinToday(member.id);
    if (alreadyCheckedIn) {
      showToast(`⚠️ ${member.name} ya registró asistencia hoy`, 'warning');
      document.getElementById('manualQRInput').value = '';
      return;
    }
    
    // === INSERTAR CHECK-IN CON TIMESTAMP CORRECTO ===
    const now = new Date();
    const { error: checkinError } = await client
      .from('checkins')
      .insert([{
        member_id: member.id,
        checkin_time: now.toISOString()   // ← Mejor formato para Supabase
      }]);
    
    if (checkinError) throw checkinError;
    
    // Actualizar último check-in del miembro
    await client
      .from('members')
      .update({ last_checkin: now.toISOString() })
      .eq('id', member.id);
    
    showToast(`✅ Check-in exitoso! Bienvenido ${member.name}`, 'success');
    
    // Limpiar input
    document.getElementById('manualQRInput').value = '';
    
    // Actualizar vistas
    await Promise.all([
      loadTodayCheckins(),
      loadDashboardData()
    ]);

  } catch (error) {
    console.error('Error processing check-in:', error);
    showToast('Error al procesar el check-in', 'error');
  }
}

async function quickCheckin(memberId) {
  if (!memberId) {
    showToast('ID de miembro inválido', 'error');
    return;
  }
  
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    const { data: member, error } = await client
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();
    
    if (error || !member) {
      showToast('Miembro no encontrado', 'error');
      return;
    }
    
    // Verificar membresía
    const expiryDate = new Date(member.membership_end);
    if (expiryDate < new Date()) {
      showToast(`⚠️ Membresía vencida desde ${formatDate(member.membership_end)}`, 'error');
      return;
    }
    
    // Verificar check-in previo hoy
    const alreadyCheckedIn = await hasCheckinToday(member.id);
    if (alreadyCheckedIn) {
      showToast(`⚠️ ${member.name} ya registró asistencia hoy`, 'warning');
      return;
    }
    
    // === INSERTAR CHECK-IN ===
    const now = new Date();
    const { error: checkinError } = await client
      .from('checkins')
      .insert([{
        member_id: member.id,
        checkin_time: now.toISOString()
      }]);
    
    if (checkinError) throw checkinError;
    
    // Actualizar último check-in
    await client
      .from('members')
      .update({ last_checkin: now.toISOString() })
      .eq('id', member.id);
    
    showToast(`✅ Check-in rápido: ${member.name}`, 'success');
    
    // Actualizar vistas
    await Promise.all([
      loadTodayCheckins(),
      loadDashboardData()
    ]);

  } catch (error) {
    console.error('Error en check-in rápido:', error);
    showToast('Error al procesar check-in', 'error');
  }
}

async function startQRScanner() {
  // Evitar múltiples inicios
  if (isScannerActive) {
    console.log('📷 Escáner ya está activo');
    return;
  }
  
  if (scannerStarting) {
    console.log('📷 Escáner ya está iniciando');
    return;
  }
  
  scannerStarting = true;
  console.log('📷 Iniciando escáner QR...');

  try {
    // Limpiar instancia anterior si existe
    if (html5QrCode) {
      try {
        await html5QrCode.stop();
        await html5QrCode.clear();
      } catch (e) {
        console.log('Limpiando escáner anterior:', e);
      }
      html5QrCode = null;
    }

    const scannerElement = document.getElementById('reader');
    if (!scannerElement) {
      scannerStarting = false;
      console.error('❌ Elemento reader no encontrado');
      return;
    }

    // Limpiar y preparar el contenedor
    scannerElement.innerHTML = '';
    scannerElement.style.minHeight = '350px';
    scannerElement.style.background = '#000';
    scannerElement.style.position = 'relative';
    scannerElement.style.borderRadius = '20px';
    scannerElement.style.overflow = 'hidden';

    // Verificar soporte de cámara
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      scannerElement.innerHTML = `<div class="text-center p-8 text-red-400"><i class="fas fa-camera-slash text-5xl mb-3"></i><p>Tu navegador no soporta cámara</p></div>`;
      scannerStarting = false;
      return;
    }

    // Mostrar loading
    scannerElement.innerHTML = `<div class="flex flex-col items-center justify-center h-full p-8"><div class="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-400 mb-4"></div><p class="text-zinc-400">Iniciando cámara...</p></div>`;

    // Crear nueva instancia
    html5QrCode = new Html5Qrcode("reader");

    // Función para sonido
    function playBeepSound() {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 880;
        gainNode.gain.value = 0.3;
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
        oscillator.stop(audioContext.currentTime + 0.3);
        if (audioContext.state === 'suspended') audioContext.resume();
      } catch (e) {}
    }

    // Callback de éxito
    const onScanSuccess = async (decodedText) => {
      if (qrProcessing) return;
      qrProcessing = true;
      
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      playBeepSound();
      
      const input = document.getElementById('manualQRInput');
      if (input) input.value = decodedText;
      
      try {
        await processCheckin();
      } catch (e) {
        console.error('Error en check-in:', e);
        showToast('Error al procesar check-in', 'error');
      } finally {
        setTimeout(() => { qrProcessing = false; }, 2000);
      }
    };

    const onScanError = (err) => {
      // Ignorar errores comunes de escaneo
      if (err?.includes('NotFoundException') || 
          err?.includes('No MultiFormat Readers') || 
          err?.includes('source width is 0') || 
          err?.includes('IndexSizeError') ||
          err?.includes('QR code parse error')) {
        return;
      }
      console.warn('⚠️ Error escáner:', err);
    };

    const config = { 
      fps: 12, 
      qrbox: { width: 170, height: 170 }, 
      aspectRatio: 1.0, 
      disableFlip: false, 
      rememberLastUsedCamera: true, 
      formatsToSupport: [0] 
    };

    // Intentar obtener cámaras
    try {
      const cameras = await Html5Qrcode.getCameras();
      if (cameras && cameras.length > 0) {
        const backCamera = cameras.find(cam => 
          cam.label.toLowerCase().includes('back') || 
          cam.label.toLowerCase().includes('rear') || 
          cam.label.toLowerCase().includes('environment')
        );
        const cameraId = backCamera ? backCamera.id : cameras[0].id;
        await html5QrCode.start(cameraId, config, onScanSuccess, onScanError);
        isScannerActive = true;
        console.log('✅ Escáner iniciado con cámara:', backCamera ? 'trasera' : 'frontal');
      } else {
        await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanError);
        isScannerActive = true;
        console.log('✅ Escáner iniciado con facingMode environment');
      }
    } catch (cameraError) {
      console.warn('Error con cámara específica, usando facingMode:', cameraError);
      await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanError);
      isScannerActive = true;
    }

    // Ajustar video
    setTimeout(() => {
      const video = document.querySelector('#reader video');
      if (video) {
        video.style.display = 'block';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.setAttribute('playsinline', true);
        video.setAttribute('autoplay', true);
        video.setAttribute('muted', true);
        video.play().catch(() => {});
      }
    }, 500);

  } catch (err) {
    console.error('❌ Error iniciando escáner:', err);
    const scannerElement = document.getElementById('reader');
    if (scannerElement) {
      scannerElement.innerHTML = `<div class="bg-yellow-900/30 rounded-2xl p-6 text-center"><i class="fas fa-camera-slash text-5xl text-yellow-400 mb-4"></i><p class="text-white font-semibold">No se pudo acceder a la cámara</p><button onclick="startQRScanner()" class="mt-4 px-4 py-2 bg-sky-600 rounded-xl">Reintentar</button></div>`;
    }
    isScannerActive = false;
  } finally {
    scannerStarting = false;
  }
}

// ============ PAYMENTS ============
async function loadPayments() {
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    const { data, error } = await client
      .from('payments')
      .select(`*, members (name)`)
      .order('payment_date', { ascending: false });
    
    if (error) throw error;
    
    const tbody = document.getElementById('paymentsTable');
    if (!tbody) return;
    
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center p-8 text-zinc-400">No hay pagos registrados</td></tr>';
      return;
    }
    
    tbody.innerHTML = data.map(p => `
      <tr class="border-b border-zinc-800 hover:bg-zinc-800/50">
        <td class="p-5">${escapeHtml(p.members?.name || '-')}</td>
        <td class="p-5">${p.plan}</td>
        <td class="p-5 font-semibold text-green-400">$${parseFloat(p.amount).toLocaleString()}</td>
        <td class="p-5 text-zinc-400">${formatDate(p.payment_date)}</td>
        <td class="p-5 ${isExpiringSoon(p.expiration_date) ? 'text-yellow-400' : 'text-zinc-400'}">${formatDate(p.expiration_date)}</td>
        <td class="p-5"><span class="px-3 py-1 rounded-full text-xs bg-green-900/50 text-green-300">${p.status}</span></td>
        <td class="p-5 text-center"><button onclick="sendPaymentReceipt(${p.id}, '${escapeHtml(p.members?.name)}', ${p.amount})" class="text-blue-400 hover:text-blue-300"><i class="fas fa-receipt"></i></button></td>
      </tr>
    `).join('');
    
    const memberSelect = document.getElementById('paymentMemberId');
    if (memberSelect && allMembers.length) {
      memberSelect.innerHTML = '<option value="">Seleccionar miembro</option>' + allMembers.map(m => `<option value="${m.id}">${escapeHtml(m.name)} - ${m.plan}</option>`).join('');
    }
  } catch (error) {
    console.error('Error loading payments:', error);
    showToast('Error al cargar los pagos', 'error');
  }
}

async function savePayment(event) {
  event.preventDefault();
  
  const memberId = document.getElementById('paymentMemberId').value;
  const amount = document.getElementById('paymentAmount').value;
  const plan = document.getElementById('paymentPlan').value;
  
  if (!memberId) { showToast('Selecciona un miembro', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Ingresa un monto válido', 'error'); return; }
  
  const expirationDate = new Date();
  if (plan === 'Básico' || plan === 'Premium') expirationDate.setDate(expirationDate.getDate() + 30);
  else expirationDate.setFullYear(expirationDate.getFullYear() + 1);
  
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    const { error: paymentError } = await client
      .from('payments')
      .insert([{ member_id: parseInt(memberId), amount: parseFloat(amount), plan: plan, payment_date: new Date().toISOString().split('T')[0], expiration_date: expirationDate.toISOString().split('T')[0], status: 'completed' }]);
    
    if (paymentError) throw paymentError;
    
    const { error: memberError } = await client
      .from('members')
      .update({ plan: plan, membership_end: expirationDate.toISOString().split('T')[0], status: 'active' })
      .eq('id', parseInt(memberId));
    
    if (memberError) throw memberError;
    
    showToast('Pago registrado exitosamente');
    closePaymentModal();
    await loadPayments();
    await loadMembers();
    await loadDashboardData();
  } catch (error) {
    console.error('Error saving payment:', error);
    showToast('Error al registrar el pago', 'error');
  }
}

function showPaymentModal() {
  document.getElementById('paymentForm').reset();
  document.getElementById('paymentModal').classList.remove('hidden');
}

function closePaymentModal() { document.getElementById('paymentModal').classList.add('hidden'); }

// ============ WHATSAPP INTEGRATION ============
async function sendWhatsAppMessages() {
  const audience = document.getElementById('whatsappAudience').value;
  const message = document.getElementById('whatsappMessage').value;
  
  if (!message) { showToast('Escribe un mensaje primero', 'error'); return; }
  
  let members = [];
  if (audience === 'all') members = allMembers.filter(m => m.status === 'active');
  else if (audience === 'expiring') {
    const expiringDate = new Date(); expiringDate.setDate(expiringDate.getDate() + 7);
    members = allMembers.filter(m => m.membership_end && new Date(m.membership_end) <= expiringDate && new Date(m.membership_end) >= new Date());
  } else if (audience === 'inactive') members = allMembers.filter(m => m.status !== 'active');
  
  if (members.length === 0) { showToast('No hay miembros en esta categoría', 'error'); return; }
  
  const membersWithPhone = members.filter(m => m.phone && m.phone.trim());
  if (membersWithPhone.length === 0) { showToast('No hay miembros con número de teléfono', 'error'); return; }
  
  let sent = 0;
  for (const member of membersWithPhone) {
    let phone = member.phone.replace(/\s/g, '').replace(/[-()]/g, '');
    if (!phone.startsWith('+')) phone = phone.startsWith('52') ? `+${phone}` : `+52${phone}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
    sent++;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  showToast(`Se abrieron ${sent} conversaciones de WhatsApp`);
}

function useTemplate(template) {
  const templates = {
    payment_reminder: "💰 *Recordatorio de Pago*\n\nHola, te recordamos que tu membresía está por vencer. ¡Renueva ahora!\n\n🏋️‍♂️ NeoFit Gym",
    promotion: "🎉 *Promoción Especial NeoFit*\n\n¡Lleva un amigo y ambos tienen 20% de descuento!\n\n🏋️‍♂️ NeoFit Gym",
    renewal: "🔄 *Renovación de Membresía*\n\nTu membresía está activa. ¡Gracias por confiar en NeoFit!\n\n🏋️‍♂️ NeoFit Gym"
  };
  document.getElementById('whatsappMessage').value = templates[template] || '';
}

function sendPaymentReminder(memberId, memberName, phone) {
  if (!phone) { showToast('Este miembro no tiene número de teléfono', 'error'); return; }
  let cleanPhone = phone.replace(/\s/g, '').replace(/[-()]/g, '');
  if (!cleanPhone.startsWith('+')) cleanPhone = cleanPhone.startsWith('52') ? `+${cleanPhone}` : `+52${cleanPhone}`;
  const message = `Hola ${memberName}, te recordamos que tu membresía está por vencer. ¡Renueva ahora en NeoFit! 💪`;
  window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
}

function sendPaymentReceipt(paymentId, memberName, amount) {
  const member = allMembers.find(m => m.name === memberName);
  if (!member || !member.phone) { showToast('No se pudo obtener el teléfono', 'error'); return; }
  let cleanPhone = member.phone.replace(/\s/g, '').replace(/[-()]/g, '');
  if (!cleanPhone.startsWith('+')) cleanPhone = cleanPhone.startsWith('52') ? `+${cleanPhone}` : `+52${cleanPhone}`;
  const message = `🧾 *Recibo de Pago - NeoFit*\n\nHola ${memberName},\n\nHemos recibido tu pago por $${amount} MXN.\n\n¡Gracias!`;
  window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
}

// ============ PERFIL COMPLETO DEL MIEMBRO - CORREGIDA ============
async function showMemberProfile(memberId) {
  console.log("🔍 showMemberProfile llamado con ID:", memberId);
  
  let member = allMembers.find(m => m.id === memberId);
  
  // Si no está en allMembers, buscarlo directamente en Supabase
  if (!member) {
    console.log("⚠️ Miembro no encontrado en allMembers, buscando en Supabase...");
    try {
      const client = window.supabaseClient();
      if (client) {
        const { data, error } = await client
          .from('members')
          .select('*')
          .eq('id', parseInt(memberId))
          .single();
        
        if (error) throw error;
        member = data;
        console.log("✅ Miembro encontrado en Supabase:", member.name);
      }
    } catch (error) {
      console.error("❌ Error buscando miembro:", error);
      showToast("Miembro no encontrado", "error");
      return;
    }
  }
  
  if (!member) {
    console.error("❌ Miembro no encontrado con ID:", memberId);
    showToast("Miembro no encontrado", "error");
    return;
  }
  
  currentProfileMember = member;
  
  // Actualizar UI
  const nameEl = document.getElementById('profileName');
  const idEl = document.getElementById('profileId');
  const planEl = document.getElementById('profilePlan');
  const photoContainer = document.getElementById('profilePhoto');
  const statusEl = document.getElementById('profileStatus');
  const qrContainer = document.getElementById('profileQR');
  const modal = document.getElementById('memberProfileModal');
  
  if (nameEl) nameEl.textContent = member.name || '-';
  if (idEl) idEl.textContent = member.id;
  if (planEl) planEl.textContent = member.plan || 'Básico';
  
  // Foto
  if (photoContainer) {
    if (member.photo_url) {
      photoContainer.innerHTML = `<img src="${member.photo_url}" class="w-32 h-32 rounded-full object-cover">`;
      photoContainer.className = "relative";
    } else {
      const firstLetter = (member.name?.charAt(0) || '?').toUpperCase();
      photoContainer.innerHTML = firstLetter;
      photoContainer.className = "w-32 h-32 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-5xl font-bold text-white shadow-xl";
    }
  }
  
  // Estado
  if (statusEl) {
    const isActive = new Date(member.membership_end) >= new Date();
    statusEl.textContent = isActive ? '✅ Activo' : '❌ Vencido';
    statusEl.className = isActive ? 'px-3 py-1 rounded-full text-xs font-semibold bg-green-900/50 text-green-300' : 'px-3 py-1 rounded-full text-xs font-semibold bg-red-900/50 text-red-300';
  }
  
  // QR
  if (qrContainer) {
    qrContainer.innerHTML = '';
    try {
      new QRCode(qrContainer, { text: `NEOFIT_${member.id}`, width: 80, height: 80 });
    } catch(e) {
      console.warn("Error generando QR:", e);
    }
  }
  
  // Cargar datos adicionales
  await loadMemberExtraData(member.id);
  
  // Abrir modal
  if (modal) {
    modal.classList.remove('hidden');
    console.log("✅ Modal abierto para:", member.name);
  } else {
    console.error("❌ Modal #memberProfileModal no encontrado en el DOM");
  }
}

async function loadMemberExtraData(memberId) {
  const client = window.supabaseClient();
  if (!client) return;
  
  const member = currentProfileMember;
  
  if (document.getElementById('infoName')) document.getElementById('infoName').textContent = member.name || '-';
  if (document.getElementById('infoEmail')) document.getElementById('infoEmail').textContent = member.email || '-';
  if (document.getElementById('infoPhone')) document.getElementById('infoPhone').textContent = member.phone || '-';
  if (document.getElementById('infoBirth')) document.getElementById('infoBirth').textContent = member.birth_date ? formatDate(member.birth_date) : '-';
  if (document.getElementById('infoHeight')) document.getElementById('infoHeight').textContent = member.height ? `${member.height} cm` : '-';
  if (document.getElementById('infoEmergencyContact')) document.getElementById('infoEmergencyContact').textContent = member.emergency_contact || '-';
  if (document.getElementById('infoEmergencyPhone')) document.getElementById('infoEmergencyPhone').textContent = member.emergency_phone || '-';
  if (document.getElementById('infoGoals')) document.getElementById('infoGoals').textContent = member.goals || '-';
  if (document.getElementById('infoHealthNotes')) document.getElementById('infoHealthNotes').textContent = member.health_notes || '-';
  if (document.getElementById('infoCurrentPlan')) document.getElementById('infoCurrentPlan').textContent = member.plan || '-';
  if (document.getElementById('infoExpiry')) document.getElementById('infoExpiry').textContent = formatDate(member.membership_end);
  
  const daysLeft = getDaysLeft(member.membership_end);
  if (document.getElementById('infoDaysLeft')) {
    document.getElementById('infoDaysLeft').textContent = daysLeft > 0 ? `${daysLeft} días` : 'Vencida';
  }
  
  if (document.getElementById('infoLastCheckin') && member.last_checkin) document.getElementById('infoLastCheckin').textContent = formatDateTime(member.last_checkin);
  
  const { data: progress } = await client.from('member_progress').select('*').eq('member_id', memberId).order('date', { ascending: false }).limit(1);
  if (progress && progress[0]) {
    const last = progress[0];
    if (document.getElementById('infoWeight')) document.getElementById('infoWeight').textContent = last.weight ? `${last.weight} kg` : '-';
    if (document.getElementById('infoBodyFat')) document.getElementById('infoBodyFat').textContent = last.body_fat ? `${last.body_fat}%` : '-';
    if (document.getElementById('infoMuscle')) document.getElementById('infoMuscle').textContent = last.muscle_mass ? `${last.muscle_mass} kg` : '-';
    if (last.weight && member.height && document.getElementById('infoBMI')) {
      const heightM = member.height / 100;
      const bmi = (last.weight / (heightM * heightM)).toFixed(1);
      document.getElementById('infoBMI').textContent = bmi;
    }
  }
  
  await loadProfilePayments(memberId);
  await loadProgressHistory(memberId);
  await loadMemberRoutines(memberId);
  await loadProfileCheckins(memberId);
  
  await updateUserAuthUI();
}

async function loadProfilePayments(memberId) {
  const client = window.supabaseClient();
  if (!client) return;
  
  const { data } = await client.from('payments').select('*').eq('member_id', memberId).order('payment_date', { ascending: false });
  const container = document.getElementById('profilePaymentsList');
  if (!container) return;
  
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="text-center p-8 text-zinc-400">No hay pagos registrados</div>';
    return;
  }
  
  container.innerHTML = data.map(p => `
    <div class="bg-zinc-800 rounded-xl p-4 flex justify-between items-center">
      <div><p class="font-semibold text-green-400">$${parseFloat(p.amount).toLocaleString()}</p><p class="text-sm text-zinc-400">${p.plan}</p></div>
      <div class="text-right"><p class="text-sm">${formatDate(p.payment_date)}</p><p class="text-xs text-zinc-500">Vence: ${formatDate(p.expiration_date)}</p></div>
    </div>
  `).join('');
}

async function loadProgressHistory(memberId) {
  const client = window.supabaseClient();
  if (!client) return;
  
  const { data } = await client.from('member_progress').select('*').eq('member_id', memberId).order('date', { ascending: true });
  const container = document.getElementById('progressHistory');
  if (!container) return;
  
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="text-center p-8 text-zinc-400">No hay mediciones registradas</div>';
    return;
  }
  
  container.innerHTML = data.map(p => `
    <div class="bg-zinc-800 rounded-xl p-4">
      <div class="flex justify-between items-start mb-2"><p class="font-semibold">${formatDate(p.date)}</p><button onclick="deleteProgress(${p.id})" class="text-red-400 text-sm"><i class="fas fa-trash"></i></button></div>
      <div class="grid grid-cols-2 gap-2 text-sm">${p.weight ? `<div>⚖️ Peso: ${p.weight} kg</div>` : ''}${p.body_fat ? `<div>🎯 Grasa: ${p.body_fat}%</div>` : ''}${p.muscle_mass ? `<div>💪 Músculo: ${p.muscle_mass} kg</div>` : ''}</div>
      ${p.notes ? `<p class="text-xs text-zinc-400 mt-2">📝 ${p.notes}</p>` : ''}
    </div>
  `).join('');
  
  createProgressChart(data);
}

function createProgressChart(progressData) {
  const ctx = document.getElementById('progressChart')?.getContext('2d');
  if (!ctx) return;
  if (progressChart) progressChart.destroy();
  const labels = progressData.map(p => formatDate(p.date));
  const weights = progressData.map(p => p.weight);
  const bodyFat = progressData.map(p => p.body_fat);
  progressChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [{ label: 'Peso (kg)', data: weights, borderColor: '#10b981', tension: 0.3, fill: false }, { label: 'Grasa corporal (%)', data: bodyFat, borderColor: '#f59e0b', tension: 0.3, fill: false }] }, options: { responsive: true, maintainAspectRatio: true } });
}

async function loadMemberRoutines(memberId) {
  const client = window.supabaseClient();
  if (!client) return;
  
  const { data } = await client.from('routines').select('*').eq('member_id', memberId);
  const container = document.getElementById('profileRoutines');
  if (!container) return;
  
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="text-center p-8 text-zinc-400">No hay rutinas asignadas</div>';
    return;
  }
  
  container.innerHTML = data.map(r => `
    <div class="bg-zinc-800 rounded-xl p-4">
      <div class="flex justify-between items-center"><div><h4 class="font-semibold">${escapeHtml(r.name)}</h4><p class="text-sm text-zinc-400">${r.difficulty || 'Intermedio'} • ${r.days_per_week || 3} días/semana</p></div><button onclick="viewRoutine(${r.id})" class="text-sky-400"><i class="fas fa-eye"></i></button></div>
    </div>
  `).join('');
}

async function loadProfileCheckins(memberId) {
  const client = window.supabaseClient();
  if (!client) return;
  
  const { data } = await client.from('checkins').select('*').eq('member_id', memberId).order('checkin_time', { ascending: false }).limit(20);
  const container = document.getElementById('profileCheckins');
  if (!container) return;
  
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="text-center p-8 text-zinc-400">No hay check-ins registrados</div>';
    return;
  }
  
  container.innerHTML = data.map(c => `<div class="bg-zinc-800 rounded-xl p-3 flex justify-between items-center"><span>📅 ${formatDateTime(c.checkin_time)}</span><span class="text-green-400">✅ Asistió</span></div>`).join('');
}

function closeMemberProfile() { document.getElementById('memberProfileModal').classList.add('hidden'); currentProfileMember = null; }

function showProfileTab(tab) {
  // 1. Ocultar TODOS los contenidos
  const tabs = ['info', 'payments', 'progress', 'routines', 'checkins', 'user'];
  tabs.forEach(t => { 
    const tabEl = document.getElementById(`${t}Tab`); 
    if (tabEl) tabEl.classList.add('hidden'); 
  });
  
  // 2. Mostrar SOLO el contenido seleccionado
  const activeTab = document.getElementById(`${tab}Tab`);
  if (activeTab) activeTab.classList.remove('hidden');
  
  // 3. 🔥 CAMBIAR COLOR DE LOS BOTONES 🔥
  // Lista de todos los botones
  const botones = ['tabInfo', 'tabPayments', 'tabProgress', 'tabRoutines', 'tabCheckins', 'tabUser'];
  
  // Quitar el estilo activo de TODOS los botones
  botones.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.className = 'tab-btn px-6 py-3 font-medium text-sm text-zinc-400';
      btn.style.borderBottom = 'none';
    }
  });
  
  // Agregar estilo activo SOLO al botón que se clickeó
  const botonActivo = document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
  if (botonActivo) {
    botonActivo.className = 'tab-btn px-6 py-3 font-medium text-sm border-b-2 border-sky-500 text-sky-400';
  }
}

function quickCheckinFromProfile() {
  if (!currentProfileMember || !currentProfileMember.id) { showToast('Error: No se pudo obtener el miembro', 'error'); return; }
  quickCheckin(currentProfileMember.id);
  setTimeout(() => closeMemberProfile(), 1000);
}

function sendWhatsAppToMember() {
  if (!currentProfileMember || !currentProfileMember.id) { showToast('Error: No se pudo obtener el miembro', 'error'); return; }
  if (currentProfileMember.phone) { sendPaymentReminder(currentProfileMember.id, currentProfileMember.name, currentProfileMember.phone); }
  else { showToast('Miembro sin número de teléfono', 'error'); }
}

function editMemberFromProfile() {
  if (!currentProfileMember) { showToast('Error: No se pudo obtener el miembro', 'error'); return; }
  if (!currentProfileMember.id) { showToast('Error: ID de miembro inválido', 'error'); return; }
  const memberId = currentProfileMember.id;
  closeMemberProfile();
  if (typeof editMember === 'function') editMember(memberId);
}

function showPaymentModalFromProfile() { if (currentProfileMember) { document.getElementById('paymentMemberId').value = currentProfileMember.id; showPaymentModal(); } }
function downloadMemberQR() { const qrCanvas = document.querySelector('#profileQR canvas'); if (qrCanvas) { const link = document.createElement('a'); link.download = `QR_${currentProfileMember.name.replace(/\s/g, '_')}.png`; link.href = qrCanvas.toDataURL(); link.click(); } }
function viewRoutine(routineId) { showToast('Detalles de rutina próximamente', 'info'); }

// ============ SUBIR FOTO DE PERFIL ============
async function uploadMemberPhoto() {
  if (!currentProfileMember) { showToast('No hay miembro seleccionado', 'error'); return; }
  
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('La imagen no puede superar los 2MB', 'error'); return; }
    if (!file.type.startsWith('image/')) { showToast('Solo se permiten imágenes', 'error'); return; }
    showToast('Subiendo foto...', 'info');
    
    try {
      const client = window.supabaseClient();
      if (!client) throw new Error('Supabase no disponible');
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${currentProfileMember.id}_${Date.now()}.${fileExt}`;
      const filePath = `members/${fileName}`;
      
      const { error: uploadError } = await client.storage.from('member-photos').upload(filePath, file);
      if (uploadError) throw uploadError;
      
      const { data: urlData } = client.storage.from('member-photos').getPublicUrl(filePath);
      const photoUrl = urlData.publicUrl;
      
      const { error: updateError } = await client.from('members').update({ photo_url: photoUrl }).eq('id', currentProfileMember.id);
      if (updateError) throw updateError;
      
      const profilePhotoDiv = document.getElementById('profilePhoto');
profilePhotoDiv.innerHTML = `<img src="${photoUrl}" style="width: 128px; height: 128px; border-radius: 9999px; object-fit: cover;">`;
profilePhotoDiv.className = "relative";
profilePhotoDiv.style.width = "128px";
profilePhotoDiv.style.height = "128px";
      currentProfileMember.photo_url = photoUrl;
      showToast('Foto actualizada correctamente', 'success');
    } catch (error) {
      showToast('Error al subir la foto: ' + error.message, 'error');
    }
  };
  input.click();
}

// ============ PROGRESS MODAL ============
function showAddProgressModal() { if (!currentProfileMember) return; document.getElementById('progressDate').value = new Date().toISOString().split('T')[0]; document.getElementById('progressForm').reset(); document.getElementById('addProgressModal').classList.remove('hidden'); }
function closeProgressModal() { document.getElementById('addProgressModal').classList.add('hidden'); }

async function deleteProgress(progressId) {
  if (!confirm('¿Eliminar esta medición?')) return;
  const client = window.supabaseClient();
  if (!client) return;
  const { error } = await client.from('member_progress').delete().eq('id', progressId);
  if (error) showToast('Error al eliminar', 'error');
  else { showToast('Medición eliminada', 'success'); await loadProgressHistory(currentProfileMember.id); await loadMemberExtraData(currentProfileMember.id); }
}

// ============ ROUTINE MODAL ============
function showAssignRoutineModal() { document.getElementById('routineForm').reset(); document.getElementById('assignRoutineModal').classList.remove('hidden'); }
function closeRoutineModal() { document.getElementById('assignRoutineModal').classList.add('hidden'); }

// ============ QR WELCOME FUNCTIONS ============
async function sendWelcomeWithQR(member) {
  console.log('📨 Enviando bienvenida a:', member.name);
  if (!member.phone) { showToast('⚠️ El miembro no tiene número de teléfono', 'warning'); return; }
  try {
    const qrImage = await generateQRCodeImage(member.id);
    const message = createWelcomeMessage(member);
    await sendWhatsAppWithQR(member.phone, message, qrImage, member);
    showToast(`🎉 ${member.name} registrado y bienvenida enviada por WhatsApp!`, 'success');
  } catch (error) { console.error('Error:', error); showToast(`✅ ${member.name} registrado`, 'warning'); }
}

async function generateQRCodeImage(memberId) {
  return new Promise((resolve, reject) => {
    try {
      const tempDiv = document.createElement('div');
      new QRCode(tempDiv, { text: `NEOFIT_${memberId}`, width: 300, height: 300, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
      setTimeout(() => {
        const canvas = tempDiv.querySelector('canvas');
        if (canvas) resolve(canvas.toDataURL('image/png'));
        else { const fallbackCanvas = document.createElement('canvas'); fallbackCanvas.width = 300; fallbackCanvas.height = 300; const ctx = fallbackCanvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 300, 300); ctx.fillStyle = '#000000'; ctx.font = '20px Arial'; ctx.fillText('QR', 130, 160); resolve(fallbackCanvas.toDataURL('image/png')); }
      }, 200);
    } catch (error) { reject(error); }
  });
}

function createWelcomeMessage(member) {
  const expirationDate = member.membership_end ? new Date(member.membership_end) : new Date();
  const formattedDate = expirationDate.toLocaleDateString('es-MX');
  let benefits = '', emoji = '💪';
  if (member.plan === 'Básico') { emoji = '👍'; benefits = '✅ Acceso a área de pesas\n✅ Horario libre (6am-10pm)\n✅ Estacionamiento gratuito\n✅ Lockers sin costo'; }
  else if (member.plan === 'Premium') { emoji = '⭐'; benefits = '✅ Acceso a área de pesas\n✅ Clases grupales ilimitadas\n✅ Asesoría nutricional mensual\n✅ Toalla de cortesía\n✅ Estacionamiento preferente\n✅ Acceso a spa y sauna'; }
  else { emoji = '🏆'; benefits = '✅ TODOS los beneficios Premium\n✅ 2 meses gratis\n✅ Playera exclusiva NeoFit\n✅ 30% descuento en tienda\n✅ Invitación a evento anual\n✅ Seguimiento personalizado'; }
  return `🎉 *¡BIENVENIDO A NEOFIT, ${member.name.toUpperCase()}!* 🎉\n\n${emoji} Tu membresía *${member.plan}* ha sido activada exitosamente.\n\n📅 *Fecha de vencimiento:* ${formattedDate}\n\n💪 *Beneficios incluidos:*\n${benefits}\n\n🎫 *Tu código QR está adjunto a este mensaje*\n📱 Guárdalo en tu teléfono o imprímelo\n🔍 Preséntalo en la entrada para escanear\n\n🏋️ *Dirección:* Av. Principal #123, Col. Centro\n⏰ *Horario:* Lunes a Sábado 6:00 - 22:00\n📞 *Contacto:* 55 1234 5678\n\n¡Te esperamos! 💪\n\n_NeoFit ERP - Tu mejor versión comienza aquí_`;
}

async function sendWhatsAppWithQR(phone, message, qrImageBase64, member) {
  let cleanPhone = phone.toString().replace(/\D/g, '');
  if (cleanPhone.length < 10) { console.warn('Número inválido:', cleanPhone); showToast('⚠️ Número inválido', 'warning'); return; }
  if (cleanPhone.length === 10) cleanPhone = '52' + cleanPhone;
  const fullMessage = message + '\n\n📲 *IMPORTANTE:* El código QR se ha descargado automáticamente en tu computadora.';
  window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(fullMessage)}`, '_blank');
  downloadQRImage(qrImageBase64, member.name);
}

function downloadQRImage(qrImageBase64, memberName) {
  const link = document.createElement('a');
  const safeName = memberName ? memberName.replace(/\s/g, '_') : 'miembro';
  link.download = `QR_NeoFit_${safeName}.png`;
  link.href = qrImageBase64;
  link.click();
}

// ============ GESTIÓN DE USUARIOS AUTH PARA MIEMBROS ============
async function checkMemberAuthStatus(memberId, memberEmail) {
  const client = window.supabaseClient();
  if (!client) return false;
  try {
    const { data: users, error } = await client.auth.admin.listUsers();
    if (error) {
      const { error: resetError } = await client.auth.resetPasswordForEmail(memberEmail);
      return !resetError || !resetError.message.includes('User not found');
    }
    return users?.users?.some(u => u.email === memberEmail);
  } catch (error) { return false; }
}

async function updateUserAuthUI() {
  if (!currentProfileMember) return;
  
  const client = window.supabaseClient();
  if (!client) return;
  
  // Buscar por email en profiles
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('email', currentProfileMember.email)
    .maybeSingle();
  
  const hasProfile = !!profile;
  
  const notCreatedDiv = document.getElementById('userNotCreated');
  const createdDiv = document.getElementById('userCreated');
  const statusDiv = document.getElementById('userAuthStatus');
  const authEmailInput = document.getElementById('userAuthEmail');
  
  if (authEmailInput) authEmailInput.value = currentProfileMember.email;
  
  if (hasProfile) {
    if (notCreatedDiv) notCreatedDiv.classList.add('hidden');
    if (createdDiv) createdDiv.classList.remove('hidden');
    if (statusDiv) {
      statusDiv.style.background = 'rgba(16, 185, 129, 0.1)';
      const statusIcon = document.getElementById('authStatusIcon');
      const statusText = document.getElementById('authStatusText');
      const statusDetail = document.getElementById('authStatusDetail');
      if (statusIcon) statusIcon.className = 'fas fa-check-circle text-green-400 text-2xl';
      if (statusText) statusText.textContent = '✓ Cuenta Activada';
      if (statusDetail) statusDetail.textContent = 'El miembro puede iniciar sesión en la app cliente';
    }
  } else {
    if (notCreatedDiv) notCreatedDiv.classList.remove('hidden');
    if (createdDiv) createdDiv.classList.add('hidden');
    if (statusDiv) {
      statusDiv.style.background = 'rgba(239, 68, 68, 0.1)';
      const statusIcon = document.getElementById('authStatusIcon');
      const statusText = document.getElementById('authStatusText');
      const statusDetail = document.getElementById('authStatusDetail');
      if (statusIcon) statusIcon.className = 'fas fa-exclamation-triangle text-red-400 text-2xl';
      if (statusText) statusText.textContent = '✗ Cuenta no creada';
      if (statusDetail) statusDetail.textContent = 'Debes crear una cuenta de acceso para este miembro';
    }
  }
}

async function updateMemberEmail() {
  if (!currentProfileMember) {
    showToast('No hay miembro seleccionado', 'error');
    return;
  }
  
  const newEmail = document.getElementById('userAuthEmail').value.trim();
  
  if (!newEmail) {
    showToast('El email no puede estar vacío', 'error');
    return;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail)) {
    showToast('Ingresa un email válido', 'error');
    return;
  }
  
  if (!confirm(`¿Cambiar email de ${currentProfileMember.name} de "${currentProfileMember.email}" a "${newEmail}"?`)) {
    return;
  }
  
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    // 1. Actualizar email en members
    const { error: updateError } = await client
      .from('members')
      .update({ email: newEmail })
      .eq('id', currentProfileMember.id);
    
    if (updateError) throw updateError;
    
    // 2. Buscar y actualizar en profiles
    const { data: profile } = await client
      .from('profiles')
      .select('id')
      .eq('email', currentProfileMember.email)
      .maybeSingle();
    
    if (profile) {
      await client
        .from('profiles')
        .update({ email: newEmail })
        .eq('id', profile.id);
    }
    
    // 3. Actualizar en el objeto actual
    currentProfileMember.email = newEmail;
    
    // 4. Actualizar en allMembers
    const memberIndex = allMembers.findIndex(m => m.id === currentProfileMember.id);
    if (memberIndex !== -1) {
      allMembers[memberIndex].email = newEmail;
    }
    
    showToast('✅ Email actualizado correctamente', 'success');
    await updateUserAuthUI();
    
  } catch (error) {
    console.error('Error:', error);
    showToast('Error al actualizar email: ' + error.message, 'error');
  }
}

// ============ CREAR CUENTA DE ACCESO PARA MIEMBRO ============
async function createUserAuthForMember() {
  if (!currentProfileMember) { 
    showToast('No hay miembro seleccionado', 'error'); 
    return; 
  }
  
  const member = currentProfileMember;
  
  const client = window.supabaseClient();
  if (!client) {
    showToast('Supabase no disponible', 'error');
    return;
  }

  try {
    showToast('Analizando estado de la cuenta...', 'info');

    // 1. Verificar si ya existe en profiles
    const { data: profile } = await client
      .from('profiles')
      .select('id')
      .eq('email', member.email)
      .maybeSingle();

    // 2. Verificar si existe en Auth
    let authUser = null;
    try {
      const { data: usersData } = await client.auth.admin.listUsers();
      authUser = usersData?.users?.find(u => u.email?.toLowerCase() === member.email.toLowerCase());
    } catch (e) {
      console.warn("No se pudo listar usuarios:", e);
    }

    // Caso 1: Ya existe todo correctamente
    if (profile && authUser) {
      showToast('✅ Este miembro ya tiene cuenta de acceso', 'success');
      await updateUserAuthUI();
      return;
    }

    // Caso 2: Existe en Auth pero NO en profiles (estado inconsistente)
    if (authUser && !profile) { showToast('🔧 Detectado estado inconsistente. Creando perfil...', 'info');
      
      const { error: profileError } = await client.from('profiles').insert({
        id: authUser.id,
        email: member.email,
        full_name: member.name,
        role: 'member',
        created_at: new Date().toISOString()
      });

      if (profileError) {
        showToast('Error al crear perfil: ' + profileError.message, 'error');
        return;
      }

      showToast('✅ Perfil creado correctamente', 'success');
      await updateUserAuthUI();
      
      if (confirm('¿Deseas reenviar las credenciales por WhatsApp?')) {
        await sendCredentialsWhatsApp();
      }
      return;
    }

    // Caso 3: No existe → Crear cuenta nueva
    showToast('Creando cuenta de acceso...', 'info');

    const tempPassword = generateTemporaryPassword();

    const { data, error } = await client.auth.admin.createUser({
      email: member.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name: member.name,
        role: 'member',
        phone: member.phone || ''
      }
    });

    if (error) throw error;

    // Crear perfil
    const { error: profileError } = await client.from('profiles').insert({
      id: data.user.id,
      email: member.email,
      full_name: member.name,
      role: 'member',
      created_at: new Date().toISOString()
    });

    if (profileError) {
      console.warn('Error al crear perfil:', profileError.message);
    }

    // Enviar credenciales
    await sendWelcomeWithCredentials(member, tempPassword);

    showToast('✅ Cuenta de acceso creada y credenciales enviadas', 'success');
    await updateUserAuthUI();

  } catch (error) {
    console.error('Error en createUserAuthForMember:', error);
    
    if (error.message?.includes('already registered') || error.message?.includes('already exists')) {
      showToast('El email ya está registrado. Intentando arreglar perfil...', 'warning');
      // Reintento inteligente
      await createUserAuthForMemberDirect?.(member);
    } else {
      showToast('Error: ' + error.message, 'error');
    }
  }
}

async function sendPasswordResetNotification(memberName, memberEmail, memberPhone) {
  if (!memberPhone) return;
  const message = `🔐 *NeoFit - Recuperación de Contraseña*\n\nHola ${memberName},\n\nHemos recibido una solicitud para restablecer tu contraseña.\n\n━━━━━━━━━━━━━━━━━━━━━━━\n📧 Usuario: ${memberEmail}\n━━━━━━━━━━━━━━━━━━━━━━━\n\n📲 Haz clic aquí para crear una nueva contraseña:\n${window.location.origin}/reset-password.html\n\nSi no solicitaste este cambio, ignora este mensaje.\n\n_NeoFit Gym_`;
  let cleanPhone = memberPhone.replace(/\s/g, '').replace(/[-()]/g, '');
  if (!cleanPhone.startsWith('+')) cleanPhone = cleanPhone.startsWith('52') ? `+${cleanPhone}` : `+52${cleanPhone}`;
  window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
}

async function resetUserPassword() {
  if (!currentProfileMember) return;
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    const { error } = await client.auth.resetPasswordForEmail(currentProfileMember.email, { redirectTo: window.location.origin + '/reset-password.html' });
    if (error) throw error;
    showToast('📧 Se ha enviado un enlace de recuperación al email del miembro', 'success');
    if (currentProfileMember.phone) { await sendPasswordResetNotification(currentProfileMember.name, currentProfileMember.email, currentProfileMember.phone); }
  } catch (error) { showToast('Error al enviar recuperación: ' + error.message, 'error'); }
}

// ============ FUNCIÓN AUXILIAR PARA ABRIR WHATSAPP SIN BLOQUEOS ============
function abrirWhatsAppSeguro(url) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => document.body.removeChild(link), 100);
}

// ============ ENVIAR CREDENCIALES POR WHATSAPP DESDE PERFIL ============
async function sendCredentialsWhatsApp() {
  if (!currentProfileMember) {
    showToast('No hay miembro seleccionado', 'error');
    return;
  }
  
  const member = currentProfileMember;
  
  if (!member.phone) {
    showToast('⚠️ Este miembro no tiene número de teléfono registrado', 'warning');
    return;
  }
  
  const client = window.supabaseClient();
  if (!client) return;
  
  // Verificar si existe el perfil
  const { data: profile } = await client
    .from('profiles')
    .select('id')
    .eq('email', member.email)
    .maybeSingle();
  
  if (!profile) {
    showToast('⚠️ Este miembro no tiene cuenta de acceso. Crea una primero.', 'warning');
    return;
  }
  
  const tempPassword = generateTemporaryPassword();
  
  try {
    const { error } = await client.auth.admin.updateUserById(profile.id, { 
      password: tempPassword 
    });
    
    if (error) throw error;
    
    // Formatear número con 521
    const numeroWhatsApp = member.phone.replace(/[^0-9]/g, '');
    let numeroFinal = `521${numeroWhatsApp.slice(-10)}`;
    
    const mensaje = `🎉 *NEOFIT - TUS CREDENCIALES* 🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 *Email:* ${member.email}
🔑 *Contraseña:* ${tempPassword}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 Accede: https://neo-fit.vercel.app/login.html`;
    
    const mensajeCodificado = encodeURIComponent(mensaje);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${numeroFinal}&text=${mensajeCodificado}`;
    
    // ✅ USAR LA FUNCIÓN SEGURA EN LUGAR DE window.open
    abrirWhatsAppSeguro(whatsappUrl);
    
    showToast('✅ Credenciales enviadas por WhatsApp', 'success');
    
  } catch (error) {
    console.error('Error:', error);
    showToast('Error: ' + error.message, 'error');
  }
}

function showResetPasswordModal() {
  const newPassword = prompt('Ingresa la nueva contraseña para ' + currentProfileMember.name + '\n(Mínimo 6 caracteres):');
  if (newPassword && newPassword.length >= 6) { setManualPassword(newPassword); }
  else if (newPassword) { showToast('La contraseña debe tener al menos 6 caracteres', 'error'); }
}

async function setManualPassword(newPassword) {
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    const { error } = await client.auth.resetPasswordForEmail(currentProfileMember.email, { redirectTo: window.location.origin + '/set-password.html?new=' + encodeURIComponent(newPassword) });
    if (error) throw error;
    showToast('📧 Se ha enviado un enlace al email para establecer la nueva contraseña', 'success');
    if (currentProfileMember.phone) {
      const message = `🔐 *NeoFit - Nueva Contraseña*\n\nHola ${currentProfileMember.name},\n\nTu contraseña de acceso ha sido actualizada.\n\n━━━━━━━━━━━━━━━━━━━━━━━\n📧 Usuario: ${currentProfileMember.email}\n🔑 Nueva contraseña: ${newPassword}\n━━━━━━━━━━━━━━━━━━━━━━━\n\n🔗 Accede aquí: ${window.location.origin}/login.html\n\n_NeoFit Gym_`;
      let cleanPhone = currentProfileMember.phone.replace(/\D/g, '');
      if (cleanPhone.length === 10) cleanPhone = '52' + cleanPhone;
      if (!cleanPhone.startsWith('+')) cleanPhone = '+' + cleanPhone;
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    }
  } catch (error) { showToast('Error al establecer contraseña: ' + error.message, 'error'); }
}

// ============ MOBILE MENU ============
function addMobileMenuButton() {
  if (document.querySelector('.mobile-menu-btn')) return;
  const sidebar = document.querySelector('.w-72');
  const menuBtn = document.createElement('button');
  menuBtn.className = 'mobile-menu-btn fixed top-4 left-4 z-50 bg-sky-600 p-3 rounded-2xl shadow-lg lg:hidden';
  menuBtn.innerHTML = '<i class="fas fa-bars text-xl"></i>';
  menuBtn.onclick = toggleMobileMenu;
  document.body.appendChild(menuBtn);
  if (window.innerWidth <= 768) { sidebar.style.position = 'fixed'; sidebar.style.left = '-100%'; sidebar.style.top = '0'; sidebar.style.bottom = '0'; sidebar.style.zIndex = '1000'; sidebar.style.transition = 'left 0.3s ease'; sidebar.style.overflowY = 'auto'; }
}

function toggleMobileMenu() {
  const sidebar = document.querySelector('.w-72');
  const currentLeft = sidebar.style.left;
  if (currentLeft === '0px') { sidebar.style.left = '-100%'; document.body.style.overflow = 'auto'; }
  else { sidebar.style.left = '0'; document.body.style.overflow = 'hidden'; }
}

function closeMobileMenuOnClick() {
  document.querySelectorAll('.w-72 nav button').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        const sidebar = document.querySelector('.w-72');
        if (sidebar) sidebar.style.left = '-100%';
        document.body.style.overflow = 'auto';
      }
    });
  });
}

function getCurrentPage() {
  const pages = ['dashboard', 'members', 'checkin-list', 'qr-scanner', 'payments', 'whatsapp'];
  for (const page of pages) {
    const el = document.getElementById(`page-${page}`);
    if (el && !el.classList.contains('hidden')) {
      return page;
    }
  }
  return null;
}

// ====================== LIMPIEZA AUTOMÁTICA DE CHECK-INS ======================
async function cleanOldCheckins() {
  try {
    const client = window.supabaseClient();
    if (!client) return;

    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const tenDaysAgoStr = tenDaysAgo.toISOString().slice(0, 19).replace('T', ' ');

    const { error } = await client
      .from('checkins')
      .delete()
      .lt('checkin_time', tenDaysAgoStr);

    if (error) {
      console.warn('No se pudieron eliminar check-ins antiguos:', error.message);
    } else {
      console.log(`🧹 ${new Date().toLocaleString('es-MX')} → Check-ins de más de 10 días eliminados`);
    }
  } catch (e) {
    console.error('Error en limpieza de check-ins:', e);
  }
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Inicializando aplicación...');
  addMobileMenuButton();
  closeMobileMenuOnClick();
  addRealtimeStyles(); // ← Asegúrate de tener esta función
  
  // Crear badge en el botón de check-ins
  const checkinButton = document.getElementById('btn-checkin-list');
  if (checkinButton) {
    const badge = document.createElement('span');
    badge.id = 'checkinBadge';
    badge.className = 'notification-badge hidden';
    checkinButton.style.position = 'relative';
    checkinButton.appendChild(badge);
  }
  
  const memberForm = document.getElementById('memberForm');
  if (memberForm) {
    memberForm.addEventListener('submit', async (e) => { if (typeof saveMember === 'function') await saveMember(e); });
  }

  const paymentForm = document.getElementById('paymentForm');
  if (paymentForm) {
    paymentForm.addEventListener('submit', async (e) => { await savePayment(e); });
  }
  
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => { if (typeof filterMembers === 'function') filterMembers(); }, 500); });
  }
  
  const planFilter = document.getElementById('planFilter');
  if (planFilter) planFilter.addEventListener('change', () => { if (typeof filterMembers === 'function') filterMembers(); });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!document.getElementById('memberModal')?.classList.contains('hidden') && typeof closeModal === 'function') closeModal();
      if (!document.getElementById('paymentModal')?.classList.contains('hidden') && typeof closePaymentModal === 'function') closePaymentModal();
      if (!document.getElementById('qrModal')?.classList.contains('hidden') && typeof closeQRModal === 'function') closeQRModal();
      if (!document.getElementById('memberProfileModal')?.classList.contains('hidden') && typeof closeMemberProfile === 'function') closeMemberProfile();
    }
  });
  
  const modals = ['memberModal', 'paymentModal', 'qrModal'];
  modals.forEach(modalId => {
    const modal = document.getElementById(modalId);
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) { if (modalId === 'memberModal' && typeof closeModal === 'function') closeModal(); if (modalId === 'paymentModal' && typeof closePaymentModal === 'function') closePaymentModal(); if (modalId === 'qrModal' && typeof closeQRModal === 'function') closeQRModal(); } });
  });
  
  // ✅ AUTENTICACIÓN CON RETRY
  const checkAuthWithRetry = () => { 
    if (window.supabaseReady && window.supabaseReady()) checkAuth(); 
    else { setTimeout(checkAuthWithRetry, 500); } 
  };
  checkAuthWithRetry();
  
  // ✅ EVENTOS DE CONEXIÓN
  window.addEventListener('online', () => { 
    showToast('📡 Conexión restablecida', 'success'); 
    if (currentUser) { 
      loadDashboardData(); 
      if (typeof loadMembers === 'function') loadMembers(); 
      loadPayments(); 
      loadTodayCheckins();
      setupRealtimeCheckins(); // Reestablecer Realtime
    } 
  });
  
  window.addEventListener('offline', () => showToast('⚠️ Sin conexión a internet', 'error'));
  
  // ✅ LIMPIEZA AUTOMÁTICA (solo check-ins antiguos)
  cleanOldCheckins();
  
});

// ============ EXPONER FUNCIONES GLOBALES (SOLO UNA VEZ) ============
window.logout = logout;
window.showPage = showPage;
window.showMainApp = showMainApp;
window.checkAuth = checkAuth;
window.initializeAppData = initializeAppData;
window.loadDashboardData = loadDashboardData;
window.startQRScanner = startQRScanner;
window.processCheckin = processCheckin;
window.loadTodayCheckins = loadTodayCheckins;
window.hasCheckinToday = hasCheckinToday;
window.loadPayments = loadPayments;
window.savePayment = savePayment;
window.closePaymentModal = closePaymentModal;
window.sendWhatsAppMessages = sendWhatsAppMessages;
window.useTemplate = useTemplate;
window.sendPaymentReminder = sendPaymentReminder;
window.sendPaymentReceipt = sendPaymentReceipt;
window.showMemberProfile = showMemberProfile;
window.closeMemberProfile = closeMemberProfile;
window.showProfileTab = showProfileTab;
window.quickCheckinFromProfile = quickCheckinFromProfile;
window.sendWhatsAppToMember = sendWhatsAppToMember;
window.editMemberFromProfile = editMemberFromProfile;
window.showPaymentModalFromProfile = showPaymentModalFromProfile;
window.downloadMemberQR = downloadMemberQR;
window.uploadMemberPhoto = uploadMemberPhoto;
window.showAddProgressModal = showAddProgressModal;
window.closeProgressModal = closeProgressModal;
window.deleteProgress = deleteProgress;
window.showAssignRoutineModal = showAssignRoutineModal;
window.closeRoutineModal = closeRoutineModal;
window.createUserAuthForMember = createUserAuthForMember;
window.resetUserPassword = resetUserPassword;
window.sendCredentialsWhatsApp = sendCredentialsWhatsApp;
window.showResetPasswordModal = showResetPasswordModal;
window.sendWelcomeWithQR = sendWelcomeWithQR;
window.toggleMobileMenu = toggleMobileMenu;
window.quickCheckin = quickCheckin;
window.stopQRScanner = stopQRScanner;
// NO exponer startAutoRefreshCheckins ni stopAutoRefreshCheckins
window.setupRealtimeCheckins = setupRealtimeCheckins;
window.checkRealtimeStatus = checkRealtimeStatus;
window.restartRealtime = restartRealtime;