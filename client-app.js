// client-app.js - App para miembros (ACTUALIZADO con soporte para fotos)
let currentClient = null;
let clientProgressChart = null;

// Verificar acceso de cliente
(function checkMemberAccess() {
  const userRole = localStorage.getItem('userRole');
  const clientData = localStorage.getItem('neofit_client');
  
  if (!userRole || userRole !== 'member' || !clientData) {
    window.location.href = 'login.html';
    return;
  }
  
  currentClient = JSON.parse(clientData);
})();

// Funciones auxiliares
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

function getDaysLeft(dateString) {
  if (!dateString) return 0;
  const expiry = new Date(dateString);
  const today = new Date();
  return Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
}

function getPlanIcon(plan) {
  switch(plan) {
    case 'Premium': return '⭐';
    case 'Anual': return '🏆';
    default: return '💪';
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function logoutClient() {
  localStorage.removeItem('neofit_client');
  localStorage.removeItem('userRole');
  window.location.href = 'login.html';
}

function showClientToast(message, type = 'success') {
  const toast = document.getElementById('clientToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function showClientTab(tab) {
  const tabs = ['home', 'progress', 'routine', 'profile'];
  tabs.forEach(t => {
    const el = document.getElementById(`${t}Tab`);
    if (el) el.classList.add('hidden');
    const btn = document.getElementById(`${t}Btn`);
    if (btn) {
      btn.classList.remove('tab-active-style', 'text-white');
      btn.classList.add('text-zinc-300');
      btn.style.background = 'transparent';
      btn.style.boxShadow = 'none';
    }
  });
  
  document.getElementById(`${tab}Tab`).classList.remove('hidden');
  const activeBtn = document.getElementById(`${tab}Btn`);
  if (activeBtn) {
    activeBtn.classList.add('tab-active-style');
    activeBtn.classList.remove('text-zinc-300');
  }
  
  if (tab === 'progress') loadClientProgress();
  if (tab === 'routine') loadClientRoutine();
  if (tab === 'profile') loadProfileDetails();
}

async function loadClientData() {
  if (!currentClient) return;
  
  document.getElementById('clientName').textContent = currentClient.name || 'Miembro';
  document.getElementById('clientPlan').innerHTML = `${getPlanIcon(currentClient.plan)} ${currentClient.plan || 'Básico'}`;
  document.getElementById('clientExpiry').textContent = formatDate(currentClient.membership_end);
  
  const daysLeft = getDaysLeft(currentClient.membership_end);
  const totalDays = currentClient.plan === 'Anual' ? 365 : 30;
  const percentage = Math.max(0, Math.min(100, (daysLeft / totalDays) * 100));
  document.getElementById('clientProgressBar').style.width = `${percentage}%`;
  document.getElementById('clientDaysLeft').innerHTML = daysLeft > 0 ? `${daysLeft} días restantes` : '❌ Membresía vencida';
  
  // Generar QR
  const qrContainer = document.getElementById('clientQR');
  if (qrContainer && !qrContainer.querySelector('canvas')) {
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, { text: `NEOFIT_${currentClient.id}`, width: 240, height: 240 });
  }
  
  // ========== CARGAR FOTO DE PERFIL DESDE SUPABASE STORAGE ==========
  await loadClientPhoto();
  
  // Perfil
  document.getElementById('clientProfileEmail').textContent = currentClient.email || '-';
  document.getElementById('clientProfilePhone').textContent = currentClient.phone || '-';
  document.getElementById('clientEmergencyContact').textContent = currentClient.emergency_contact || 'No registrado';
  document.getElementById('clientGoals').textContent = currentClient.goals || 'Sin objetivos registrados';
  document.getElementById('clientSince').textContent = formatDate(currentClient.created_at);
  
  await loadClientCheckins();
  await loadClientProgress();
  await loadClientRoutine();
}

// ========== NUEVA FUNCIÓN PARA CARGAR FOTO DEL CLIENTE ==========
async function loadClientPhoto() {
  const avatarEl = document.getElementById('clientAvatar');
  if (!avatarEl) return;
  
  // Si ya tiene photo_url guardada en el objeto
  if (currentClient.photo_url && currentClient.photo_url.startsWith('http')) {
    avatarEl.innerHTML = `<img src="${currentClient.photo_url}" class="w-full h-full rounded-2xl object-cover" alt="Foto de perfil">`;
    avatarEl.classList.remove('flex', 'items-center', 'justify-center');
    return;
  }
  
  // Intentar obtener la foto desde Supabase Storage
  const client = window.supabaseClient();
  if (!client) {
    showInitialsAvatar(avatarEl);
    return;
  }
  
  try {
    // Buscar foto en el bucket 'member-photos'
    const { data: files, error: listError } = await client.storage
      .from('member-photos')
      .list(`members/`, {
        search: `${currentClient.id}`
      });
    
    if (listError || !files || files.length === 0) {
      console.log('No se encontró foto para el miembro:', currentClient.id);
      showInitialsAvatar(avatarEl);
      return;
    }
    
    // Buscar archivo que empiece con el ID del miembro
    const photoFile = files.find(f => f.name.startsWith(currentClient.id.toString()));
    if (photoFile) {
      const { data: urlData } = client.storage
        .from('member-photos')
        .getPublicUrl(`members/${photoFile.name}`);
      
      const photoUrl = urlData.publicUrl;
      
      // Guardar URL en currentClient para futuras veces
      currentClient.photo_url = photoUrl;
      localStorage.setItem('neofit_client', JSON.stringify(currentClient));
      
      avatarEl.innerHTML = `<img src="${photoUrl}" class="w-full h-full rounded-2xl object-cover" alt="Foto de perfil">`;
      avatarEl.classList.remove('flex', 'items-center', 'justify-center');
    } else {
      showInitialsAvatar(avatarEl);
    }
  } catch (error) {
    console.error('Error al cargar la foto del cliente:', error);
    showInitialsAvatar(avatarEl);
  }
}

function showInitialsAvatar(avatarEl) {
  const initial = (currentClient.name?.charAt(0) || '?').toUpperCase();
  avatarEl.textContent = initial;
  avatarEl.classList.add('flex', 'items-center', 'justify-center');
  avatarEl.classList.remove('img');
  avatarEl.style.background = 'linear-gradient(135deg, #0ea5e9, #3b82f6)';
}

// Cargar datos del perfil
async function loadProfileDetails() {
  if (!currentClient) return;
  document.getElementById('clientProfileEmail').textContent = currentClient.email || '-';
  document.getElementById('clientProfilePhone').textContent = currentClient.phone || '-';
  document.getElementById('clientEmergencyContact').textContent = currentClient.emergency_contact || 'No registrado';
  document.getElementById('clientGoals').textContent = currentClient.goals || 'Sin objetivos registrados';
  document.getElementById('clientSince').textContent = formatDate(currentClient.created_at);
  
  // También actualizar datos físicos si existen
  if (currentClient.height) {
    document.getElementById('clientHeight').textContent = `${currentClient.height} cm`;
  }
  if (currentClient.birth_date) {
    document.getElementById('clientBirthDate').textContent = formatDate(currentClient.birth_date);
  }
}

async function loadClientCheckins() {
  const client = window.supabaseClient();
  if (!client) return;
  
  const { data } = await client
    .from('checkins')
    .select('*')
    .eq('member_id', currentClient.id)
    .order('checkin_time', { ascending: false })
    .limit(10);
  
  const container = document.getElementById('clientRecentCheckins');
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="text-center text-zinc-500 py-6 bg-white/5 rounded-2xl">✨ Aún no tienes check-ins registrados</div>';
    return;
  }
  
  container.innerHTML = data.map(c => `
    <div class="flex justify-between items-center p-3 bg-white/5 rounded-2xl backdrop-blur-sm">
      <span class="text-sm font-medium"><i class="far fa-calendar-check mr-2 text-sky-400"></i>${formatDateTime(c.checkin_time)}</span>
      <span class="text-emerald-400 text-xs bg-emerald-500/10 px-3 py-1 rounded-full"><i class="fas fa-check-circle"></i> Registrado</span>
    </div>
  `).join('');
}

async function loadClientProgress() {
  const client = window.supabaseClient();
  if (!client) return;
  
  const { data } = await client
    .from('member_progress')
    .select('*')
    .eq('member_id', currentClient.id)
    .order('date', { ascending: true });
  
  const measurementsContainer = document.getElementById('clientMeasurements');
  if (!data || data.length === 0) {
    if (measurementsContainer) {
      measurementsContainer.innerHTML = '<div class="text-center text-zinc-500 py-6 bg-white/5 rounded-2xl">📊 Sin mediciones registradas aún</div>';
    }
    return;
  }
  
  const lastThree = data.slice(-3).reverse();
  if (measurementsContainer) {
    measurementsContainer.innerHTML = lastThree.map(m => `
      <div class="bg-white/5 rounded-xl p-3 flex flex-wrap justify-between items-center">
        <span class="font-semibold text-sm"><i class="far fa-calendar-alt mr-1"></i>${formatDate(m.date)}</span>
        <div class="flex gap-3 text-xs">
          ${m.weight ? `<span>⚖️ ${m.weight} kg</span>` : ''}
          ${m.body_fat ? `<span>🎯 ${m.body_fat}% grasa</span>` : ''}
          ${m.muscle_mass ? `<span>💪 ${m.muscle_mass} kg músculo</span>` : ''}
        </div>
      </div>
    `).join('');
  }
  
  // Gráfico
  const ctx = document.getElementById('clientProgressChart')?.getContext('2d');
  if (ctx && data.filter(d => d.weight).length > 0) {
    if (clientProgressChart) clientProgressChart.destroy();
    const labels = data.map(p => formatDate(p.date));
    const weights = data.map(p => p.weight);
    clientProgressChart = new Chart(ctx, {
      type: 'line',
      data: { 
        labels: labels, 
        datasets: [{ 
          label: 'Peso (kg)', 
          data: weights, 
          borderColor: '#38bdf8', 
          backgroundColor: 'rgba(56,189,248,0.05)', 
          tension: 0.3, 
          fill: true,
          pointBackgroundColor: '#0ea5e9'
        }] 
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: true, 
        plugins: { 
          legend: { labels: { color: '#cbd5e1' } } 
        },
        scales: { 
          y: { grid: { color: 'rgba(255,255,255,0.05)' } }, 
          x: { ticks: { color: '#94a3b8' } } 
        }
      }
    });
  } else if (ctx) {
    ctx.canvas.style.display = 'none';
  }
}

async function loadClientRoutine() {
  const client = window.supabaseClient();
  if (!client) return;
  
  const { data } = await client
    .from('routines')
    .select('*')
    .eq('member_id', currentClient.id)
    .order('created_at', { ascending: false })
    .limit(1);
  
  const container = document.getElementById('clientRoutine');
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="glass-card p-7 text-center rounded-3xl">🧘‍♂️ Tu entrenador te asignará una rutina pronto</div>';
    return;
  }
  
  const routine = data[0];
  container.innerHTML = `
    <div class="bg-gradient-to-br from-sky-900/40 to-indigo-900/30 rounded-3xl p-6 border border-sky-500/30">
      <div class="flex justify-between items-start">
        <div>
          <h4 class="text-2xl font-black">${escapeHtml(routine.name)}</h4>
          <div class="flex gap-2 mt-3">
            <span class="px-3 py-1 bg-black/40 rounded-full text-xs">${routine.difficulty || 'Intermedio'}</span>
            <span class="px-3 py-1 bg-black/40 rounded-full text-xs">${routine.days_per_week || 3} días/semana</span>
          </div>
        </div>
        <i class="fas fa-dumbbell text-sky-400 text-3xl"></i>
      </div>
      <p class="mt-4 text-zinc-300 text-sm">💡 Sigue las indicaciones de tu coach para maximizar resultados.</p>
    </div>
  `;
}

async function quickClientCheckin() {
  const button = document.querySelector('button[onclick="quickClientCheckin()"]');
  if (!currentClient) {
    showClientToast('Error: No se encontró información del cliente', 'error');
    return;
  }

  // Efecto de carga en el botón
  const originalHTML = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<i class="fas fa-spinner fa-spin text-xl"></i> Registrando...`;

  try {
    const supabase = window.supabaseClient();
    if (!supabase) throw new Error('Supabase no disponible');

    // Verificar membresía activa
    if (new Date(currentClient.membership_end) < new Date()) {
      showClientToast('⚠️ Tu membresía está vencida', 'error');
      return;
    }

    // ✅ Insertar sin enviar checkin_time (usa el DEFAULT de la tabla)
    const { error } = await supabase
      .from('checkins')
      .insert([{
        member_id: currentClient.id
        // checkin_time se llena automáticamente con hora de México
      }]);

    if (error) throw error;

    // Actualizar último check-in del miembro
    const now = new Date();
    const localTime = now.toISOString().slice(0, 19).replace('T', ' ');

    await supabase
      .from('members')
      .update({ last_checkin: localTime })
      .eq('id', currentClient.id);

    showClientToast('✅ ¡Asistencia registrada correctamente! 💪', 'success');

    // Actualizar la lista de check-ins inmediatamente
    await loadClientCheckins();

  } catch (error) {
    console.error('Error al registrar check-in:', error);
    showClientToast('❌ Error al registrar asistencia. Inténtalo de nuevo.', 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = originalHTML;
  }
}

function downloadClientQR() {
  const qrCanvas = document.querySelector('#clientQR canvas');
  if (qrCanvas) {
    const link = document.createElement('a');
    link.download = `NeoFit_QR_${currentClient.name.replace(/\s/g, '_')}.png`;
    link.href = qrCanvas.toDataURL();
    link.click();
  } else {
    showClientToast('Espera a que cargue el código QR', 'warning');
  }
}

function refreshClientData() {
  loadClientData();
  showClientToast('🔄 Datos actualizados');
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  if (currentClient) {
    loadClientData();
  }
});