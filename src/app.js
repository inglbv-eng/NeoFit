// ============ VERIFICACIÓN DE ADMIN ============
// (Comentado porque se usa login.html)

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

// ============ AUTH ============
function logout() {
  const client = window.supabaseClient();
  if (client) client.auth.signOut();
  currentUser = null;
  localStorage.removeItem('user');
  localStorage.removeItem('userRole');
  localStorage.removeItem('neofit_client');
  window.location.href = 'login.html';
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

// ============ UI NAVIGATION ============
async function showPage(page) {
  const pages = ['dashboard', 'members', 'checkin', 'payments', 'whatsapp'];
  pages.forEach(p => {
    const el = document.getElementById(`page-${p}`);
    if (el) el.classList.add('hidden');
  });
  
  const activePage = document.getElementById(`page-${page}`);
  if (activePage) activePage.classList.remove('hidden');
  
  const buttons = ['dashboard', 'members', 'checkin', 'payments', 'whatsapp'];
  buttons.forEach(btn => {
    const btnEl = document.getElementById(`btn-${btn}`);
    if (btnEl) btnEl.classList.remove('nav-active');
  });
  
  const activeBtn = document.getElementById(`btn-${page}`);
  if (activeBtn) activeBtn.classList.add('nav-active');
  
  // ✅ INICIAR CÁMARA SOLO SI ENTRAMOS A CHECK-IN
  if (page === 'checkin') {
    await startQRScanner();
  } 
  // ✅ DETENER CÁMARA SI SALIMOS DE CHECK-IN
  else {
    await stopQRScanner();
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
    
    // Cargar gráficos (solo si los canvas existen)
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

// ============ CHECK-IN  QR stop ========
async function stopQRScanner() {
  if (html5QrCode && html5QrCode.isScanning) {
    try {
      await html5QrCode.stop();
      await html5QrCode.clear();
      console.log('📷 Escáner QR detenido correctamente');
      
      // Limpiar el contenedor del lector
      const readerDiv = document.getElementById('reader');
      if (readerDiv) {
        readerDiv.innerHTML = '';
        readerDiv.style.background = '';
      }
    } catch (error) {
      console.warn('Error al detener escáner:', error);
    }
  }
  scannerStarting = false;
  qrProcessing = false;
}

// ============ CHECK-IN Y QR SCANNER ============
async function hasCheckinToday(memberId) {
  try {
    const client = window.supabaseClient();
    if (!client) return false;
    
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    const { data, error } = await client
      .from('checkins')
      .select('id')
      .eq('member_id', memberId)
      .gte('checkin_time', `${todayStr} 00:00:00`)
      .lte('checkin_time', `${todayStr} 23:59:59`)
      .limit(1);
    
    if (error) throw error;
    return data && data.length > 0;
  } catch (error) {
    console.error('Error verificando check-in:', error);
    return false;
  }
}

async function processCheckin() {
  const qrInput = document.getElementById('manualQRInput')?.value || '';
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
    
    const today = new Date();
    const expiryDate = new Date(member.membership_end);
    if (expiryDate < today) {
      showToast(`⚠️ Membresía vencida desde ${formatDate(member.membership_end)}. Por favor renueva.`, 'error');
      return;
    }
    
    const alreadyCheckedIn = await hasCheckinToday(member.id);
    if (alreadyCheckedIn) {
      showToast(`⚠️ ${member.name} ya registró asistencia hoy`, 'warning');
      document.getElementById('manualQRInput').value = '';
      return;
    }
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const localDateTimeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    
    const { error: checkinError } = await client
      .from('checkins')
      .insert([{ member_id: member.id, checkin_time: localDateTimeString }]);
    
    if (checkinError) throw checkinError;
    
    await client.from('members').update({ last_checkin: localDateTimeString }).eq('id', member.id);
    
    showToast(`✅ Check-in exitoso! Bienvenido ${member.name}`);
    document.getElementById('manualQRInput').value = '';
    await loadTodayCheckins();
    await loadDashboardData();
    
  } catch (error) {
    console.error('Error processing check-in:', error);
    showToast('Error al procesar el check-in', 'error');
  }
}

async function quickCheckin(memberId) {
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
    
    const expiryDate = new Date(member.membership_end);
    if (expiryDate < new Date()) {
      showToast(`⚠️ Membresía vencida desde ${formatDate(member.membership_end)}`, 'error');
      return;
    }
    
    const alreadyCheckedIn = await hasCheckinToday(member.id);
    if (alreadyCheckedIn) {
      showToast(`⚠️ ${member.name} ya registró asistencia hoy`, 'warning');
      return;
    }
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const localDateTimeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    
    const { error: checkinError } = await client
      .from('checkins')
      .insert([{ member_id: member.id, checkin_time: localDateTimeString }]);
    
    if (checkinError) throw checkinError;
    
    await client.from('members').update({ last_checkin: localDateTimeString }).eq('id', member.id);
    
    showToast(`✅ Check-in rápido: ${member.name}`);
    await loadTodayCheckins();
    await loadDashboardData();
    
  } catch (error) {
    console.error('Error en check-in rápido:', error);
    showToast('Error al procesar check-in', 'error');
  }
}

async function loadTodayCheckins() {
  try {
    const client = window.supabaseClient();
    if (!client) return;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const { data, error } = await client
      .from('checkins')
      .select(`*, members (name, plan)`)
      .gte('checkin_time', `${todayStr} 00:00:00`)
      .lte('checkin_time', `${todayStr} 23:59:59`)
      .order('checkin_time', { ascending: false });

    if (error) throw error;

    document.getElementById('todayCount').textContent = data?.length || 0;

    const container = document.getElementById('todayCheckinsList');
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML = `<div class="text-center py-12 text-zinc-400"><i class="fas fa-clock text-5xl mb-4 opacity-30"></i><p class="text-lg">Aún no hay check-ins hoy</p></div>`;
      return;
    }

    container.innerHTML = data.map(c => {
      const date = new Date(c.checkin_time);
      const timeStr = `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
      return `<div class="flex items-center justify-between p-4 bg-zinc-800 rounded-2xl"><div><p class="font-semibold">${escapeHtml(c.members?.name || 'Desconocido')}</p><p class="text-sm text-zinc-400">${c.members?.plan || '-'}</p></div><div class="text-emerald-400 font-medium"><i class="fas fa-clock"></i> ${timeStr}</div></div>`;
    }).join('');

  } catch (error) {
    console.error(error);
  }
}

async function startQRScanner() {
    // ✅ Si ya está escaneando, no hacer nada
  if (html5QrCode && html5QrCode.isScanning) {
    console.log('📷 Escáner ya está activo');
    return;
  }
 
  if (scannerStarting) return;
  scannerStarting = true;
  console.log('📷 Iniciando escáner QR PRO...');

  try {
    if (html5QrCode) {
      try {
        await html5QrCode.stop();
        await html5QrCode.clear();
      } catch (e) {}
    }

    const scannerElement = document.getElementById('reader');
    if (!scannerElement) {
      scannerStarting = false;
      return;
    }

    scannerElement.innerHTML = '';
    scannerElement.style.minHeight = '350px';
    scannerElement.style.background = '#000';
    scannerElement.style.position = 'relative';
    scannerElement.style.borderRadius = '20px';
    scannerElement.style.overflow = 'hidden';

    if (!navigator.mediaDevices?.getUserMedia) {
      scannerElement.innerHTML = `<div class="text-center p-8 text-red-400"><i class="fas fa-camera-slash text-5xl mb-3"></i><p>Tu navegador no soporta cámara</p></div>`;
      scannerStarting = false;
      return;
    }

    scannerElement.innerHTML = `<div class="flex flex-col items-center justify-center h-full p-8"><div class="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-400 mb-4"></div><p class="text-zinc-400">Iniciando cámara...</p></div>`;

    html5QrCode = new Html5Qrcode("reader");

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
        showToast('Error al procesar check-in', 'error');
      } finally {
        setTimeout(() => { qrProcessing = false; }, 2000);
      }
    };

    const onScanError = (err) => {
      if (err?.includes('NotFoundException') || 
          err?.includes('No MultiFormat Readers') || 
          err?.includes('source width is 0') || 
          err?.includes('IndexSizeError') ||
          err?.includes('QR code parse error')) {
        return;
      }
      console.warn('⚠️ Error escáner:', err);
    };

    const config = { fps: 12, qrbox: { width: 170, height: 170 }, aspectRatio: 1.0, disableFlip: false, rememberLastUsedCamera: true, formatsToSupport: [0] };

    try {
      const cameras = await Html5Qrcode.getCameras();
      if (cameras && cameras.length > 0) {
        const backCamera = cameras.find(cam => cam.label.toLowerCase().includes('back') || cam.label.toLowerCase().includes('rear') || cam.label.toLowerCase().includes('environment'));
        const cameraId = backCamera ? backCamera.id : cameras[0].id;
        await html5QrCode.start(cameraId, config, onScanSuccess, onScanError);
      } else {
        await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanError);
      }
    } catch (cameraError) {
      await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanError);
    }

    setTimeout(() => {
      const video = document.querySelector('#reader video');
      if (!video) return;
      video.style.display = 'block';
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      video.setAttribute('playsinline', true);
      video.setAttribute('autoplay', true);
      video.setAttribute('muted', true);
      video.play().catch(() => {});
    }, 500);

  } catch (err) {
    const scannerElement = document.getElementById('reader');
    if (scannerElement) {
      scannerElement.innerHTML = `<div class="bg-yellow-900/30 rounded-2xl p-6 text-center"><i class="fas fa-camera-slash text-5xl text-yellow-400 mb-4"></i><p class="text-white font-semibold">No se pudo acceder a la cámara</p><button onclick="startQRScanner()" class="mt-4 px-4 py-2 bg-sky-600 rounded-xl">Reintentar</button></div>`;
    }
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

// ============ PERFIL COMPLETO DEL MIEMBRO ============
async function showMemberProfile(memberId) {
  const member = allMembers.find(m => m.id === memberId);
  if (!member) return;
  
  currentProfileMember = member;
  
  document.getElementById('profileName').textContent = member.name;
  document.getElementById('profileId').textContent = member.id;
  document.getElementById('profilePlan').textContent = member.plan;
  
  const photoContainer = document.getElementById('profilePhoto');
  if (member.photo_url) {
    photoContainer.innerHTML = `<img src="${member.photo_url}" class="w-32 h-32 rounded-full object-cover">`;
    photoContainer.className = "relative";
  } else {
    const firstLetter = (member.name?.charAt(0) || '?').toUpperCase();
    photoContainer.innerHTML = firstLetter;
    photoContainer.className = "w-32 h-32 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-5xl font-bold text-white shadow-xl";
  }
  
  const isActive = new Date(member.membership_end) >= new Date();
  const statusEl = document.getElementById('profileStatus');
  statusEl.textContent = isActive ? '✅ Activo' : '❌ Vencido';
  statusEl.className = isActive ? 'px-3 py-1 rounded-full text-xs font-semibold bg-green-900/50 text-green-300' : 'px-3 py-1 rounded-full text-xs font-semibold bg-red-900/50 text-red-300';
  
  const qrContainer = document.getElementById('profileQR');
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, { text: `NEOFIT_${member.id}`, width: 80, height: 80 });
  
  await loadMemberExtraData(member.id);
  document.getElementById('memberProfileModal').classList.remove('hidden');
}

async function loadMemberExtraData(memberId) {
  const client = window.supabaseClient();
  if (!client) return;
  
  const member = currentProfileMember;
  
  const fields = ['infoName', 'infoEmail', 'infoPhone', 'infoBirth', 'infoHeight', 'infoEmergencyContact', 'infoEmergencyPhone', 'infoGoals', 'infoHealthNotes', 'infoCurrentPlan', 'infoExpiry', 'infoDaysLeft', 'infoLastCheckin', 'infoWeight', 'infoBMI', 'infoBodyFat', 'infoMuscle'];
  
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
  const tabs = ['info', 'payments', 'progress', 'routines', 'checkins', 'user'];
  tabs.forEach(t => { const tabEl = document.getElementById(`${t}Tab`); if (tabEl) tabEl.classList.add('hidden'); });
  const activeTab = document.getElementById(`${tab}Tab`);
  if (activeTab) activeTab.classList.remove('hidden');
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
      
      document.getElementById('profilePhoto').innerHTML = `<img src="${photoUrl}" class="w-32 h-32 rounded-full object-cover">`;
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
  const hasAuth = await checkMemberAuthStatus(currentProfileMember.id, currentProfileMember.email);
  let hasProfile = false;
  if (currentProfileMember.auth_id) {
    const client = window.supabaseClient();
    if (client) {
      const { data: profile } = await client.from('profiles').select('id').eq('id', currentProfileMember.auth_id).single();
      hasProfile = !!profile;
    }
  }
  const notCreatedDiv = document.getElementById('userNotCreated');
  const createdDiv = document.getElementById('userCreated');
  const statusDiv = document.getElementById('userAuthStatus');
  const authEmailInput = document.getElementById('userAuthEmail');
  if (authEmailInput) authEmailInput.value = currentProfileMember.email;
  if (hasAuth || hasProfile) {
    if (notCreatedDiv) notCreatedDiv.classList.add('hidden');
    if (createdDiv) createdDiv.classList.remove('hidden');
    if (statusDiv) {
      statusDiv.style.background = 'rgba(16, 185, 129, 0.1)';
      document.getElementById('authStatusIcon').className = 'fas fa-check-circle text-green-400 text-2xl';
      document.getElementById('authStatusText').textContent = '✓ Cuenta Activada';
      document.getElementById('authStatusDetail').textContent = 'El miembro puede iniciar sesión en la app cliente';
    }
  } else {
    if (notCreatedDiv) notCreatedDiv.classList.remove('hidden');
    if (createdDiv) createdDiv.classList.add('hidden');
    if (statusDiv) {
      statusDiv.style.background = 'rgba(239, 68, 68, 0.1)';
      document.getElementById('authStatusIcon').className = 'fas fa-exclamation-triangle text-red-400 text-2xl';
      document.getElementById('authStatusText').textContent = '✗ Cuenta no creada';
      document.getElementById('authStatusDetail').textContent = 'Debes crear una cuenta de acceso para este miembro';
    }
  }
}

async function createUserAuthForMember() {
  if (!currentProfileMember) { showToast('No hay miembro seleccionado', 'error'); return; }
  const tempPassword = generateTemporaryPassword();
  showToast('Creando cuenta de acceso...', 'info');
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    const { data, error } = await client.auth.signUp({
      email: currentProfileMember.email,
      password: tempPassword,
      options: { data: { name: currentProfileMember.name, role: 'member', phone: currentProfileMember.phone } }
    });
    if (error) {
      if (error.message.includes('already registered')) { showToast('⚠️ El usuario ya existe', 'warning'); await updateUserAuthUI(); return; }
      throw error;
    }
    if (data?.user?.id) {
      const { error: profileError } = await client.from('profiles').insert({ id: data.user.id, email: currentProfileMember.email, full_name: currentProfileMember.name, role: 'member', created_at: new Date().toISOString() });
      if (profileError) console.error('Error creando perfil:', profileError);
      await client.from('members').update({ auth_id: data.user.id }).eq('id', currentProfileMember.id);
    }
    // Usar la función de members.js si existe
    if (typeof window.sendWelcomeWithCredentials === 'function') {
      await window.sendWelcomeWithCredentials(currentProfileMember, tempPassword);
    } else {
      showToast('✅ Cuenta creada. Credenciales: ' + tempPassword, 'success');
    }
    showToast('✅ Cuenta creada. Credenciales enviadas por WhatsApp', 'success');
    await updateUserAuthUI();
  } catch (error) { showToast('Error al crear usuario: ' + error.message, 'error'); }
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

async function sendCredentialsWhatsApp() {
  if (!currentProfileMember) return;
  const tempPassword = generateTemporaryPassword();
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    const { error } = await client.auth.admin.updateUserById(currentProfileMember.auth_id, { password: tempPassword });
    if (error) { await resetUserPassword(); showToast('📧 Se ha enviado un enlace para restablecer contraseña', 'success'); return; }
    if (typeof window.sendWelcomeWithCredentials === 'function') {
      await window.sendWelcomeWithCredentials(currentProfileMember, tempPassword);
    }
    showToast('✅ Credenciales reenviadas por WhatsApp', 'success');
  } catch (error) { await resetUserPassword(); showToast('📧 Se ha enviado un enlace para crear contraseña', 'success'); }
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
  document.querySelectorAll('.w-72 nav button').forEach(link => link.addEventListener('click', () => { if (window.innerWidth <= 768) { document.querySelector('.w-72').style.left = '-100%'; document.body.style.overflow = 'auto'; } }));
}

// ============ INICIALIZACIÓN ============
async function initializeAppData() {
  if (isInitializing) return;
  isInitializing = true;
  
  showToast('Cargando datos...', 'info');
  try {
    await loadDashboardData();
    if (typeof loadMembers === 'function') await loadMembers();
    await loadPayments();
    await loadTodayCheckins();
       
    const savedView = localStorage.getItem('membersView');
    if (savedView === 'card') { 
      currentView = 'card'; 
    } else { 
      currentView = 'table'; 
    }
    if (typeof updateViewDisplay === 'function') updateViewDisplay();
    
    showToast('Datos cargados correctamente');
  } catch (error) {
    console.error('Error initializing app:', error);
    showToast('Error al cargar datos', 'error');
  } finally {
    isInitializing = false;
  }
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
  
  const checkAuthWithRetry = () => { if (window.supabaseReady && window.supabaseReady()) checkAuth(); else { setTimeout(checkAuthWithRetry, 500); } };
  checkAuthWithRetry();
  
  window.addEventListener('online', () => { showToast('📡 Conexión restablecida', 'success'); if (currentUser) { loadDashboardData(); if (typeof loadMembers === 'function') loadMembers(); loadPayments(); loadTodayCheckins(); } });
  window.addEventListener('offline', () => showToast('⚠️ Sin conexión a internet', 'error'));
  
  cleanOldCheckins();
  
  setInterval(() => {
    const checkinPage = document.getElementById('page-checkin');
    if (checkinPage && !checkinPage.classList.contains('hidden')) { loadTodayCheckins(); }
  }, 5000);
});

document.addEventListener('visibilitychange', () => { if (!document.hidden && currentUser) { loadDashboardData(); if (typeof loadMembers === 'function') loadMembers(); loadPayments(); loadTodayCheckins(); } });

// ============ EXPONER FUNCIONES GLOBALES ============
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