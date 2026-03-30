// ===== ticker.js =====
// 티커 바 + 사이드바 실시간 업데이트

const formatPrice = (p, digits = 2) =>
  parseFloat(p).toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const formatQuoteVol = (v) => {
  v = parseFloat(v);
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B USDT';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M USDT';
  return v.toLocaleString('ko-KR', { maximumFractionDigits: 0 }) + ' USDT';
};

document.addEventListener('binance:ticker', ({ detail: d }) => {
  const symbol = d.s;
  const price  = parseFloat(d.c);
  const change = parseFloat(d.P);
  const isUp   = change >= 0;

  // ===== 사이드바 =====
  const coinEl = document.querySelector(`.sidebar__coin[data-symbol="${symbol}"]`);
  if (coinEl) {
    const priceEl  = coinEl.querySelector('.sidebar__coin-price');
    const changeEl = coinEl.querySelector('.sidebar__coin-change');
    if (priceEl)  priceEl.textContent  = Math.round(price).toLocaleString('ko-KR');
    if (changeEl) {
      changeEl.textContent = (isUp ? '+' : '') + change.toFixed(2) + '%';
      changeEl.className   = 'sidebar__coin-change ' + (isUp ? 'sidebar__coin-change--up' : 'sidebar__coin-change--down');
    }
  }

  // ===== 티커 바 (활성 심볼만) =====
  if (symbol !== BinanceWS.getSymbol()) return;

  const base = symbol.replace('USDT', '');

  // 페어명
  const pairEl = document.querySelector('.ticker__symbol');
  if (pairEl) pairEl.textContent = `${base} / USDT`;

  // 현재가
  const priceEl = document.getElementById('tickerPrice');
  if (priceEl) {
    priceEl.textContent = formatPrice(price);
    priceEl.className   = 'ticker__price ' + (isUp ? 'ticker__price--up' : 'ticker__price--down');
  }

  // 24h 변동
  const changeEl = document.getElementById('ticker24hChange');
  if (changeEl) {
    changeEl.textContent = (isUp ? '+' : '') + change.toFixed(2) + '%';
    changeEl.className   = 'ticker__stat-value ' + (isUp ? 'ticker__stat-value--up' : 'ticker__stat-value--down');
  }

  // 고가 / 저가
  const highEl = document.getElementById('ticker24hHigh');
  const lowEl  = document.getElementById('ticker24hLow');
  if (highEl) highEl.textContent = formatPrice(d.h);
  if (lowEl)  lowEl.textContent  = formatPrice(d.l);

  // 거래량
  const volEl  = document.getElementById('ticker24hVol');
  const qvolEl = document.getElementById('ticker24hQuoteVol');
  if (volEl)  volEl.textContent  = parseFloat(d.v).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  if (qvolEl) qvolEl.textContent = formatQuoteVol(d.q);

  // 미드 프라이스 (order.js가 참조)
  const midEl = document.getElementById('midPrice');
  if (midEl) {
    midEl.textContent = formatPrice(price);
    midEl.className   = 'orderbook__mid-price ' + (isUp ? 'orderbook__mid-price--up' : 'orderbook__mid-price--down');
  }
  const midUsdEl = document.querySelector('.orderbook__mid-usd');
  if (midUsdEl) midUsdEl.textContent = '≈ $' + formatPrice(price);
});
