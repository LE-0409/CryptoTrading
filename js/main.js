// ===== main.js =====
// UI 인터랙션 — 탭 전환, 토글, 모달

document.addEventListener('DOMContentLoaded', () => {

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

  // ===== 주문 유형 탭 전환 =====
  const typeTabs = document.querySelectorAll('.trade-unified__type-tab');
  typeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      typeTabs.forEach(t => t.classList.remove('trade-unified__type-tab--active'));
      tab.classList.add('trade-unified__type-tab--active');
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

  // 오버레이 클릭 시 초기화 모달 닫기 (이체 모달은 order.js에서 처리)
  if (resetModal) {
    resetModal.addEventListener('click', e => {
      if (e.target === resetModal) resetModal.classList.remove('modal-overlay--open');
    });
  }

  // ===== 코인 검색 필터 =====
  const searchInput = document.querySelector('.sidebar__search-input');
  const coinItems   = document.querySelectorAll('.sidebar__coin');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toUpperCase();
      coinItems.forEach(item => {
        const symbol = (item.dataset.symbol || '').toUpperCase();
        item.style.display = (!q || symbol.includes(q)) ? '' : 'none';
      });
    });
  }

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
