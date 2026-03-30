// ===== portfolio.js =====
// 포트폴리오 페이지 — 현재 자산 현황 + 수익률 차트

document.addEventListener('DOMContentLoaded', async () => {

  const INIT_TOTAL = 100;
  const fmtN = (n, d = 2) => parseFloat(n).toLocaleString('ko-KR', { maximumFractionDigits: d });
  const fmtP = (n) => (n >= 0 ? '+' : '') + fmtN(n) + ' USDT';

  // ===== localStorage 로드 =====
  const saved     = JSON.parse(localStorage.getItem('ct_state')     || 'null');
  const positions = JSON.parse(localStorage.getItem('ct_positions') || '[]');
  const trades    = JSON.parse(localStorage.getItem('ct_history')   || '[]');
  const snapshots = JSON.parse(localStorage.getItem('ct_snapshots') || '[]');

  const spotUsdt    = saved?.spotUsdt    ?? 100;
  const futuresUsdt = saved?.futuresUsdt ?? 0;

  // ===== 헤더 잔고 =====
  const balEls = document.querySelectorAll('.header__balance-value');
  if (balEls[0]) balEls[0].textContent = parseFloat(spotUsdt).toFixed(2);
  if (balEls[1]) balEls[1].textContent = parseFloat(futuresUsdt).toFixed(2);

  // ===== Binance 현재가 조회 =====
  const SYMBOLS = ['BTCUSDT', 'ETHUSDT'];
  const prices  = {};
  try {
    const syms = SYMBOLS.map(s => `"${s}"`).join(',');
    const res  = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=[${syms}]`);
    const data = await res.json();
    data.forEach(d => { prices[d.symbol] = parseFloat(d.price); });
  } catch (e) {
    SYMBOLS.forEach(s => { prices[s] = 0; });
  }

  // ===== 현물 포지션 평가 =====
  const spotPositions = positions.filter(p => p.mode === 'spot');
  const spotCoinValue = spotPositions.reduce((s, p) => {
    const cp = prices[p.symbol] || p.entryPrice;
    return s + p.qty * cp;
  }, 0);
  const spotTotal = spotUsdt + spotCoinValue;

  // ===== 선물 포지션 미실현 PnL =====
  const futPositions  = positions.filter(p => p.mode === 'futures');
  const futuresPnl    = futPositions.reduce((s, p) => {
    const cp  = prices[p.symbol] || p.entryPrice;
    const dir = p.side === 'long' ? 1 : -1;
    return s + (cp - p.entryPrice) * p.qty * dir;
  }, 0);
  const futuresTotal = futuresUsdt + futuresPnl;

  // ===== 총 실현 PnL (체결 내역에서 계산) =====
  const realizedPnl = trades.reduce((s, r) => s + (r.realizedPnl ?? 0) - r.fee, 0);

  // ===== 총 자산 =====
  const totalAsset   = spotTotal + futuresTotal;
  const totalPnl     = totalAsset - INIT_TOTAL;
  const totalPnlPct  = (totalPnl / INIT_TOTAL * 100).toFixed(2);

  // ===== 요약 카드 업데이트 =====
  const summaryCards = document.querySelectorAll('.summary-card__value');
  const summaryPnlEl = document.querySelector('.summary-pnl');

  if (summaryCards[0]) summaryCards[0].textContent = fmtN(totalAsset) + ' USDT';
  if (summaryCards[1]) summaryCards[1].textContent = fmtN(spotTotal)   + ' USDT';
  if (summaryCards[2]) summaryCards[2].textContent = fmtN(futuresTotal) + ' USDT';
  if (summaryCards[3]) {
    summaryCards[3].textContent = fmtP(realizedPnl);
    summaryCards[3].style.color = realizedPnl >= 0 ? 'var(--color-buy)' : 'var(--color-sell)';
  }
  if (summaryPnlEl) {
    const isPos = totalPnl >= 0;
    summaryPnlEl.textContent = `${isPos ? '+' : ''}${fmtN(totalPnl)} USDT (${isPos ? '+' : ''}${totalPnlPct}%)`;
    summaryPnlEl.style.color = isPos ? 'var(--color-buy)' : 'var(--color-sell)';
  }

  // ===== 현물 보유 자산 테이블 =====
  const spotTbody = document.querySelector('.portfolio-section:nth-child(1) tbody, .portfolio-section tbody');
  const allTbodies = document.querySelectorAll('.portfolio-section tbody');
  const spotTableBody    = allTbodies[0];
  const futuresTableBody = allTbodies[1];

  if (spotTableBody) {
    if (!spotPositions.length && spotUsdt <= 0) {
      spotTableBody.innerHTML = '<tr class="history-table__empty"><td colspan="7">보유 중인 현물 자산이 없습니다</td></tr>';
    } else {
      const rows = [];

      // USDT 잔고 행
      if (spotUsdt > 0.001) {
        rows.push(`<tr>
          <td>USDT</td>
          <td>${fmtN(spotUsdt)}</td>
          <td>—</td>
          <td>1.00</td>
          <td>${fmtN(spotUsdt)}</td>
          <td>—</td>
          <td>—</td>
        </tr>`);
      }

      // 코인 포지션 행
      spotPositions.forEach(pos => {
        const cp    = prices[pos.symbol] || pos.entryPrice;
        const val   = pos.qty * cp;
        const pnl   = (cp - pos.entryPrice) * pos.qty;
        const roi   = pos.margin > 0 ? pnl / pos.margin * 100 : 0;
        const base  = pos.symbol.replace('USDT', '');
        const color = pnl >= 0 ? 'var(--color-buy)' : 'var(--color-sell)';
        rows.push(`<tr>
          <td>${base}</td>
          <td>${pos.qty.toFixed(6)}</td>
          <td>${fmtN(pos.entryPrice)}</td>
          <td>${fmtN(cp)}</td>
          <td>${fmtN(val)}</td>
          <td style="color:${color}">${pnl >= 0 ? '+' : ''}${fmtN(pnl)}</td>
          <td style="color:${color}">${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%</td>
        </tr>`);
      });

      spotTableBody.innerHTML = rows.join('') || '<tr class="history-table__empty"><td colspan="7">보유 중인 현물 자산이 없습니다</td></tr>';
    }
  }

  // ===== 선물 포지션 테이블 =====
  if (futuresTableBody) {
    if (!futPositions.length) {
      futuresTableBody.innerHTML = '<tr class="history-table__empty"><td colspan="9">보유 중인 선물 포지션이 없습니다</td></tr>';
    } else {
      futuresTableBody.innerHTML = futPositions.map(pos => {
        const cp    = prices[pos.symbol] || pos.entryPrice;
        const dir   = pos.side === 'long' ? 1 : -1;
        const pnl   = (cp - pos.entryPrice) * pos.qty * dir;
        const roi   = pos.margin > 0 ? pnl / pos.margin * 100 : 0;
        const liq   = pos.side === 'long'
          ? pos.entryPrice * (1 - 1 / pos.leverage)
          : pos.entryPrice * (1 + 1 / pos.leverage);
        const base  = pos.symbol.replace('USDT', '');
        const color = pnl >= 0 ? 'var(--color-buy)' : 'var(--color-sell)';
        const sideColor = pos.side === 'long' ? 'var(--color-buy)' : 'var(--color-sell)';
        return `<tr>
          <td>${base}/USDT</td>
          <td style="color:${sideColor}">${pos.side === 'long' ? '롱' : '숏'}</td>
          <td>${pos.leverage}x</td>
          <td>${fmtN(pos.entryPrice)}</td>
          <td>${fmtN(cp)}</td>
          <td>${pos.qty.toFixed(6)}</td>
          <td style="color:${color}">${pnl >= 0 ? '+' : ''}${fmtN(pnl)}</td>
          <td style="color:${color}">${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%</td>
          <td>${fmtN(liq)}</td>
        </tr>`;
      }).join('');
    }
  }

  // ===== 수익률 차트 (Lightweight Charts) =====
  if (typeof LightweightCharts === 'undefined') return;

  const chartOpts = {
    autoSize: true,
    layout: { background: { type: 'solid', color: '#1e2026' }, textColor: '#848e9c' },
    grid:   { vertLines: { color: '#2b2f36' }, horzLines: { color: '#2b2f36' } },
    rightPriceScale: { borderColor: '#2b2f36' },
    timeScale: { borderColor: '#2b2f36', timeVisible: true },
  };

  // ── 총 자산 변화 (라인 차트) ──
  const lineContainer = document.getElementById('portfolioLineChart');
  if (lineContainer && snapshots.length > 1) {
    lineContainer.innerHTML = '';
    lineContainer.style.height = '100%';

    const lineChart  = LightweightCharts.createChart(lineContainer, chartOpts);
    const areaSeries = lineChart.addAreaSeries({
      lineColor:   '#f0b90b',
      topColor:    'rgba(240,185,11,0.15)',
      bottomColor: 'rgba(240,185,11,0)',
      lineWidth: 2,
    });

    // 중복 time 제거 (같은 초에 여러 스냅샷)
    const deduped = [];
    snapshots.forEach(s => {
      if (!deduped.length || deduped[deduped.length - 1].time !== s.time) {
        deduped.push({ time: s.time, value: s.total });
      } else {
        deduped[deduped.length - 1].value = s.total;
      }
    });

    areaSeries.setData(deduped);
    lineChart.timeScale().fitContent();
  }

  // ── 일별 손익 (히스토그램) ──
  const barContainer = document.getElementById('portfolioBarChart');
  if (barContainer && trades.length) {
    barContainer.innerHTML = '';
    barContainer.style.height = '100%';

    const barChart  = LightweightCharts.createChart(barContainer, chartOpts);
    const histSeries = barChart.addHistogramSeries({
      color: '#0ecb81',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });

    // 일별 실현 PnL 집계
    const dailyMap = {};
    trades.forEach(r => {
      const date = r.time.slice(0, 10);
      if (!dailyMap[date]) dailyMap[date] = 0;
      dailyMap[date] += (r.realizedPnl ?? 0) - r.fee;
    });

    const histData = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, pnl]) => ({
        time:  date,
        value: parseFloat(pnl.toFixed(2)),
        color: pnl >= 0 ? '#0ecb81' : '#f6465d',
      }));

    if (histData.length) {
      histSeries.setData(histData);
      barChart.timeScale().fitContent();
    }
  }

});
