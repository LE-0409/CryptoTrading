// ===== api.js =====
// Binance WebSocket 연결 관리자

const BinanceWS = (() => {
  const SYMBOLS = ['BTCUSDT', 'ETHUSDT'];

  let ws             = null;
  let reconnectTimer = null;
  let activeSym      = 'BTCUSDT';
  let activeTf       = '1h';
  let alive          = true;

  const buildUrl = () => {
    const s       = activeSym.toLowerCase();
    const tickers = SYMBOLS.map(x => `${x.toLowerCase()}@ticker`).join('/');
    return `wss://stream.binance.com:9443/stream?streams=${tickers}/${s}@depth20@100ms/${s}@trade/${s}@kline_${activeTf}`;
  };

  const emit = (type, data) =>
    document.dispatchEvent(new CustomEvent(type, { detail: data }));

  const connect = () => {
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
    clearTimeout(reconnectTimer);

    ws = new WebSocket(buildUrl());

    ws.onmessage = ({ data }) => {
      const msg    = JSON.parse(data);
      const stream = msg.stream || '';
      const d      = msg.data  || msg;

      if      (stream.endsWith('@ticker'))     emit('binance:ticker', d);
      else if (stream.includes('@depth'))      emit('binance:depth',  d);
      else if (stream.endsWith('@trade'))      emit('binance:trade',  d);
      else if (stream.includes('@kline'))      emit('binance:kline',  d);
    };

    ws.onclose = () => {
      if (alive) reconnectTimer = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
  };

  // DOMContentLoaded 이후 자동 시작
  document.addEventListener('DOMContentLoaded', connect);

  return {
    setSymbol:   (s) => { if (s !== activeSym) { activeSym = s; connect(); } },
    setInterval: (i) => { if (i !== activeTf)  { activeTf  = i; connect(); } },
    getSymbol:   ()  => activeSym,
  };
})();
