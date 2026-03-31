// ===== positions.js =====
// 포지션 렌더링, 미체결 주문 관리, 자동 체결 (지정가 / TP / SL / 강제청산)

// ===== 가격 캐시 =====
const _priceCache = {};
window._priceCache = _priceCache; // funding.js에서 참조

// ===== 숫자 포맷 =====
const _fmt = (n, d = 2) => n.toLocaleString('ko-KR', { maximumFractionDigits: d });

// ===== 포지션 탭 렌더링 =====
const renderPositions = () => {
  const tbody = document.querySelector('#panePositions tbody');
  if (!tbody) return;
  const st = window._st;
  if (!st) return;

  const positions = st.positions || [];
  // 차트 라인 갱신 이벤트
  document.dispatchEvent(new CustomEvent('positions:changed', {
    detail: { positions }
  }));

  if (!positions.length) {
    tbody.innerHTML = '<tr class="bp-table__empty"><td colspan="11">보유 포지션 없음</td></tr>';
    return;
  }

  tbody.innerHTML = positions.map(pos => {
    const cp  = _priceCache[pos.symbol] || pos.entryPrice;
    const dir = pos.side === 'long' ? 1 : -1;
    const pnl = (cp - pos.entryPrice) * pos.qty * dir;
    const roi = pos.margin > 0 ? pnl / pos.margin * 100 : 0;
    const liq = pos.mode === 'futures'
      ? (pos.side === 'long'
          ? pos.entryPrice * (1 - 1 / pos.leverage)
          : pos.entryPrice * (1 + 1 / pos.leverage))
      : null;

    const pnlColor  = pnl >= 0 ? 'var(--color-buy)' : 'var(--color-sell)';
    const sideLabel = pos.side === 'long' ? '롱' : '숏';
    const sideColor = (pos.side === 'long') ? 'var(--color-buy)' : 'var(--color-sell)';
    const base      = pos.symbol.replace('USDT', '');

    return `<tr>
      <td><span style="color:${sideColor}">${base} ${sideLabel}</span></td>
      <td>${pos.leverage}x</td>
      <td>${_fmt(pos.entryPrice)}</td>
      <td>${_fmt(cp)}</td>
      <td>${pos.qty.toFixed(6)}</td>
      <td style="color:${pnlColor}">${pnl >= 0 ? '+' : ''}${_fmt(pnl)} USDT</td>
      <td style="color:${pnlColor}">${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%</td>
      <td>${liq !== null ? _fmt(liq) : '—'}</td>
      <td class="bp-tpsl-cell" data-pos-id="${pos.id}">${pos.tp ? _fmt(pos.tp) : '—'} / ${pos.sl ? _fmt(pos.sl) : '—'}</td>
      <td><button class="bp-btn bp-btn--close bp-close-btn" data-pos-id="${pos.id}">청산</button></td>
      <td>${_fmt(pos.margin)} USDT</td>
    </tr>`;
  }).join('');
};

// ===== 미체결 주문 탭 렌더링 =====
const renderPendingOrders = () => {
  const tbody = document.querySelector('#panePending tbody');
  if (!tbody) return;
  const st = window._st;
  if (!st) return;

  const orders = st.pendingOrders || [];
  if (!orders.length) {
    tbody.innerHTML = '<tr class="bp-table__empty"><td colspan="10">미체결 주문 없음</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const t   = new Date(o.time);
    const ts  = t.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
              + ' ' + t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const base  = o.symbol.replace('USDT', '');
    const color = o.side === 'buy' ? 'var(--color-buy)' : 'var(--color-sell)';

    return `<tr>
      <td>${ts}</td>
      <td>${base}/USDT</td>
      <td style="color:${color}">${o.side === 'buy' ? '매수' : '매도'}</td>
      <td>지정가</td>
      <td>${_fmt(o.price)}</td>
      <td>${o.qty.toFixed(6)}</td>
      <td>${_fmt(o.total)}</td>
      <td>—</td>
      <td><button class="bp-btn bp-btn--cancel bp-cancel-btn" data-order-id="${o.id}">취소</button></td>
    </tr>`;
  }).join('');
};

const renderAll = () => { renderPositions(); renderPendingOrders(); };

// ===== 지정가 주문 체결 =====
const executeLimitOrder = (order, fillPrice) => {
  const st = window._st;
  const h  = window._orderHelpers;
  if (!st || !h) return;

  // 미체결 목록에서 제거
  st.pendingOrders = st.pendingOrders.filter(o => o.id !== order.id);
  h.savePending();

  // 토스트 알림
  if (typeof Toast !== 'undefined') {
    const base  = order.symbol.replace('USDT', '');
    const side  = order.side === 'buy' ? '매수' : '매도';
    Toast.success(`${base} ${side} 지정가 체결 @ ${_fmt(order.price)}`, '주문 체결');
  }

  // 증거금은 주문 등록 시 이미 차감됨 / 수수료는 체결 시 차감
  const dir = order.side === 'buy' ? 'long' : 'short';
  h.updateFuturesPos(order.symbol, dir, order.qty, order.price, order.margin,
    order.leverage, order.tp, order.sl);

  const limitFee = order.total * h.FEE_RATE;
  st.futuresUsdt = Math.max(0, st.futuresUsdt - limitFee);
  h.addTradeRecord(order.side, order.price, order.qty, order.total, limitFee);
  h.saveSnapshot?.(order.price, order.symbol);
  h.savePositions(); h.saveState(); h.updateAvailable();
  renderAll();
};

// ===== 포지션 청산 (TP/SL/강제/수동) =====
// closeQty: 청산 수량 (undefined = 전체 청산)
const closePosition = (pos, reason = 'manual', closeQty) => {
  const st = window._st;
  const h  = window._orderHelpers;
  if (!st || !h) return;

  const cp    = _priceCache[pos.symbol] || pos.entryPrice;
  const dir   = pos.side === 'long' ? 1 : -1;
  const base  = pos.symbol.replace('USDT', '');
  const side  = pos.side === 'long' ? '롱' : '숏';

  const EPSILON = 1e-8;
  const _closeQty  = closeQty && closeQty < pos.qty ? closeQty : pos.qty;
  // 부동소수점 오차로 남은 수량이 사실상 0이면 전체 청산으로 처리
  const isFullClose = (pos.qty - _closeQty) < EPSILON;
  const qty   = isFullClose ? pos.qty : _closeQty;
  const ratio = qty / pos.qty; // 부분 청산 비율
  const pnl   = (cp - pos.entryPrice) * qty * dir;
  const returnedMargin = pos.margin * ratio;

  const closeSide = pos.side === 'long' ? 'sell' : 'buy';
  const fee       = qty * cp * h.FEE_RATE;

  if (!isFullClose && ratio < 1) {
    // 부분 청산: 수량과 증거금만 줄임
    pos.qty    -= qty;
    pos.margin -= returnedMargin;
    st.futuresUsdt += Math.max(0, returnedMargin + pnl - fee);
  } else {
    // 전체 청산
    st.positions = st.positions.filter(p => p.id !== pos.id);
    st.futuresUsdt += Math.max(0, pos.margin + pnl - fee);
  }

  h.addTradeRecord(closeSide, cp, qty, qty * cp, fee, {
    tpslType:     reason === 'tp' ? 'TP' : reason === 'sl' ? 'SL' : null,
    triggerPrice: reason === 'tp' ? pos.tp : reason === 'sl' ? pos.sl : null,
    realizedPnl:  pnl,
  });
  h.saveSnapshot?.(cp, pos.symbol);
  h.savePositions(); h.saveState(); h.updateAvailable();

  // ── 토스트 알림 ──
  if (typeof Toast !== 'undefined') {
    const pnlStr = (pnl >= 0 ? '+' : '') + _fmt(pnl) + ' USDT';
    if (reason === 'tp')               Toast.success(`${base} ${side} TP 체결 ${pnlStr}`, 'Take Profit');
    else if (reason === 'sl')          Toast.warning(`${base} ${side} SL 체결 ${pnlStr}`, 'Stop Loss');
    else if (reason === 'liquidation') Toast.error(`${base} ${side} 강제 청산`, '청산');
    else if (!isFullClose && ratio < 1) Toast.info(`${base} ${side} 부분 청산 (${(ratio*100).toFixed(0)}%) ${pnlStr}`, '수동 청산');
    else                               Toast.info(`${base} ${side} 청산 완료 ${pnlStr}`, '수동 청산');
  }

  renderAll();
};

// ===== 가격 모니터링 =====
let _renderTimer = null;
const _scheduleRender = () => {
  if (_renderTimer) return;
  _renderTimer = setTimeout(() => {
    renderPositions();
    window._orderHelpers?.updateAvailable?.();
    _renderTimer = null;
  }, 250);
};

document.addEventListener('binance:ticker', ({ detail: d }) => {
  const symbol = d.s;
  const price  = parseFloat(d.c);
  if (!price) return;

  _priceCache[symbol] = price;

  const st = window._st;
  if (!st) return;

  // ── 지정가 주문 체결 확인 ──
  [...(st.pendingOrders || [])].forEach(o => {
    if (o.symbol !== symbol) return;
    const hit = (o.side === 'buy' && price <= o.price) ||
                (o.side === 'sell' && price >= o.price);
    if (hit) executeLimitOrder(o, price);
  });

  // ── 포지션 TP / SL / 강제청산 확인 ──
  [...(st.positions || [])].forEach(pos => {
    if (pos.symbol !== symbol) return;

    // 강제 청산 (선물)
    if (pos.mode === 'futures') {
      const liq = pos.side === 'long'
        ? pos.entryPrice * (1 - 1 / pos.leverage)
        : pos.entryPrice * (1 + 1 / pos.leverage);
      if ((pos.side === 'long' && price <= liq) ||
          (pos.side === 'short' && price >= liq)) {
        closePosition(pos, 'liquidation'); return;
      }
    }

    // TP
    if (pos.tp) {
      const hit = (pos.side === 'long'  && price >= pos.tp) ||
                  (pos.side === 'short' && price <= pos.tp);
      if (hit) { closePosition(pos, 'tp'); return; }
    }

    // SL
    if (pos.sl) {
      const hit = (pos.side === 'long'  && price <= pos.sl) ||
                  (pos.side === 'short' && price >= pos.sl);
      if (hit) { closePosition(pos, 'sl'); return; }
    }
  });

  // PnL 주기적 갱신
  _scheduleRender();
});

// ===== 청산 모달 =====
const _closeModal    = document.getElementById('closeModal');
let _closePosId      = null;
let _closeMode       = 'qty'; // 'qty' | 'pct'

const _updateCloseEstimate = () => {
  const st  = window._st;
  const pos = st?.positions?.find(p => p.id === _closePosId);
  if (!pos) return;

  const cp    = _priceCache[pos.symbol] || pos.entryPrice;
  const dir   = pos.side === 'long' ? 1 : -1;
  const input = document.getElementById('closeModalInput');
  const estEl = document.getElementById('closeModalEstPnl');
  if (!input || !estEl) return;

  const raw = parseFloat(input.value);
  if (!raw || isNaN(raw) || raw <= 0) { estEl.textContent = '—'; estEl.className = 'close-modal__estimate-val'; return; }

  // qty 모드: raw = 증거금(margin) 기준 USDT → qty 변환
  const closeQty = _closeMode === 'pct'
    ? pos.qty * (Math.min(raw, 100) / 100)
    : pos.qty * Math.min(raw / pos.margin, 1);

  const pnl = (cp - pos.entryPrice) * closeQty * dir;
  estEl.textContent = (pnl >= 0 ? '+' : '') + _fmt(pnl) + ' USDT';
  estEl.className   = 'close-modal__estimate-val ' + (pnl >= 0 ? 'close-modal__estimate-val--up' : 'close-modal__estimate-val--down');
};

const openCloseModal = (pos) => {
  _closePosId = pos.id;
  _closeMode  = 'qty';

  const cp    = _priceCache[pos.symbol] || pos.entryPrice;
  const dir   = pos.side === 'long' ? 1 : -1;
  const pnl   = (cp - pos.entryPrice) * pos.qty * dir;
  const base  = pos.symbol.replace('USDT', '');
  const sideLabel = pos.side === 'long' ? '롱' : '숏';

  document.getElementById('closeModalPair').textContent     = `${base} ${sideLabel}`;
  document.getElementById('closeModalEntry').textContent    = _fmt(pos.entryPrice);
  document.getElementById('closeModalCurrent').textContent  = _fmt(cp);
  document.getElementById('closeModalTotalQty').textContent = pos.qty.toFixed(6) + ' ' + base;

  const pnlEl = document.getElementById('closeModalPnl');
  pnlEl.textContent = (pnl >= 0 ? '+' : '') + _fmt(pnl) + ' USDT';
  pnlEl.className   = 'close-modal__pnl ' + (pnl >= 0 ? 'close-modal__pnl--up' : 'close-modal__pnl--down');

  // 모드 탭 초기화
  document.getElementById('closeModeQty').classList.add('close-modal__mode-tab--active');
  document.getElementById('closeModePct').classList.remove('close-modal__mode-tab--active');

  // 입력 초기화 (100% = 투자 증거금, USDT 단위)
  const input  = document.getElementById('closeModalInput');
  const slider = document.getElementById('closeModalSlider');
  const unit   = document.getElementById('closeModalUnit');
  input.value  = pos.margin.toFixed(2);
  input.step   = 'any';
  input.max    = pos.margin;
  input.placeholder = '0';
  slider.value = 100;
  unit.textContent  = 'USDT';

  document.getElementById('closeModalEstPnl').textContent = (pnl >= 0 ? '+' : '') + _fmt(pnl) + ' USDT';
  document.getElementById('closeModalEstPnl').className   = 'close-modal__estimate-val ' + (pnl >= 0 ? 'close-modal__estimate-val--up' : 'close-modal__estimate-val--down');

  _closeModal.classList.add('modal-overlay--open');
  input.focus();
};

const _closeCloseModal = () => {
  _closeModal?.classList.remove('modal-overlay--open');
  _closePosId = null;
};

const _confirmClose = () => {
  const st  = window._st;
  const pos = st?.positions?.find(p => p.id === _closePosId);
  if (!pos) return;

  const input = document.getElementById('closeModalInput');
  const raw   = parseFloat(input.value);
  if (!raw || isNaN(raw) || raw <= 0) return;

  const closeQty = _closeMode === 'pct'
    ? pos.qty * (Math.min(raw, 100) / 100)
    : pos.qty * Math.min(raw / pos.margin, 1);

  _closeCloseModal();
  closePosition(pos, 'manual', closeQty);
};

// 모드 전환
document.getElementById('closeModeQty')?.addEventListener('click', () => {
  if (_closeMode === 'qty') return;
  _closeMode = 'qty';
  const pos = window._st?.positions?.find(p => p.id === _closePosId);
  if (!pos) return;
  const input  = document.getElementById('closeModalInput');
  const slider = document.getElementById('closeModalSlider');
  const unit   = document.getElementById('closeModalUnit');
  const pct    = parseFloat(slider.value) || 100;
  input.value  = (pos.margin * pct / 100).toFixed(2);
  input.step   = 'any';
  input.max    = pos.margin;
  unit.textContent = 'USDT';
  document.getElementById('closeModeQty').classList.add('close-modal__mode-tab--active');
  document.getElementById('closeModePct').classList.remove('close-modal__mode-tab--active');
  _updateCloseEstimate();
});

document.getElementById('closeModePct')?.addEventListener('click', () => {
  if (_closeMode === 'pct') return;
  _closeMode = 'pct';
  const pos = window._st?.positions?.find(p => p.id === _closePosId);
  if (!pos) return;
  const input  = document.getElementById('closeModalInput');
  const slider = document.getElementById('closeModalSlider');
  const unit   = document.getElementById('closeModalUnit');
  const usdt   = parseFloat(input.value) || pos.margin;
  const pct    = Math.min(usdt / pos.margin * 100, 100);
  input.value  = pct.toFixed(1);
  input.step   = '0.1';
  input.max    = 100;
  slider.value = pct;
  unit.textContent = '%';
  document.getElementById('closeModePct').classList.add('close-modal__mode-tab--active');
  document.getElementById('closeModeQty').classList.remove('close-modal__mode-tab--active');
  _updateCloseEstimate();
});

// 입력 ↔ 슬라이더 연동
document.getElementById('closeModalInput')?.addEventListener('input', () => {
  const pos = window._st?.positions?.find(p => p.id === _closePosId);
  if (!pos) return;
  const input  = document.getElementById('closeModalInput');
  const slider = document.getElementById('closeModalSlider');
  const raw    = parseFloat(input.value);
  if (!isNaN(raw) && raw > 0) {
    const pct = _closeMode === 'pct'
      ? Math.min(raw, 100)
      : Math.min(raw / pos.margin * 100, 100);
    slider.value = pct;
  }
  _updateCloseEstimate();
});

document.getElementById('closeModalSlider')?.addEventListener('input', () => {
  const pos = window._st?.positions?.find(p => p.id === _closePosId);
  if (!pos) return;
  const slider = document.getElementById('closeModalSlider');
  const input  = document.getElementById('closeModalInput');
  const pct    = parseFloat(slider.value);
  if (_closeMode === 'pct') {
    input.value = pct.toFixed(1);
  } else {
    input.value = (pos.margin * pct / 100).toFixed(2);
  }
  _updateCloseEstimate();
});

// % 마크 버튼
_closeModal?.addEventListener('click', e => {
  if (e.target === _closeModal) { _closeCloseModal(); return; }
  const mark = e.target.closest('[data-close-pct]');
  if (!mark) return;
  const pos = window._st?.positions?.find(p => p.id === _closePosId);
  if (!pos) return;
  const pct    = parseFloat(mark.dataset.closePct);
  const slider = document.getElementById('closeModalSlider');
  const input  = document.getElementById('closeModalInput');
  slider.value = pct;
  if (_closeMode === 'pct') {
    input.value = pct.toFixed(1);
  } else {
    input.value = (pos.margin * pct / 100).toFixed(2);
  }
  _updateCloseEstimate();
});

document.getElementById('closeModalClose')?.addEventListener('click',   _closeCloseModal);
document.getElementById('closeModalCancel')?.addEventListener('click',  _closeCloseModal);
document.getElementById('closeModalConfirm')?.addEventListener('click', _confirmClose);

// ===== TP/SL 모달 =====
const _tpslModal = document.getElementById('tpslModal');
let _tpslPosId = null;
let _tpslUnit  = { tp: 'USDT', sl: 'USDT' };

// ROI 공식: 롱=(현재가-진입가)/진입가, 숏=(진입가-현재가)/진입가
// TP는 양수(수익), SL은 음수(손실) — isTp 구분 불필요, side만으로 결정
const _usdtToRoi = (usdt, side, entry) => {
  const pct = side === 'long'
    ? ((usdt - entry) / entry) * 100
    : ((entry - usdt) / entry) * 100;
  return pct.toFixed(2);
};
const _roiToUsdt = (roi, side, entry) => {
  return (side === 'long'
    ? entry * (1 + roi / 100)
    : entry * (1 - roi / 100)).toFixed(2);
};

const _updateTpslPreview = (type, entry, side) => {
  const isTp    = type === 'tp';
  const input   = document.getElementById(isTp ? 'tpslModalTp' : 'tpslModalSl');
  const preview = document.getElementById(isTp ? 'tpslModalTpPreview' : 'tpslModalSlPreview');
  if (!preview) return;
  const val = parseFloat(input.value);
  if (isNaN(val)) { preview.textContent = '—'; return; }
  const unit = isTp ? _tpslUnit.tp : _tpslUnit.sl;
  if (unit === 'USDT') {
    // 가격 입력 → ROI% 프리뷰
    const roi = parseFloat(_usdtToRoi(val, side, entry));
    if (isNaN(roi)) { preview.textContent = '—'; return; }
    const sign = roi >= 0 ? '+' : '';
    preview.textContent = sign + roi.toFixed(2) + '%';
  } else {
    // ROI% 입력 → 가격 프리뷰 (SL은 음수 roi)
    const usdt = parseFloat(_roiToUsdt(val, side, entry));
    preview.textContent = isNaN(usdt) ? '—' : usdt.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + ' USDT';
  }
};

const _switchTpslUnit = (type, entry, side) => {
  const isTp    = type === 'tp';
  const input   = document.getElementById(isTp ? 'tpslModalTp'            : 'tpslModalSl');
  const btn     = document.getElementById(isTp ? 'tpslModalTpUnit'        : 'tpslModalSlUnit');
  const wrap    = document.getElementById(isTp ? 'tpslModalTpSliderWrap'  : 'tpslModalSlSliderWrap');
  const slider  = document.getElementById(isTp ? 'tpslModalTpSlider'      : 'tpslModalSlSlider');
  const current = isTp ? _tpslUnit.tp : _tpslUnit.sl;
  const newUnit = current === 'USDT' ? 'ROI%' : 'USDT';
  const val = parseFloat(input.value);
  if (!isNaN(val) && val !== 0) {
    // USDT→ROI%: 결과는 부호 포함 (TP=양수, SL=음수)
    // ROI%→USDT: roi가 음수여도 올바른 가격 반환
    input.value = current === 'USDT' ? _usdtToRoi(val, side, entry) : _roiToUsdt(val, side, entry);
  }
  if (isTp) _tpslUnit.tp = newUnit; else _tpslUnit.sl = newUnit;
  btn.textContent = newUnit;
  newUnit === 'ROI%' ? btn.classList.add('tpsl-block__unit-btn--roi') : btn.classList.remove('tpsl-block__unit-btn--roi');
  // 슬라이더 표시/숨김 + 슬라이더 값 동기화
  if (newUnit === 'ROI%') {
    wrap?.classList.add('tpsl-modal__slider-wrap--visible');
    const roiVal = parseFloat(input.value);
    if (slider && !isNaN(roiVal) && roiVal !== 0) {
      slider.value = isTp
        ? Math.min(Math.max(roiVal, 0.1), 100)
        : Math.max(Math.min(roiVal, -0.1), -100);
    }
  } else {
    wrap?.classList.remove('tpsl-modal__slider-wrap--visible');
  }
  _updateTpslPreview(type, entry, side);
};

const openTpslModal = (pos) => {
  _tpslPosId = pos.id;
  _tpslUnit  = { tp: 'USDT', sl: 'USDT' };

  const base      = pos.symbol.replace('USDT', '');
  const sideLabel = pos.side === 'long' ? '롱' : '숏';

  document.getElementById('tpslModalPair').textContent  = `${base} ${sideLabel}`;
  document.getElementById('tpslModalEntry').textContent = _fmt(pos.entryPrice);
  document.getElementById('tpslModalTp').value          = pos.tp || '';
  document.getElementById('tpslModalSl').value          = pos.sl || '';

  ['tp', 'sl'].forEach(t => {
    const btn    = document.getElementById(t === 'tp' ? 'tpslModalTpUnit'       : 'tpslModalSlUnit');
    const wrap   = document.getElementById(t === 'tp' ? 'tpslModalTpSliderWrap' : 'tpslModalSlSliderWrap');
    const slider = document.getElementById(t === 'tp' ? 'tpslModalTpSlider'     : 'tpslModalSlSlider');
    if (btn)    { btn.textContent = 'USDT'; btn.classList.remove('tpsl-block__unit-btn--roi'); }
    if (wrap)   wrap.classList.remove('tpsl-modal__slider-wrap--visible');
    if (slider) slider.value = t === 'tp' ? 10 : -10;
  });

  _updateTpslPreview('tp', pos.entryPrice, pos.side);
  _updateTpslPreview('sl', pos.entryPrice, pos.side);

  const hint = pos.side === 'long'
    ? `롱: TP 가격 > 진입가(${_fmt(pos.entryPrice)}), SL 가격 < 진입가 | ROI%: SL은 음수(-5% 등)`
    : `숏: TP 가격 < 진입가(${_fmt(pos.entryPrice)}), SL 가격 > 진입가 | ROI%: SL은 음수(-5% 등)`;
  document.getElementById('tpslModalHint').textContent = hint;

  _tpslModal.classList.add('modal-overlay--open');
  document.getElementById('tpslModalTp').focus();
};

const closeTpslModal = () => {
  _tpslModal.classList.remove('modal-overlay--open');
  _tpslPosId = null;
};

const saveTpsl = () => {
  if (_tpslPosId === null) return;
  const st = window._st;
  const h  = window._orderHelpers;
  if (!st || !h) return;

  const pos   = st.positions.find(p => p.id === _tpslPosId);
  if (!pos) return;
  const entry = pos.entryPrice;

  const tpRaw = parseFloat(document.getElementById('tpslModalTp').value);
  const slRaw = parseFloat(document.getElementById('tpslModalSl').value);
  // TP: 양수여야 유효 / SL: ROI%는 음수, USDT는 양수
  let tp = isNaN(tpRaw) || tpRaw <= 0 ? null : tpRaw;
  let sl = isNaN(slRaw) ? null
         : _tpslUnit.sl === 'ROI%' ? (slRaw >= 0 ? null : slRaw)   // ROI%는 반드시 음수
         : (slRaw <= 0 ? null : slRaw);                              // USDT는 양수

  // ROI% → USDT 변환 (roi가 음수면 그대로 사용)
  if (tp !== null && _tpslUnit.tp === 'ROI%') tp = parseFloat(_roiToUsdt(tp, pos.side, entry));
  if (sl !== null && _tpslUnit.sl === 'ROI%') sl = parseFloat(_roiToUsdt(sl, pos.side, entry));

  // 방향 검증
  if (tp !== null) {
    if (pos.side === 'long'  && tp <= entry) { alert('롱 TP는 진입가보다 높아야 합니다.'); return; }
    if (pos.side === 'short' && tp >= entry) { alert('숏 TP는 진입가보다 낮아야 합니다.'); return; }
  }
  if (sl !== null) {
    if (pos.side === 'long'  && sl >= entry) { alert('롱 SL은 진입가보다 낮아야 합니다.'); return; }
    if (pos.side === 'short' && sl <= entry) { alert('숏 SL은 진입가보다 높아야 합니다.'); return; }
  }

  pos.tp = tp;
  pos.sl = sl;
  h.savePositions();
  closeTpslModal();
  renderPositions();

  if (typeof Toast !== 'undefined') {
    Toast.info('TP / SL이 업데이트되었습니다.', 'TP/SL 설정');
  }
};

document.getElementById('tpslModalClose')?.addEventListener('click',   closeTpslModal);
document.getElementById('tpslModalCancel')?.addEventListener('click',  closeTpslModal);
document.getElementById('tpslModalConfirm')?.addEventListener('click', saveTpsl);
_tpslModal?.addEventListener('click', e => {
  if (e.target === _tpslModal) { closeTpslModal(); return; }
  const mark = e.target.closest('.tpsl-modal__mark');
  if (!mark) return;
  const type     = mark.closest('[data-tpsl-type]')?.dataset.tpslType;
  if (!type) return;
  const val      = parseFloat(mark.dataset.val);
  const inputEl  = document.getElementById(type === 'tp' ? 'tpslModalTp'       : 'tpslModalSl');
  const sliderEl = document.getElementById(type === 'tp' ? 'tpslModalTpSlider' : 'tpslModalSlSlider');
  if (inputEl)  inputEl.value  = val;
  if (sliderEl) sliderEl.value = val;
  const pos = window._st?.positions?.find(p => p.id === _tpslPosId);
  if (pos) _updateTpslPreview(type, pos.entryPrice, pos.side);
});

document.getElementById('tpslModalTpUnit')?.addEventListener('click', () => {
  const pos = window._st?.positions?.find(p => p.id === _tpslPosId);
  if (pos) _switchTpslUnit('tp', pos.entryPrice, pos.side);
});
document.getElementById('tpslModalSlUnit')?.addEventListener('click', () => {
  const pos = window._st?.positions?.find(p => p.id === _tpslPosId);
  if (pos) _switchTpslUnit('sl', pos.entryPrice, pos.side);
});

document.getElementById('tpslModalTp')?.addEventListener('input', () => {
  const pos = window._st?.positions?.find(p => p.id === _tpslPosId);
  if (pos) _updateTpslPreview('tp', pos.entryPrice, pos.side);
  if (_tpslUnit.tp === 'ROI%') {
    const v = parseFloat(document.getElementById('tpslModalTp').value);
    const s = document.getElementById('tpslModalTpSlider');
    if (s && v && !isNaN(v)) s.value = Math.min(Math.max(v, 0.1), 100);
  }
});
document.getElementById('tpslModalSl')?.addEventListener('input', () => {
  const pos = window._st?.positions?.find(p => p.id === _tpslPosId);
  if (pos) _updateTpslPreview('sl', pos.entryPrice, pos.side);
  if (_tpslUnit.sl === 'ROI%') {
    const v = parseFloat(document.getElementById('tpslModalSl').value);
    const s = document.getElementById('tpslModalSlSlider');
    if (s && !isNaN(v) && v !== 0) s.value = Math.max(Math.min(v, -0.1), -100);
  }
});

document.getElementById('tpslModalTpSlider')?.addEventListener('input', () => {
  const s = document.getElementById('tpslModalTpSlider');
  const i = document.getElementById('tpslModalTp');
  if (i) i.value = s.value;
  const pos = window._st?.positions?.find(p => p.id === _tpslPosId);
  if (pos) _updateTpslPreview('tp', pos.entryPrice, pos.side);
});
document.getElementById('tpslModalSlSlider')?.addEventListener('input', () => {
  const s = document.getElementById('tpslModalSlSlider');
  const i = document.getElementById('tpslModalSl');
  if (i) i.value = s.value;
  const pos = window._st?.positions?.find(p => p.id === _tpslPosId);
  if (pos) _updateTpslPreview('sl', pos.entryPrice, pos.side);
});

// ===== 버튼 이벤트 (이벤트 위임) =====
document.querySelector('.bottom-panel__content')?.addEventListener('click', e => {

  // TP/SL 셀 클릭
  const tpslCell = e.target.closest('.bp-tpsl-cell');
  if (tpslCell) {
    const posId = parseInt(tpslCell.dataset.posId);
    const pos   = window._st?.positions?.find(p => p.id === posId);
    if (pos) openTpslModal(pos);
    return;
  }

  // 청산 버튼 → 청산 모달 오픈
  const closeBtn = e.target.closest('.bp-close-btn');
  if (closeBtn) {
    const posId = parseInt(closeBtn.dataset.posId);
    const pos   = window._st?.positions?.find(p => p.id === posId);
    if (pos) openCloseModal(pos);
    return;
  }

  // 취소 버튼
  const cancelBtn = e.target.closest('.bp-cancel-btn');
  if (cancelBtn) {
    const orderId = parseInt(cancelBtn.dataset.orderId);
    const st = window._st;
    const h  = window._orderHelpers;
    if (!st || !h) return;

    const order = st.pendingOrders.find(o => o.id === orderId);
    if (!order) return;

    // 지정가 취소 → 예약 증거금 반환
    if (order.margin > 0) {
      st.futuresUsdt += order.margin;
      h.saveState(); h.updateAvailable();
    }

    st.pendingOrders = st.pendingOrders.filter(o => o.id !== orderId);
    h.savePending();
    renderPendingOrders();
  }
});

// ===== positions:update 이벤트 =====
document.addEventListener('positions:update', renderAll);

// ===== 심볼 변경 시 미체결 표시 갱신 =====
document.addEventListener('symbol:change', renderAll);
