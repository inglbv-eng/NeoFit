// ============ VERIFICACIÓN DE ADMIN (NUEVO - PONER AL INICIO) ============
(function checkAdminAccess() {
  const userRole = localStorage.getItem('userRole');
  const user = localStorage.getItem('user');
  
  if (!userRole || userRole !== 'admin' || !user) {
    console.log('🔒 Acceso denegado - Redirigiendo a login');
    window.location.href = 'login.html';
    return;
  }
  
  try {
    const userData = JSON.parse(user);
    if (userData.email !== 'admin@neofit.com') {
      localStorage.removeItem('userRole');
      localStorage.removeItem('user');
      window.location.href = 'login.html';
    }
  } catch (e) {
    window.location.href = 'login.html';
  }
})();

// app.js - NeoFit ERP Complete System (VERSIÓN PROFESIONAL CON PERFIL COMPLETO)
let currentUser = null;
let allMembers = [];
let html5QrCode = null;
let attendanceChart = null;
let incomeChart = null;
let appInitialized = false;
let qrProcessing = false;
let scannerStarting = false;

// Variables para perfil
let currentProfileMember = null;
let progressChart = null;
let currentView = 'table'; // 'table' o 'card'

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

function formatDateTime(dateTimeString) {
  if (!dateTimeString) return '-';
  if (dateTimeString.includes(' ')) {
    const [date, time] = dateTimeString.split(' ');
    return `${formatDate(date)} ${time.slice(0,5)}`;
  }
  return formatDate(dateTimeString);
}

function isExpiringSoon(dateString) {
  if (!dateString) return false;
  const expiry = new Date(dateString);
  const today = new Date();
  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  return diffDays <= 7 && diffDays >= 0;
}

function getDaysLeft(dateString) {
  if (!dateString) return 0;
  const expiry = new Date(dateString);
  const today = new Date();
  return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
}

function getPlanClass(plan) {
  switch(plan) {
    case 'Premium': return 'bg-purple-900/50 text-purple-300';
    case 'Anual': return 'bg-blue-900/50 text-blue-300';
    default: return 'bg-gray-800 text-gray-300';
  }
}

function getPlanIcon(plan) {
  switch(plan) {
    case 'Premium': return '⭐';
    case 'Anual': return '🏆';
    default: return '💪';
  }
}

// ============ TOAST NOTIFICATIONS ============
function showToast(message, type = 'success') {
  const existingToast = document.querySelector('.toast-notification');
  if (existingToast) existingToast.remove();
  
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
  
  setTimeout(() => {
    if (toast && toast.remove) toast.remove();
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
    localStorage.setItem('userRole', 'admin');  // ← NUEVO: guardar rol
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
  localStorage.removeItem('userRole');
  localStorage.removeItem('neofit_client');
  
  // Redirigir directamente al login.html
  window.location.href = 'login.html';
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

function showMainApp() {
  // El loginScreen ya no existe o está oculto permanentemente
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) loginScreen.classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
}

function checkAuth() {
  const user = localStorage.getItem('user');
  const userRole = localStorage.getItem('userRole');
  
  // Si no hay usuario o no es admin, redirigir a login
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

async function initializeAppData() {
  showToast('Cargando datos...', 'info');
  await loadDashboardData();
  await loadMembers();
  await loadPayments();
  await loadTodayCheckins();
  startQRScanner();
  loadSavedView();
  showToast('Datos cargados correctamente');
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
    
    const { count: activeCount } = await client
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    document.getElementById('activeMembers').textContent = activeCount || 0;
    
    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const { data: payments } = await client
      .from('payments')
      .select('amount')
      .gte('payment_date', firstDayOfMonth);
    
    const monthlyTotal = payments?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0;
    document.getElementById('monthlyIncome').textContent = `$${monthlyTotal.toLocaleString()}`;
    
    const today = new Date().toISOString().split('T')[0];
    const { count: checkinsCount } = await client
      .from('checkins')
      .select('*', { count: 'exact', head: true })
      .gte('checkin_time', today);
    document.getElementById('todayCheckins').textContent = checkinsCount || 0;
    
    const expiringDate = new Date();
    expiringDate.setDate(expiringDate.getDate() + 7);
    const { count: expiringCount } = await client
      .from('members')
      .select('*', { count: 'exact', head: true })
      .lte('membership_end', expiringDate.toISOString().split('T')[0])
      .gte('membership_end', new Date().toISOString().split('T')[0]);
    document.getElementById('expiringMembers').textContent = expiringCount || 0;
    
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
    
    // Destruir charts de forma SEGURA (corregido)
    if (attendanceChart) {
      try {
        attendanceChart.destroy();
      } catch(e) {
        console.warn('Error destroying attendanceChart:', e);
      }
      attendanceChart = null;
    }
    if (incomeChart) {
      try {
        incomeChart.destroy();
      } catch(e) {
        console.warn('Error destroying incomeChart:', e);
      }
      incomeChart = null;
    }
    
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
    
    let members = data || [];
    
    if (filtered && filtered.status && filtered.status !== '') {
      const today = new Date();
      const expiringDate = new Date();
      expiringDate.setDate(expiringDate.getDate() + 7);
      
      members = members.filter(m => {
        const expiryDate = new Date(m.membership_end);
        if (filtered.status === 'active') {
          return expiryDate >= today;
        } else if (filtered.status === 'expired') {
          return expiryDate < today;
        } else if (filtered.status === 'expiring') {
          return expiryDate >= today && expiryDate <= expiringDate;
        }
        return true;
      });
    }
    
    allMembers = members;
    renderMembersTable(allMembers);
  } catch (error) {
    console.error('Error loading members:', error);
    showToast('Error al cargar los miembros', 'error');
  }
}

function renderMembersTable(members) {
  const tbody = document.getElementById('membersTable');
  const cardContainer = document.getElementById('cardView');
  const membersCount = document.getElementById('membersCount');
  
  if (!tbody) return;
  if (membersCount) membersCount.textContent = members.length;
  
  if (!members || members.length === 0) {
    const emptyMessage = `
      <tr><td colspan="6" class="text-center p-12 text-zinc-400">
        <i class="fas fa-users text-5xl mb-3 opacity-50"></i>
        <p>No hay miembros registrados</p>
        <button onclick="showAddMemberModal()" class="mt-3 text-sky-400 hover:text-sky-300">+ Crear primer miembro</button>
      </td>
      </tr>
    `;
    tbody.innerHTML = emptyMessage;
    if (cardContainer) cardContainer.innerHTML = '<div class="col-span-full text-center p-12 text-zinc-400">No hay miembros registrados</div>';
    return;
  }
  
  // RENDER TABLA
  tbody.innerHTML = members.map(m => {
    const isActive = new Date(m.membership_end) >= new Date();
    const daysLeft = getDaysLeft(m.membership_end);
    const isExpiringSoon = daysLeft <= 7 && daysLeft >= 0;
    const statusClass = isActive ? (isExpiringSoon ? 'bg-yellow-900/50 text-yellow-300' : 'bg-green-900/50 text-green-300') : 'bg-red-900/50 text-red-300';
    const statusText = isActive ? (isExpiringSoon ? `⚠️ ${daysLeft} días` : '✅ Activo') : '❌ Vencido';
    
    return `
      <tr class="border-b border-zinc-800 hover:bg-zinc-800/30 transition cursor-pointer" onclick="showMemberProfile(${m.id})">
        <td class="p-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white font-semibold">
              ${(m.name?.charAt(0) || '?').toUpperCase()}
            </div>
            <div>
              <p class="font-medium">${escapeHtml(m.name || '-')}</p>
              <p class="text-xs text-zinc-500">ID: ${m.id}</p>
            </div>
          </div>
        </td>
        <td class="p-4">
          <p class="text-sm">${escapeHtml(m.email || '-')}</p>
          <p class="text-xs text-zinc-500">${m.phone || '-'}</p>
        </td>
        <td class="p-4">
          <span class="px-3 py-1 rounded-full text-xs font-semibold ${getPlanClass(m.plan)}">
            ${getPlanIcon(m.plan)} ${m.plan || 'Básico'}
          </span>
        </td>
        <td class="p-4">
          <span class="px-3 py-1 rounded-full text-xs font-semibold ${statusClass}">${statusText}</span>
        </td>
        <td class="p-4 text-sm">${formatDate(m.membership_end)}</td>
        <td class="p-4 text-center">
          <div class="flex justify-center gap-2">
            <button onclick="event.stopPropagation(); quickCheckin(${m.id})" class="p-2 rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/40 transition" title="Check-in rápido">
              <i class="fas fa-qrcode"></i>
            </button>
            <button onclick="event.stopPropagation(); showQR(${m.id}, '${escapeHtml(m.name || '')}')" class="p-2 rounded-lg bg-sky-600/20 text-sky-400 hover:bg-sky-600/40 transition" title="Ver QR">
              <i class="fas fa-qrcode"></i>
            </button>
            <button onclick="event.stopPropagation(); editMember(${m.id})" class="p-2 rounded-lg bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/40 transition" title="Editar">
              <i class="fas fa-edit"></i>
            </button>
            <button onclick="event.stopPropagation(); sendPaymentReminder(${m.id}, '${escapeHtml(m.name || '')}', '${m.phone || ''}')" class="p-2 rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/40 transition" title="WhatsApp">
              <i class="fab fa-whatsapp"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  // RENDER CARDS
  if (cardContainer) {
    cardContainer.innerHTML = members.map(m => {
      const isActive = new Date(m.membership_end) >= new Date();
      const daysLeft = getDaysLeft(m.membership_end);
      const isExpiringSoon = daysLeft <= 7 && daysLeft >= 0;
      const statusClass = isActive ? (isExpiringSoon ? 'bg-yellow-900/50 text-yellow-300' : 'bg-green-900/50 text-green-300') : 'bg-red-900/50 text-red-300';
      const statusText = isActive ? (isExpiringSoon ? `⚠️ ${daysLeft} días` : '✅ Activo') : '❌ Vencido';
      
      return `
        <div class="member-card bg-zinc-900/50 backdrop-blur rounded-2xl p-4 border border-zinc-800 hover:border-sky-500/50 transition" onclick="showMemberProfile(${m.id})">
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
                ${(m.name?.charAt(0) || '?').toUpperCase()}
              </div>
              <div>
                <h3 class="font-semibold">${escapeHtml(m.name || '-')}</h3>
                <p class="text-xs text-zinc-500">ID: ${m.id}</p>
              </div>
            </div>
            <span class="px-3 py-1 rounded-full text-xs font-semibold ${getPlanClass(m.plan)}">
              ${getPlanIcon(m.plan)} ${m.plan || 'Básico'}
            </span>
          </div>
          
          <div class="space-y-2 mb-4">
            <div class="flex items-center gap-2 text-sm"><i class="fas fa-envelope text-zinc-500 w-4"></i><span class="text-zinc-300">${escapeHtml(m.email || '-')}</span></div>
            <div class="flex items-center gap-2 text-sm"><i class="fas fa-phone text-zinc-500 w-4"></i><span class="text-zinc-300">${m.phone || '-'}</span></div>
            <div class="flex items-center gap-2 text-sm"><i class="fas fa-calendar text-zinc-500 w-4"></i><span class="text-zinc-300">Vence: ${formatDate(m.membership_end)}</span></div>
            <div class="flex items-center gap-2"><span class="px-2 py-0.5 rounded-full text-xs ${statusClass}">${statusText}</span></div>
          </div>
          
          <div class="flex justify-around pt-3 border-t border-zinc-800">
            <button onclick="event.stopPropagation(); quickCheckin(${m.id})" class="flex flex-col items-center gap-1 text-green-400 hover:text-green-300 transition">
              <i class="fas fa-qrcode text-lg"></i><span class="text-xs">Check-in</span>
            </button>
            <button onclick="event.stopPropagation(); showQR(${m.id}, '${escapeHtml(m.name || '')}')" class="flex flex-col items-center gap-1 text-sky-400 hover:text-sky-300 transition">
              <i class="fas fa-qrcode text-lg"></i><span class="text-xs">QR</span>
            </button>
            <button onclick="event.stopPropagation(); editMember(${m.id})" class="flex flex-col items-center gap-1 text-yellow-400 hover:text-yellow-300 transition">
              <i class="fas fa-edit text-lg"></i><span class="text-xs">Editar</span>
            </button>
            <button onclick="event.stopPropagation(); sendPaymentReminder(${m.id}, '${escapeHtml(m.name || '')}', '${m.phone || ''}')" class="flex flex-col items-center gap-1 text-green-400 hover:text-green-300 transition">
              <i class="fab fa-whatsapp text-lg"></i><span class="text-xs">WhatsApp</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
  
  updateViewDisplay();
}

function filterMembers() {
  const term = document.getElementById('searchInput')?.value || '';
  const plan = document.getElementById('planFilter')?.value || '';
  const status = document.getElementById('statusFilter')?.value || '';
  loadMembers({ term, plan, status });
}

function resetFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('planFilter').value = '';
  document.getElementById('statusFilter').value = '';
  loadMembers();
}

function toggleView() {
  currentView = currentView === 'table' ? 'card' : 'table';
  updateViewDisplay();
  localStorage.setItem('membersView', currentView);
  // Forzar re-renderizado de la vista (corregido)
  if (allMembers.length > 0) {
    renderMembersTable(allMembers);
  }
}

function updateViewDisplay() {
  const tableView = document.getElementById('tableView');
  const cardView = document.getElementById('cardView');
  const tableViewBtn = document.getElementById('tableViewBtn');
  const cardViewBtn = document.getElementById('cardViewBtn');
  
  if (currentView === 'table') {
    // Mostrar tabla, ocultar cards
    tableView.classList.remove('hidden');
    cardView.classList.add('hidden');
    
    // Estilos botones
    tableViewBtn.classList.remove('text-zinc-400', 'bg-transparent');
    tableViewBtn.classList.add('bg-sky-600', 'text-white', 'shadow-md');
    cardViewBtn.classList.remove('bg-sky-600', 'text-white', 'shadow-md');
    cardViewBtn.classList.add('text-zinc-400', 'bg-transparent');
  } else {
    // Mostrar cards, ocultar tabla
    tableView.classList.add('hidden');
    cardView.classList.remove('hidden');
    
    // Estilos botones
    cardViewBtn.classList.remove('text-zinc-400', 'bg-transparent');
    cardViewBtn.classList.add('bg-sky-600', 'text-white', 'shadow-md');
    tableViewBtn.classList.remove('bg-sky-600', 'text-white', 'shadow-md');
    tableViewBtn.classList.add('text-zinc-400', 'bg-transparent');
  }
}

function loadSavedView() {
  const savedView = localStorage.getItem('membersView');
  if (savedView === 'card') {
    currentView = 'card';
  } else {
    currentView = 'table';
  }
  updateViewDisplay();
  // Forzar renderizado
  if (allMembers.length > 0) {
    renderMembersTable(allMembers);
  }
}

async function saveMember(event) {
  event.preventDefault();
  
  const memberId = document.getElementById('memberId').value;
  const name = document.getElementById('name').value;
  const email = document.getElementById('email').value;
  const phone = document.getElementById('phone').value;
  const plan = document.getElementById('plan').value;
  const birthDate = document.getElementById('birthDate').value;
  const height = document.getElementById('height').value;
  const emergencyContact = document.getElementById('emergencyContact').value;
  const emergencyPhone = document.getElementById('emergencyPhone').value;
  const healthNotes = document.getElementById('healthNotes').value;
  const goals = document.getElementById('goals').value;
  
  if (!name || !email || !phone) {
    showToast('Por favor completa todos los campos', 'error');
    return;
  }
  
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    let result;
    
    if (memberId) {
      // ACTUALIZAR MIEMBRO EXISTENTE
      const updateData = {
        name: name,
        email: email,
        phone: phone,
        plan: plan,
        birth_date: birthDate || null,
        height: height ? parseFloat(height) : null,
        emergency_contact: emergencyContact || null,
        emergency_phone: emergencyPhone || null,
        health_notes: healthNotes || null,
        goals: goals || null,
        updated_at: new Date().toISOString()
      };
      
      result = await client
        .from('members')
        .update(updateData)
        .eq('id', parseInt(memberId))
        .select();
        
      if (result.error) throw result.error;
      
      // Actualizar también el perfil en profiles si existe
      const member = allMembers.find(m => m.id === parseInt(memberId));
      if (member && member.auth_id) {
        await client
          .from('profiles')
          .update({
            email: email,
            full_name: name,
            updated_at: new Date().toISOString()
          })
          .eq('id', member.auth_id);
      }
      
      showToast('Miembro actualizado correctamente', 'success');
      
    } else {
      // ========== CREAR NUEVO MIEMBRO ==========
      
      // 1. Generar contraseña temporal
      const tempPassword = generateTemporaryPassword();
      
      // 2. Crear usuario en Supabase Auth
      const { data: authUser, error: authError } = await client.auth.signUp({
        email: email,
        password: tempPassword,
        options: {
          data: {
            name: name,
            role: 'member',
            phone: phone
          }
        }
      });
      
      if (authError) {
        if (authError.message.includes('already registered')) {
          console.log('⚠️ Usuario ya existe, continuando...');
        } else {
          throw authError;
        }
      }
      
      // 3. Crear perfil en tabla profiles
      let profileCreated = false;
      if (authUser?.user?.id) {
        const { error: profileError } = await client
          .from('profiles')
          .insert({
            id: authUser.user.id,
            email: email,
            full_name: name,
            role: 'member',
            created_at: new Date().toISOString()
          });
        
        if (profileError) {
          console.error('Error creando perfil:', profileError);
        } else {
          profileCreated = true;
          console.log('✅ Perfil creado en profiles');
        }
      }
      
      // 4. Crear miembro en la tabla members
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
        status: 'active',
        membership_end: expirationDate.toISOString().split('T')[0],
        created_at: new Date().toISOString(),
        birth_date: birthDate || null,
        height: height ? parseFloat(height) : null,
        emergency_contact: emergencyContact || null,
        emergency_phone: emergencyPhone || null,
        health_notes: healthNotes || null,
        goals: goals || null,
        auth_id: authUser?.user?.id || null
      };
      
      result = await client
        .from('members')
        .insert([memberData])
        .select();
      
      if (result.error) throw result.error;
      
      // 5. Enviar credenciales por WhatsApp
      if (result.data && result.data[0]) {
        const newMember = result.data[0];
        await sendWelcomeWithCredentials(newMember, tempPassword);
      }
      
      showToast(`✅ Miembro creado. Credenciales enviadas por WhatsApp`, 'success');
    }
    
    // Cerrar modal y recargar datos
    const memberModal = document.getElementById('memberModal');
    if (memberModal) {
      memberModal.classList.add('hidden');
    }
    
    await loadMembers();
    await loadDashboardData();
    
    // Resetear formulario
    const memberForm = document.getElementById('memberForm');
    if (memberForm) {
      memberForm.reset();
    }
    const memberIdField = document.getElementById('memberId');
    if (memberIdField) {
      memberIdField.value = '';
    }
    
  } catch (error) {
    console.error('Error:', error);
    showToast('Error al guardar miembro: ' + error.message, 'error');
  }
}

// Función para generar contraseña temporal
function generateTemporaryPassword() {
  const length = 8;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// Función para enviar credenciales por WhatsApp
async function sendWelcomeWithCredentials(member, tempPassword) {
  if (!member.phone) {
    console.warn('No hay teléfono para enviar credenciales');
    showToast('⚠️ No se pudo enviar credenciales - miembro sin teléfono', 'warning');
    return;
  }
  
  const message = `🎉 *¡BIENVENIDO A NEOFIT, ${member.name}!* 🎉

✅ Tu cuenta ha sido creada exitosamente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 *TUS CREDENCIALES DE ACCESO:*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 *Usuario:* ${member.email}
🔑 *Contraseña:* ${tempPassword}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📲 *ACCEDE AQUÍ:* ${window.location.origin}/login.html

🎫 *USA TU QR EN LA ENTRADA DEL GIMNASIO*

⚠️ *RECOMENDACIÓN:* Cambia tu contraseña en tu primer acceso.

¡Te esperamos para entrenar! 💪

_NeoFit Gym_`;

  let cleanPhone = member.phone.replace(/\s/g, '').replace(/[-()]/g, '');
  if (!cleanPhone.startsWith('+')) {
    cleanPhone = cleanPhone.startsWith('52') ? `+${cleanPhone}` : `+52${cleanPhone}`;
  }
  
  window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
}

// ============ SUBIR FOTO DE PERFIL ============
async function uploadMemberPhoto() {
  if (!currentProfileMember) {
    showToast('No hay miembro seleccionado', 'error');
    return;
  }
  
  // Crear input de archivo oculto
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validar tamaño (máx 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showToast('La imagen no puede superar los 2MB', 'error');
      return;
    }
    
    // Validar tipo
    if (!file.type.startsWith('image/')) {
      showToast('Solo se permiten imágenes', 'error');
      return;
    }
    
    showToast('Subiendo foto...', 'info');
    
    try {
      const client = window.supabaseClient();
      if (!client) throw new Error('Supabase no disponible');
      
      // Generar nombre único para la foto
      const fileExt = file.name.split('.').pop();
      const fileName = `${currentProfileMember.id}_${Date.now()}.${fileExt}`;
      const filePath = `members/${fileName}`;
      
      // Subir a Supabase Storage
      const { error: uploadError } = await client.storage
        .from('member-photos')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      // Obtener URL pública
      const { data: urlData } = client.storage
        .from('member-photos')
        .getPublicUrl(filePath);
      
      const photoUrl = urlData.publicUrl;
      
      // Actualizar en la base de datos
      const { error: updateError } = await client
        .from('members')
        .update({ photo_url: photoUrl })
        .eq('id', currentProfileMember.id);
      
      if (updateError) throw updateError;
      
      // Actualizar UI
      document.getElementById('profilePhoto').innerHTML = `<img src="${photoUrl}" class="w-32 h-32 rounded-full object-cover">`;
      currentProfileMember.photo_url = photoUrl;
      
      showToast('Foto actualizada correctamente', 'success');
      
    } catch (error) {
      console.error('Error subiendo foto:', error);
      showToast('Error al subir la foto: ' + error.message, 'error');
    }
  };
  
  input.click();
}

// Función alternativa para foto sin Supabase Storage (usando Base64)
async function uploadMemberPhotoBase64() {
  if (!currentProfileMember) {
    showToast('No hay miembro seleccionado', 'error');
    return;
  }
  
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
      showToast('La imagen no puede superar los 2MB', 'error');
      return;
    }
    
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result;
      
      try {
        const client = window.supabaseClient();
        if (!client) throw new Error('Supabase no disponible');
        
        // Guardar Base64 directamente en la BD (no recomendado para muchas fotos)
        const { error: updateError } = await client
          .from('members')
          .update({ photo_url: base64String })
          .eq('id', currentProfileMember.id);
        
        if (updateError) throw updateError;
        
        document.getElementById('profilePhoto').innerHTML = `<img src="${base64String}" class="w-32 h-32 rounded-full object-cover">`;
        currentProfileMember.photo_url = base64String;
        
        showToast('Foto actualizada correctamente', 'success');
        
      } catch (error) {
        console.error('Error:', error);
        showToast('Error al guardar la foto', 'error');
      }
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

async function editMember(id) {
  const member = allMembers.find(m => m.id === id);
  if (!member) return;
  
  console.log('Editando miembro:', member);
  
  document.getElementById('modalTitle').textContent = 'Editar Miembro';
  document.getElementById('memberId').value = member.id;
  document.getElementById('name').value = member.name || '';
  document.getElementById('email').value = member.email || '';
  document.getElementById('phone').value = member.phone || '';
  document.getElementById('plan').value = member.plan || 'Básico';
  
  // Cargar campos adicionales
  document.getElementById('birthDate').value = member.birth_date || '';
  document.getElementById('height').value = member.height || '';
  document.getElementById('emergencyContact').value = member.emergency_contact || '';
  document.getElementById('emergencyPhone').value = member.emergency_phone || '';
  document.getElementById('healthNotes').value = member.health_notes || '';
  document.getElementById('goals').value = member.goals || '';
  
  // Si tienes foto, mostrar preview
  if (member.photo_url) {
    const photoContainer = document.getElementById('profilePhotoPreview');
    if (photoContainer) {
      photoContainer.innerHTML = `<img src="${member.photo_url}" class="w-20 h-20 rounded-full object-cover">`;
    }
  }
  
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
    
    // Actualizar último check-in en members
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
    if (!client) throw new Error('Supabase no disponible');
    
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    const { data, error } = await client
      .from('checkins')
      .select(`*, members (name, plan)`)
      .gte('checkin_time', `${todayStr} 00:00:00`)
      .order('checkin_time', { ascending: false });
    
    if (error) throw error;
    
    document.getElementById('todayCount').textContent = data?.length || 0;
    
    const container = document.getElementById('todayCheckinsList');
    if (!container) return;
    
    if (!data || data.length === 0) {
      container.innerHTML = '<div class="text-center p-8 text-zinc-400">No hay check-ins hoy</div>';
      return;
    }
    
    container.innerHTML = data.map(c => {
      let timeStr = '';
      if (c.checkin_time) {
        const timePart = c.checkin_time.split(' ')[1];
        if (timePart) {
          const [hours, minutes] = timePart.split(':');
          timeStr = `${hours}:${minutes}`;
        }
      }
      return `
        <div class="flex items-center justify-between p-4 bg-zinc-800 rounded-2xl">
          <div><p class="font-semibold">${escapeHtml(c.members?.name || 'Unknown')}</p><p class="text-sm text-zinc-400">${c.members?.plan || '-'}</p></div>
          <div class="text-right"><p class="text-sm text-green-400"><i class="fas fa-clock mr-1"></i> ${timeStr || 'Hora no registrada'}</p></div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading checkins:', error);
  }
}

// ============ QR SCANNER ============
async function startQRScanner() {
  if (scannerStarting) return;
  scannerStarting = true;
  console.log('📷 Iniciando escáner QR PRO...');

  try {
    if (html5QrCode) {
      try {
        await html5QrCode.stop();
        await html5QrCode.clear();
        console.log('🛑 Escáner anterior detenido');
      } catch (e) {
        console.warn('Error cerrando scanner:', e);
      }
    }

    const scannerElement = document.getElementById('reader');
    if (!scannerElement) {
      console.error('❌ No existe #reader');
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
      } catch (e) {
        try {
          const audio = new Audio('data:audio/wav;base64,U3RlYWx0aCBzb3VuZA==');
          audio.play().catch(() => {});
        } catch (err) { console.log('Sonido no disponible'); }
      }
    }

    const onScanSuccess = async (decodedText) => {
      if (qrProcessing) return;
      qrProcessing = true;
      console.log('✅ QR detectado:', decodedText);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      playBeepSound();
      const input = document.getElementById('manualQRInput');
      if (input) input.value = decodedText;
      try {
        await processCheckin();
      } catch (e) {
        console.error(e);
        showToast('Error al procesar check-in', 'error');
      } finally {
        setTimeout(() => { qrProcessing = false; }, 2000);
      }
    };

    const onScanError = (err) => {
      // Ignorar errores comunes que NO afectan el funcionamiento
      if (
        err?.includes('NotFoundException') ||
        err?.includes('No MultiFormat Readers') ||
        err?.includes('source width is 0') ||
        err?.includes('IndexSizeError')
      ) {
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
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
    };

    await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanError);
    console.log('✅ Cámara iniciada');

    setTimeout(() => {
      const video = document.querySelector('#reader video');
      if (!video) return;
      video.style.display = 'block';
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      video.style.filter = 'contrast(1.2) brightness(1.1) saturate(1.1)';
      video.setAttribute('playsinline', true);
      video.setAttribute('autoplay', true);
      video.setAttribute('muted', true);
      video.play().catch(() => {});
      const stream = video.srcObject;
      const track = stream?.getVideoTracks()[0];
      if (track && track.getCapabilities().zoom) {
        track.applyConstraints({ advanced: [{ zoom: 2 }] }).catch(() => {});
        console.log('🔍 Zoom aplicado');
      }
    }, 500);

  } catch (err) {
    console.error('❌ Error total cámara:', err);
    const scannerElement = document.getElementById('reader');
    if (scannerElement) {
      scannerElement.innerHTML = `<div class="bg-yellow-900/30 rounded-2xl p-6 text-center border border-yellow-800 h-full flex flex-col justify-center"><i class="fas fa-camera-slash text-5xl text-yellow-400 mb-4"></i><p class="text-white font-semibold text-lg mb-2">No se pudo acceder a la cámara</p><p class="text-zinc-400 text-sm mb-4">${err.message || 'Verifica permisos'}</p><button onclick="startQRScanner()" class="px-4 py-3 bg-sky-600 hover:bg-sky-500 rounded-xl text-sm transition">Reintentar</button></div>`;
    }
  } finally {
    scannerStarting = false;
  }
}

function requestCameraPermission() {
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => { stream.getTracks().forEach(track => track.stop()); showToast('✅ Permiso concedido', 'success'); startQRScanner(); })
    .catch(err => { showToast('❌ Permiso de cámara denegado', 'error'); });
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
        <td class="p-5 text-center"><button onclick="sendPaymentReceipt(${p.id}, '${escapeHtml(p.members?.name)}', ${p.amount})" class="text-blue-400 hover:text-blue-300" title="Enviar recibo"><i class="fas fa-receipt"></i></button></td>
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
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
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
  
  // Mostrar foto si existe, si no mostrar inicial
  const photoContainer = document.getElementById('profilePhoto');
  if (member.photo_url) {
    photoContainer.innerHTML = `<img src="${member.photo_url}" class="w-32 h-32 rounded-full object-cover">`;
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
  
  // Verificar que los elementos existan antes de asignarles valor
  const infoName = document.getElementById('infoName');
  const infoEmail = document.getElementById('infoEmail');
  const infoPhone = document.getElementById('infoPhone');
  const infoBirth = document.getElementById('infoBirth');
  const infoHeight = document.getElementById('infoHeight');
  const infoEmergencyContact = document.getElementById('infoEmergencyContact');
  const infoEmergencyPhone = document.getElementById('infoEmergencyPhone');
  const infoGoals = document.getElementById('infoGoals');
  const infoHealthNotes = document.getElementById('infoHealthNotes');
  const infoCurrentPlan = document.getElementById('infoCurrentPlan');
  const infoExpiry = document.getElementById('infoExpiry');
  const infoDaysLeft = document.getElementById('infoDaysLeft');
  const infoLastCheckin = document.getElementById('infoLastCheckin');
  const infoWeight = document.getElementById('infoWeight');
  const infoBMI = document.getElementById('infoBMI');
  const infoBodyFat = document.getElementById('infoBodyFat');
  const infoMuscle = document.getElementById('infoMuscle');
  
  if (infoName) infoName.textContent = member.name || '-';
  if (infoEmail) infoEmail.textContent = member.email || '-';
  if (infoPhone) infoPhone.textContent = member.phone || '-';
  if (infoBirth) infoBirth.textContent = member.birth_date ? formatDate(member.birth_date) : '-';
  if (infoHeight) infoHeight.textContent = member.height ? `${member.height} cm` : '-';
  if (infoEmergencyContact) infoEmergencyContact.textContent = member.emergency_contact || '-';
  if (infoEmergencyPhone) infoEmergencyPhone.textContent = member.emergency_phone || '-';
  if (infoGoals) infoGoals.textContent = member.goals || '-';
  if (infoHealthNotes) infoHealthNotes.textContent = member.health_notes || '-';
  if (infoCurrentPlan) infoCurrentPlan.textContent = member.plan || '-';
  if (infoExpiry) infoExpiry.textContent = formatDate(member.membership_end);
  
  const daysLeft = getDaysLeft(member.membership_end);
  if (infoDaysLeft) {
    infoDaysLeft.textContent = daysLeft > 0 ? `${daysLeft} días` : 'Vencida';
    infoDaysLeft.className = daysLeft <= 7 && daysLeft > 0 ? 'font-medium text-yellow-400' : 'font-medium';
  }
  
  if (infoLastCheckin && member.last_checkin) infoLastCheckin.textContent = formatDateTime(member.last_checkin);
  
  // Cargar progreso si existe
  const { data: progress } = await client.from('member_progress').select('*').eq('member_id', memberId).order('date', { ascending: false }).limit(1);
  if (progress && progress[0]) {
    const last = progress[0];
    if (infoWeight) infoWeight.textContent = last.weight ? `${last.weight} kg` : '-';
    if (infoBodyFat) infoBodyFat.textContent = last.body_fat ? `${last.body_fat}%` : '-';
    if (infoMuscle) infoMuscle.textContent = last.muscle_mass ? `${last.muscle_mass} kg` : '-';
    if (last.weight && member.height && infoBMI) {
      const heightM = member.height / 100;
      const bmi = (last.weight / (heightM * heightM)).toFixed(1);
      infoBMI.textContent = bmi;
    }
  }
  
  // Cargar las listas (estas funciones ya tienen sus propias verificaciones)
  await loadProfilePayments(memberId);
  await loadProgressHistory(memberId);
  await loadMemberRoutines(memberId);
  await loadProfileCheckins(memberId);
  
  // Actualizar UI de usuario Auth
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
      <div>
        <p class="font-semibold text-green-400">$${parseFloat(p.amount).toLocaleString()}</p>
        <p class="text-sm text-zinc-400">${p.plan}</p>
      </div>
      <div class="text-right">
        <p class="text-sm">${formatDate(p.payment_date)}</p>
        <p class="text-xs text-zinc-500">Vence: ${formatDate(p.expiration_date)}</p>
      </div>
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
      <div class="flex justify-between items-start mb-2">
        <p class="font-semibold">${formatDate(p.date)}</p>
        <button onclick="deleteProgress(${p.id})" class="text-red-400 text-sm"><i class="fas fa-trash"></i></button>
      </div>
      <div class="grid grid-cols-2 gap-2 text-sm">
        ${p.weight ? `<div>⚖️ Peso: ${p.weight} kg</div>` : ''}
        ${p.body_fat ? `<div>🎯 Grasa: ${p.body_fat}%</div>` : ''}
        ${p.muscle_mass ? `<div>💪 Músculo: ${p.muscle_mass} kg</div>` : ''}
      </div>
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
      <div class="flex justify-between items-center">
        <div>
          <h4 class="font-semibold">${escapeHtml(r.name)}</h4>
          <p class="text-sm text-zinc-400">${r.difficulty || 'Intermedio'} • ${r.days_per_week || 3} días/semana</p>
        </div>
        <button onclick="viewRoutine(${r.id})" class="text-sky-400"><i class="fas fa-eye"></i></button>
      </div>
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
  
  container.innerHTML = data.map(c => `
    <div class="bg-zinc-800 rounded-xl p-3 flex justify-between items-center">
      <span>📅 ${formatDateTime(c.checkin_time)}</span>
      <span class="text-green-400">✅ Asistió</span>
    </div>
  `).join('');
}

function closeMemberProfile() { document.getElementById('memberProfileModal').classList.add('hidden'); currentProfileMember = null; }

function showProfileTab(tab) {
  const tabs = ['info', 'payments', 'progress', 'routines', 'checkins', 'user'];
  tabs.forEach(t => {
    const tabEl = document.getElementById(`${t}Tab`);
    if (tabEl) tabEl.classList.add('hidden');
    
    const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) {
      btn.classList.remove('border-sky-500', 'text-sky-400');
      btn.classList.add('text-zinc-400');
    }
  });
  
  const activeTab = document.getElementById(`${tab}Tab`);
  if (activeTab) activeTab.classList.remove('hidden');
  
  const activeBtn = document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
  if (activeBtn) {
    activeBtn.classList.add('border-sky-500', 'text-sky-400');
    activeBtn.classList.remove('text-zinc-400');
  }
}

function quickCheckinFromProfile() {
  if (!currentProfileMember || !currentProfileMember.id) {
    showToast('Error: No se pudo obtener el miembro', 'error');
    return;
  }
  quickCheckin(currentProfileMember.id);
  setTimeout(() => closeMemberProfile(), 1000);
}

function sendWhatsAppToMember() {
  if (!currentProfileMember || !currentProfileMember.id) {
    showToast('Error: No se pudo obtener el miembro', 'error');
    return;
  }
  if (currentProfileMember.phone) {
    sendPaymentReminder(currentProfileMember.id, currentProfileMember.name, currentProfileMember.phone);
  } else {
    showToast('Miembro sin número de teléfono', 'error');
  }
}

// ============ EDITAR MIEMBRO DESDE PERFIL (CORREGIDO) ============
function editMemberFromProfile() {
  if (!currentProfileMember) {
    console.error('No hay miembro seleccionado para editar');
    showToast('Error: No se pudo obtener el miembro', 'error');
    return;
  }
  
  if (!currentProfileMember.id) {
    console.error('El miembro no tiene ID válido', currentProfileMember);
    showToast('Error: ID de miembro inválido', 'error');
    return;
  }
  
  const memberId = currentProfileMember.id;
  console.log('Editando miembro desde perfil:', memberId);
  
  // Cerrar modal de perfil
  closeMemberProfile();
  
  // Abrir modal de edición
  editMember(memberId);
}

function showPaymentModalFromProfile() { if (currentProfileMember) { document.getElementById('paymentMemberId').value = currentProfileMember.id; showPaymentModal(); } }
function downloadMemberQR() { const qrCanvas = document.querySelector('#profileQR canvas'); if (qrCanvas) { const link = document.createElement('a'); link.download = `QR_${currentProfileMember.name.replace(/\s/g, '_')}.png`; link.href = qrCanvas.toDataURL(); link.click(); } }
function viewRoutine(routineId) { showToast('Detalles de rutina próximamente', 'info'); }

// ============ PROGRESS MODAL ============
document.addEventListener('DOMContentLoaded', () => {
  const progressForm = document.getElementById('progressForm');
  if (progressForm) {
    progressForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentProfileMember) return;
      const client = window.supabaseClient();
      if (!client) return;
      const progressData = {
        member_id: currentProfileMember.id,
        date: document.getElementById('progressDate').value || new Date().toISOString().split('T')[0],
        weight: parseFloat(document.getElementById('progressWeight').value) || null,
        body_fat: parseFloat(document.getElementById('progressBodyFat').value) || null,
        muscle_mass: parseFloat(document.getElementById('progressMuscle').value) || null,
        chest: parseFloat(document.getElementById('progressChest').value) || null,
        waist: parseFloat(document.getElementById('progressWaist').value) || null,
        notes: document.getElementById('progressNotes').value
      };
      const { error } = await client.from('member_progress').insert([progressData]);
      if (error) showToast('Error al guardar progreso', 'error');
      else { showToast('Progreso registrado', 'success'); closeProgressModal(); await loadProgressHistory(currentProfileMember.id); await loadMemberExtraData(currentProfileMember.id); }
    });
  }
});

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

document.addEventListener('DOMContentLoaded', () => {
  const routineForm = document.getElementById('routineForm');
  if (routineForm) {
    routineForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentProfileMember) return;
      const client = window.supabaseClient();
      if (!client) return;
      const routineData = {
        member_id: currentProfileMember.id,
        name: document.getElementById('routineName').value,
        difficulty: document.getElementById('routineDifficulty').value,
        days_per_week: parseInt(document.getElementById('routineDaysPerWeek').value),
        created_at: new Date().toISOString()
      };
      const { error } = await client.from('routines').insert([routineData]);
      if (error) showToast('Error al asignar rutina', 'error');
      else { showToast('Rutina asignada', 'success'); closeRoutineModal(); await loadMemberRoutines(currentProfileMember.id); }
    });
  }
});

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

function closeModal() { document.getElementById('memberModal').classList.add('hidden'); }
function closePaymentModal() { document.getElementById('paymentModal').classList.add('hidden'); }

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

// ============ MOBILE MENU ============
function isMobile() { return window.innerWidth <= 768; }

function addMobileMenuButton() {
  if (document.querySelector('.mobile-menu-btn')) return;
  const sidebar = document.querySelector('.w-72');
  const menuBtn = document.createElement('button');
  menuBtn.className = 'mobile-menu-btn fixed top-4 left-4 z-50 bg-sky-600 p-3 rounded-2xl shadow-lg lg:hidden';
  menuBtn.innerHTML = '<i class="fas fa-bars text-xl"></i>';
  menuBtn.onclick = toggleMobileMenu;
  document.body.appendChild(menuBtn);
  if (isMobile()) { sidebar.style.position = 'fixed'; sidebar.style.left = '-100%'; sidebar.style.top = '0'; sidebar.style.bottom = '0'; sidebar.style.zIndex = '1000'; sidebar.style.transition = 'left 0.3s ease'; sidebar.style.overflowY = 'auto'; }
}

function toggleMobileMenu() {
  const sidebar = document.querySelector('.w-72');
  const currentLeft = sidebar.style.left;
  if (currentLeft === '0px') { sidebar.style.left = '-100%'; document.body.style.overflow = 'auto'; }
  else { sidebar.style.left = '0'; document.body.style.overflow = 'hidden'; }
}

function closeMobileMenuOnClick() {
  document.querySelectorAll('.w-72 nav button').forEach(link => link.addEventListener('click', () => { if (isMobile()) { document.querySelector('.w-72').style.left = '-100%'; document.body.style.overflow = 'auto'; } }));
}

// ============ GESTIÓN DE USUARIOS AUTH PARA MIEMBROS ============

// Verificar si un miembro tiene usuario Auth
async function checkMemberAuthStatus(memberId, memberEmail) {
  const client = window.supabaseClient();
  if (!client) return false;
  
  try {
    // Intentar obtener el usuario por email
    const { data: users, error } = await client.auth.admin.listUsers();
    
    // Si no tenemos acceso admin a la lista, intentamos verificar si puede loguear
    if (error) {
      console.warn('No se pudo listar usuarios, intentando método alternativo');
      // Método alternativo: intentar reset de contraseña (si existe el usuario)
      const { error: resetError } = await client.auth.resetPasswordForEmail(memberEmail);
      // Si no hay error de "user not found", probablemente existe
      return !resetError || !resetError.message.includes('User not found');
    }
    
    const userExists = users?.users?.some(u => u.email === memberEmail);
    return userExists;
  } catch (error) {
    console.error('Error verificando usuario Auth:', error);
    return false;
  }
}

// Actualizar UI del estado del usuario en el perfil
async function updateUserAuthUI() {
  if (!currentProfileMember) return;
  
  const hasAuth = await checkMemberAuthStatus(currentProfileMember.id, currentProfileMember.email);
  
  // También verificar si existe en profiles
  let hasProfile = false;
  if (currentProfileMember.auth_id) {
    const client = window.supabaseClient();
    if (client) {
      const { data: profile } = await client
        .from('profiles')
        .select('id')
        .eq('id', currentProfileMember.auth_id)
        .single();
      hasProfile = !!profile;
    }
  }
  
  const notCreatedDiv = document.getElementById('userNotCreated');
  const createdDiv = document.getElementById('userCreated');
  const statusDiv = document.getElementById('userAuthStatus');
  const authEmailInput = document.getElementById('userAuthEmail');
  
  if (authEmailInput) authEmailInput.value = currentProfileMember.email;
  
  if (hasAuth || hasProfile) {
    // Usuario YA tiene cuenta Auth
    if (notCreatedDiv) notCreatedDiv.classList.add('hidden');
    if (createdDiv) createdDiv.classList.remove('hidden');
    if (statusDiv) {
      statusDiv.style.background = 'rgba(16, 185, 129, 0.1)';
      statusDiv.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      document.getElementById('authStatusIcon').className = 'fas fa-check-circle text-green-400 text-2xl';
      document.getElementById('authStatusText').textContent = '✓ Cuenta Activada';
      document.getElementById('authStatusText').className = 'font-semibold text-green-400';
      document.getElementById('authStatusDetail').textContent = 'El miembro puede iniciar sesión en la app cliente';
    }
  } else {
    // Usuario NO tiene cuenta Auth
    if (notCreatedDiv) notCreatedDiv.classList.remove('hidden');
    if (createdDiv) createdDiv.classList.add('hidden');
    if (statusDiv) {
      statusDiv.style.background = 'rgba(239, 68, 68, 0.1)';
      statusDiv.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      document.getElementById('authStatusIcon').className = 'fas fa-exclamation-triangle text-red-400 text-2xl';
      document.getElementById('authStatusText').textContent = '✗ Cuenta no creada';
      document.getElementById('authStatusText').className = 'font-semibold text-red-400';
      document.getElementById('authStatusDetail').textContent = 'Debes crear una cuenta de acceso para este miembro';
    }
  }
}

// Crear usuario Auth para un miembro
async function createUserAuthForMember() {
  if (!currentProfileMember) {
    showToast('No hay miembro seleccionado', 'error');
    return;
  }
  
  const tempPassword = generateTemporaryPassword();
  
  showToast('Creando cuenta de acceso...', 'info');
  
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    // 1. Crear usuario en Supabase Auth
    const { data, error } = await client.auth.signUp({
      email: currentProfileMember.email,
      password: tempPassword,
      options: {
        data: {
          name: currentProfileMember.name,
          role: 'member',
          phone: currentProfileMember.phone
        }
      }
    });
    
    if (error) {
      if (error.message.includes('already registered')) {
        showToast('⚠️ El usuario ya existe. Puedes resetear su contraseña.', 'warning');
        await updateUserAuthUI();
        return;
      }
      throw error;
    }
    
    // 2. Crear perfil en tabla profiles
    if (data?.user?.id) {
      const { error: profileError } = await client
        .from('profiles')
        .insert({
          id: data.user.id,
          email: currentProfileMember.email,
          full_name: currentProfileMember.name,
          role: 'member',
          created_at: new Date().toISOString()
        });
      
      if (profileError) {
        console.error('Error creando perfil:', profileError);
        showToast('⚠️ Usuario creado pero hubo error con el perfil', 'warning');
      } else {
        console.log('✅ Perfil creado en profiles');
      }
      
      // 3. Actualizar el auth_id en la tabla members
      await client
        .from('members')
        .update({ auth_id: data.user.id })
        .eq('id', currentProfileMember.id);
    }
    
    // 4. Enviar credenciales por WhatsApp
    await sendWelcomeWithCredentials(currentProfileMember, tempPassword);
    
    showToast('✅ Cuenta creada. Credenciales enviadas por WhatsApp', 'success');
    await updateUserAuthUI();
    
  } catch (error) {
    console.error('Error creando usuario:', error);
    showToast('Error al crear usuario: ' + error.message, 'error');
  }
}

// Resetear contraseña (enviar email de recuperación)
async function resetUserPassword() {
  if (!currentProfileMember) return;
  
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    const { error } = await client.auth.resetPasswordForEmail(currentProfileMember.email, {
      redirectTo: window.location.origin + '/reset-password.html'
    });
    
    if (error) throw error;
    
    showToast('📧 Se ha enviado un enlace de recuperación al email del miembro', 'success');
    
    // Opcional: enviar WhatsApp notificando
    if (currentProfileMember.phone) {
      await sendPasswordResetNotification(
        currentProfileMember.name, 
        currentProfileMember.email, 
        currentProfileMember.phone
      );
    }
    
  } catch (error) {
    console.error('Error:', error);
    showToast('Error al enviar recuperación: ' + error.message, 'error');
  }
}

// Reenviar credenciales por WhatsApp
async function sendCredentialsWhatsApp() {
  if (!currentProfileMember) return;
  
  // Generar nueva contraseña temporal
  const tempPassword = generateTemporaryPassword();
  
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    // Actualizar contraseña (requiere que el usuario exista)
    const { error } = await client.auth.admin.updateUserById(
      currentProfileMember.auth_id,
      { password: tempPassword }
    );
    
    if (error) {
      // Si no podemos actualizar directamente, enviamos reset
      await resetUserPassword();
      showToast('📧 Se ha enviado un enlace para restablecer contraseña', 'success');
      return;
    }
    
    await sendWelcomeWithCredentials(currentProfileMember, tempPassword);
    showToast('✅ Credenciales reenviadas por WhatsApp', 'success');
    
  } catch (error) {
    console.error('Error:', error);
    // Fallback: enviar solo el enlace de reset
    await resetUserPassword();
    showToast('📧 Se ha enviado un enlace para crear contraseña', 'success');
  }
}

// Modal para establecer contraseña manualmente
function showResetPasswordModal() {
  const newPassword = prompt('Ingresa la nueva contraseña para ' + currentProfileMember.name + '\n(Mínimo 6 caracteres):');
  
  if (newPassword && newPassword.length >= 6) {
    setManualPassword(newPassword);
  } else if (newPassword) {
    showToast('La contraseña debe tener al menos 6 caracteres', 'error');
  }
}

async function setManualPassword(newPassword) {
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    // Método: enviar reset con contraseña específica
    const { error } = await client.auth.resetPasswordForEmail(currentProfileMember.email, {
      redirectTo: window.location.origin + '/set-password.html?new=' + encodeURIComponent(newPassword)
    });
    
    if (error) throw error;
    
    showToast('📧 Se ha enviado un enlace al email para establecer la nueva contraseña', 'success');
    
    // Enviar WhatsApp con la nueva contraseña
    if (currentProfileMember.phone) {
      const message = `🔐 *NeoFit - Nueva Contraseña*

Hola ${currentProfileMember.name},

Tu contraseña de acceso ha sido actualizada.

━━━━━━━━━━━━━━━━━━━━━━━
📧 Usuario: ${currentProfileMember.email}
🔑 Nueva contraseña: ${newPassword}
━━━━━━━━━━━━━━━━━━━━━━━

🔗 Accede aquí: ${window.location.origin}/login.html

_NeoFit Gym_`;
      
      let cleanPhone = currentProfileMember.phone.replace(/\D/g, '');
      if (cleanPhone.length === 10) cleanPhone = '52' + cleanPhone;
      if (!cleanPhone.startsWith('+')) cleanPhone = '+' + cleanPhone;
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    }
    
  } catch (error) {
    console.error('Error:', error);
    showToast('Error al establecer contraseña: ' + error.message, 'error');
  }
}

// Función para copiar al portapapeles
function copyToClipboard(elementId) {
  const input = document.getElementById(elementId);
  if (input) {
    input.select();
    document.execCommand('copy');
    showToast('📋 Copiado al portapapeles', 'success');
  }
}

// ============ EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Inicializando aplicación...');
  setupPasswordToggle();
  addMobileMenuButton();
  closeMobileMenuOnClick();
  
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail')?.value || '';
      const password = document.getElementById('loginPassword')?.value || '';
      if (!email || !password) { showToast('Ingresa email y contraseña', 'error'); return; }
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<div class="loading-spinner"></div> Iniciando...';
      submitBtn.disabled = true;
      await login(email, password);
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    });
  }
  
  // Member form - VERSIÓN CORREGIDA (usa selector externo)
  const memberForm = document.getElementById('memberForm');
  const memberSubmitBtn = document.querySelector('button[form="memberForm"]');
  
  if (memberForm && memberSubmitBtn) {
    memberForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const name = document.getElementById('name')?.value;
      const email = document.getElementById('email')?.value;
      const phone = document.getElementById('phone')?.value;
      
      if (!name || !email || !phone) {
        showToast('Por favor completa todos los campos requeridos', 'error');
        return;
      }
      
      const originalText = memberSubmitBtn.innerHTML;
      memberSubmitBtn.innerHTML = '<div class="loading-spinner"></div> Guardando...';
      memberSubmitBtn.disabled = true;
      
      try {
        await saveMember(e);
      } catch (error) {
        console.error('Error en submit:', error);
        showToast('Error al guardar', 'error');
      } finally {
        memberSubmitBtn.innerHTML = originalText;
        memberSubmitBtn.disabled = false;
      }
    });
  }

  const paymentForm = document.getElementById('paymentForm');
  if (paymentForm) {
    paymentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const memberId = document.getElementById('paymentMemberId')?.value;
      const amount = document.getElementById('paymentAmount')?.value;
      if (!memberId) { showToast('Selecciona un miembro', 'error'); return; }
      if (!amount || amount <= 0) { showToast('Ingresa un monto válido', 'error'); return; }
      const submitBtn = paymentForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<div class="loading-spinner"></div> Registrando...';
      submitBtn.disabled = true;
      await savePayment(e);
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    });
  }
  
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => { clearTimeout(debounceTimer); debounceTimer = setTimeout(() => filterMembers(), 500); });
  }
  
  const planFilter = document.getElementById('planFilter');
  if (planFilter) planFilter.addEventListener('change', () => filterMembers());
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('memberModal') && !document.getElementById('memberModal').classList.contains('hidden')) closeModal();
      if (document.getElementById('paymentModal') && !document.getElementById('paymentModal').classList.contains('hidden')) closePaymentModal();
      if (document.getElementById('qrModal') && !document.getElementById('qrModal').classList.contains('hidden')) closeQRModal();
      if (document.getElementById('memberProfileModal') && !document.getElementById('memberProfileModal').classList.contains('hidden')) closeMemberProfile();
    }
  });
  
  const modals = ['memberModal', 'paymentModal', 'qrModal'];
  modals.forEach(modalId => {
    const modal = document.getElementById(modalId);
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) { if (modalId === 'memberModal') closeModal(); if (modalId === 'paymentModal') closePaymentModal(); if (modalId === 'qrModal') closeQRModal(); } });
  });
  
  const checkAuthWithRetry = () => { if (window.supabaseReady && window.supabaseReady()) checkAuth(); else { console.log('⏳ Esperando Supabase...'); setTimeout(checkAuthWithRetry, 500); } };
  checkAuthWithRetry();
  
  window.addEventListener('online', () => { showToast('📡 Conexión restablecida', 'success'); if (currentUser) { loadDashboardData(); loadMembers(); loadPayments(); loadTodayCheckins(); } });
  window.addEventListener('offline', () => showToast('⚠️ Sin conexión a internet', 'error'));
  console.log('✅ Aplicación inicializada correctamente');
});

document.addEventListener('visibilitychange', () => { if (!document.hidden && currentUser) { loadDashboardData(); loadMembers(); loadPayments(); loadTodayCheckins(); } });