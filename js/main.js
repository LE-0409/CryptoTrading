// ===== main.js =====
// UI 인터랙션 — 탭 전환, 토글, 모달

document.addEventListener('DOMContentLoaded', () => {

  // ===== 현물 / 선물 탭 전환 =====
  const navItems = document.querySelectorAll('.header__nav-item');
  const spotWrapper    = document.querySelector('.trade-wrapper--spot');
  const futuresWrapper = document.querySelector('.trade-wrapper--futures');

  navItems.forEach(item => {
    item.addEventListener('click', e => {
      const mode = item.dataset.mode;
      if (!mode) return;

      e.preventDefault();
      navItems.forEach(n => n.classList.remove('header__nav-item--active'));
      item.classList.add('header__nav-item--active');

      if (mode === 'spot') {
        spotWrapper.style.display    = 'block';
        futuresWrapper.style.display = 'none';
      } else {
        spotWrapper.style.display    = 'none';
        futuresWrapper.style.display = 'block';
      }
    });
  });

  // ===== 하단 패널 탭 전환 =====
  const bpTabs  = document.querySelectorAll('.bottom-panel__tab');
  const bpPanes = document.querySelectorAll('.bottom-panel__pane');

  bpTabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      bpTabs.forEach(t  => t.classList.remove('bottom-panel__tab--active'));
      bpPanes.forEach(p => p.classList.remove('bottom-panel__pane--active'));
      tab.classList.add('bottom-panel__tab--active');
      bpPanes[i].classList.add('bottom-panel__pane--active');
    });
  });

  // ===== TP/SL 토글 =====
  document.querySelectorAll('.tpsl__toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const tpsl = btn.closest('.tpsl');
      tpsl.classList.toggle('tpsl--open');
    });
  });

  // ===== 설정 드롭다운 =====
  const settingsBtn      = document.getElementById('settingsBtn');
  const settingsDropdown = document.getElementById('settingsDropdown');

  if (settingsBtn) {
    settingsBtn.addEventListener('click', e => {
      e.stopPropagation();
      settingsDropdown.classList.toggle('settings-dropdown--open');
    });

    document.addEventListener('click', () => {
      settingsDropdown.classList.remove('settings-dropdown--open');
    });
  }

  // ===== 이체 모달 =====
  const transferModal = document.getElementById('transferModal');
  const transferBtn   = document.getElementById('transferBtn');
  const transferClose = document.getElementById('transferClose');

  if (transferBtn) {
    transferBtn.addEventListener('click', () => {
      settingsDropdown.classList.remove('settings-dropdown--open');
      transferModal.classList.add('modal-overlay--open');
    });
  }

  if (transferClose) {
    transferClose.addEventListener('click', () => {
      transferModal.classList.remove('modal-overlay--open');
    });
  }

  // ===== 초기화 모달 =====
  const resetModal     = document.getElementById('resetModal');
  const resetBtn       = document.getElementById('resetBtn');
  const resetClose     = document.getElementById('resetClose');
  const resetCancelBtn = document.getElementById('resetCancelBtn');

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      settingsDropdown.classList.remove('settings-dropdown--open');
      resetModal.classList.add('modal-overlay--open');
    });
  }

  const closeResetModal = () => resetModal.classList.remove('modal-overlay--open');
  if (resetClose)     resetClose.addEventListener('click', closeResetModal);
  if (resetCancelBtn) resetCancelBtn.addEventListener('click', closeResetModal);

  // 오버레이 클릭 시 모달 닫기
  [transferModal, resetModal].forEach(modal => {
    if (!modal) return;
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.classList.remove('modal-overlay--open');
    });
  });

  // ===== 거래내역 페이지 탭 전환 =====
  const historyTabs  = document.querySelectorAll('.history-tab');
  const historyPanes = document.querySelectorAll('.history-pane');

  historyTabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      historyTabs.forEach(t  => t.classList.remove('history-tab--active'));
      historyPanes.forEach(p => p.classList.remove('history-pane--active'));
      tab.classList.add('history-tab--active');
      historyPanes[i].classList.add('history-pane--active');
    });
  });

});
