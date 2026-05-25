// ============ CRUD DE MIEMBROS ============

// ✅ Declarar variables globales si no existen
if (typeof window.allMembers === 'undefined') {
  window.allMembers = [];
}
if (typeof window.currentView === 'undefined') {
  window.currentView = 'table';
}

// ✅ Sincronizar con variables locales para compatibilidad
let allMembers = window.allMembers;
let currentView = window.currentView;

// ✅ Función para sincronizar cambios
function syncGlobalVariables() {
  window.allMembers = allMembers;
  window.currentView = currentView;
}

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
    syncGlobalVariables();
    renderMembersTable(allMembers);
    
    if (currentView === 'card') {
      document.getElementById('tableView')?.classList.add('hidden');
      document.getElementById('cardView')?.classList.remove('hidden');
    } else {
      document.getElementById('tableView')?.classList.remove('hidden');
      document.getElementById('cardView')?.classList.add('hidden');
    }
    
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
              <i class="fas fa-check-circle"></i>
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
              <i class="fas fa-check-circle text-lg"></i><span class="text-xs">Check-in</span>
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
  const searchInput = document.getElementById('searchInput');
  const planFilter = document.getElementById('planFilter');
  const statusFilter = document.getElementById('statusFilter');
  if (searchInput) searchInput.value = '';
  if (planFilter) planFilter.value = '';
  if (statusFilter) statusFilter.value = '';
  loadMembers();
}

function toggleView() {
  currentView = currentView === 'table' ? 'card' : 'table';
  window.currentView = currentView;
  updateViewDisplay();
  localStorage.setItem('membersView', currentView);
  if (allMembers.length > 0) {
    renderMembersTable(allMembers);
  }
}

function updateViewDisplay() {
  const tableView = document.getElementById('tableView');
  const cardView = document.getElementById('cardView');
  const tableViewBtn = document.getElementById('tableViewBtn');
  const cardViewBtn = document.getElementById('cardViewBtn');
  
  if (!tableView || !cardView) return;
  
  if (currentView === 'table') {
    tableView.classList.remove('hidden');
    cardView.classList.add('hidden');
    if (tableViewBtn) {
      tableViewBtn.classList.remove('text-zinc-400', 'bg-transparent');
      tableViewBtn.classList.add('bg-sky-600', 'text-white', 'shadow-md');
    }
    if (cardViewBtn) {
      cardViewBtn.classList.remove('bg-sky-600', 'text-white', 'shadow-md');
      cardViewBtn.classList.add('text-zinc-400', 'bg-transparent');
    }
  } else {
    tableView.classList.add('hidden');
    cardView.classList.remove('hidden');
    if (cardViewBtn) {
      cardViewBtn.classList.remove('text-zinc-400', 'bg-transparent');
      cardViewBtn.classList.add('bg-sky-600', 'text-white', 'shadow-md');
    }
    if (tableViewBtn) {
      tableViewBtn.classList.remove('bg-sky-600', 'text-white', 'shadow-md');
      tableViewBtn.classList.add('text-zinc-400', 'bg-transparent');
    }
  }
}

async function saveMember(event) {
  event.preventDefault();
  
  const memberId = document.getElementById('memberId')?.value;
  const name = document.getElementById('name')?.value;
  const email = document.getElementById('email')?.value;
  const phone = document.getElementById('phone')?.value;
  const plan = document.getElementById('plan')?.value;
  const birthDate = document.getElementById('birthDate')?.value;
  const height = document.getElementById('height')?.value;
  const emergencyContact = document.getElementById('emergencyContact')?.value;
  const emergencyPhone = document.getElementById('emergencyPhone')?.value;
  const healthNotes = document.getElementById('healthNotes')?.value;
  const goals = document.getElementById('goals')?.value;
  
  if (!name || !email || !phone) {
    showToast('Por favor completa todos los campos requeridos', 'error');
    return;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showToast('Por favor ingresa un email válido', 'error');
    return;
  }
  
  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    showToast('Por favor ingresa un número de teléfono válido (mínimo 10 dígitos)', 'error');
    return;
  }
  
  try {
    const client = window.supabaseClient();
    if (!client) throw new Error('Supabase no disponible');
    
    let result;
    
    if (memberId) {
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
      const { data: existingMember } = await client
        .from('members')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      
      if (existingMember) {
        showToast('Ya existe un miembro con este email', 'error');
        return;
      }
      
      const tempPassword = generateTemporaryPassword();
      
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
          console.log('✅ Perfil creado en profiles');
        }
      }
      
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
      
      if (result.data && result.data[0]) {
        const newMember = result.data[0];
        await sendWelcomeWithCredentials(newMember, tempPassword);
      }
      
      showToast(`✅ Miembro creado. Credenciales enviadas por WhatsApp`, 'success');
    }
    
    const memberModal = document.getElementById('memberModal');
    if (memberModal) {
      memberModal.classList.add('hidden');
    }
    
    await loadMembers();
    if (typeof loadDashboardData === 'function') {
      await loadDashboardData();
    }
    
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

async function editMember(id) {
  const member = allMembers.find(m => m.id === id);
  if (!member) return;
  
  const modalTitle = document.getElementById('modalTitle');
  const memberIdField = document.getElementById('memberId');
  const nameField = document.getElementById('name');
  const emailField = document.getElementById('email');
  const phoneField = document.getElementById('phone');
  const planField = document.getElementById('plan');
  const birthDateField = document.getElementById('birthDate');
  const heightField = document.getElementById('height');
  const emergencyContactField = document.getElementById('emergencyContact');
  const emergencyPhoneField = document.getElementById('emergencyPhone');
  const healthNotesField = document.getElementById('healthNotes');
  const goalsField = document.getElementById('goals');
  
  if (modalTitle) modalTitle.textContent = 'Editar Miembro';
  if (memberIdField) memberIdField.value = member.id;
  if (nameField) nameField.value = member.name || '';
  if (emailField) emailField.value = member.email || '';
  if (phoneField) phoneField.value = member.phone || '';
  if (planField) planField.value = member.plan || 'Básico';
  if (birthDateField) birthDateField.value = member.birth_date || '';
  if (heightField) heightField.value = member.height || '';
  if (emergencyContactField) emergencyContactField.value = member.emergency_contact || '';
  if (emergencyPhoneField) emergencyPhoneField.value = member.emergency_phone || '';
  if (healthNotesField) healthNotesField.value = member.health_notes || '';
  if (goalsField) goalsField.value = member.goals || '';
  
  const memberModal = document.getElementById('memberModal');
  if (memberModal) memberModal.classList.remove('hidden');
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
    if (typeof loadDashboardData === 'function') {
      await loadDashboardData();
    }
  } catch (error) {
    console.error('Error deleting member:', error);
    showToast('Error al eliminar el miembro', 'error');
  }
}

function showQR(memberId, memberName) {
  const qrData = `NEOFIT_${memberId}`;
  const qrContainer = document.getElementById('qrCodeContainer');
  if (qrContainer) {
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: qrData,
      width: 200,
      height: 200
    });
  }
  const qrMemberName = document.getElementById('qrMemberName');
  if (qrMemberName) qrMemberName.textContent = memberName;
  const qrModal = document.getElementById('qrModal');
  if (qrModal) qrModal.classList.remove('hidden');
}

function loadSavedView() {
  const savedView = localStorage.getItem('membersView');
  if (savedView === 'card') {
    currentView = 'card';
    window.currentView = 'card';
  } else {
    currentView = 'table';
    window.currentView = 'table';
  }
  updateViewDisplay();
  if (allMembers.length > 0) {
    renderMembersTable(allMembers);
  }
}

function closeQRModal() {
  const qrModal = document.getElementById('qrModal');
  if (qrModal) qrModal.classList.add('hidden');
}

function showAddMemberModal() {
  const modalTitle = document.getElementById('modalTitle');
  const memberForm = document.getElementById('memberForm');
  const memberIdField = document.getElementById('memberId');
  const memberModal = document.getElementById('memberModal');
  
  if (modalTitle) modalTitle.textContent = 'Nuevo Miembro';
  if (memberForm) memberForm.reset();
  if (memberIdField) memberIdField.value = '';
  if (memberModal) memberModal.classList.remove('hidden');
}

function closeModal() { 
  const memberModal = document.getElementById('memberModal');
  if (memberModal) memberModal.classList.add('hidden');
}

// ✅ Inicializar vista guardada al cargar
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    loadSavedView();
  });
}

// ✅ Exponer funciones globalmente para los onclick del HTML
window.loadMembers = loadMembers;
window.filterMembers = filterMembers;
window.resetFilters = resetFilters;
window.toggleView = toggleView;
window.updateViewDisplay = updateViewDisplay;
window.saveMember = saveMember;
window.editMember = editMember;
window.deleteMember = deleteMember;
window.showQR = showQR;
window.closeQRModal = closeQRModal;
window.showAddMemberModal = showAddMemberModal;
window.closeModal = closeModal;
window.sendWelcomeWithCredentials = sendWelcomeWithCredentials;
window.renderMembersTable = renderMembersTable;
window.loadSavedView = loadSavedView;