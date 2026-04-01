// ===== indicators.js =====
// 보조 지표 순수 계산 함수 모음

const Indicators = (() => {

  // ===== 내부 헬퍼 =====

  // EMA 배열 계산 (내부용, 결과 배열 반환)
  function _emaArr(values, period) {
    const k = 2 / (period + 1);
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i];
    out[period - 1] = sum / period;
    for (let i = period; i < values.length; i++) {
      out[i] = values[i] * k + out[i - 1] * (1 - k);
    }
    return out;
  }

  // ===== MA (단순이동평균) =====
  // returns: [{ time, value }]
  function calcMA(candles, period) {
    const result = [];
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
      sum += candles[i].close;
      if (i >= period) sum -= candles[i - period].close;
      if (i >= period - 1) {
        result.push({ time: candles[i].time, value: sum / period });
      }
    }
    return result;
  }

  // ===== 볼린저 밴드 =====
  // returns: { upper, middle, lower } — 각각 [{ time, value }]
  function calcBB(candles, period = 20, stdDevMult = 2) {
    const upper = [], middle = [], lower = [];
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
      sum += candles[i].close;
      if (i >= period) sum -= candles[i - period].close;
      if (i < period - 1) continue;
      const mean = sum / period;
      let variance = 0;
      for (let j = i - period + 1; j <= i; j++) {
        variance += (candles[j].close - mean) ** 2;
      }
      const std = Math.sqrt(variance / period);
      const t = candles[i].time;
      upper.push({ time: t, value: mean + stdDevMult * std });
      middle.push({ time: t, value: mean });
      lower.push({ time: t, value: mean - stdDevMult * std });
    }
    return { upper, middle, lower };
  }

  // ===== RSI =====
  // returns: [{ time, value }]
  function calcRSI(candles, period = 14) {
    if (candles.length < period + 1) return [];
    const result = [];
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      if (diff > 0) avgGain += diff;
      else avgLoss -= diff;
    }
    avgGain /= period;
    avgLoss /= period;
    const rsiVal = () => avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: candles[period].time, value: rsiVal() });
    for (let i = period + 1; i < candles.length; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
      result.push({ time: candles[i].time, value: rsiVal() });
    }
    return result;
  }

  // ===== MACD =====
  // returns: { macd, signal, histogram } — 각각 [{ time, value }] / histogram은 color 포함
  function calcMACD(candles, fast = 12, slow = 26, signal = 9) {
    const closes = candles.map(c => c.close);
    const emaFast = _emaArr(closes, fast);
    const emaSlow = _emaArr(closes, slow);

    // MACD 라인 (slow EMA가 유효해지는 시점부터)
    const macdRaw = [];
    for (let i = slow - 1; i < closes.length; i++) {
      if (emaFast[i] === null || emaSlow[i] === null) continue;
      macdRaw.push({ time: candles[i].time, value: emaFast[i] - emaSlow[i] });
    }

    // 시그널 라인 (MACD의 EMA)
    const macdValues = macdRaw.map(d => d.value);
    const sigArr = _emaArr(macdValues, signal);

    const macdSeries = [], signalSeries = [], histSeries = [];
    for (let i = signal - 1; i < macdRaw.length; i++) {
      if (sigArr[i] === null) continue;
      const t = macdRaw[i].time;
      const m = macdRaw[i].value;
      const s = sigArr[i];
      const h = m - s;
      macdSeries.push({ time: t, value: m });
      signalSeries.push({ time: t, value: s });
      histSeries.push({ time: t, value: h, color: h >= 0 ? '#0ecb81' : '#f6465d' });
    }
    return { macd: macdSeries, signal: signalSeries, histogram: histSeries };
  }

  // ===== 스토캐스틱 =====
  // returns: { k, d } — 각각 [{ time, value }]
  function calcStochastic(candles, kPeriod = 14, dPeriod = 3, smooth = 3) {
    // Raw %K
    const rawK = [];
    for (let i = kPeriod - 1; i < candles.length; i++) {
      let lo = Infinity, hi = -Infinity;
      for (let j = i - kPeriod + 1; j <= i; j++) {
        if (candles[j].low < lo) lo = candles[j].low;
        if (candles[j].high > hi) hi = candles[j].high;
      }
      const range = hi - lo;
      rawK.push({ time: candles[i].time, value: range === 0 ? 50 : ((candles[i].close - lo) / range) * 100 });
    }

    // Smooth %K
    const kSeries = [];
    for (let i = smooth - 1; i < rawK.length; i++) {
      let sum = 0;
      for (let j = i - smooth + 1; j <= i; j++) sum += rawK[j].value;
      kSeries.push({ time: rawK[i].time, value: sum / smooth });
    }

    // %D = SMA of smooth %K
    const dSeries = [];
    for (let i = dPeriod - 1; i < kSeries.length; i++) {
      let sum = 0;
      for (let j = i - dPeriod + 1; j <= i; j++) sum += kSeries[j].value;
      dSeries.push({ time: kSeries[i].time, value: sum / dPeriod });
    }

    return { k: kSeries, d: dSeries };
  }

  // ===== ATR =====
  // returns: [{ time, value }]
  function calcATR(candles, period = 14) {
    if (candles.length < period + 1) return [];
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
      trs.push(Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low  - candles[i - 1].close),
      ));
    }
    let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const result = [{ time: candles[period].time, value: atr }];
    for (let i = period; i < trs.length; i++) {
      atr = (atr * (period - 1) + trs[i]) / period;
      result.push({ time: candles[i + 1].time, value: atr });
    }
    return result;
  }

  // ===== CCI =====
  // returns: [{ time, value }]
  function calcCCI(candles, period = 20) {
    const result = [];
    for (let i = period - 1; i < candles.length; i++) {
      let sum = 0;
      const typicals = [];
      for (let j = i - period + 1; j <= i; j++) {
        const tp = (candles[j].high + candles[j].low + candles[j].close) / 3;
        typicals.push(tp);
        sum += tp;
      }
      const mean = sum / period;
      const meanDev = typicals.reduce((a, tp) => a + Math.abs(tp - mean), 0) / period;
      const tp = typicals[typicals.length - 1];
      result.push({ time: candles[i].time, value: meanDev === 0 ? 0 : (tp - mean) / (0.015 * meanDev) });
    }
    return result;
  }

  // ===== Volume =====
  // returns: [{ time, value, color }]
  function calcVolume(candles, upColor = '#0ecb8155', downColor = '#f6465d55') {
    return candles.map(c => ({
      time: c.time,
      value: c.volume || 0,
      color: c.close >= c.open ? upColor : downColor,
    }));
  }

  // ===== Volume MA =====
  // returns: [{ time, value }]
  function calcVolumeMA(candles, period = 20) {
    const result = [];
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
      sum += (candles[i].volume || 0);
      if (i >= period) sum -= (candles[i - period].volume || 0);
      if (i >= period - 1) {
        result.push({ time: candles[i].time, value: sum / period });
      }
    }
    return result;
  }

  return { calcMA, calcBB, calcRSI, calcMACD, calcStochastic, calcATR, calcCCI, calcVolume, calcVolumeMA };
})();
