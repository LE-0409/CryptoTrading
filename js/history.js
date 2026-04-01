// ===== history.js =====
// 거래내역 페이지 — localStorage 데이터 렌더링

document.addEventListener('DOMContentLoaded', () => {

  // ===== 헤더 잔고 =====
  const saved = JSON.parse(localStorage.getItem('ct_state') || 'null');
  const balEls = document.querySelectorAll('.header__balance-value');
  if (saved) {
    if (balEls[0]) balEls[0].textContent = parseFloat(saved.futuresUsdt || 0).toFixed(2);
  }

  // ===== 데이터 로드 =====
  const trades  = JSON.parse(localStorage.getItem('ct_history') || '[]');
  const pending = JSON.parse(localStorage.getItem('ct_pending')  || '[]');

  const fmtTime = (iso) => {
    const t = new Date(iso);
    return t.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
           + ' ' + t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  const fmtNum = (n, d = 2) => parseFloat(n).toLocaleString('ko-KR', { maximumFractionDigits: d });

  // ===== 체결 내역 탭 =====
  const tradeTbody = document.querySelector('#paneTradeHistory tbody');
  if (tradeTbody) {
    const regular = trades.filter(r => !r.tpslType);
    if (!regular.length) {
      tradeTbody.innerHTML = '<tr class="history-table__empty"><td colspan="9">체결 내역이 없습니다</td></tr>';
    } else {
      tradeTbody.innerHTML = regular.map(r => {
        const color = r.side === 'buy' ? 'var(--color-buy)' : 'var(--color-sell)';
        return `<tr>
          <td>${fmtTime(r.time)}</td>
          <td>${r.symbol.replace('USDT', '')}/USDT</td>
          <td style="color:${color}">${r.side === 'buy' ? '매수' : '매도'}</td>
          <td>${r.orderType === 'market' ? '시장가' : '지정가'}</td>
          <td>${fmtNum(r.price)}</td>
          <td>${parseFloat(r.qty).toFixed(6)}</td>
          <td>${fmtNum(r.total)}</td>
          <td>${parseFloat(r.fee).toFixed(4)}</td>
        </tr>`;
      }).join('');
    }
  }

  // ===== 미체결 주문 탭 =====
  const pendingTbody = document.querySelector('#panePending tbody');
  if (pendingTbody) {
    if (!pending.length) {
      pendingTbody.innerHTML = '<tr class="history-table__empty"><td colspan="10">미체결 주문이 없습니다</td></tr>';
    } else {
      pendingTbody.innerHTML = pending.map(o => {
        const color = o.side === 'buy' ? 'var(--color-buy)' : 'var(--color-sell)';
        return `<tr>
          <td>${fmtTime(o.time)}</td>
          <td>${o.symbol.replace('USDT', '')}/USDT</td>
          <td style="color:${color}">${o.side === 'buy' ? '매수' : '매도'}</td>
          <td>지정가</td>
          <td>${fmtNum(o.price)}</td>
          <td>${parseFloat(o.qty).toFixed(6)}</td>
          <td>${fmtNum(o.total)}</td>
          <td>—</td>
          <td>—</td>
        </tr>`;
      }).join('');
    }
  }

  // ===== TP/SL 체결 내역 탭 =====
  const tpslTbody = document.querySelector('#paneTpsl tbody');
  if (tpslTbody) {
    const tpslTrades = trades.filter(r => r.tpslType);
    if (!tpslTrades.length) {
      tpslTbody.innerHTML = '<tr class="history-table__empty"><td colspan="10">TP/SL 체결 내역이 없습니다</td></tr>';
    } else {
      tpslTbody.innerHTML = tpslTrades.map(r => {
        const pnl      = r.realizedPnl ?? 0;
        const pnlColor = pnl >= 0 ? 'var(--color-buy)' : 'var(--color-sell)';
        const typeColor = r.tpslType === 'TP' ? 'var(--color-buy)' : 'var(--color-sell)';
        return `<tr>
          <td>${fmtTime(r.time)}</td>
          <td>${r.symbol.replace('USDT', '')}/USDT</td>
          <td style="color:${typeColor}">${r.tpslType}</td>
          <td>가격</td>
          <td>${r.triggerPrice ? fmtNum(r.triggerPrice) : '—'}</td>
          <td>${fmtNum(r.price)}</td>
          <td>${parseFloat(r.qty).toFixed(6)}</td>
          <td style="color:${pnlColor}">${pnl >= 0 ? '+' : ''}${fmtNum(pnl)}</td>
          <td>${parseFloat(r.fee).toFixed(4)}</td>
        </tr>`;
      }).join('');
    }
  }

});
