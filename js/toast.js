// ===== toast.js =====
// 우측 상단 토스트 알림

const Toast = (() => {
  const container = document.createElement('div');
  container.className = 'toast-container';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(container));

  const show = (title, msg, type = 'info', duration = 3500) => {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = title
      ? `<span class="toast__title">${title}</span>${msg}`
      : msg;
    container.appendChild(el);

    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('toast--visible')));

    setTimeout(() => {
      el.classList.remove('toast--visible');
      setTimeout(() => el.remove(), 250);
    }, duration);
  };

  return {
    success: (msg, title = '') => show(title, msg, 'success'),
    error:   (msg, title = '') => show(title, msg, 'error'),
    warning: (msg, title = '') => show(title, msg, 'warning'),
    info:    (msg, title = '') => show(title, msg, 'info'),
  };
})();
