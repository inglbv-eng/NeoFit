// app.js - NeoFit ERP Complete System (VERSIÓN CORREGIDA)
let currentUser = null;
let allMembers = [];
let html5QrCode = null;
let attendanceChart = null;
let incomeChart = null;
let appInitialized = false;
let qrProcessing = false;
let scannerStarting = false;

// ============ UTILITIES ============
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-MX');
}

function isExpiringSoon(dateString) {
  if (!dateString) return false;
  const expiry = new Date(dateString);
  const today = new Date();
  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  return diffDays <= 7 && diffDays >= 0;
}

// ============ TOAST NOTIFICATIONS ============
function showToast(message, type = 'success') {
  // Eliminar toast existente
  const existingToast = document.querySelector('.toast-notification');
  if (existingToast) {
    existingToast.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = `toast-notification fixed bottom-4 right-4 z-50 px-6 py-3 rounded-2xl shadow-lg animate-fade-in ${
    type === 'success' ? 'bg-green-600' : 
    type === 'error' ? 'bg-red-600' : 
    type === 'warning' ? 'bg-yellow-600' :
    'bg-blue-600'
  } text-white font-semibold`;
  
  const icon = type === 'success' ? 'fa-check-circle' : 
               type === 'error' ? 'fa-exclamation-circle' : 
               type === 'warning' ? 'fa-exclamation-triangle' :
               'fa-info-circle';
  
  toast.innerHTML = `<i class="fas ${icon} mr-2"></i>${message}`;
  document.body.appendChild(toast);
  
  // Auto-remover después de 3 segundos
  setTimeout(() => {
    if (toast && toast.remove) {
      toast.remove();
    }
  }, 3000);
}

// ============ AUTHENTICATION ============
async function login(email, password) {
  try {
    const client = window.supabaseClient();
    if (!client) {
      showToast('Conectando con el servidor...', 'error');
      return false;
    }
    
    const { data, error } = await client.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (error) throw error;
    
    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(currentUser));
    showMainApp();
    await loadDashboardData();
    await loadMembers();
    await loadPayments();
    await loadTodayCheckins();
    startQRScanner();
    showToast('Inicio de sesión exitoso');
    return true;
  } catch (error) {
    console.error('Error:', error);
    showToast('Credenciales incorrectas. Demo: admin@neofit.com / demo123', 'error');
    return false;
  }
}

function logout() {
  const client = window.supabaseClient();
  if (client) client.auth.signOut();
  currentUser = null;
  localStorage.removeItem('user');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('mainApp').classList.add('hidden');
  if (html5QrCode) {
    html5QrCode.stop().catch(console.log);
  }
  showToast('Sesión cerrada correctamente');
}

function setupPasswordToggle() {
  const togglePassword = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('loginPassword');
  
  if (!togglePassword || !passwordInput) return;
  
  togglePassword.addEventListener('click', function() {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    const icon = this.querySelector('i');
    if (type === 'text') {
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    } else {
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    }
  });
}

function checkAuth() {
  const user = localStorage.getItem('user');
  
  if (!window.supabaseReady()) {
    // Esperar a que Supabase esté listo
    window.onSupabaseReady(() => {
      if (localStorage.getItem('user')) {
        currentUser = JSON.parse(localStorage.getItem('user'));
        showMainApp();
        initializeAppData();
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

// Nueva función para inicializar todos los datos
async function initializeAppData() {
  showToast('Cargando datos...', 'info');
  await loadDashboardData();
  await loadMembers();
  await loadPayments();
  await loadTodayCheckins();
  startQRScanner();
  showToast('Datos cargados correctamente');
}

function showMainApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
}

// ============ UI NAVIGATION ============
function showPage(page) {
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
  
  if (page === 'checkin') {
    startQRScanner();
  }
}

// ============ DASHBOARD ============
async function loadDashboardData() {
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    // Active members count
    const { count: activeCount } = await client
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    document.getElementById('activeMembers').textContent = activeCount || 0;
    
    // Monthly income
    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const { data: payments } = await client
      .from('payments')
      .select('amount')
      .gte('payment_date', firstDayOfMonth);
    
    const monthlyTotal = payments?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0;
    document.getElementById('monthlyIncome').textContent = `$${monthlyTotal.toLocaleString()}`;
    
    // Today's checkins
    const today = new Date().toISOString().split('T')[0];
    const { count: checkinsCount } = await client
      .from('checkins')
      .select('*', { count: 'exact', head: true })
      .gte('checkin_time', today);
    document.getElementById('todayCheckins').textContent = checkinsCount || 0;
    
    // Expiring members (7 days)
    const expiringDate = new Date();
    expiringDate.setDate(expiringDate.getDate() + 7);
    const { count: expiringCount } = await client
      .from('members')
      .select('*', { count: 'exact', head: true })
      .lte('membership_end', expiringDate.toISOString().split('T')[0])
      .gte('membership_end', new Date().toISOString().split('T')[0]);
    document.getElementById('expiringMembers').textContent = expiringCount || 0;
    
    // Load charts
    await loadCharts();
  } catch (error) {
    console.error('Error loading dashboard:', error);
    showToast('Error al cargar el dashboard', 'error');
  }
}

async function loadCharts() {
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    // Destroy existing charts
    if (attendanceChart) attendanceChart.destroy();
    if (incomeChart) incomeChart.destroy();
    
    // Attendance chart - last 7 days
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
    
    const ctx1 = document.getElementById('attendanceChart').getContext('2d');
    attendanceChart = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: last7Days.map(d => d.split('-').slice(1).join('/')),
        datasets: [{
          label: 'Check-ins',
          data: attendanceData,
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2, 132, 199, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: { responsive: true, maintainAspectRatio: true }
    });
    
    // Income chart - last 6 months (CORREGIDO)
    const months = [];
    const incomeData = [];
    const currentDate = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthStr = date.toISOString().slice(0, 7);
      months.push(date.toLocaleString('es', { month: 'short' }));
      
      // Calcular el primer y último día del mes correctamente
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
    
    const ctx2 = document.getElementById('incomeChart').getContext('2d');
    incomeChart = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [{
          label: 'Ingresos ($)',
          data: incomeData,
          backgroundColor: '#10b981',
          borderRadius: 8
        }]
      },
      options: { responsive: true, maintainAspectRatio: true }
    });
  } catch (error) {
    console.error('Error loading charts:', error);
  }
}

// ============ MEMBERS CRUD ============
async function loadMembers(filtered = null) {
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    let query = client.from('members').select('*').order('name');
    
    if (filtered) {
      const term = filtered.term;
      const plan = filtered.plan;
      if (term && term.trim()) {
        query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
      }
      if (plan && plan !== '') {
        query = query.eq('plan', plan);
      }
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    allMembers = data || [];
    renderMembersTable(allMembers);
  } catch (error) {
    console.error('Error loading members:', error);
    showToast('Error al cargar los miembros', 'error');
  }
}

function renderMembersTable(members) {
  const tbody = document.getElementById('membersTable');
  if (!tbody) return;
  
  if (!members || members.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center p-8 text-zinc-400">No hay miembros registrados</td></tr>';
    return;
  }
  
  tbody.innerHTML = members.map(m => `
    <tr class="border-b border-zinc-800 hover:bg-zinc-800/50 transition">
      <td class="p-5">
        <button onclick="showQR(${m.id}, '${escapeHtml(m.name || '')}')" class="text-sky-400 hover:text-sky-300" title="Ver QR">
          <i class="fas fa-qrcode text-xl"></i>
        </button>
      </td>
      <td class="p-5 font-medium">${escapeHtml(m.name || '-')}</td>
      <td class="p-5 text-zinc-400">${escapeHtml(m.email || '-')}</td>
      <td class="p-5">${m.phone || '-'}</td>
      <td class="p-5">
        <span class="px-3 py-1 rounded-full text-xs font-semibold ${
          m.plan === 'Premium' ? 'bg-purple-900/50 text-purple-300' :
          m.plan === 'Anual' ? 'bg-blue-900/50 text-blue-300' :
          'bg-gray-800 text-gray-300'
        }">${m.plan || 'Básico'}</span>
      </td>
      <td class="p-5">
        <span class="px-3 py-1 rounded-full text-xs font-semibold ${
          m.status === 'active' ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300'
        }">
          ${m.status === 'active' ? '✅ Activo' : '⚠️ Por vencer'}
        </span>
      </td>
      <td class="p-5 text-sm text-zinc-400">${formatDate(m.membership_end)}</td>
      <td class="p-5 text-center">
        <button onclick="editMember(${m.id})" class="text-sky-400 hover:text-sky-300 mx-1" title="Editar">
          <i class="fas fa-edit"></i>
        </button>
        <button onclick="deleteMember(${m.id})" class="text-red-400 hover:text-red-300 mx-1" title="Eliminar">
          <i class="fas fa-trash"></i>
        </button>
        <button onclick="sendPaymentReminder(${m.id}, '${escapeHtml(m.name || '')}', '${m.phone || ''}')" class="text-green-400 hover:text-green-300 mx-1" title="WhatsApp">
          <i class="fab fa-whatsapp"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function filterMembers() {
  const term = document.getElementById('searchInput')?.value || '';
  const plan = document.getElementById('planFilter')?.value || '';
  loadMembers({ term, plan });
}

// ============ MEMBERS CRUD (CORREGIDO) ============
async function saveMember(event) {
  event.preventDefault();
  
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const phone = document.getElementById('phone').value;
  const plan = document.getElementById('plan').value;
  const memberId = document.getElementById('memberId').value;
  
  // Validar campos
  if (!name || !email || !phone) {
    showToast('Por favor completa todos los campos', 'error');
    return;
  }
  
  // Calcular fecha de expiración
  const expirationDate = new Date();
  if (plan === 'Anual') {
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);
  } else {
    expirationDate.setMonth(expirationDate.getMonth() + 1);
  }
  
  const memberData = {
    name: name,
    email: email,
    phone: phone,
    plan: plan,
    status: 'active',  // Cambiar 'activo' por 'active' para consistencia
    membership_end: expirationDate.toISOString().split('T')[0],  // Usar membership_end (como en loadMembers)
    created_at: new Date().toISOString()
  };
  
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    let result;
    
    if (memberId) {
      // ACTUALIZAR miembro existente
      result = await client
        .from('members')
        .update(memberData)
        .eq('id', parseInt(memberId))
        .select();
    } else {
      // CREAR nuevo miembro
      result = await client
        .from('members')
        .insert([memberData])
        .select();
    }
    
    if (result.error) throw result.error;
    
    // ✅ Si es un miembro NUEVO (no edición), enviar bienvenida con QR
    if (!memberId && result.data && result.data[0]) {
      const newMember = result.data[0];
      await sendWelcomeWithQR(newMember);
    } else {
      showToast('Miembro actualizado correctamente', 'success');
    }
    
    closeModal();
    await loadMembers();
    await loadDashboardData();
    document.getElementById('memberForm').reset();
    document.getElementById('memberId').value = '';
    
  } catch (error) {
    console.error('Error:', error);
    showToast('Error al guardar miembro: ' + error.message, 'error');
  }
}

async function editMember(id) {
  const member = allMembers.find(m => m.id === id);
  if (!member) return;
  
  document.getElementById('modalTitle').textContent = 'Editar Miembro';
  document.getElementById('memberId').value = member.id;
  document.getElementById('name').value = member.name;
  document.getElementById('email').value = member.email || '';
  document.getElementById('phone').value = member.phone || '';
  document.getElementById('plan').value = member.plan;
  
  document.getElementById('memberModal').classList.remove('hidden');
}

async function deleteMember(id) {
  if (!confirm('¿Estás seguro de eliminar este miembro?')) return;
  
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    const { error } = await client
      .from('members')
      .delete()
      .eq('id', id);
    if (error) throw error;
    
    showToast('Miembro eliminado');
    await loadMembers();
    await loadDashboardData();
  } catch (error) {
    console.error('Error deleting member:', error);
    showToast('Error al eliminar el miembro', 'error');
  }
}

function showQR(memberId, memberName) {
  const qrData = `NEOFIT_${memberId}`;
  document.getElementById('qrCodeContainer').innerHTML = '';
  new QRCode(document.getElementById('qrCodeContainer'), {
    text: qrData,
    width: 200,
    height: 200
  });
  document.getElementById('qrMemberName').textContent = memberName;
  document.getElementById('qrModal').classList.remove('hidden');
}

function closeQRModal() {
  document.getElementById('qrModal').classList.add('hidden');
}

// ============ CHECK-IN ============
async function processCheckin() {
  const qrInput = document.getElementById('manualQRInput')?.value || '';
  if (!qrInput) {
    showToast('Por favor ingresa o escanea un código QR', 'error');
    return;
  }
  
  // Soporte para formato NEOFIT_ID o solo ID
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
    
    // Check if membership is expired
    const today = new Date();
    const expiryDate = new Date(member.membership_end);
    if (expiryDate < today) {
      showToast(`⚠️ Membresía vencida desde ${formatDate(member.membership_end)}. Por favor renueva.`, 'error');
      return;
    }
    
    // Register check-in
    const { error: checkinError } = await client
      .from('checkins')
      .insert([{ member_id: member.id, checkin_time: new Date().toISOString() }]);
    
    if (checkinError) throw checkinError;
    
    showToast(`✅ Check-in exitoso! Bienvenido ${member.name}`);
    document.getElementById('manualQRInput').value = '';
    await loadTodayCheckins();
    await loadDashboardData();
    
  } catch (error) {
    console.error('Error processing check-in:', error);
    showToast('Error al procesar el check-in', 'error');
  }
}

async function loadTodayCheckins() {
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await client
      .from('checkins')
      .select(`
        *,
        members (name, plan)
      `)
      .gte('checkin_time', today)
      .order('checkin_time', { ascending: false });
    
    if (error) throw error;
    
    document.getElementById('todayCount').textContent = data?.length || 0;
    
    const container = document.getElementById('todayCheckinsList');
    if (!container) return;
    
    if (!data || data.length === 0) {
      container.innerHTML = '<div class="text-center p-8 text-zinc-400">No hay check-ins hoy</div>';
      return;
    }
    
    container.innerHTML = data.map(c => `
      <div class="flex items-center justify-between p-4 bg-zinc-800 rounded-2xl">
        <div>
          <p class="font-semibold">${escapeHtml(c.members?.name || 'Unknown')}</p>
          <p class="text-sm text-zinc-400">${c.members?.plan || '-'}</p>
        </div>
        <div class="text-right">
          <p class="text-sm text-green-400">
            <i class="fas fa-clock mr-1"></i> ${new Date(c.checkin_time).toLocaleTimeString()}
          </p>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading checkins:', error);
  }
}

async function startQRScanner() {

  // Evitar doble inicio
  if (scannerStarting) return;

  scannerStarting = true;

  console.log('📷 Iniciando escáner QR PRO...');

  try {

    // =========================
    // DETENER ESCÁNER ANTERIOR
    // =========================
    if (html5QrCode) {

      try {

        const state = html5QrCode.getState();

        if (
          state === Html5QrcodeScannerState.SCANNING ||
          state === Html5QrcodeScannerState.PAUSED
        ) {

          await html5QrCode.stop();
          await html5QrCode.clear();

          console.log('🛑 Escáner anterior detenido');

        }

      } catch (e) {
        console.warn('Error cerrando scanner:', e);
      }
    }

    // =========================
    // CONTENEDOR
    // =========================
    const scannerElement = document.getElementById('reader');

    if (!scannerElement) {
      console.error('❌ No existe #reader');
      return;
    }

    scannerElement.innerHTML = '';

    scannerElement.style.minHeight = '350px';
    scannerElement.style.background = '#000';
    scannerElement.style.position = 'relative';
    scannerElement.style.borderRadius = '20px';
    scannerElement.style.overflow = 'hidden';

    // =========================
    // SOPORTE CÁMARA
    // =========================
    if (!navigator.mediaDevices?.getUserMedia) {

      scannerElement.innerHTML = `
        <div class="text-center p-8 text-red-400">
          <i class="fas fa-camera-slash text-5xl mb-3"></i>
          <p>Tu navegador no soporta cámara</p>
        </div>
      `;

      return;
    }

    // =========================
    // LOADING
    // =========================
    scannerElement.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full p-8">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-400 mb-4"></div>
        <p class="text-zinc-400">
          Iniciando cámara...
        </p>
      </div>
    `;

    // =========================
    // CREAR SCANNER
    // =========================
    html5QrCode = new Html5Qrcode("reader");

    // =========================
    // SUCCESS
    // =========================
    const onScanSuccess = async (decodedText) => {

      if (qrProcessing) return;

      qrProcessing = true;

      console.log('✅ QR detectado:', decodedText);

      if (navigator.vibrate) {
        navigator.vibrate(120);
      }

      const input = document.getElementById('manualQRInput');

      if (input) {
        input.value = decodedText;
      }

      try {

        await processCheckin();

      } catch (e) {

        console.error(e);

      } finally {

        setTimeout(() => {
          qrProcessing = false;
        }, 2000);
      }
    };

    // =========================
    // ERROR SCAN
    // =========================
    const onScanError = (err) => {

      if (
        err?.includes('NotFoundException') ||
        err?.includes('No MultiFormat Readers')
      ) {
        return;
      }

      console.warn('⚠️', err);
    };

    // =========================
    // CONFIG
    // =========================
    const config = {

      fps: 12,

      qrbox: {
        width: 170,
        height: 170
      },

      aspectRatio: 1.0,

      disableFlip: false,

      rememberLastUsedCamera: true,

      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE
      ]
    };

    // =========================
    // INICIAR
    // =========================
    await html5QrCode.start(

      { facingMode: "environment" },

      config,

      onScanSuccess,

      onScanError
    );

    console.log('✅ Cámara iniciada');

    // =========================
    // OPTIMIZAR VIDEO
    // =========================
    setTimeout(() => {

      const video = document.querySelector('#reader video');

      if (track) {
        const capabilities = track.getCapabilities();
      
        if (capabilities.zoom) {
      
          track.applyConstraints({
            advanced: [{ zoom: 2 }]
          }).catch(() => {});
      
          console.log('🔍 Zoom aplicado');
        }
      }
      
      if (!video) return;

      video.style.display = 'block';
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';

      // Mejora webcams malas
      video.style.filter =
        'contrast(1.2) brightness(1.1) saturate(1.1)';

      video.setAttribute('playsinline', true);
      video.setAttribute('autoplay', true);
      video.setAttribute('muted', true);

      video.play().catch(() => {});

      console.log('🎥 Video optimizado');

    }, 500);

  } catch (err) {

    console.error('❌ Error total cámara:', err);

    const scannerElement = document.getElementById('reader');

    if (scannerElement) {

      scannerElement.innerHTML = `
        <div class="bg-yellow-900/30 rounded-2xl p-6 text-center border border-yellow-800 h-full flex flex-col justify-center">

          <i class="fas fa-camera-slash text-5xl text-yellow-400 mb-4"></i>

          <p class="text-white font-semibold text-lg mb-2">
            No se pudo acceder a la cámara
          </p>

          <p class="text-zinc-400 text-sm mb-4">
            ${err.message || 'Verifica permisos'}
          </p>

          <button
            onclick="startQRScanner()"
            class="px-4 py-3 bg-sky-600 hover:bg-sky-500 rounded-xl text-sm transition"
          >
            Reintentar
          </button>

        </div>
      `;
    }

  } finally {

    scannerStarting = false;

  }
}

// Función para solicitar permiso de cámara
function requestCameraPermission() {
  console.log('📷 Solicitando permiso de cámara...');
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      console.log('✅ Permiso concedido');
      stream.getTracks().forEach(track => track.stop());
      showToast('✅ Permiso concedido, reiniciando escáner...', 'success');
      startQRScanner();
    })
    .catch(err => {
      console.error('❌ Permiso denegado:', err);
      showToast('❌ Permiso de cámara denegado. Usa la entrada manual.', 'error');
    });
}

// ============ PAYMENTS ============
async function loadPayments() {
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    const { data, error } = await client
      .from('payments')
      .select(`
        *,
        members (name)
      `)
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
        <td class="p-5">
          <span class="px-3 py-1 rounded-full text-xs bg-green-900/50 text-green-300">${p.status}</span>
        </td>
        <td class="p-5 text-center">
          <button onclick="sendPaymentReceipt(${p.id}, '${escapeHtml(p.members?.name)}', ${p.amount})" class="text-blue-400 hover:text-blue-300" title="Enviar recibo">
            <i class="fas fa-receipt"></i>
          </button>
        </td>
      </tr>
    `).join('');
    
    // Load member select for payment modal
    const memberSelect = document.getElementById('paymentMemberId');
    if (memberSelect && allMembers.length) {
      memberSelect.innerHTML = '<option value="">Seleccionar miembro</option>' + 
        allMembers.map(m => `<option value="${m.id}">${escapeHtml(m.name)} - ${m.plan}</option>`).join('');
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
  
  if (!memberId) {
    showToast('Selecciona un miembro', 'error');
    return;
  }
  
  if (!amount || amount <= 0) {
    showToast('Ingresa un monto válido', 'error');
    return;
  }
  
  const expirationDate = new Date();
  if (plan === 'Básico' || plan === 'Premium') expirationDate.setDate(expirationDate.getDate() + 30);
  else expirationDate.setFullYear(expirationDate.getFullYear() + 1);
  
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    // Register payment
    const { error: paymentError } = await client
      .from('payments')
      .insert([{
        member_id: parseInt(memberId),
        amount: parseFloat(amount),
        plan: plan,
        payment_date: new Date().toISOString().split('T')[0],
        expiration_date: expirationDate.toISOString().split('T')[0],
        status: 'completed'
      }]);
    
    if (paymentError) throw paymentError;
    
    // Update member membership
    const { error: memberError } = await client
      .from('members')
      .update({
        plan: plan,
        membership_end: expirationDate.toISOString().split('T')[0],
        status: 'active'
      })
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

// ============ WHATSAPP INTEGRATION ============
async function sendWhatsAppMessages() {
  const audience = document.getElementById('whatsappAudience').value;
  const message = document.getElementById('whatsappMessage').value;
  
  if (!message) {
    showToast('Escribe un mensaje primero', 'error');
    return;
  }
  
  let members = [];
  
  if (audience === 'all') {
    members = allMembers.filter(m => m.status === 'active');
  } else if (audience === 'expiring') {
    const expiringDate = new Date();
    expiringDate.setDate(expiringDate.getDate() + 7);
    members = allMembers.filter(m => 
      m.membership_end && new Date(m.membership_end) <= expiringDate && new Date(m.membership_end) >= new Date()
    );
  } else if (audience === 'inactive') {
    members = allMembers.filter(m => m.status !== 'active');
  }
  
  if (members.length === 0) {
    showToast('No hay miembros en esta categoría', 'error');
    return;
  }
  
  // Filter members with phone numbers
  const membersWithPhone = members.filter(m => m.phone && m.phone.trim());
  
  if (membersWithPhone.length === 0) {
    showToast('No hay miembros con número de teléfono registrado', 'error');
    return;
  }
  
  let sent = 0;
  for (const member of membersWithPhone) {
    let phone = member.phone.replace(/\s/g, '').replace(/[-()]/g, '');
    if (!phone.startsWith('+')) {
      phone = phone.startsWith('52') ? `+${phone}` : `+52${phone}`;
    }
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    sent++;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  showToast(`Se abrieron ${sent} conversaciones de WhatsApp. Revisa las pestañas para enviar los mensajes.`);
}

function useTemplate(template) {
  const templates = {
    payment_reminder: "💰 *Recordatorio de Pago*\n\nHola, te recordamos que tu membresía está por vencer. ¡Renueva ahora y no pierdas tus beneficios!\n\nPara más información, contáctanos.\n\n🏋️‍♂️ NeoFit Gym",
    promotion: "🎉 *Promoción Especial NeoFit*\n\n¡Lleva un amigo y ambos tienen 20% de descuento este mes!\n\nAprovecha esta oportunidad única. 💪\n\n🏋️‍♂️ NeoFit Gym",
    renewal: "🔄 *Renovación de Membresía*\n\nTu membresía está activa. ¡Gracias por confiar en NeoFit!\n\nRecuerda que puedes pagar en línea o en nuestras instalaciones.\n\n🏋️‍♂️ NeoFit Gym"
  };
  
  document.getElementById('whatsappMessage').value = templates[template] || '';
}

function sendPaymentReminder(memberId, memberName, phone) {
  if (!phone) {
    showToast('Este miembro no tiene número de teléfono registrado', 'error');
    return;
  }
  
  let cleanPhone = phone.replace(/\s/g, '').replace(/[-()]/g, '');
  if (!cleanPhone.startsWith('+')) {
    cleanPhone = cleanPhone.startsWith('52') ? `+${cleanPhone}` : `+52${cleanPhone}`;
  }
  
  const message = `Hola ${memberName}, te recordamos que tu membresía está por vencer. ¡Renueva ahora en NeoFit! 💪\n\n🏋️‍♂️ NeoFit Gym`;
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
}

function sendPaymentReceipt(paymentId, memberName, amount) {
  if (!memberName) {
    showToast('No se pudo obtener la información del miembro', 'error');
    return;
  }
  
  // Buscar el miembro para obtener su teléfono
  const member = allMembers.find(m => m.name === memberName);
  if (!member || !member.phone) {
    showToast('Este miembro no tiene número de teléfono registrado', 'error');
    return;
  }
  
  let cleanPhone = member.phone.replace(/\s/g, '').replace(/[-()]/g, '');
  if (!cleanPhone.startsWith('+')) {
    cleanPhone = cleanPhone.startsWith('52') ? `+${cleanPhone}` : `+52${cleanPhone}`;
  }
  
  const message = `🧾 *Recibo de Pago - NeoFit*\n\nHola ${memberName},\n\nHemos recibido tu pago por $${amount} MXN.\n\n¡Gracias por confiar en nosotros!\n\n🏋️‍♂️ NeoFit Gym`;
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
  showToast('Abriendo WhatsApp para enviar el recibo');
}

// ============ MODALS ============
function showAddMemberModal() {
  document.getElementById('modalTitle').textContent = 'Nuevo Miembro';
  document.getElementById('memberForm').reset();
  document.getElementById('memberId').value = '';
  document.getElementById('memberModal').classList.remove('hidden');
}

function showPaymentModal() {
  document.getElementById('paymentForm').reset();
  document.getElementById('paymentModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('memberModal').classList.add('hidden');
}

function closePaymentModal() {
  document.getElementById('paymentModal').classList.add('hidden');
}

// ============ DISPOSITIVO MOVIL ============
function isMobile() {
  return window.innerWidth <= 768;
}

function addMobileMenuButton() {
  if (document.querySelector('.mobile-menu-btn')) return;
  
  const sidebar = document.querySelector('.w-72');
  
  const menuBtn = document.createElement('button');
  menuBtn.className = 'mobile-menu-btn fixed top-4 left-4 z-50 bg-sky-600 p-3 rounded-2xl shadow-lg lg:hidden';
  menuBtn.innerHTML = '<i class="fas fa-bars text-xl"></i>';
  menuBtn.onclick = toggleMobileMenu;
  
  document.body.appendChild(menuBtn);
  
  if (isMobile()) {
    sidebar.style.position = 'fixed';
    sidebar.style.left = '-100%';
    sidebar.style.top = '0';
    sidebar.style.bottom = '0';
    sidebar.style.zIndex = '1000';
    sidebar.style.transition = 'left 0.3s ease';
    sidebar.style.overflowY = 'auto';
  }
}

function toggleMobileMenu() {
  const sidebar = document.querySelector('.w-72');
  const currentLeft = sidebar.style.left;
  
  if (currentLeft === '0px') {
    sidebar.style.left = '-100%';
    document.body.style.overflow = 'auto';
  } else {
    sidebar.style.left = '0';
    document.body.style.overflow = 'hidden';
  }
}

function closeMobileMenuOnClick() {
  const links = document.querySelectorAll('.w-72 nav button');
  links.forEach(link => {
    link.addEventListener('click', () => {
      if (isMobile()) {
        const sidebar = document.querySelector('.w-72');
        sidebar.style.left = '-100%';
        document.body.style.overflow = 'auto';
      }
    });
  });
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Inicializando aplicación...');
  
  // Setup password toggle
  setupPasswordToggle();
  
  // Add mobile menu button
  addMobileMenuButton();
  closeMobileMenuOnClick();
  
  // Login form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail')?.value || '';
      const password = document.getElementById('loginPassword')?.value || '';
      
      if (!email || !password) {
        showToast('Por favor ingresa email y contraseña', 'error');
        return;
      }
      
      // Mostrar loading en el botón
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<div class="loading-spinner"></div> Iniciando...';
      submitBtn.disabled = true;
      
      await login(email, password);
      
      // Restaurar botón
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    });
  }
  
  // Member form
  const memberForm = document.getElementById('memberForm');
  if (memberForm) {
    memberForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Validar campos requeridos
      const name = document.getElementById('name')?.value;
      const email = document.getElementById('email')?.value;
      const phone = document.getElementById('phone')?.value;
      
      if (!name || !email || !phone) {
        showToast('Por favor completa todos los campos requeridos', 'error');
        return;
      }
      
      // Mostrar loading
      const submitBtn = memberForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<div class="loading-spinner"></div> Guardando...';
      submitBtn.disabled = true;
      
      await saveMember(e);
      
      // Restaurar botón
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    });
  }
  
  // Payment form
  const paymentForm = document.getElementById('paymentForm');
  if (paymentForm) {
    paymentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Validar campos requeridos
      const memberId = document.getElementById('paymentMemberId')?.value;
      const amount = document.getElementById('paymentAmount')?.value;
      
      if (!memberId) {
        showToast('Selecciona un miembro', 'error');
        return;
      }
      
      if (!amount || amount <= 0) {
        showToast('Ingresa un monto válido', 'error');
        return;
      }
      
      // Mostrar loading
      const submitBtn = paymentForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<div class="loading-spinner"></div> Registrando...';
      submitBtn.disabled = true;
      
      await savePayment(e);
      
      // Restaurar botón
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    });
  }
  
  // Search input with debounce
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log('🔍 Buscando:', e.target.value);
        filterMembers();
      }, 500);
    });
  }
  
  // Plan filter
  const planFilter = document.getElementById('planFilter');
  if (planFilter) {
    planFilter.addEventListener('change', () => {
      filterMembers();
    });
  }
  
  // Modal close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const memberModal = document.getElementById('memberModal');
      const paymentModal = document.getElementById('paymentModal');
      const qrModal = document.getElementById('qrModal');
      
      if (memberModal && !memberModal.classList.contains('hidden')) {
        closeModal();
      }
      if (paymentModal && !paymentModal.classList.contains('hidden')) {
        closePaymentModal();
      }
      if (qrModal && !qrModal.classList.contains('hidden')) {
        closeQRModal();
      }
    }
  });
  
  // Click outside modal to close
  const modals = ['memberModal', 'paymentModal', 'qrModal'];
  modals.forEach(modalId => {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          if (modalId === 'memberModal') closeModal();
          if (modalId === 'paymentModal') closePaymentModal();
          if (modalId === 'qrModal') closeQRModal();
        }
      });
    }
  });
  
  // Check auth on load (con retry si Supabase no está listo)
  const checkAuthWithRetry = () => {
    if (window.supabaseReady && window.supabaseReady()) {
      checkAuth();
    } else {
      console.log('⏳ Esperando a que Supabase esté listo...');
      setTimeout(checkAuthWithRetry, 500);
    }
  };
  
  checkAuthWithRetry();
  
  // Detectar cambios de red
  window.addEventListener('online', () => {
    showToast('📡 Conexión restablecida', 'success');
    if (currentUser) {
      loadDashboardData();
      loadMembers();
      loadPayments();
      loadTodayCheckins();
    }
  });
  
  window.addEventListener('offline', () => {
    showToast('⚠️ Sin conexión a internet. Algunas funciones pueden no estar disponibles.', 'error');
  });
  
  console.log('✅ Aplicación inicializada correctamente');
});

// Función adicional para manejar la visibilidad de la página (pestaña activa)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && currentUser) {
    // Recargar datos cuando el usuario vuelve a la pestaña
    console.log('🔄 Recargando datos...');
    loadDashboardData();
    loadMembers();
    loadPayments();
    loadTodayCheckins();
  }
});

// ===== FUNCIONES DE QR Y BIENVENIDA (CORREGIDAS) =====
// Función principal que se ejecuta DESPUÉS de guardar el miembro
async function sendWelcomeWithQR(member) {
  console.log('📨 Enviando bienvenida a:', member.name);
  
  if (!member.phone) {
    showToast('⚠️ El miembro no tiene número de teléfono. No se envió WhatsApp.', 'warning');
    return;
  }
  
  try {
    // 1. Generar el código QR en formato imagen Base64
    const qrImage = await generateQRCodeImage(member.id);
    
    // 2. Crear mensaje de WhatsApp con el QR
    const message = createWelcomeMessage(member);
    
    // 3. Enviar por WhatsApp
    await sendWhatsAppWithQR(member.phone, message, qrImage, member);
    
    // 4. Mostrar notificación en pantalla
    showToast(`🎉 ${member.name} registrado y bienvenida enviada por WhatsApp!`, 'success');
  } catch (error) {
    console.error('Error al enviar bienvenida:', error);
    showToast(`✅ ${member.name} registrado, pero hubo un error al enviar WhatsApp`, 'warning');
  }
}

// Generar QR como imagen Base64 (para enviar por WhatsApp)
async function generateQRCodeImage(memberId) {
  return new Promise((resolve, reject) => {
    try {
      // Crear un div temporal para generar el QR
      const tempDiv = document.createElement('div');
      const qrCode = new QRCode(tempDiv, {
        text: memberId.toString(),
        width: 300,
        height: 300,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
      
      // Esperar a que se genere y buscar el canvas
      setTimeout(() => {
        const canvas = tempDiv.querySelector('canvas');
        if (canvas) {
          const imageData = canvas.toDataURL('image/png');
          resolve(imageData);
        } else {
          // Fallback: crear canvas manualmente
          const fallbackCanvas = document.createElement('canvas');
          fallbackCanvas.width = 300;
          fallbackCanvas.height = 300;
          const ctx = fallbackCanvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 300, 300);
          ctx.fillStyle = '#000000';
          ctx.font = '20px Arial';
          ctx.fillText('QR', 130, 160);
          ctx.fillText(memberId.toString(), 100, 200);
          resolve(fallbackCanvas.toDataURL('image/png'));
        }
      }, 200);
    } catch (error) {
      console.error('Error generando QR:', error);
      reject(error);
    }
  });
}

// Crear mensaje personalizado de bienvenida
function createWelcomeMessage(member) {
  // Calcular fecha de vencimiento
  const expirationDate = member.membership_end ? new Date(member.membership_end) : new Date();
  const formattedDate = expirationDate.toLocaleDateString('es-MX');
  
  // Mensaje según el plan
  let benefits = '';
  let emoji = '💪';
  
  if (member.plan === 'Básico') {
    emoji = '👍';
    benefits = '✅ Acceso a área de pesas\n✅ Horario libre (6am-10pm)\n✅ Estacionamiento gratuito\n✅ Lockers sin costo';
  } else if (member.plan === 'Premium') {
    emoji = '⭐';
    benefits = '✅ Acceso a área de pesas\n✅ Clases grupales ilimitadas\n✅ Asesoría nutricional mensual\n✅ Toalla de cortesía\n✅ Estacionamiento preferente\n✅ Acceso a spa y sauna';
  } else {
    emoji = '🏆';
    benefits = '✅ TODOS los beneficios Premium\n✅ 2 meses gratis\n✅ Playera exclusiva NeoFit\n✅ 30% descuento en tienda\n✅ Invitación a evento anual\n✅ Seguimiento personalizado';
  }
  
  return `🎉 *¡BIENVENIDO A NEOFIT, ${member.name.toUpperCase()}!* 🎉

${emoji} Tu membresía *${member.plan}* ha sido activada exitosamente.

📅 *Fecha de vencimiento:* ${formattedDate}

💪 *Beneficios incluidos:*
${benefits}

🎫 *Tu código QR está adjunto a este mensaje*
📱 Guárdalo en tu teléfono o imprímelo
🔍 Preséntalo en la entrada para escanear

🏋️ *Dirección:* Av. Principal #123, Col. Centro
⏰ *Horario:* Lunes a Sábado 6:00 - 22:00
📞 *Contacto:* 55 1234 5678

¡Te esperamos para comenzar tu transformación! 💪

_NeoFit ERP - Tu mejor versión comienza aquí_`;
}

// Enviar WhatsApp con imagen QR
async function sendWhatsAppWithQR(phone, message, qrImageBase64, member) {
  // Limpiar número de teléfono (solo números)
  let cleanPhone = phone.toString().replace(/\D/g, '');
  
  // Validar que tenga al menos 10 dígitos
  if (cleanPhone.length < 10) {
    console.warn('Número inválido:', cleanPhone);
    showToast('⚠️ Número de teléfono inválido, no se envió WhatsApp', 'warning');
    return;
  }
  
  // Agregar código de México (+52) si no tiene
  if (cleanPhone.length === 10) {
    cleanPhone = '52' + cleanPhone;
  }
  
  // Mensaje completo (sin incluir el QR porque WhatsApp Web no permite adjuntar automáticamente)
  const fullMessage = message + '\n\n📲 *IMPORTANTE:* El código QR se ha descargado automáticamente en tu computadora. Si estás en celular, descárgalo de tu perfil en el sistema.';
  
  // Crear URL de WhatsApp
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(fullMessage)}`;
  
  // Abrir WhatsApp en nueva pestaña
  window.open(whatsappUrl, '_blank');
  
  // Descargar QR automáticamente
  downloadQRImage(qrImageBase64, member.name);
  
  console.log('📱 WhatsApp abierto para:', cleanPhone);
  console.log('📥 QR descargado para:', member.name);
}

// Descargar QR automáticamente
function downloadQRImage(qrImageBase64, memberName) {
  const link = document.createElement('a');
  const safeName = memberName ? memberName.replace(/\s/g, '_') : 'miembro';
  const fileName = `QR_NeoFit_${safeName}.png`;
  link.download = fileName;
  link.href = qrImageBase64;
  link.click();
  console.log('✅ QR descargado:', fileName);
}