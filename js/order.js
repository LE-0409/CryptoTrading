// ===== order.js =====
// 주문 패널 + 잔고 + 체결내역 관리

document.addEventListener('DOMContentLoaded', () => {

  // ===== localStorage 키 =====
  const LS_STATE     = 'ct_state';
  const LS_HISTORY   = 'ct_history';
  const LS_POSITIONS = 'ct_positions';
  const LS_PENDING   = 'ct_pending';

  // ===== 상태 (localStorage 복원) =====
  const saved = JSON.parse(localStorage.getItem(LS_STATE) || 'null');
  const state = {
    futuresUsdt:  saved?.futuresUsdt ?? 100.00,
    mode:         'futures',
    orderType:    'limit',
    leverage:     10,
    positions:    JSON.parse(localStorage.getItem(LS_POSITIONS) || '[]'),
    pendingOrders:JSON.parse(localStorage.getItem(LS_PENDING)   || '[]'),
  };

  // positions.js에서 참조
  window._st = state;

  // 체결 내역
  let tradeHistory = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');

  // ===== DOM =====
  const priceInput      = document.getElementById('uniPrice');
  const amountInput     = document.getElementById('uniAmount');
  const slider          = document.getElementById('uniSlider');
  const marks           = document.querySelectorAll('.trade-unified__slider-mark');
  const availableEl     = document.getElementById('uniAvailable');
  const buyBtn          = document.getElementById('uniBuyBtn');
  const sellBtn         = document.getElementById('uniSellBtn');
  const leverageBtn     = document.getElementById('leverageBtn');
  const tpslCheckbox    = document.getElementById('tpslCheckbox');
  const tpslSection     = document.getElementById('tpslSection');
  const typeTabs        = document.querySelectorAll('.trade-unified__type-tab');
  const tpPriceInput    = document.getElementById('tpPrice');
  const slPriceInput    = document.getElementById('slPrice');
  const tpUnitBtn       = document.getElementById('tpUnitBtn');
  const slUnitBtn       = document.getElementById('slUnitBtn');
  const tpPreview       = document.getElementById('tpPreview');
  const slPreview       = document.getElementById('slPreview');

  const FEE_RATE  = 0.001;
  const tpslUnit  = { tp: 'USDT', sl: 'USDT' };

  // ===== 현재가 =====
  const getCurrentPrice = () => {
    const el = document.getElementById('midPrice') || document.getElementById('tickerPrice');
    return parseFloat(el?.textContent?.replace(/,/g, '')) || 65432.10;
  };

  // ===== localStorage 저장 =====
  const saveState = () => localStorage.setItem(LS_STATE, JSON.stringify({
    futuresUsdt: state.futuresUsdt,
  }));
  const savePositions = () => localStorage.setItem(LS_POSITIONS, JSON.stringify(state.positions));
  const savePending   = () => localStorage.setItem(LS_PENDING,   JSON.stringify(state.pendingOrders));

  // ===== 체결 내역 기록 =====
  const addTradeRecord = (side, price, btcQty, usdtTotal, fee, meta = {}) => {
    const symbol = typeof BinanceWS !== 'undefined' ? BinanceWS.getSymbol() : 'BTCUSDT';
    tradeHistory.unshift({
      time: new Date().toISOString(), symbol, mode: state.mode,
      side, orderType: state.orderType, price, qty: btcQty, total: usdtTotal, fee,
      tpslType:     meta.tpslType     || null,
      triggerPrice: meta.triggerPrice || null,
      realizedPnl:  meta.realizedPnl  ?? null,
    });
    if (tradeHistory.length > 500) tradeHistory.length = 500;
    localStorage.setItem(LS_HISTORY, JSON.stringify(tradeHistory));
    renderTradeHistory();
  };

  // ===== 포트폴리오 스냅샷 저장 =====
  // refPrice: 방금 체결된 가격, refSymbol: 해당 심볼 (다른 심볼 포지션은 진입가 기준 = PnL 0)
  const saveSnapshot = (refPrice, refSymbol) => {
    const snapshots = JSON.parse(localStorage.getItem('ct_snapshots') || '[]');
    const futPositions = (state.positions || []).filter(p => p.mode === 'futures');
    const lockedMargin = futPositions.reduce((s, p) => s + (p.margin ?? 0), 0);
    const futuresPnl   = futPositions.reduce((s, p) => {
      const cp  = p.symbol === refSymbol ? refPrice : p.entryPrice;
      const dir = p.side === 'long' ? 1 : -1;
      return s + (cp - p.entryPrice) * p.qty * dir;
    }, 0);
    snapshots.push({
      time:  Math.floor(Date.now() / 1000),
      total: parseFloat((state.futuresUsdt + lockedMargin + futuresPnl).toFixed(2)),
    });
    if (snapshots.length > 1000) snapshots.shift();
    localStorage.setItem('ct_snapshots', JSON.stringify(snapshots));
  };

  // ===== 체결 내역 렌더링 =====
  const renderTradeHistory = () => {
    const tbody = document.querySelector('#paneHistory tbody');
    if (!tbody) return;
    if (!tradeHistory.length) {
      tbody.innerHTML = '<tr class="bp-table__empty"><td colspan="8">체결 내역 없음</td></tr>';
      return;
    }
    tbody.innerHTML = tradeHistory.slice(0, 50).map(r => {
      const t = new Date(r.time);
      const ts = t.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
               + ' ' + t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const color = r.side === 'buy' ? 'var(--color-buy)' : 'var(--color-sell)';
      return `<tr>
        <td>${ts}</td>
        <td>${r.symbol.replace('USDT', '')}/USDT</td>
        <td style="color:${color}">${r.side === 'buy' ? '매수' : '매도'}</td>
        <td>${r.orderType === 'market' ? '시장가' : '지정가'}</td>
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
    if (cards.length < 2) return;
    cards[0].textContent = state.futuresUsdt.toFixed(2);
    cards[1].textContent = state.futuresUsdt.toFixed(2) + ' USDT';
  };

  // ===== 잔고 표시 업데이트 =====
  const updateAvailable = () => {
    if (availableEl) availableEl.textContent = state.futuresUsdt.toFixed(2) + ' USDT';
    const futBalEl = document.getElementById('futuresBalance');
    if (futBalEl) futBalEl.textContent = state.futuresUsdt.toFixed(2);
    renderAssets();
    updateInfoRows();
  };

  // ===== TP/SL 가격 읽기 (입력 폼 기준) =====
  const getTpSlFromForm = (entryPrice) => {
    if (!tpslCheckbox?.checked) return { tp: null, sl: null };
    const tpVal = parseFloat(tpPriceInput?.value);
    const slVal = parseFloat(slPriceInput?.value);
    return {
      tp: (!isNaN(tpVal) && tpVal > 0)
        ? (tpslUnit.tp === 'ROI' ? entryPrice * (1 + tpVal / 100) : tpVal) : null,
      sl: (!isNaN(slVal) && slVal > 0)
        ? (tpslUnit.sl === 'ROI' ? entryPrice * (1 - slVal / 100) : slVal) : null,
    };
  };

  // ===== 포지션 업데이트 헬퍼 =====
  const updateFuturesPos = (symbol, side, btcAmt, price, margin, lev, tp, sl) => {
    const pos = state.positions.find(p =>
      p.symbol === symbol && p.mode === 'futures' && p.side === side && p.leverage === lev);
    if (pos) {
      const total = pos.qty + btcAmt;
      pos.entryPrice = (pos.qty * pos.entryPrice + btcAmt * price) / total;
      pos.qty = total; pos.margin += margin;
    } else {
      state.positions.push({ id: Date.now(), symbol, mode: 'futures', side,
        leverage: lev, entryPrice: price, qty: btcAmt,
        margin, tp, sl, openTime: new Date().toISOString() });
    }
  };

  // ===== 시장가 즉시 체결 =====
  const executeMarket = (side, price, btcAmt, amount) => {
    const symbol     = typeof BinanceWS !== 'undefined' ? BinanceWS.getSymbol() : 'BTCUSDT';
    const { tp, sl } = getTpSlFromForm(price);
    const margin     = amount / state.leverage;
    state.futuresUsdt = Math.max(0, state.futuresUsdt - margin);
    const dir = side === 'buy' ? 'long' : 'short';
    updateFuturesPos(symbol, dir, btcAmt, price, margin, state.leverage, tp, sl);

    addTradeRecord(side, price, btcAmt, amount, amount * FEE_RATE);
    saveSnapshot(price, symbol);
    saveState(); savePositions();
    updateAvailable();
    document.dispatchEvent(new CustomEvent('positions:update'));
  };

  // ===== 지정가 주문 등록 =====
  const addPendingOrder = (side, price, btcAmt, amount, reservedMargin = 0) => {
    const symbol    = typeof BinanceWS !== 'undefined' ? BinanceWS.getSymbol() : 'BTCUSDT';
    const { tp, sl } = getTpSlFromForm(price);
    state.pendingOrders.push({
      id: Date.now(), symbol, mode: state.mode, side,
      leverage: state.leverage,
      orderType: 'limit', price, qty: btcAmt, total: amount,
      margin: reservedMargin, tp, sl, time: new Date().toISOString(),
    });
    savePending();
    document.dispatchEvent(new CustomEvent('positions:update'));
  };

  // ===== positions.js에 노출 =====
  window._orderHelpers = {
    updateAvailable, addTradeRecord, saveState, savePositions, savePending,
    updateFuturesPos, saveSnapshot, FEE_RATE,
  };

  // ===== 청산가 / 예상 수령액 =====
  const liqBuyEl  = document.getElementById('liqBuy');
  const liqSellEl = document.getElementById('liqSell');
  const buyEstEl  = document.getElementById('buyEstimate');
  const sellEstEl = document.getElementById('sellEstimate');

  const getEffectivePrice = () =>
    state.orderType === 'market' ? getCurrentPrice() : (parseFloat(priceInput?.value) || 0);

  const resolveAmountUsdt = () => {
    const raw = amountInput?.value?.trim();
    if (!raw) return 0;
    if (raw.endsWith('%')) {
      const pct = parseFloat(raw);
      if (isNaN(pct)) return 0;
      // pct는 증거금 비율 → 노셔널 = 잔고 * pct/100 * leverage
      return state.futuresUsdt * pct / 100 * state.leverage;
    }
    return parseFloat(raw) || 0;
  };

  const updateEstimate = () => {
    if (!buyEstEl || !sellEstEl) return;
    const price  = getEffectivePrice() || getCurrentPrice();
    const amount = resolveAmountUsdt();
    if (!amount || !price) {
      buyEstEl.textContent = sellEstEl.textContent = '≈ — USDT'; return;
    }
    const received = amount * (1 - FEE_RATE);
    const fmt = received.toLocaleString('ko-KR', { minimumFractionDigits: 5, maximumFractionDigits: 5 });
    buyEstEl.textContent = sellEstEl.textContent = '≈ ' + fmt + ' USDT';
  };

  const updateInfoRows = () => {
    if (!liqBuyEl || !liqSellEl) return;
    const price = getEffectivePrice() || getCurrentPrice();
    if (!price) { liqBuyEl.textContent = liqSellEl.textContent = '—'; return; }
    const fmt = n => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + ' USDT';
    liqBuyEl.textContent  = fmt(price * (1 - 1 / state.leverage));
    liqSellEl.textContent = fmt(price * (1 + 1 / state.leverage));
    updateEstimate();
  };

  // ===== 슬라이더 =====
  const updateMarks = (pct) => marks.forEach((m, i) => {
    const on = i * 25 <= pct;
    m.style.background  = on ? 'var(--color-brand)' : '';
    m.style.borderColor = on ? 'var(--color-brand)' : '';
  });

  const applySliderPct = (pct) => {
    if (amountInput) amountInput.value = pct > 0 ? pct + '%' : '';
    updateMarks(pct); updateInfoRows();
  };

  if (slider) slider.addEventListener('input', () => applySliderPct(parseInt(slider.value)));
  marks.forEach((m, i) => m.addEventListener('click', () => {
    const pct = i * 25;
    if (slider) slider.value = pct;
    applySliderPct(pct);
  }));

  if (priceInput)  priceInput.addEventListener('input',  () => { updateInfoRows(); updateEstimate(); });
  if (amountInput) amountInput.addEventListener('input', () => { updateInfoRows(); updateEstimate(); });

  // ===== 주문 유형 탭 =====
  typeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const label = tab.textContent.trim();
      if (label.startsWith('시장가')) {
        state.orderType = 'market';
        if (priceInput) { priceInput.disabled = true; priceInput.placeholder = '시장가'; priceInput.value = ''; priceInput.style.opacity = '0.4'; }
      } else {
        state.orderType = label.startsWith('지정가') ? 'limit' : 'conditional';
        if (priceInput) { priceInput.disabled = false; priceInput.placeholder = '0.00'; priceInput.style.opacity = ''; }
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
  const getBase = () => getEffectivePrice() || getCurrentPrice();

  const usdtToRoi = (usdt, isTp) => {
    const base = getBase(); if (!base) return '';
    const pct = isTp ? ((usdt - base) / base) * 100 : ((base - usdt) / base) * 100;
    return pct.toFixed(2);
  };
  const roiToUsdt = (roi, isTp) => {
    const base = getBase(); if (!base) return '';
    return (isTp ? base * (1 + roi / 100) : base * (1 - roi / 100)).toFixed(2);
  };

  const updatePreview = (type) => {
    const isTp    = type === 'tp';
    const input   = isTp ? tpPriceInput : slPriceInput;
    const preview = isTp ? tpPreview    : slPreview;
    const unit    = isTp ? tpslUnit.tp  : tpslUnit.sl;
    if (!preview) return;
    const val = parseFloat(input?.value);
    if (!val || isNaN(val)) { preview.textContent = '—'; return; }
    if (unit === 'USDT') {
      const roi = parseFloat(usdtToRoi(val, isTp));
      preview.textContent = isNaN(roi) ? '—' : (isTp ? '+' : '-') + Math.abs(roi).toFixed(2) + '%';
    } else {
      const usdt = parseFloat(roiToUsdt(val, isTp));
      preview.textContent = isNaN(usdt) ? '—' : usdt.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + ' USDT';
    }
  };

  const switchUnit = (type) => {
    const isTp    = type === 'tp';
    const input   = isTp ? tpPriceInput : slPriceInput;
    const btn     = isTp ? tpUnitBtn    : slUnitBtn;
    const current = isTp ? tpslUnit.tp  : tpslUnit.sl;
    const newUnit = current === 'USDT' ? 'ROI' : 'USDT';
    const val = parseFloat(input?.value);
    if (val && !isNaN(val)) {
      input.value = current === 'USDT' ? usdtToRoi(val, isTp) : roiToUsdt(val, isTp);
    }
    if (isTp) tpslUnit.tp = newUnit; else tpslUnit.sl = newUnit;
    btn.textContent = newUnit;
    newUnit === 'ROI' ? btn.classList.add('tpsl-block__unit-btn--roi') : btn.classList.remove('tpsl-block__unit-btn--roi');
    updatePreview(type);
  };

  if (tpUnitBtn) tpUnitBtn.addEventListener('click', () => switchUnit('tp'));
  if (slUnitBtn) slUnitBtn.addEventListener('click', () => switchUnit('sl'));
  if (tpPriceInput) tpPriceInput.addEventListener('input', () => updatePreview('tp'));
  if (slPriceInput) slPriceInput.addEventListener('input', () => updatePreview('sl'));

  // ===== 레버리지 =====
  if (leverageBtn) leverageBtn.addEventListener('click', () => {
    const val = parseInt(prompt('레버리지 설정 (1 ~ 125):', state.leverage));
    if (isNaN(val) || val < 1 || val > 125) return;
    state.leverage = val;
    leverageBtn.textContent = val + 'x';
    updateInfoRows();
  });

  // ===== 버튼 피드백 =====
  const flashBtn = (btn, msg, colorClass) => {
    const span = btn.querySelector('span:first-child');
    const orig = span ? span.textContent : '';
    const origClass = btn.className;
    if (span) span.textContent = msg;
    btn.classList.remove('trade-unified__btn--buy', 'trade-unified__btn--sell');
    btn.classList.add(colorClass);
    btn.disabled = true;
    setTimeout(() => {
      if (span) span.textContent = orig;
      btn.className = origClass;
      btn.disabled  = false;
    }, 1200);
  };

  const resetForm = () => {
    if (priceInput && state.orderType !== 'market') priceInput.value = '';
    if (amountInput) amountInput.value = '';
    if (slider) slider.value = 0;
    updateMarks(0);
    updateAvailable();
  };

  // ===== 매수 버튼 =====
  if (buyBtn) {
    buyBtn.addEventListener('click', () => {
      const price  = getEffectivePrice() || getCurrentPrice();
      const amount = resolveAmountUsdt();
      const btcAmt = amount / price;

      if (!amount || amount <= 0) { flashBtn(buyBtn, '수량(USDT) 입력 필요', 'trade-unified__btn--warn'); return; }

      const margin = amount / state.leverage;
      if (margin > state.futuresUsdt + 0.0001) { flashBtn(buyBtn, '증거금 부족', 'trade-unified__btn--warn'); return; }
      if (state.orderType === 'limit') {
        state.futuresUsdt = Math.max(0, state.futuresUsdt - margin);
        saveState(); updateAvailable();
        addPendingOrder('buy', price, btcAmt, amount, margin);
        flashBtn(buyBtn, '✓ 롱 주문 등록', 'trade-unified__btn--buy');
      } else {
        executeMarket('buy', price, btcAmt, amount);
        flashBtn(buyBtn, '✓ 롱 진입', 'trade-unified__btn--buy');
      }
      resetForm();
    });
  }

  // ===== 매도 버튼 =====
  if (sellBtn) {
    sellBtn.addEventListener('click', () => {
      const price  = getEffectivePrice() || getCurrentPrice();
      const amount = resolveAmountUsdt();
      const btcAmt = amount / price;

      if (!amount || amount <= 0) { flashBtn(sellBtn, '수량(USDT) 입력 필요', 'trade-unified__btn--warn'); return; }

      const margin = amount / state.leverage;
      if (margin > state.futuresUsdt + 0.0001) { flashBtn(sellBtn, '증거금 부족', 'trade-unified__btn--warn'); return; }
      if (state.orderType === 'limit') {
        state.futuresUsdt = Math.max(0, state.futuresUsdt - margin);
        saveState(); updateAvailable();
        addPendingOrder('sell', price, btcAmt, amount, margin);
        flashBtn(sellBtn, '✓ 숏 주문 등록', 'trade-unified__btn--sell');
      } else {
        executeMarket('sell', price, btcAmt, amount);
        flashBtn(sellBtn, '✓ 숏 진입', 'trade-unified__btn--sell');
      }
      resetForm();
    });
  }

  // ===== 전체 초기화 =====
  const resetModal = document.getElementById('resetModal');
  const dangerBtn  = resetModal?.querySelector('.modal__btn--danger');
  if (dangerBtn) {
    dangerBtn.addEventListener('click', () => {
      state.futuresUsdt = 100;
      state.positions = []; state.pendingOrders = [];
      tradeHistory = [];
      [LS_STATE, LS_HISTORY, LS_POSITIONS, LS_PENDING].forEach(k => localStorage.removeItem(k));
      resetModal.classList.remove('modal-overlay--open');
      updateAvailable(); renderTradeHistory();
      document.dispatchEvent(new CustomEvent('positions:update'));
    });
  }

  // ===== 초기화 =====
  updateAvailable(); updateEstimate(); renderTradeHistory();
  document.dispatchEvent(new CustomEvent('positions:update'));
});
