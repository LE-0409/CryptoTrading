// ===== chart.js =====
// TradingView Lightweight Charts + Binance REST API 연동

document.addEventListener('DOMContentLoaded', () => {

  const container   = document.getElementById('tradingChart');
  const placeholder = document.getElementById('chartPlaceholder');
  if (!container || typeof LightweightCharts === 'undefined') return;

  // ===== 상태 =====
  let currentSymbol   = 'BTCUSDT';
  let currentInterval = '1h';
  let chartType       = 'candlestick'; // 'candlestick' | 'line'

  // ===== 차트 생성 =====
  const chart = LightweightCharts.createChart(container, {
    autoSize: true,
    layout: {
      background: { type: 'solid', color: '#1e2026' },
      textColor: '#848e9c',
    },
    grid: {
      vertLines: { color: '#2b2f36' },
      horzLines: { color: '#2b2f36' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
    },
    rightPriceScale: {
      borderColor: '#2b2f36',
    },
    timeScale: {
      borderColor: '#2b2f36',
      timeVisible: true,
      secondsVisible: false,
    },
    localization: {
      priceFormatter: price =>
        price.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
  });

  // ===== 시리즈 =====
  const candleSeries = chart.addCandlestickSeries({
    upColor:        '#0ecb81',
    downColor:      '#f6465d',
    borderUpColor:  '#0ecb81',
    borderDownColor:'#f6465d',
    wickUpColor:    '#0ecb81',
    wickDownColor:  '#f6465d',
  });

  const lineSeries = chart.addLineSeries({
    color:      '#f0b90b',
    lineWidth:  2,
    visible:    false,
  });

  // ===== Binance klines 조회 =====
  const fetchKlines = async (symbol, interval) => {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`;
      const res  = await fetch(url);
      const data = await res.json();

      if (!Array.isArray(data)) throw new Error('데이터 형식 오류');

      const candles = data.map(k => ({
        time:  k[0] / 1000,           // ms → s
        open:  parseFloat(k[1]),
        high:  parseFloat(k[2]),
        low:   parseFloat(k[3]),
        close: parseFloat(k[4]),
      }));

      candleSeries.setData(candles);
      lineSeries.setData(candles.map(c => ({ time: c.time, value: c.close })));

      // 심볼 전환 시 y축 자동 스케일 리셋 (이전 심볼의 가격대에 고정되는 현상 방지)
      chart.priceScale('right').applyOptions({ autoScale: true });

      // 플레이스홀더 숨기기
      if (placeholder) placeholder.style.display = 'none';
    } catch (err) {
      console.error('[chart] 데이터 로딩 실패:', err);
      if (placeholder) {
        placeholder.querySelector('span:last-child').textContent = '차트 로딩 실패 — 새로고침';
      }
    }
  };

  // ===== 초기 로딩 =====
  fetchKlines(currentSymbol, currentInterval);

  // ===== 타임프레임 버튼 =====
  const tfMap = {
    '1m': '1m', '5m': '5m', '15m': '15m',
    '1H': '1h', '4H': '4h', '1D': '1d', '1W': '1w',
  };
  const tfButtons = document.querySelectorAll('.chart__tf-btn');

  tfButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tf = tfMap[btn.textContent.trim()];
      if (!tf || tf === currentInterval) return;

      tfButtons.forEach(b => b.classList.remove('chart__tf-btn--active'));
      btn.classList.add('chart__tf-btn--active');

      currentInterval = tf;
      fetchKlines(currentSymbol, currentInterval);
      BinanceWS.setInterval(tf);
    });
  });

  // ===== 차트 유형 버튼 =====
  const typeButtons = document.querySelectorAll('.chart__type-btn');

  // 첫 번째 버튼(캔들) 기본 활성화
  if (typeButtons[0]) typeButtons[0].classList.add('chart__type-btn--active');

  typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      typeButtons.forEach(b => b.classList.remove('chart__type-btn--active'));
      btn.classList.add('chart__type-btn--active');

      const isCandlestick = btn.textContent.trim() === '캔들';
      chartType = isCandlestick ? 'candlestick' : 'line';

      candleSeries.applyOptions({ visible: isCandlestick });
      lineSeries.applyOptions({ visible: !isCandlestick });
    });
  });

  // ===== 코인 사이드바 클릭 시 심볼 전환 =====
  document.getElementById('coinList')?.addEventListener('click', e => {
    const coin = e.target.closest('[data-symbol]');
    if (!coin) return;

    const symbol = coin.dataset.symbol;
    if (symbol === currentSymbol) return;

    // 사이드바 활성화 표시
    document.querySelectorAll('.sidebar__coin').forEach(el =>
      el.classList.toggle('sidebar__coin--active', el.dataset.symbol === symbol));

    currentSymbol = symbol;
    if (placeholder) placeholder.style.display = 'flex';
    fetchKlines(currentSymbol, currentInterval);
    BinanceWS.setSymbol(symbol);

    // 다른 모듈에 심볼 변경 알림
    document.dispatchEvent(new CustomEvent('symbol:change', { detail: { symbol } }));
  });

  // ===== 포지션 라인 (청산 / TP / SL) =====
  let _posLines = [];

  const clearPositionLines = () => {
    _posLines.forEach(({ line }) => {
      try { candleSeries.removePriceLine(line); } catch (_) {}
    });
    _posLines = [];
  };

  const updatePositionLines = (positions) => {
    clearPositionLines();
    positions
      .filter(pos => pos.symbol === currentSymbol)
      .forEach(pos => {
        if (pos.mode === 'futures') {
          const liq = pos.side === 'long'
            ? pos.entryPrice * (1 - 1 / pos.leverage)
            : pos.entryPrice * (1 + 1 / pos.leverage);
          _posLines.push({ line: candleSeries.createPriceLine({
            price: liq,
            color: '#f6465d',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'Liq',
          })});
        }
        if (pos.tp) {
          _posLines.push({ line: candleSeries.createPriceLine({
            price: pos.tp,
            color: '#0ecb81',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'TP',
          })});
        }
        if (pos.sl) {
          _posLines.push({ line: candleSeries.createPriceLine({
            price: pos.sl,
            color: '#f0b90b',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'SL',
          })});
        }
      });
  };

  document.addEventListener('positions:changed', ({ detail: { positions } }) => {
    updatePositionLines(positions);
  });

  document.addEventListener('symbol:change', () => {
    updatePositionLines(window._st?.positions || []);
  });

  // ===== 실시간 캔들 업데이트 (WebSocket) =====
  document.addEventListener('binance:kline', ({ detail: d }) => {
    const k      = d.k;
    const candle = {
      time:  k.t / 1000,
      open:  parseFloat(k.o),
      high:  parseFloat(k.h),
      low:   parseFloat(k.l),
      close: parseFloat(k.c),
    };
    candleSeries.update(candle);
    lineSeries.update({ time: candle.time, value: candle.close });
  });

});
