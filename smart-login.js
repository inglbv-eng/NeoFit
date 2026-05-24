// smart-login.js - Login inteligente que detecta admin vs cliente (VERSIÓN MEJORADA)

async function smartLogin(identifier, password) {
  try {
    const client = window.supabaseClient();
    if (!client) {
      showLoginError('Conectando con el servidor...');
      return false;
    }
    
    let email = identifier;
    
    // Si NO parece un email (no contiene @), buscar por nombre en members
    if (!identifier.includes('@')) {
      console.log('🔍 Buscando miembro por nombre:', identifier);
      
      const { data: members, error: searchError } = await client
        .from('members')
        .select('email, name')
        .ilike('name', `%${identifier}%`)
        .limit(1);
      
      if (!searchError && members && members.length > 0) {
        email = members[0].email;
        console.log('✅ Miembro encontrado:', members[0].name, '->', email);
      }
    }
    
    // Intentar autenticar
    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (authError) throw authError;
    
    const user = authData.user;
    console.log('✅ Usuario autenticado:', user.email);
    
    // === DETECCIÓN DE ROL ===
    
    // 1. Es ADMIN? (por email fijo)
    if (user.email === 'admin@neofit.com') {
      console.log('👑 Acceso como ADMINISTRADOR');
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('userRole', 'admin');
      window.location.href = 'index.html';
      return true;
    }
    
    // 2. Verificar rol en tabla profiles
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();
    
    if (profileError || !profile) {
      console.log('⚠️ No se encontró perfil, buscando en members...');
      
      // Fallback: buscar en members
      const { data: member, error: memberError } = await client
        .from('members')
        .select('*')
        .eq('email', user.email)
        .single();
      
      if (memberError || !member) {
        showLoginError('No eres un miembro registrado. Contacta al administrador.');
        await client.auth.signOut();
        return false;
      }
      
      console.log('💪 Acceso como MIEMBRO (desde members):', member.name);
      localStorage.setItem('neofit_client', JSON.stringify(member));
      localStorage.setItem('userRole', 'member');
      window.location.href = 'client-dashboard.html';
      return true;
    }
    
    // 3. Es CLIENTE por rol en profiles
    if (profile.role === 'member') {
      console.log('💪 Acceso como MIEMBRO (desde profiles):', profile.full_name);
      
      // Obtener datos completos del member
      const { data: member, error: memberError } = await client
        .from('members')
        .select('*')
        .eq('email', user.email)
        .single();
      
      if (memberError || !member) {
        // Si no existe en members, crear un registro básico
        console.log('⚠️ Miembro no encontrado en members, creando...');
        const tempMember = {
          name: profile.full_name || user.email.split('@')[0],
          email: user.email,
          phone: '',
          plan: 'Básico',
          status: 'active',
          auth_id: user.id,
          created_at: new Date().toISOString(),
          membership_end: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]
        };
        
        const { data: newMember, error: insertError } = await client
          .from('members')
          .insert([tempMember])
          .select();
        
        if (insertError) {
          console.error('Error creando member:', insertError);
          showLoginError('Error al cargar tus datos');
          return false;
        }
        
        localStorage.setItem('neofit_client', JSON.stringify(newMember[0]));
      } else {
        localStorage.setItem('neofit_client', JSON.stringify(member));
      }
      
      localStorage.setItem('userRole', 'member');
      window.location.href = 'client-dashboard.html';
      return true;
    }
    
    // 4. Rol no reconocido
    showLoginError('Rol de usuario no reconocido');
    await client.auth.signOut();
    return false;
    
  } catch (error) {
    console.error('Error en login:', error);
    showLoginError('Credenciales incorrectas');
    return false;
  }
}

function showLoginError(message) {
  const existingToast = document.querySelector('.toast-error');
  if (existingToast) existingToast.remove();
  
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-4 left-4 right-4 md:left-auto md:right-4 bg-red-600 text-white px-6 py-3 rounded-2xl shadow-lg z-50 animate-fade-in';
  toast.innerHTML = `<i class="fas fa-exclamation-circle mr-2"></i>${message}`;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    if (toast && toast.remove) toast.remove();
  }, 4000);
}

// Setup del formulario
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('smartLoginForm');
  const togglePassword = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('loginPassword');
  
  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      const icon = togglePassword.querySelector('i');
      icon.classList.toggle('fa-eye-slash');
      icon.classList.toggle('fa-eye');
    });
  }
  
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = document.getElementById('loginIdentifier').value;
      const password = document.getElementById('loginPassword').value;
      
      if (!identifier || !password) {
        showLoginError('Completa todos los campos');
        return;
      }
      
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<div class="loading-spinner"></div> Validando...';
      submitBtn.disabled = true;
      
      await smartLogin(identifier, password);
      
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    });
  }
  
  // Si ya hay sesión activa, redirigir
  const userRole = localStorage.getItem('userRole');
  if (userRole === 'admin' && localStorage.getItem('user')) {
    window.location.href = 'index.html';
  } else if (userRole === 'member' && localStorage.getItem('neofit_client')) {
    window.location.href = 'client-dashboard.html';
  }
});