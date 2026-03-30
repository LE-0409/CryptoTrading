// ===== positions.js =====
// 포지션 렌더링, 미체결 주문 관리, 자동 체결 (지정가 / TP / SL / 강제청산)

// ===== 가격 캐시 =====
const _priceCache = {};

// ===== 숫자 포맷 =====
const _fmt = (n, d = 2) => n.toLocaleString('ko-KR', { maximumFractionDigits: d });

// ===== 포지션 탭 렌더링 =====
const renderPositions = () => {
  const tbody = document.querySelector('#panePositions tbody');
  if (!tbody) return;
  const st = window._st;
  if (!st) return;

  const positions = st.positions || [];
  if (!positions.length) {
    tbody.innerHTML = '<tr class="bp-table__empty"><td colspan="13">보유 포지션 없음</td></tr>';
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
    const sideLabel = pos.mode === 'spot' ? '현물' : (pos.side === 'long' ? '롱' : '숏');
    const sideColor = (pos.side === 'long') ? 'var(--color-buy)' : 'var(--color-sell)';
    const base      = pos.symbol.replace('USDT', '');

    return `<tr>
      <td><span style="color:${sideColor}">${base} ${sideLabel}</span></td>
      <td>${pos.mode === 'futures' ? pos.leverage + 'x' : '—'}</td>
      <td>${pos.mode === 'futures' ? pos.marginMode : '—'}</td>
      <td>${_fmt(pos.entryPrice)}</td>
      <td>${_fmt(cp)}</td>
      <td>${pos.qty.toFixed(6)}</td>
      <td style="color:${pnlColor}">${pnl >= 0 ? '+' : ''}${_fmt(pnl)} USDT</td>
      <td style="color:${pnlColor}">${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%</td>
      <td>${liq ? _fmt(liq) : '—'}</td>
      <td>${pos.tp ? _fmt(pos.tp) : '—'}</td>
      <td>${pos.sl ? _fmt(pos.sl) : '—'}</td>
      <td><button class="bp-btn bp-btn--close bp-close-btn" data-pos-id="${pos.id}">청산</button></td>
      <td>—</td>
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
      <td>${o.mode === 'spot' ? '현물' : '선물'}</td>
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

  if (order.mode === 'spot') {
    if (order.side === 'buy') {
      st.spotUsdt = Math.max(0, st.spotUsdt - order.total);
      st.spotBtc += order.qty;
      h.updateSpotPos(order.symbol, order.qty, order.price, order.total, order.tp, order.sl);
    } else {
      st.spotBtc  = Math.max(0, st.spotBtc - order.qty);
      st.spotUsdt += order.total * (1 - h.FEE_RATE);
      h.reduceSpotPos(order.symbol, order.qty);
    }
  } else {
    // 증거금은 주문 등록 시 이미 차감됨
    const dir = order.side === 'buy' ? 'long' : 'short';
    h.updateFuturesPos(order.symbol, dir, order.qty, order.price, order.margin,
      order.leverage, order.marginMode, order.tp, order.sl);
  }

  h.addTradeRecord(order.side, order.price, order.qty, order.total, order.total * h.FEE_RATE);
  h.saveSnapshot?.(order.price);
  h.savePositions(); h.saveState(); h.updateAvailable();
  renderAll();
};

// ===== 포지션 청산 (TP/SL/강제/수동) =====
const closePosition = (pos, reason = 'manual') => {
  const st = window._st;
  const h  = window._orderHelpers;
  if (!st || !h) return;

  const cp    = _priceCache[pos.symbol] || pos.entryPrice;
  const dir   = pos.side === 'long' ? 1 : -1;
  const pnl   = (cp - pos.entryPrice) * pos.qty * dir;
  const base  = pos.symbol.replace('USDT', '');
  const side  = pos.side === 'long' ? '롱' : (pos.mode === 'spot' ? '현물' : '숏');

  st.positions = st.positions.filter(p => p.id !== pos.id);

  const closeSide = pos.side === 'long' ? 'sell' : 'buy';
  const fee       = pos.qty * cp * h.FEE_RATE;

  if (pos.mode === 'spot') {
    st.spotBtc   = Math.max(0, st.spotBtc - pos.qty);
    st.spotUsdt += pos.qty * cp * (1 - h.FEE_RATE);
  } else {
    st.futuresUsdt += Math.max(0, pos.margin + pnl);
  }

  h.addTradeRecord(closeSide, cp, pos.qty, pos.qty * cp, fee, {
    tpslType:     reason === 'tp' ? 'TP' : reason === 'sl' ? 'SL' : null,
    triggerPrice: reason === 'tp' ? pos.tp : reason === 'sl' ? pos.sl : null,
    realizedPnl:  pnl,
  });
  h.saveSnapshot?.(cp);
  h.savePositions(); h.saveState(); h.updateAvailable();

  // ── 토스트 알림 ──
  if (typeof Toast !== 'undefined') {
    const pnlStr = (pnl >= 0 ? '+' : '') + _fmt(pnl) + ' USDT';
    if (reason === 'tp')          Toast.success(`${base} ${side} TP 체결 ${pnlStr}`, 'Take Profit');
    else if (reason === 'sl')     Toast.warning(`${base} ${side} SL 체결 ${pnlStr}`, 'Stop Loss');
    else if (reason === 'liquidation') Toast.error(`${base} ${side} 강제 청산`, '청산');
    else                          Toast.info(`${base} ${side} 청산 완료 ${pnlStr}`, '수동 청산');
  }

  renderAll();
};

// ===== 가격 모니터링 =====
let _renderTimer = null;
const _scheduleRender = () => {
  if (_renderTimer) return;
  _renderTimer = setTimeout(() => { renderPositions(); _renderTimer = null; }, 250);
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

// ===== 버튼 이벤트 (이벤트 위임) =====
document.querySelector('.bottom-panel__content')?.addEventListener('click', e => {

  // 청산 버튼
  const closeBtn = e.target.closest('.bp-close-btn');
  if (closeBtn) {
    const posId = parseInt(closeBtn.dataset.posId);
    const pos   = window._st?.positions?.find(p => p.id === posId);
    if (pos) closePosition(pos);
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

    // 선물 지정가 취소 → 예약 증거금 반환
    if (order.mode === 'futures' && order.margin > 0) {
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
