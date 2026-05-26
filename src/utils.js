// ============ UTILITIES COMPARTIDAS ============

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-MX', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  });
}

function formatDateTime(dateTimeString) {
  if (!dateTimeString) return '-';
  const date = new Date(dateTimeString);
  return date.toLocaleDateString('es-MX', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  }) + ' ' + date.toLocaleTimeString('es-MX', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
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
  if (isNaN(expiry.getTime())) return 0;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

function getPlanClass(plan) {
  switch(plan) {
    case 'Premium': return 'bg-purple-900/50 text-purple-300';
    case 'Anual': return 'bg-blue-900/50 text-blue-300';
    default: return 'bg-emerald-900/50 text-emerald-300';
  }
}

function getPlanIcon(plan) {
  switch(plan) {
    case 'Premium': return '⭐';
    case 'Anual': return '🏆';
    default: return '💪';
  }
}

function generateTemporaryPassword(length = 10) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

function showToast(message, type = 'success') {
  // Remover toast anterior
  document.querySelectorAll('.toast-notification').forEach(t => t.remove());
  
  const toast = document.createElement('div');
  toast.className = `toast-notification fixed bottom-4 right-4 z-[100] px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 text-white font-medium animate-fade-in ${
    type === 'success' ? 'bg-emerald-600' : 
    type === 'error' ? 'bg-red-600' : 
    type === 'warning' ? 'bg-amber-600' : 'bg-sky-600'
  }`;
  
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-xmark-circle',
    warning: 'fa-triangle-exclamation',
    info: 'fa-info-circle'
  };
  
  toast.innerHTML = `
    <i class="fas ${icons[type] || icons.info}"></i>
    <span>${message}</span>
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.transition = 'all 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('📋 Copiado al portapapeles', 'success');
  }).catch(() => {
    showToast('Error al copiar', 'error');
  });
}

// Exponer funciones globales
window.escapeHtml = escapeHtml;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.isExpiringSoon = isExpiringSoon;
window.getDaysLeft = getDaysLeft;
window.getPlanClass = getPlanClass;
window.getPlanIcon = getPlanIcon;
window.generateTemporaryPassword = generateTemporaryPassword;
window.showToast = showToast;
window.copyToClipboard = copyToClipboard;