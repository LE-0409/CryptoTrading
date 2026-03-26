// ===== order.js =====
// 주문 패널 기능 구현

document.addEventListener('DOMContentLoaded', () => {

  // ===== 상태 =====
  const state = {
    spotUsdt:   100.00,
    spotBtc:    0.000000,
    futuresUsdt: 0.00,
    mode:        'spot',      // 'spot' | 'futures'
    orderType:   'limit',     // 'limit' | 'market' | 'conditional'
    amountUnit:  'BTC',       // 'BTC' | 'USDT'
    leverage:    10,
    marginMode:  '격리',
    tif:         'GTC',
    reduceOnly:  false,
  };

  // ===== DOM =====
  const priceInput     = document.getElementById('uniPrice');
  const amountInput    = document.getElementById('uniAmount');
  const slider         = document.getElementById('uniSlider');
  const marks          = document.querySelectorAll('.trade-unified__slider-mark');
  const availableEl    = document.getElementById('uniAvailable');
  const buyBtn         = document.getElementById('uniBuyBtn');
  const sellBtn        = document.getElementById('uniSellBtn');
  const marginModeBtn  = document.getElementById('marginModeBtn');
  const leverageBtn    = document.getElementById('leverageBtn');
  const tifBtn         = document.getElementById('tifBtn');
  const tpslCheckbox   = document.getElementById('tpslCheckbox');
  const tpslSection    = document.getElementById('tpslSection');
  const reduceOnlyCb   = document.getElementById('reduceOnlyCheckbox');
  const unitSelBtn     = document.querySelector('.trade-unified__unit-sel');
  const avblTransferBtn = document.querySelector('.trade-unified__avbl-btn');
  const typeTabs       = document.querySelectorAll('.trade-unified__type-tab');

  // 정보 행
  const infoBuyCost    = document.querySelector('.trade-unified__info-col:first-child .trade-unified__info-row:nth-child(2) .trade-unified__info-value');
  const infoBuyMax     = document.querySelector('.trade-unified__info-col:first-child .trade-unified__info-row:nth-child(3) .trade-unified__info-value');
  const infoSellCost   = document.querySelector('.trade-unified__info-col--right .trade-unified__info-row:nth-child(2) .trade-unified__info-value');
  const infoSellMax    = document.querySelector('.trade-unified__info-col--right .trade-unified__info-row:nth-child(3) .trade-unified__info-value');

  // ===== 현재가 가져오기 =====
  const getCurrentPrice = () => {
    const el = document.getElementById('midPrice') || document.getElementById('tickerPrice');
    if (!el) return 65432.10;
    return parseFloat(el.textContent.replace(/,/g, '')) || 65432.10;
  };

  // ===== 잔고 표시 업데이트 =====
  const updateAvailable = () => {
    const usdt = state.mode === 'spot' ? state.spotUsdt : state.futuresUsdt;
    if (availableEl) availableEl.textContent = usdt.toFixed(2) + ' USDT';
    const spotBalEl = document.getElementById('spotBalance');
    const futBalEl  = document.getElementById('futuresBalance');
    if (spotBalEl) spotBalEl.textContent = state.spotUsdt.toFixed(2);
    if (futBalEl)  futBalEl.textContent  = state.futuresUsdt.toFixed(2);
    updateInfoRows();
  };

  // ===== 정보 행 업데이트 (비용, 최대) =====
  const updateInfoRows = () => {
    const price  = getEffectivePrice();
    const usdt   = state.mode === 'spot' ? state.spotUsdt : state.futuresUsdt;
    const btc    = state.spotBtc;

    if (price > 0) {
      const maxBuy = state.mode === 'spot'
        ? usdt / price
        : (usdt * state.leverage) / price;
      const maxSell = state.mode === 'spot' ? btc : maxBuy;

      if (infoBuyMax)  infoBuyMax.textContent  = maxBuy.toFixed(4) + ' BTC';
      if (infoSellMax) infoSellMax.textContent = maxSell.toFixed(4) + ' BTC';

      const amount = parseFloat(amountInput?.value) || 0;
      const cost   = state.mode === 'spot'
        ? amount * price
        : (amount * price) / state.leverage;

      if (infoBuyCost)  infoBuyCost.textContent  = cost.toFixed(4) + ' USDT';
      if (infoSellCost) infoSellCost.textContent = cost.toFixed(4) + ' USDT';
    }
  };

  // ===== 유효 가격 (시장가이면 현재가) =====
  const getEffectivePrice = () => {
    if (state.orderType === 'market') return getCurrentPrice();
    return parseFloat(priceInput?.value) || 0;
  };

  // ===== 슬라이더: % → 수량 계산 =====
  const applySliderPct = (pct) => {
    const price = getEffectivePrice() || getCurrentPrice();
    if (!price) return;
    const usdt = state.mode === 'spot' ? state.spotUsdt : state.futuresUsdt;
    const portion = usdt * pct / 100;

    if (state.amountUnit === 'USDT') {
      // USDT 단위: 사용 금액 직접 표시
      if (amountInput) amountInput.value = portion > 0 ? portion.toFixed(2) : '';
    } else {
      // BTC 단위: USDT → BTC 환산
      const btcAmt = state.mode === 'spot'
        ? portion / price
        : portion * state.leverage / price;
      if (amountInput) amountInput.value = btcAmt > 0 ? btcAmt.toFixed(6) : '';
    }
    updateMarks(pct);
    updateInfoRows();
  };

  const updateMarks = (pct) => {
    marks.forEach((mark, i) => {
      const markPct = i * 25;
      const active  = markPct <= pct;
      mark.style.background   = active ? 'var(--color-brand)' : '';
      mark.style.borderColor  = active ? 'var(--color-brand)' : '';
    });
  };

  if (slider) {
    slider.addEventListener('input', () => applySliderPct(parseInt(slider.value)));
  }

  marks.forEach((mark, i) => {
    mark.addEventListener('click', () => {
      const pct = i * 25;
      if (slider) slider.value = pct;
      applySliderPct(pct);
    });
  });

  // ===== 수량 단위 전환 (BTC ↔ USDT) =====
  const updateUnitSel = () => {
    if (!unitSelBtn) return;
    unitSelBtn.textContent = state.amountUnit + ' ▾';
    if (amountInput) {
      amountInput.placeholder = state.amountUnit === 'BTC' ? '0.000000' : '0.00';
      amountInput.value = '';
    }
    if (slider) slider.value = 0;
    updateMarks(0);
  };

  if (unitSelBtn) {
    unitSelBtn.addEventListener('click', () => {
      state.amountUnit = state.amountUnit === 'BTC' ? 'USDT' : 'BTC';
      updateUnitSel();
    });
  }

  // 가격/수량 변경 시 정보 행 갱신
  if (priceInput)  priceInput.addEventListener('input',  updateInfoRows);
  if (amountInput) amountInput.addEventListener('input', updateInfoRows);

  // ===== 주문 유형 탭 =====
  typeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const label = tab.textContent.trim();
      if (label.startsWith('시장가')) {
        state.orderType = 'market';
        if (priceInput) {
          priceInput.disabled     = true;
          priceInput.placeholder  = '시장가';
          priceInput.value        = '';
          priceInput.style.opacity = '0.4';
        }
      } else {
        state.orderType = label.startsWith('지정가') ? 'limit' : 'conditional';
        if (priceInput) {
          priceInput.disabled      = false;
          priceInput.placeholder   = '0.00';
          priceInput.style.opacity = '';
        }
      }
      updateInfoRows();
    });
  });

  // ===== TP/SL 체크박스 =====
  if (tpslCheckbox && tpslSection) {
    tpslCheckbox.addEventListener('change', () => {
      tpslSection.style.display = tpslCheckbox.checked ? 'flex' : 'none';
    });
  }

  // ===== 잔고 이체 버튼 =====
  if (avblTransferBtn) {
    avblTransferBtn.addEventListener('click', () => {
      const modal = document.getElementById('transferModal');
      if (modal) modal.classList.add('modal-overlay--open');
    });
  }

  // ===== 레버리지 버튼 =====
  if (leverageBtn) {
    leverageBtn.addEventListener('click', () => {
      const val = parseInt(prompt('레버리지 설정 (1 ~ 125):', state.leverage));
      if (isNaN(val) || val < 1 || val > 125) return;
      state.leverage = val;
      leverageBtn.textContent = val + 'x';
      updateInfoRows();
    });
  }

  // ===== 마진 모드 버튼 =====
  if (marginModeBtn) {
    marginModeBtn.addEventListener('click', () => {
      state.marginMode = state.marginMode === '격리' ? '교차' : '격리';
      marginModeBtn.textContent = state.marginMode;
    });
  }

  // ===== TIF 버튼 (순환) =====
  const tifOptions = ['GTC', 'IOC', 'FOK'];
  if (tifBtn) {
    tifBtn.addEventListener('click', () => {
      const idx = tifOptions.indexOf(state.tif);
      state.tif = tifOptions[(idx + 1) % tifOptions.length];
      tifBtn.textContent = 'TIF ' + state.tif + ' ▾';
    });
  }

  // ===== Reduce-Only =====
  if (reduceOnlyCb) {
    reduceOnlyCb.addEventListener('change', () => {
      state.reduceOnly = reduceOnlyCb.checked;
    });
  }

  // ===== 버튼 피드백 (텍스트 잠시 변경) =====
  const flashBtn = (btn, msg, colorClass) => {
    const original = btn.textContent;
    const origClass = btn.className;
    btn.textContent = msg;
    btn.classList.remove('trade-unified__btn--buy', 'trade-unified__btn--sell');
    btn.classList.add(colorClass);
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.className   = origClass;
      btn.disabled    = false;
    }, 1200);
  };

  // ===== 주문 공통 초기화 =====
  const resetForm = () => {
    if (priceInput && state.orderType !== 'market') priceInput.value = '';
    if (amountInput) amountInput.value = '';
    if (slider)      slider.value = 0;
    updateMarks(0);
    updateAvailable();
  };

  // 입력값을 항상 BTC 수량으로 변환
  const getAmountInBtc = (price) => {
    const raw = parseFloat(amountInput?.value);
    if (!raw || raw <= 0) return 0;
    if (state.amountUnit === 'USDT') return raw / price;
    return raw;
  };

  // ===== 매수 버튼 =====
  if (buyBtn) {
    buyBtn.addEventListener('click', () => {
      const price  = getEffectivePrice() || getCurrentPrice();
      const amount = getAmountInBtc(price);

      if (!price || !amount || price <= 0 || amount <= 0) {
        flashBtn(buyBtn, '가격/수량 입력 필요', 'trade-unified__btn--warn');
        return;
      }

      if (state.mode === 'spot') {
        const total = price * amount;
        if (total > state.spotUsdt + 0.0001) {
          flashBtn(buyBtn, '잔고 부족', 'trade-unified__btn--warn');
          return;
        }
        state.spotUsdt = Math.max(0, state.spotUsdt - total);
        state.spotBtc += amount;
        flashBtn(buyBtn, '✓ 매수 완료', 'trade-unified__btn--buy');
      } else {
        const margin = (price * amount) / state.leverage;
        if (margin > state.futuresUsdt + 0.0001) {
          flashBtn(buyBtn, '증거금 부족', 'trade-unified__btn--warn');
          return;
        }
        state.futuresUsdt = Math.max(0, state.futuresUsdt - margin);
        flashBtn(buyBtn, '✓ 롱 진입', 'trade-unified__btn--buy');
      }

      resetForm();
    });
  }

  // ===== 매도 버튼 =====
  if (sellBtn) {
    sellBtn.addEventListener('click', () => {
      const price  = getEffectivePrice() || getCurrentPrice();
      const amount = getAmountInBtc(price);

      if (!price || !amount || price <= 0 || amount <= 0) {
        flashBtn(sellBtn, '가격/수량 입력 필요', 'trade-unified__btn--warn');
        return;
      }

      if (state.mode === 'spot') {
        if (amount > state.spotBtc + 0.000001) {
          flashBtn(sellBtn, '보유 BTC 부족', 'trade-unified__btn--warn');
          return;
        }
        state.spotBtc  = Math.max(0, state.spotBtc - amount);
        state.spotUsdt += price * amount;
        flashBtn(sellBtn, '✓ 매도 완료', 'trade-unified__btn--sell');
      } else {
        const margin = (price * amount) / state.leverage;
        if (margin > state.futuresUsdt + 0.0001) {
          flashBtn(sellBtn, '증거금 부족', 'trade-unified__btn--warn');
          return;
        }
        state.futuresUsdt = Math.max(0, state.futuresUsdt - margin);
        flashBtn(sellBtn, '✓ 숏 진입', 'trade-unified__btn--sell');
      }

      resetForm();
    });
  }

  // ===== 현물 / 선물 모드 전환 연동 =====
  document.querySelectorAll('.header__nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const mode = item.dataset.mode;
      if (!mode) return;
      state.mode      = mode;
      state.orderType = 'limit';
      if (priceInput) {
        priceInput.disabled      = false;
        priceInput.placeholder   = '0.00';
        priceInput.style.opacity = '';
        priceInput.value         = '';
      }
      if (amountInput) amountInput.value = '';
      if (slider)      slider.value      = 0;
      updateMarks(0);
      updateAvailable();
    });
  });

  // ===== 이체 모달 =====
  const transferModal    = document.getElementById('transferModal');
  const transferFromEl   = document.getElementById('transferFrom');
  const transferToEl     = document.getElementById('transferTo');
  const transferAvailEl  = document.getElementById('transferAvailable');
  const transferAmountEl = document.getElementById('transferAmount');
  const transferSwapBtn  = document.getElementById('transferSwapBtn');
  const transferMaxBtn   = document.getElementById('transferMaxBtn');
  const transferConfirm  = document.getElementById('transferConfirmBtn');
  const transferCancel   = document.getElementById('transferCancelBtn');
  const transferClose2   = document.getElementById('transferClose');

  // 이체 방향 상태: true = 현물→선물, false = 선물→현물
  let transferToFutures = true;

  const getTransferAvailable = () =>
    transferToFutures ? state.spotUsdt : state.futuresUsdt;

  const updateTransferModal = () => {
    if (!transferFromEl) return;
    transferFromEl.textContent = transferToFutures ? '현물' : '선물';
    transferToEl.textContent   = transferToFutures ? '선물' : '현물';
    const avbl = getTransferAvailable();
    if (transferAvailEl) transferAvailEl.textContent = avbl.toFixed(2) + ' USDT';
    if (transferAmountEl) transferAmountEl.value = '';
  };

  const closeTransferModal = () => {
    if (transferModal) transferModal.classList.remove('modal-overlay--open');
    if (transferAmountEl) transferAmountEl.value = '';
  };

  // 모달 열릴 때 최신 잔고 반영 (주문 패널 ⇄ 버튼 / 설정 드롭다운 버튼 공통)
  const openTransferModal = () => {
    transferToFutures = state.mode === 'spot';
    updateTransferModal();
  };

  if (avblTransferBtn) {
    avblTransferBtn.addEventListener('click', openTransferModal);
  }
  if (transferModal) {
    transferModal.addEventListener('modal-open', openTransferModal);
  }

  // 방향 전환
  if (transferSwapBtn) {
    transferSwapBtn.addEventListener('click', () => {
      transferToFutures = !transferToFutures;
      updateTransferModal();
    });
  }

  // MAX 버튼
  if (transferMaxBtn) {
    transferMaxBtn.addEventListener('click', () => {
      const avbl = getTransferAvailable();
      if (transferAmountEl) transferAmountEl.value = avbl.toFixed(2);
    });
  }

  // 이체 확인
  if (transferConfirm) {
    transferConfirm.addEventListener('click', () => {
      const amount = parseFloat(transferAmountEl?.value);
      const avbl   = getTransferAvailable();

      if (!amount || amount <= 0) {
        transferAmountEl.style.borderColor = 'var(--color-sell)';
        setTimeout(() => { transferAmountEl.style.borderColor = ''; }, 1200);
        return;
      }
      if (amount > avbl + 0.001) {
        transferAmountEl.style.borderColor = 'var(--color-sell)';
        setTimeout(() => { transferAmountEl.style.borderColor = ''; }, 1200);
        return;
      }

      if (transferToFutures) {
        state.spotUsdt    -= amount;
        state.futuresUsdt += amount;
      } else {
        state.futuresUsdt -= amount;
        state.spotUsdt    += amount;
      }

      closeTransferModal();
      updateAvailable();
    });
  }

  // 취소 / 닫기
  if (transferCancel) transferCancel.addEventListener('click', closeTransferModal);
  if (transferClose2) transferClose2.addEventListener('click', closeTransferModal);
  if (transferModal) {
    transferModal.addEventListener('click', e => {
      if (e.target === transferModal) closeTransferModal();
    });
  }

  // ===== 초기화 =====
  updateAvailable();
});
