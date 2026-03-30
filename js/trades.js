// ===== trades.js =====
// 실시간 체결 내역

const MAX_TRADE_ROWS = 20;
let tradesInitialized = false;

// 심볼 변경 시 목록 초기화
document.addEventListener('symbol:change', () => {
  const list = document.getElementById('recentTradesList');
  if (list) list.innerHTML = '';
  tradesInitialized = false;
});

document.addEventListener('binance:trade', ({ detail: d }) => {
  const list = document.getElementById('recentTradesList');
  if (!list) return;

  // 첫 수신 시 하드코딩 더미 제거
  if (!tradesInitialized) {
    list.innerHTML = '';
    tradesInitialized = true;
  }

  const price  = parseFloat(d.p);
  const amount = parseFloat(d.q);
  const isBuy  = !d.m; // m = isBuyerMarketMaker (true → 매도 aggressive)
  const time   = new Date(d.T).toTimeString().slice(0, 8);

  const li = document.createElement('li');
  li.className = 'recent-trades__row';
  li.innerHTML =
    `<span class="recent-trades__time">${time}</span>` +
    `<span class="recent-trades__price ${isBuy ? 'recent-trades__price--up' : 'recent-trades__price--down'}">` +
      price.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    `</span>` +
    `<span class="recent-trades__amount">${amount.toFixed(4)}</span>`;

  list.insertBefore(li, list.firstChild);

  // 최대 행 수 유지
  while (list.children.length > MAX_TRADE_ROWS) {
    list.removeChild(list.lastChild);
  }
});
