// ===== orderbook.js =====
// 호가창 실시간 렌더링

const BOOK_ROWS = 5;

const fmtPrice  = (p) => parseFloat(p).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtAmount = (a) => parseFloat(a).toFixed(4);

// rows: [[price, qty], ...] — 입력 순서대로 누적 계산
const buildRows = (rows, side) => {
  const fragment = document.createDocumentFragment();
  let cum = 0;

  // 전체 합산 (depth % 기준)
  const total = rows.reduce((s, [, q]) => s + parseFloat(q), 0) || 1;

  rows.forEach(([price, qty]) => {
    cum += parseFloat(qty);
    const depth = Math.round((cum / total) * 100);

    const row = document.createElement('div');
    row.className = `orderbook__row orderbook__row--${side}`;
    row.style.setProperty('--depth', depth + '%');
    row.innerHTML =
      `<span class="orderbook__price">${fmtPrice(price)}</span>` +
      `<span class="orderbook__amount">${fmtAmount(qty)}</span>` +
      `<span class="orderbook__total">${fmtAmount(cum)}</span>`;
    fragment.appendChild(row);
  });

  return fragment;
};

document.addEventListener('binance:depth', ({ detail: d }) => {
  const askList = document.getElementById('askList');
  const bidList = document.getElementById('bidList');
  if (!askList || !bidList) return;

  // asks: Binance → 낮은 가격(best) 먼저
  // 화면 표시: 높은 가격(worst)이 위, best ask가 mid 바로 위
  // → 역순으로 DOM에 삽입 (높은 가격 → 낮은 가격)
  const rawAsks = (d.asks || []).slice(0, BOOK_ROWS);
  const asks    = [...rawAsks].reverse(); // worst(top) → best(bottom)
  askList.innerHTML = '';
  askList.appendChild(buildRows(asks, 'sell'));

  // bids: Binance → 높은 가격(best) 먼저 → 그대로 표시
  const bids = (d.bids || []).slice(0, BOOK_ROWS);
  bidList.innerHTML = '';
  bidList.appendChild(buildRows(bids, 'buy'));
});
