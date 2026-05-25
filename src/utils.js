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
  if (!dateString || dateString === 'null' || dateString === 'undefined') return 0;
  const expiry = new Date(dateString);
  if (isNaN(expiry.getTime())) {
    console.warn('Fecha inválida:', dateString);
    return 0;
  }
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

function generateTemporaryPassword() {
  const length = 8;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

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

function copyToClipboard(elementId) {
  const input = document.getElementById(elementId);
  if (input) {
    input.select();
    document.execCommand('copy');
    showToast('📋 Copiado al portapapeles', 'success');
  }
}

// Al final de utils.js
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