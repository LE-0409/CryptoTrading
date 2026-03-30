// ===== order.js =====
// 주문 패널 기능 구현

document.addEventListener('DOMContentLoaded', () => {

  // ===== localStorage 키 =====
  const LS_STATE   = 'ct_state';
  const LS_HISTORY = 'ct_history';

  // ===== 상태 (localStorage에서 복원) =====
  const saved = JSON.parse(localStorage.getItem(LS_STATE) || 'null');
  const state = {
    spotUsdt:    saved?.spotUsdt    ?? 100.00,
    spotBtc:     saved?.spotBtc     ?? 0.000000,
    futuresUsdt: saved?.futuresUsdt ?? 0.00,
    mode:        'spot',
    orderType:   'limit',
    leverage:    10,
    marginMode:  '격리',
  };

  // ===== 체결 내역 =====
  let tradeHistory = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');

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
  const tpslCheckbox   = document.getElementById('tpslCheckbox');
  const tpslSection    = document.getElementById('tpslSection');
  const avblTransferBtn = document.querySelector('.trade-unified__avbl-btn');
  const typeTabs       = document.querySelectorAll('.trade-unified__type-tab');


  // ===== 현재가 가져오기 =====
  const getCurrentPrice = () => {
    const el = document.getElementById('midPrice') || document.getElementById('tickerPrice');
    if (!el) return 65432.10;
    return parseFloat(el.textContent.replace(/,/g, '')) || 65432.10;
  };

  // ===== localStorage 저장 =====
  const saveState = () => {
    localStorage.setItem(LS_STATE, JSON.stringify({
      spotUsdt:    state.spotUsdt,
      spotBtc:     state.spotBtc,
      futuresUsdt: state.futuresUsdt,
    }));
  };

  // ===== 체결 내역 기록 =====
  const addTradeRecord = (side, price, btcQty, usdtTotal, fee) => {
    const symbol = (typeof BinanceWS !== 'undefined' ? BinanceWS.getSymbol() : null) || 'BTCUSDT';
    tradeHistory.unshift({
      time:      new Date().toISOString(),
      symbol,
      mode:      state.mode,
      side,
      orderType: state.orderType,
      price,
      qty:       btcQty,
      total:     usdtTotal,
      fee,
    });
    if (tradeHistory.length > 200) tradeHistory.length = 200;
    localStorage.setItem(LS_HISTORY, JSON.stringify(tradeHistory));
    renderTradeHistory();
  };

  // ===== 체결 내역 렌더링 =====
  const renderTradeHistory = () => {
    const tbody = document.querySelector('#paneHistory tbody');
    if (!tbody) return;

    if (!tradeHistory.length) {
      tbody.innerHTML = '<tr class="bp-table__empty"><td colspan="9">체결 내역 없음</td></tr>';
      return;
    }

    tbody.innerHTML = tradeHistory.slice(0, 50).map(r => {
      const t       = new Date(r.time);
      const timeStr = t.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
                    + ' ' + t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const base    = r.symbol.replace('USDT', '');
      const modeKr  = r.mode === 'spot' ? '현물' : '선물';
      const sideKr  = r.side === 'buy'  ? '매수'  : '매도';
      const typeKr  = r.orderType === 'market' ? '시장가' : '지정가';
      const color   = r.side === 'buy' ? 'var(--color-buy)' : 'var(--color-sell)';
      return `<tr>
        <td>${timeStr}</td>
        <td>${base}/USDT</td>
        <td>${modeKr}</td>
        <td style="color:${color}">${sideKr}</td>
        <td>${typeKr}</td>
        <td>${r.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</td>
        <td>${r.qty.toFixed(6)}</td>
        <td>${r.total.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</td>
        <td>${r.fee.toFixed(4)}</td>
      </tr>`;
    }).join('');
  };

  // ===== 자산 탭 렌더링 =====
  const renderAssets = () => {
    const cards = document.querySelectorAll('.bp-asset-card .bp-asset-card__value');
    if (cards.length < 3) return;
    cards[0].textContent = state.spotUsdt.toFixed(2);
    cards[1].textContent = state.futuresUsdt.toFixed(2);
    cards[2].textContent = (state.spotUsdt + state.futuresUsdt).toFixed(2) + ' USDT';
  };

  // ===== 잔고 표시 업데이트 =====
  const updateAvailable = () => {
    const usdt = state.mode === 'spot' ? state.spotUsdt : state.futuresUsdt;
    if (availableEl) availableEl.textContent = usdt.toFixed(2) + ' USDT';
    const spotBalEl = document.getElementById('spotBalance');
    const futBalEl  = document.getElementById('futuresBalance');
    if (spotBalEl) spotBalEl.textContent = state.spotUsdt.toFixed(2);
    if (futBalEl)  futBalEl.textContent  = state.futuresUsdt.toFixed(2);
    renderAssets();
    updateInfoRows();
  };

  const FEE_RATE  = 0.001; // 0.1%
  const liqBuyEl  = document.getElementById('liqBuy');
  const liqSellEl = document.getElementById('liqSell');
  const buyEstEl  = document.getElementById('buyEstimate');
  const sellEstEl = document.getElementById('sellEstimate');

  // 청산가 계산 및 업데이트
  // 롱 청산가 ≈ 진입가 × (1 - 1/레버리지)
  // 숏 청산가 ≈ 진입가 × (1 + 1/레버리지)
  const updateInfoRows = () => {
    if (!liqBuyEl || !liqSellEl) return;

    if (state.mode !== 'futures') {
      liqBuyEl.textContent  = '—';
      liqSellEl.textContent = '—';
      updateEstimate();
      return;
    }

    const price = getEffectivePrice() || getCurrentPrice();
    if (!price) {
      liqBuyEl.textContent  = '—';
      liqSellEl.textContent = '—';
      return;
    }

    const liqLong  = price * (1 - 1 / state.leverage);
    const liqShort = price * (1 + 1 / state.leverage);
    liqBuyEl.textContent  = liqLong  > 0 ? liqLong.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + ' USDT' : '—';
    liqSellEl.textContent = liqShort > 0 ? liqShort.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + ' USDT' : '—';

    // 예상 수령액 업데이트
    updateEstimate();
  };

  const updateEstimate = () => {
    if (!buyEstEl || !sellEstEl) return;
    const price  = getEffectivePrice() || getCurrentPrice();
    const amount = resolveAmountUsdt();

    if (!amount || !price) {
      buyEstEl.textContent  = '≈ — USDT';
      sellEstEl.textContent = '≈ — USDT';
      return;
    }

    // 매수/매도 모두 수수료 차감 후 USDT 기준 표시
    const received = amount * (1 - FEE_RATE);
    const formatted = received.toLocaleString('ko-KR', { minimumFractionDigits: 5, maximumFractionDigits: 5 });

    buyEstEl.textContent  = '≈ ' + formatted + ' USDT';
    sellEstEl.textContent = '≈ ' + formatted + ' USDT';
  };

  // ===== 유효 가격 (시장가이면 현재가) =====
  const getEffectivePrice = () => {
    if (state.orderType === 'market') return getCurrentPrice();
    return parseFloat(priceInput?.value) || 0;
  };

  // ===== 슬라이더: % → 수량 입력란에 퍼센트 표시 =====
  const applySliderPct = (pct) => {
    if (amountInput) amountInput.value = pct > 0 ? pct + '%' : '';
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

  // 가격/수량 변경 시 정보 행 갱신
  if (priceInput)  priceInput.addEventListener('input',  () => { updateInfoRows(); updateEstimate(); });
  if (amountInput) amountInput.addEventListener('input', () => { updateInfoRows(); updateEstimate(); });

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

  // ===== TP/SL 단위 토글 =====
  const tpPriceInput = document.getElementById('tpPrice');
  const slPriceInput = document.getElementById('slPrice');
  const tpUnitBtn    = document.getElementById('tpUnitBtn');
  const slUnitBtn    = document.getElementById('slUnitBtn');

  // 단위 상태: 'USDT' | 'ROI'
  const tpslUnit = { tp: 'USDT', sl: 'USDT' };

  const getBase = () => getEffectivePrice() || getCurrentPrice();

  // USDT ↔ ROI 값 변환
  const usdtToRoi = (usdt, isTp) => {
    const base = getBase();
    if (!base) return '';
    const pct = isTp
      ? ((usdt - base) / base) * 100
      : ((base - usdt) / base) * 100;
    return pct.toFixed(2);
  };

  const roiToUsdt = (roi, isTp) => {
    const base = getBase();
    if (!base) return '';
    const price = isTp
      ? base * (1 + roi / 100)
      : base * (1 - roi / 100);
    return price.toFixed(2);
  };

  const switchUnit = (type) => {
    const isTp     = type === 'tp';
    const unitRef  = tpslUnit;
    const input    = isTp ? tpPriceInput : slPriceInput;
    const btn      = isTp ? tpUnitBtn    : slUnitBtn;
    const current  = isTp ? unitRef.tp   : unitRef.sl;
    const newUnit  = current === 'USDT' ? 'ROI' : 'USDT';

    // 현재 값을 새 단위로 변환
    const val = parseFloat(input?.value);
    if (val && !isNaN(val)) {
      input.value = current === 'USDT'
        ? usdtToRoi(val, isTp)   // USDT → ROI
        : roiToUsdt(val, isTp);  // ROI → USDT
    }

    if (isTp) unitRef.tp = newUnit; else unitRef.sl = newUnit;
    btn.textContent = newUnit;
    input.placeholder = newUnit === 'ROI' ? '0.00' : '0.00';

    if (newUnit === 'ROI') {
      btn.classList.add('tpsl-block__unit-btn--roi');
    } else {
      btn.classList.remove('tpsl-block__unit-btn--roi');
    }

    updatePreview(type);
  };

  if (tpUnitBtn) tpUnitBtn.addEventListener('click', () => switchUnit('tp'));
  if (slUnitBtn) slUnitBtn.addEventListener('click', () => switchUnit('sl'));

  const tpPreview = document.getElementById('tpPreview');
  const slPreview = document.getElementById('slPreview');

  // 입력값 변경 시 반대 단위 미리보기 갱신
  const updatePreview = (type) => {
    const isTp    = type === 'tp';
    const input   = isTp ? tpPriceInput : slPriceInput;
    const preview = isTp ? tpPreview    : slPreview;
    const unit    = isTp ? tpslUnit.tp  : tpslUnit.sl;
    if (!preview) return;

    const val = parseFloat(input?.value);
    if (!val || isNaN(val)) {
      preview.textContent = '—';
      return;
    }

    if (unit === 'USDT') {
      // 입력이 USDT → ROI% 표시
      const roi = parseFloat(usdtToRoi(val, isTp));
      preview.textContent = isNaN(roi) ? '—' : (isTp ? '+' : '-') + Math.abs(roi).toFixed(2) + '%';
    } else {
      // 입력이 ROI% → USDT 표시
      const usdt = parseFloat(roiToUsdt(val, isTp));
      preview.textContent = isNaN(usdt) ? '—' : usdt.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + ' USDT';
    }
  };

  if (tpPriceInput) tpPriceInput.addEventListener('input', () => updatePreview('tp'));
  if (slPriceInput) slPriceInput.addEventListener('input', () => updatePreview('sl'));

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

  // ===== 버튼 피드백 (텍스트 잠시 변경) =====
  const flashBtn = (btn, msg, colorClass) => {
    const span      = btn.querySelector('span:first-child');
    const original  = span ? span.textContent : '';
    const origClass = btn.className;
    if (span) span.textContent = msg;
    btn.classList.remove('trade-unified__btn--buy', 'trade-unified__btn--sell');
    btn.classList.add(colorClass);
    btn.disabled = true;
    setTimeout(() => {
      if (span) span.textContent = original;
      btn.className = origClass;
      btn.disabled  = false;
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

  // 입력값을 USDT 금액으로 변환 (퍼센트면 잔고 비율 계산)
  const resolveAmountUsdt = () => {
    const raw = amountInput?.value?.trim();
    if (!raw) return 0;
    if (raw.endsWith('%')) {
      const pct  = parseFloat(raw);
      const usdt = state.mode === 'spot' ? state.spotUsdt : state.futuresUsdt;
      return isNaN(pct) ? 0 : usdt * pct / 100;
    }
    return parseFloat(raw) || 0;
  };

  // ===== 매수 버튼 =====
  // amount = USDT 금액, btcAmt = 실제 수령 BTC 수량
  if (buyBtn) {
    buyBtn.addEventListener('click', () => {
      const price   = getEffectivePrice() || getCurrentPrice();
      const amount  = resolveAmountUsdt(); // USDT
      const btcAmt  = amount / price;

      if (!amount || amount <= 0) {
        flashBtn(buyBtn, '수량(USDT) 입력 필요', 'trade-unified__btn--warn');
        return;
      }

      if (state.mode === 'spot') {
        if (amount > state.spotUsdt + 0.0001) {
          flashBtn(buyBtn, '잔고 부족', 'trade-unified__btn--warn');
          return;
        }
        state.spotUsdt = Math.max(0, state.spotUsdt - amount);
        state.spotBtc += btcAmt;
        addTradeRecord('buy', price, btcAmt, amount, amount * FEE_RATE);
        saveState();
        flashBtn(buyBtn, '✓ 매수 완료', 'trade-unified__btn--buy');
      } else {
        const margin = amount / state.leverage;
        if (margin > state.futuresUsdt + 0.0001) {
          flashBtn(buyBtn, '증거금 부족', 'trade-unified__btn--warn');
          return;
        }
        state.futuresUsdt = Math.max(0, state.futuresUsdt - margin);
        addTradeRecord('buy', price, btcAmt, amount, amount * FEE_RATE);
        saveState();
        flashBtn(buyBtn, '✓ 롱 진입', 'trade-unified__btn--buy');
      }

      resetForm();
    });
  }

  // ===== 매도 버튼 =====
  // amount = USDT 금액 기준, 해당 BTC 수량만큼 매도
  if (sellBtn) {
    sellBtn.addEventListener('click', () => {
      const price   = getEffectivePrice() || getCurrentPrice();
      const amount  = resolveAmountUsdt(); // USDT
      const btcAmt  = amount / price;

      if (!amount || amount <= 0) {
        flashBtn(sellBtn, '수량(USDT) 입력 필요', 'trade-unified__btn--warn');
        return;
      }

      if (state.mode === 'spot') {
        if (btcAmt > state.spotBtc + 0.000001) {
          flashBtn(sellBtn, '보유 BTC 부족', 'trade-unified__btn--warn');
          return;
        }
        state.spotBtc  = Math.max(0, state.spotBtc - btcAmt);
        state.spotUsdt += amount;
        addTradeRecord('sell', price, btcAmt, amount, amount * FEE_RATE);
        saveState();
        flashBtn(sellBtn, '✓ 매도 완료', 'trade-unified__btn--sell');
      } else {
        const margin = amount / state.leverage;
        if (margin > state.futuresUsdt + 0.0001) {
          flashBtn(sellBtn, '증거금 부족', 'trade-unified__btn--warn');
          return;
        }
        state.futuresUsdt = Math.max(0, state.futuresUsdt - margin);
        addTradeRecord('sell', price, btcAmt, amount, amount * FEE_RATE);
        saveState();
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
      updateInfoRows();
      updateEstimate();
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

      saveState();
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

  // ===== 전체 초기화 버튼 =====
  const resetModal  = document.getElementById('resetModal');
  const dangerBtn   = resetModal?.querySelector('.modal__btn--danger');
  if (dangerBtn) {
    dangerBtn.addEventListener('click', () => {
      state.spotUsdt    = 100;
      state.spotBtc     = 0;
      state.futuresUsdt = 0;
      tradeHistory      = [];
      localStorage.removeItem(LS_STATE);
      localStorage.removeItem(LS_HISTORY);
      resetModal.classList.remove('modal-overlay--open');
      updateAvailable();
      renderTradeHistory();
    });
  }

  // ===== 초기화 =====
  updateAvailable();
  updateEstimate();
  renderTradeHistory();
});
