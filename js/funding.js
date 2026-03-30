// ===== funding.js =====
// 선물 펀딩비 — 바이낸스 8시간 주기 (00:00 / 08:00 / 16:00 UTC)

const LS_FUNDING      = 'ct_funding';
const LS_LAST_FUNDING = 'ct_last_funding';
const FUNDING_MS      = 8 * 60 * 60 * 1000; // 8h in ms

// ===== 다음 펀딩 시각 계산 (UTC 0/8/16시) =====
const nextFundingTime = () => {
  const now  = new Date();
  const utcH = now.getUTCHours();
  const next = [0, 8, 16].find(h => h > utcH) ?? 24;
  const t    = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(),
    next === 24 ? now.getUTCDate() + 1 : now.getUTCDate(),
    next === 24 ? 0 : next, 0, 0
  ));
  return t.getTime();
};

// ===== 펀딩비율 조회 (Binance fapi) =====
const fetchFundingRate = async (symbol) => {
  try {
    const res  = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
    const data = await res.json();
    return parseFloat(data.lastFundingRate) || 0.0001;
  } catch {
    return 0.0001; // 기본값 0.01%
  }
};

// ===== 펀딩비 적용 =====
const applyFunding = async () => {
  const st = window._st;
  const h  = window._orderHelpers;
  if (!st || !h) return;

  const futPos = (st.positions || []).filter(p => p.mode === 'futures');
  if (!futPos.length) return;

  const symbols = [...new Set(futPos.map(p => p.symbol))];
  const rates   = {};
  await Promise.all(symbols.map(async s => { rates[s] = await fetchFundingRate(s); }));

  const history = JSON.parse(localStorage.getItem(LS_FUNDING) || '[]');
  let   netFlow = 0; // + = 받음, - = 냄

  futPos.forEach(pos => {
    const rate      = rates[pos.symbol] ?? 0.0001;
    const markPrice = window._priceCache?.[pos.symbol] || pos.entryPrice;
    const posValue  = pos.qty * markPrice;
    const fee       = posValue * rate; // 양수 = 롱 → 숏 방향

    // 롱: rate > 0 → 지급, rate < 0 → 수취
    // 숏: rate > 0 → 수취, rate < 0 → 지급
    const flow = pos.side === 'long' ? -fee : fee;
    st.futuresUsdt = Math.max(0, st.futuresUsdt + flow);
    netFlow += flow;

    history.push({
      time:      new Date().toISOString(),
      symbol:    pos.symbol,
      side:      pos.side,
      posValue:  parseFloat(posValue.toFixed(4)),
      rate:      rate,
      amount:    parseFloat(Math.abs(fee).toFixed(6)),
      direction: flow >= 0 ? 'receive' : 'pay',
    });
  });

  if (history.length > 200) history.splice(0, history.length - 200);
  localStorage.setItem(LS_FUNDING, JSON.stringify(history));
  localStorage.setItem(LS_LAST_FUNDING, Date.now().toString());

  h.saveState();
  h.updateAvailable();

  // 토스트
  if (typeof Toast !== 'undefined') {
    const abs = Math.abs(netFlow).toFixed(4);
    netFlow >= 0
      ? Toast.success(`펀딩비 수취 +${abs} USDT`, '펀딩비')
      : Toast.warning(`펀딩비 지급 -${abs} USDT`, '펀딩비');
  }
};

// ===== 누락된 펀딩 처리 (탭 재진입 시) =====
const catchUpFunding = async () => {
  const lastStr = localStorage.getItem(LS_LAST_FUNDING);
  if (!lastStr) { localStorage.setItem(LS_LAST_FUNDING, Date.now().toString()); return; }

  const last = parseInt(lastStr);
  const now  = Date.now();
  let   t    = last + FUNDING_MS;
  let   cnt  = 0;

  // 최대 3회치 소급 적용
  while (t <= now && cnt < 3) {
    await applyFunding();
    t  += FUNDING_MS;
    cnt++;
  }

  if (cnt) localStorage.setItem(LS_LAST_FUNDING, now.toString());
};

// ===== 다음 펀딩 예약 =====
const scheduleFunding = () => {
  const delay = nextFundingTime() - Date.now();
  setTimeout(async () => {
    await applyFunding();
    scheduleFunding(); // 재귀 예약
  }, delay);
};

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', async () => {
  await catchUpFunding();
  scheduleFunding();
});
