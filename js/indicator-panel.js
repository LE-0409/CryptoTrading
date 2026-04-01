// ===== indicator-panel.js =====
// 보조 지표 UI 패널 + 서브패널 차트 관리

const IndicatorPanel = (() => {

  // ===== 기본 설정 =====
  const DEFAULTS = {
    ma: {
      label: '이동평균선', group: 'trend', enabled: false,
      lines: [
        { period: 7,  color: '#f0b90b', enabled: true },
        { period: 25, color: '#3a86ff', enabled: true },
        { period: 99, color: '#ff6b9d', enabled: true },
      ],
    },
    bb: {
      label: '볼린저 밴드', group: 'trend', enabled: false,
      period: 20, stdDev: 2,
      upperColor: '#9c27b0', middleColor: '#9c27b099', lowerColor: '#9c27b0',
    },
    rsi: {
      label: 'RSI', group: 'oscillator', enabled: false,
      period: 14, color: '#e91e63',
    },
    macd: {
      label: 'MACD', group: 'oscillator', enabled: false,
      fast: 12, slow: 26, signal: 9,
      macdColor: '#2196f3', signalColor: '#ff9800',
    },
    stoch: {
      label: '스토캐스틱', group: 'oscillator', enabled: false,
      kPeriod: 14, dPeriod: 3,
      kColor: '#2196f3', dColor: '#ff9800',
    },
    atr: {
      label: 'ATR', group: 'oscillator', enabled: false,
      period: 14, color: '#00bcd4',
    },
    cci: {
      label: 'CCI', group: 'oscillator', enabled: false,
      period: 20, color: '#9c27b0',
    },
    volume: {
      label: 'Volume', group: 'volume', enabled: false,
      upColor: '#0ecb8155', downColor: '#f6465d55',
    },
    volumeMA: {
      label: 'Volume MA', group: 'volume', enabled: false,
      period: 20, color: '#f0b90b',
    },
  };

  const GROUP_LABELS = { trend: '트렌드', oscillator: '오실레이터', volume: '거래량' };
  const LS_KEY = 'ct_indicators';

  const _fmtV = v => {
    if (v >= 1e9) return (v / 1e9).toFixed(3) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(3) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(3) + 'K';
    return v.toFixed(2);
  };

  // ===== 상태 =====
  let _settings = _loadSettings();
  let _candles = [];
  let _overlaySeries = {};   // { ma: [s1,s2,s3], bb: [upper,mid,lower] }
  let _subPanels = {};       // { rsi: { chart, container, series:{} } }
  let _syncLock = false;

  // ===== 설정 로드/저장 =====
  function _loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      const result = {};
      for (const key of Object.keys(DEFAULTS)) {
        result[key] = { ...JSON.parse(JSON.stringify(DEFAULTS[key])), ...saved[key] };
        if (key === 'ma' && Array.isArray(saved[key]?.lines)) {
          result[key].lines = saved[key].lines;
        }
      }
      return result;
    } catch {
      return JSON.parse(JSON.stringify(DEFAULTS));
    }
  }

  function _saveSettings() {
    const out = {};
    for (const [k, v] of Object.entries(_settings)) {
      const { label: _l, group: _g, ...rest } = v;
      out[k] = rest;
    }
    localStorage.setItem(LS_KEY, JSON.stringify(out));
  }

  // ===== 지표 패널 UI =====
  const _panelOverlay = document.getElementById('indPanelOverlay');
  const _panelList    = document.getElementById('indPanelList');
  const _panelSearch  = document.getElementById('indPanelSearch');

  document.getElementById('indBtn')?.addEventListener('click', () => {
    _renderPanelList();
    _panelOverlay?.classList.add('ind-panel-overlay--open');
  });

  document.getElementById('indPanelClose')?.addEventListener('click', _closePanel);
  _panelOverlay?.addEventListener('click', e => { if (e.target === _panelOverlay) _closePanel(); });
  _panelSearch?.addEventListener('input', () => _renderPanelList(_panelSearch.value));

  function _closePanel() {
    _panelOverlay?.classList.remove('ind-panel-overlay--open');
  }

  function _renderPanelList(query = '') {
    if (!_panelList) return;
    const q = query.trim().toLowerCase();
    let html = '';

    for (const [groupKey, groupLabel] of Object.entries(GROUP_LABELS)) {
      const items = Object.entries(_settings).filter(([, v]) =>
        v.group === groupKey && (!q || v.label.toLowerCase().includes(q))
      );
      if (!items.length) continue;

      html += `<div class="ind-panel__group">${groupLabel}</div>`;
      for (const [key, val] of items) {
        html += `
          <div class="ind-panel__item">
            <span class="ind-panel__item-name">${val.label}</span>
            <div class="ind-panel__item-actions">
              <button class="ind-panel__settings-btn" data-key="${key}" title="설정">⚙</button>
              <button class="ind-panel__toggle-btn ${val.enabled ? 'ind-panel__toggle-btn--on' : ''}" data-key="${key}">
                ${val.enabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>`;
      }
    }

    _panelList.innerHTML = html;

    _panelList.querySelectorAll('.ind-panel__toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        _settings[key].enabled = !_settings[key].enabled;
        _saveSettings();
        _renderPanelList(_panelSearch?.value || '');
        _applyIndicators();
      });
    });

    _panelList.querySelectorAll('.ind-panel__settings-btn').forEach(btn => {
      btn.addEventListener('click', () => _openSettings(btn.dataset.key));
    });
  }

  // ===== 설정 모달 =====
  const _settingsModal  = document.getElementById('indSettingsModal');
  const _settingsTitle  = document.getElementById('indSettingsTitle');
  const _settingsBody   = document.getElementById('indSettingsBody');

  let _editingKey  = null;
  let _tempSetting = null;

  document.getElementById('indSettingsClose')?.addEventListener('click',  _closeSettings);
  document.getElementById('indSettingsCancel')?.addEventListener('click', _closeSettings);
  _settingsModal?.addEventListener('click', e => { if (e.target === _settingsModal) _closeSettings(); });

  document.getElementById('indSettingsConfirm')?.addEventListener('click', () => {
    if (!_editingKey || !_tempSetting) return;
    _readForm(_editingKey);
    Object.assign(_settings[_editingKey], _tempSetting);
    _saveSettings();
    _closeSettings();
    if (_settings[_editingKey].enabled) _applyIndicators();
  });

  function _closeSettings() {
    _settingsModal?.classList.remove('modal-overlay--open');
    _editingKey = _tempSetting = null;
  }

  function _openSettings(key) {
    _editingKey  = key;
    _tempSetting = JSON.parse(JSON.stringify(_settings[key]));
    if (_settingsTitle) _settingsTitle.textContent = `${_settings[key].label} 설정`;
    _renderSettingsBody(key);
    _settingsModal?.classList.add('modal-overlay--open');
  }

  function _colorField(id, label, value) {
    return `<div class="ind-settings__field">
      <label class="ind-settings__label">${label}</label>
      <div class="ind-settings__color-wrap">
        <input type="color" class="ind-settings__color" id="${id}" value="${value.slice(0,7)}" />
      </div>
    </div>`;
  }

  function _numField(id, label, value, min, max, step = 1) {
    return `<div class="ind-settings__field">
      <label class="ind-settings__label">${label}</label>
      <input type="number" class="ind-settings__number" id="${id}" value="${value}" min="${min}" max="${max}" step="${step}" />
    </div>`;
  }

  function _renderSettingsBody(key) {
    if (!_settingsBody) return;
    const s = _tempSetting;
    let html = '';

    switch (key) {
      case 'ma':
        s.lines.forEach((line, i) => {
          html += `<div class="ind-settings__ma-line">
            <label class="ind-settings__check-label">
              <input type="checkbox" id="ma-en-${i}" ${line.enabled ? 'checked' : ''} />
              <span>MA ${i + 1}</span>
            </label>
            ${_numField(`ma-p-${i}`, '기간', line.period, 1, 500)}
            ${_colorField(`ma-c-${i}`, '색상', line.color)}
          </div>`;
        });
        break;
      case 'bb':
        html += _numField('bb-period', '기간', s.period, 2, 500);
        html += _numField('bb-std', '표준편차', s.stdDev, 0.1, 10, 0.1);
        html += _colorField('bb-upper', '상단 밴드', s.upperColor);
        html += _colorField('bb-mid', '중간선', s.middleColor);
        html += _colorField('bb-lower', '하단 밴드', s.lowerColor);
        break;
      case 'rsi':
        html += _numField('rsi-p', '기간', s.period, 2, 500);
        html += _colorField('rsi-c', '색상', s.color);
        break;
      case 'macd':
        html += _numField('macd-fast', '단기 기간', s.fast, 2, 100);
        html += _numField('macd-slow', '장기 기간', s.slow, 2, 200);
        html += _numField('macd-sig', '시그널 기간', s.signal, 2, 100);
        html += _colorField('macd-mc', 'MACD선', s.macdColor);
        html += _colorField('macd-sc', '시그널선', s.signalColor);
        break;
      case 'stoch':
        html += _numField('stoch-k', '%K 기간', s.kPeriod, 2, 100);
        html += _numField('stoch-d', '%D 기간', s.dPeriod, 2, 100);
        html += _colorField('stoch-kc', '%K 색상', s.kColor);
        html += _colorField('stoch-dc', '%D 색상', s.dColor);
        break;
      case 'atr':
        html += _numField('atr-p', '기간', s.period, 2, 500);
        html += _colorField('atr-c', '색상', s.color);
        break;
      case 'cci':
        html += _numField('cci-p', '기간', s.period, 2, 500);
        html += _colorField('cci-c', '색상', s.color);
        break;
      case 'volume':
        html += _colorField('vol-up', '상승 색상', s.upColor);
        html += _colorField('vol-dn', '하락 색상', s.downColor);
        break;
      case 'volumeMA':
        html += _numField('vma-p', '기간', s.period, 2, 500);
        html += _colorField('vma-c', '색상', s.color);
        break;
    }

    _settingsBody.innerHTML = html;
  }

  function _readForm(key) {
    const g = id => document.getElementById(id);
    const s = _tempSetting;
    const int = (id, fallback) => Math.max(parseInt(g(id)?.value) || fallback, 1);
    const flt = (id, fallback, min) => Math.max(parseFloat(g(id)?.value) || fallback, min);
    const col = (id, fallback) => g(id)?.value || fallback;

    switch (key) {
      case 'ma':
        s.lines.forEach((line, i) => {
          line.enabled = g(`ma-en-${i}`)?.checked ?? line.enabled;
          line.period  = int(`ma-p-${i}`, line.period);
          line.color   = col(`ma-c-${i}`, line.color);
        });
        break;
      case 'bb':
        s.period     = int('bb-period', s.period);
        s.stdDev     = flt('bb-std', s.stdDev, 0.1);
        s.upperColor = col('bb-upper', s.upperColor);
        s.middleColor = col('bb-mid', s.middleColor);
        s.lowerColor = col('bb-lower', s.lowerColor);
        break;
      case 'rsi':
        s.period = int('rsi-p', s.period);
        s.color  = col('rsi-c', s.color);
        break;
      case 'macd':
        s.fast        = int('macd-fast', s.fast);
        s.slow        = int('macd-slow', s.slow);
        s.signal      = int('macd-sig', s.signal);
        s.macdColor   = col('macd-mc', s.macdColor);
        s.signalColor = col('macd-sc', s.signalColor);
        break;
      case 'stoch':
        s.kPeriod = int('stoch-k', s.kPeriod);
        s.dPeriod = int('stoch-d', s.dPeriod);
        s.kColor  = col('stoch-kc', s.kColor);
        s.dColor  = col('stoch-dc', s.dColor);
        break;
      case 'atr':
        s.period = int('atr-p', s.period);
        s.color  = col('atr-c', s.color);
        break;
      case 'cci':
        s.period = int('cci-p', s.period);
        s.color  = col('cci-c', s.color);
        break;
      case 'volume':
        s.upColor   = col('vol-up', s.upColor);
        s.downColor = col('vol-dn', s.downColor);
        break;
      case 'volumeMA':
        s.period = int('vma-p', s.period);
        s.color  = col('vma-c', s.color);
        break;
    }
  }

  // ===== 서브패널 공통 옵션 =====
  const SUB_CHART_OPTIONS = {
    autoSize: true,
    layout: {
      background: { type: 'solid', color: '#1e2026' },
      textColor: '#848e9c',
      fontSize: 10,
    },
    grid: {
      vertLines: { color: 'transparent' },
      horzLines: { color: '#2b2f3620' },
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: {
      borderColor: '#2b2f36',
      scaleMargins: { top: 0.1, bottom: 0.1 },
    },
    timeScale: { visible: false, borderColor: '#2b2f36' },
    handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false },
    handleScale: false,
  };

  // ===== 서브패널 생성 =====
  function _createSubPanel(id, title) {
    const chartCanvas = document.querySelector('.chart__canvas');
    if (!chartCanvas) return null;

    const container = document.createElement('div');
    container.className = 'sub-panel';
    container.id = `subPanel-${id}`;
    container.innerHTML = `
      <div class="sub-panel__header">
        <span class="sub-panel__title" id="subPanelTitle-${id}">${title}</span>
        <button class="sub-panel__close-btn" data-panel-id="${id}" title="닫기">✕</button>
      </div>
      <div class="sub-panel__body" id="subPanelBody-${id}"></div>`;

    chartCanvas.appendChild(container);

    container.querySelector('.sub-panel__close-btn').addEventListener('click', () => {
      // 연관 지표 비활성화
      if (id === 'volume') {
        _settings.volume.enabled = false;
        _settings.volumeMA.enabled = false;
      } else {
        _settings[id].enabled = false;
      }
      _saveSettings();
      _applyIndicators();
      _renderPanelList(_panelSearch?.value || '');
    });

    const chartDiv = document.getElementById(`subPanelBody-${id}`);
    const subChart = LightweightCharts.createChart(chartDiv, SUB_CHART_OPTIONS);

    return { chart: subChart, container, series: {} };
  }

  // ===== 타임스케일 동기화 =====
  function _syncSubPanelTimescales() {
    const mainChart = window.ChartCore?.chart;
    if (!mainChart) return;

    const allCharts = [mainChart, ...Object.values(_subPanels).map(p => p.chart)];

    allCharts.forEach(chart => {
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (_syncLock || !range) return;
        _syncLock = true;
        allCharts.forEach(c => { if (c !== chart) c.timeScale().setVisibleLogicalRange(range); });
        _syncLock = false;
      });
    });
  }

  // ===== 지표 전체 적용 =====
  function _applyIndicators() {
    if (!_candles.length || !window.ChartCore) return;
    _clearOverlays();
    _clearSubPanels();

    for (const key of Object.keys(_settings)) {
      if (_settings[key].enabled) _renderIndicator(key);
    }

    _syncSubPanelTimescales();

    // 현재 메인 차트의 visible range를 서브패널에 즉시 적용
    const mainChart = window.ChartCore.chart;
    const range = mainChart?.timeScale().getVisibleLogicalRange();
    if (range) {
      Object.values(_subPanels).forEach(p => {
        try { p.chart.timeScale().setVisibleLogicalRange(range); } catch {}
      });
    }
  }

  function _clearOverlays() {
    const core = window.ChartCore;
    if (!core) return;
    for (const seriesList of Object.values(_overlaySeries)) {
      (Array.isArray(seriesList) ? seriesList : Object.values(seriesList)).forEach(s => {
        try { core.chart.removeSeries(s); } catch {}
      });
    }
    _overlaySeries = {};
  }

  function _clearSubPanels() {
    for (const panel of Object.values(_subPanels)) {
      try { panel.chart.remove(); } catch {}
      panel.container.remove();
    }
    _subPanels = {};
  }

  // ===== 지표별 렌더링 =====
  function _renderIndicator(key) {
    const core = window.ChartCore;
    const s = _settings[key];
    const c = _candles;

    switch (key) {
      case 'ma':   _renderMA(core, c, s);   break;
      case 'bb':   _renderBB(core, c, s);   break;
      case 'rsi':  _renderRSI(c, s);        break;
      case 'macd': _renderMACD(c, s);       break;
      case 'stoch': _renderStoch(c, s);     break;
      case 'atr':  _renderATR(c, s);        break;
      case 'cci':  _renderCCI(c, s);        break;
      case 'volume':
      case 'volumeMA':
        // Volume과 VolumeMA는 같은 패널에 렌더링 (아직 패널이 없을 때만 생성)
        if (!_subPanels['volume']) _renderVolumePanelIfNeeded();
        break;
    }
  }

  // MA 오버레이
  function _renderMA(core, candles, s) {
    const list = [];
    s.lines.forEach(line => {
      if (!line.enabled) return;
      const data = Indicators.calcMA(candles, line.period);
      const series = core.chart.addLineSeries({
        color: line.color, lineWidth: 1,
        priceLineVisible: false, lastValueVisible: true,
        title: `MA${line.period}`,
      });
      series.setData(data);
      list.push(series);
    });
    _overlaySeries.ma = list;
  }

  // BB 오버레이
  function _renderBB(core, candles, s) {
    const { upper, middle, lower } = Indicators.calcBB(candles, s.period, s.stdDev);
    const list = [
      { data: upper,  color: s.upperColor,  title: `BB(${s.period})` },
      { data: middle, color: s.middleColor, title: '' },
      { data: lower,  color: s.lowerColor,  title: '' },
    ].map(({ data, color, title }) => {
      const series = core.chart.addLineSeries({
        color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title,
      });
      series.setData(data);
      return series;
    });
    _overlaySeries.bb = list;
  }

  // RSI 서브패널
  function _renderRSI(candles, s) {
    const panel = _createSubPanel('rsi', `RSI(${s.period})`);
    if (!panel) return;
    _subPanels.rsi = panel;

    const data = Indicators.calcRSI(candles, s.period);
    panel._data = { rsi: data };
    const rsiSeries = panel.chart.addLineSeries({
      color: s.color, lineWidth: 1.5, priceLineVisible: false, title: '',
    });
    rsiSeries.setData(data);
    rsiSeries.createPriceLine({ price: 70, color: '#f6465d55', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false });
    rsiSeries.createPriceLine({ price: 30, color: '#0ecb8155', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false });
    panel.series.rsi = rsiSeries;
  }

  // MACD 서브패널
  function _renderMACD(candles, s) {
    const label = `MACD(${s.fast},${s.slow},${s.signal})`;
    const panel = _createSubPanel('macd', label);
    if (!panel) return;
    _subPanels.macd = panel;

    const { macd, signal, histogram } = Indicators.calcMACD(candles, s.fast, s.slow, s.signal);
    panel._data = { macd, signal, hist: histogram };

    const histSeries = panel.chart.addHistogramSeries({
      priceLineVisible: false, lastValueVisible: false, title: '',
    });
    histSeries.setData(histogram);

    const macdSeries = panel.chart.addLineSeries({
      color: s.macdColor, lineWidth: 1.5, priceLineVisible: false, title: '',
    });
    macdSeries.setData(macd);

    const sigSeries = panel.chart.addLineSeries({
      color: s.signalColor, lineWidth: 1.5, priceLineVisible: false, title: '',
    });
    sigSeries.setData(signal);

    panel.series = { hist: histSeries, macd: macdSeries, signal: sigSeries };
  }

  // 스토캐스틱 서브패널
  function _renderStoch(candles, s) {
    const label = `Stoch(${s.kPeriod},${s.dPeriod})`;
    const panel = _createSubPanel('stoch', label);
    if (!panel) return;
    _subPanels.stoch = panel;

    const { k, d } = Indicators.calcStochastic(candles, s.kPeriod, s.dPeriod);
    panel._data = { k, d };

    const kSeries = panel.chart.addLineSeries({
      color: s.kColor, lineWidth: 1.5, priceLineVisible: false, title: '%K',
    });
    kSeries.setData(k);
    kSeries.createPriceLine({ price: 80, color: '#f6465d44', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false });
    kSeries.createPriceLine({ price: 20, color: '#0ecb8144', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false });

    const dSeries = panel.chart.addLineSeries({
      color: s.dColor, lineWidth: 1.5, priceLineVisible: false, title: '%D',
    });
    dSeries.setData(d);

    panel.series = { k: kSeries, d: dSeries };
  }

  // ATR 서브패널
  function _renderATR(candles, s) {
    const panel = _createSubPanel('atr', `ATR(${s.period})`);
    if (!panel) return;
    _subPanels.atr = panel;

    const data = Indicators.calcATR(candles, s.period);
    panel._data = { atr: data };
    const series = panel.chart.addLineSeries({
      color: s.color, lineWidth: 1.5, priceLineVisible: false, title: '',
    });
    series.setData(data);
    panel.series.atr = series;
  }

  // CCI 서브패널
  function _renderCCI(candles, s) {
    const panel = _createSubPanel('cci', `CCI(${s.period})`);
    if (!panel) return;
    _subPanels.cci = panel;

    const data = Indicators.calcCCI(candles, s.period);
    panel._data = { cci: data };
    const series = panel.chart.addLineSeries({
      color: s.color, lineWidth: 1.5, priceLineVisible: false, title: '',
    });
    series.setData(data);
    series.createPriceLine({ price:  100, color: '#f6465d44', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false });
    series.createPriceLine({ price: -100, color: '#0ecb8144', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false });
    panel.series.cci = series;
  }

  // Volume + VolumeMA는 같은 서브패널에 렌더링
  function _renderVolumePanelIfNeeded() {
    const sVol = _settings.volume;
    const sVMA = _settings.volumeMA;
    if (!sVol.enabled && !sVMA.enabled) return;

    const title = [
      sVol.enabled ? 'Vol' : null,
      sVMA.enabled ? `MA(${sVMA.period})` : null,
    ].filter(Boolean).join(' · ');

    const panel = _createSubPanel('volume', title);
    if (!panel) return;
    _subPanels.volume = panel;

    panel._data = {};

    if (sVol.enabled) {
      const data = Indicators.calcVolume(_candles, sVol.upColor, sVol.downColor);
      panel._data.vol = data;
      const volSeries = panel.chart.addHistogramSeries({
        priceLineVisible: false, lastValueVisible: false, title: '',
        priceScaleId: 'vol',
      });
      volSeries.setData(data);
      panel.series.vol = volSeries;
    }

    if (sVMA.enabled) {
      const data = Indicators.calcVolumeMA(_candles, sVMA.period);
      panel._data.vma = data;
      const vmaSeries = panel.chart.addLineSeries({
        color: sVMA.color, lineWidth: 1.5,
        priceLineVisible: false, lastValueVisible: false, title: '',
        priceScaleId: 'vol',
      });
      vmaSeries.setData(data);
      panel.series.vma = vmaSeries;
    }
  }

  // ===== 실시간 업데이트 =====
  // 마지막 캔들 업데이트 (재렌더링 없이 series.update 사용)
  function _updateLast(candle) {
    if (!_candles.length) return;
    if (_candles[_candles.length - 1].time === candle.time) {
      _candles[_candles.length - 1] = candle;
    } else {
      _candles.push(candle);
    }
    _refreshSeriesData();
  }

  function _refreshSeriesData() {
    const c = _candles;

    // MA 오버레이
    if (_overlaySeries.ma) {
      const enabledLines = _settings.ma.lines.filter(l => l.enabled);
      _overlaySeries.ma.forEach((series, i) => {
        if (!enabledLines[i]) return;
        try { series.setData(Indicators.calcMA(c, enabledLines[i].period)); } catch {}
      });
    }

    // BB 오버레이
    if (_overlaySeries.bb) {
      const { upper, middle, lower } = Indicators.calcBB(c, _settings.bb.period, _settings.bb.stdDev);
      try {
        _overlaySeries.bb[0].setData(upper);
        _overlaySeries.bb[1].setData(middle);
        _overlaySeries.bb[2].setData(lower);
      } catch {}
    }

    // RSI
    if (_subPanels.rsi?.series.rsi) {
      const d = Indicators.calcRSI(c, _settings.rsi.period);
      _subPanels.rsi._data = { rsi: d };
      try { _subPanels.rsi.series.rsi.setData(d); } catch {}
    }

    // MACD
    if (_subPanels.macd) {
      const { macd, signal, histogram } = Indicators.calcMACD(c, _settings.macd.fast, _settings.macd.slow, _settings.macd.signal);
      _subPanels.macd._data = { macd, signal, hist: histogram };
      try {
        _subPanels.macd.series.hist.setData(histogram);
        _subPanels.macd.series.macd.setData(macd);
        _subPanels.macd.series.signal.setData(signal);
      } catch {}
    }

    // 스토캐스틱
    if (_subPanels.stoch) {
      const { k, d } = Indicators.calcStochastic(c, _settings.stoch.kPeriod, _settings.stoch.dPeriod);
      _subPanels.stoch._data = { k, d };
      try {
        _subPanels.stoch.series.k.setData(k);
        _subPanels.stoch.series.d.setData(d);
      } catch {}
    }

    // ATR
    if (_subPanels.atr?.series.atr) {
      const d = Indicators.calcATR(c, _settings.atr.period);
      _subPanels.atr._data = { atr: d };
      try { _subPanels.atr.series.atr.setData(d); } catch {}
    }

    // CCI
    if (_subPanels.cci?.series.cci) {
      const d = Indicators.calcCCI(c, _settings.cci.period);
      _subPanels.cci._data = { cci: d };
      try { _subPanels.cci.series.cci.setData(d); } catch {}
    }

    // Volume
    if (_subPanels.volume) {
      if (!_subPanels.volume._data) _subPanels.volume._data = {};
      if (_subPanels.volume.series.vol) {
        const d = Indicators.calcVolume(c, _settings.volume.upColor, _settings.volume.downColor);
        _subPanels.volume._data.vol = d;
        try { _subPanels.volume.series.vol.setData(d); } catch {}
      }
      if (_subPanels.volume.series.vma) {
        const d = Indicators.calcVolumeMA(c, _settings.volumeMA.period);
        _subPanels.volume._data.vma = d;
        try { _subPanels.volume.series.vma.setData(d); } catch {}
      }
    }
  }

  // ===== 서브패널 타이틀 호버 업데이트 =====
  function _updateSubPanelTitles(time) {
    function findVal(data, t) {
      if (!data || !data.length) return null;
      if (t === null) return data[data.length - 1];
      return data.find(d => d.time === t) || null;
    }

    if (_subPanels.rsi) {
      const el = document.getElementById('subPanelTitle-rsi');
      if (el) {
        const v = findVal(_subPanels.rsi._data?.rsi, time);
        el.textContent = v ? `RSI(${_settings.rsi.period})  ${v.value.toFixed(2)}` : `RSI(${_settings.rsi.period})`;
      }
    }

    if (_subPanels.macd) {
      const el = document.getElementById('subPanelTitle-macd');
      if (el) {
        const { fast, slow, signal } = _settings.macd;
        const base = `MACD(${fast},${slow},${signal})`;
        const m  = findVal(_subPanels.macd._data?.macd,   time);
        const sg = findVal(_subPanels.macd._data?.signal, time);
        const h  = findVal(_subPanels.macd._data?.hist,   time);
        el.textContent = (m && sg && h)
          ? `${base}  MACD: ${m.value.toFixed(2)}  Sig: ${sg.value.toFixed(2)}  Hist: ${h.value.toFixed(2)}`
          : base;
      }
    }

    if (_subPanels.stoch) {
      const el = document.getElementById('subPanelTitle-stoch');
      if (el) {
        const { kPeriod, dPeriod } = _settings.stoch;
        const base = `Stoch(${kPeriod},${dPeriod})`;
        const k = findVal(_subPanels.stoch._data?.k, time);
        const d = findVal(_subPanels.stoch._data?.d, time);
        el.textContent = (k && d)
          ? `${base}  %K: ${k.value.toFixed(2)}  %D: ${d.value.toFixed(2)}`
          : base;
      }
    }

    if (_subPanels.atr) {
      const el = document.getElementById('subPanelTitle-atr');
      if (el) {
        const v = findVal(_subPanels.atr._data?.atr, time);
        el.textContent = v ? `ATR(${_settings.atr.period})  ${v.value.toFixed(2)}` : `ATR(${_settings.atr.period})`;
      }
    }

    if (_subPanels.cci) {
      const el = document.getElementById('subPanelTitle-cci');
      if (el) {
        const v = findVal(_subPanels.cci._data?.cci, time);
        const sign = v && v.value >= 0 ? '+' : '';
        el.textContent = v ? `CCI(${_settings.cci.period})  ${sign}${v.value.toFixed(2)}` : `CCI(${_settings.cci.period})`;
      }
    }

    if (_subPanels.volume) {
      const el = document.getElementById('subPanelTitle-volume');
      if (el) {
        const parts = [];
        const vol = findVal(_subPanels.volume._data?.vol, time);
        const vma = findVal(_subPanels.volume._data?.vma, time);
        if (_settings.volume.enabled   && vol) parts.push(`Vol  ${_fmtV(vol.value)}`);
        if (_settings.volumeMA.enabled && vma) parts.push(`MA(${_settings.volumeMA.period}): ${_fmtV(vma.value)}`);
        if (parts.length) {
          el.textContent = parts.join('  ');
        } else {
          el.textContent = [
            _settings.volume.enabled   ? 'Vol' : null,
            _settings.volumeMA.enabled ? `MA(${_settings.volumeMA.period})` : null,
          ].filter(Boolean).join(' · ');
        }
      }
    }
  }

  document.addEventListener('chart:crosshair', ({ detail: { time } }) => {
    _updateSubPanelTitles(time);
  });

  // ===== 이벤트 리스너 =====
  document.addEventListener('chart:candles-loaded', ({ detail: { candles } }) => {
    _candles = candles;
    _applyIndicators();
  });

  document.addEventListener('binance:kline', ({ detail: d }) => {
    if (!_candles.length) return;
    const k = d.k;
    _updateLast({
      time:   k.t / 1000,
      open:   parseFloat(k.o),
      high:   parseFloat(k.h),
      low:    parseFloat(k.l),
      close:  parseFloat(k.c),
      volume: parseFloat(k.v),
    });
  });

  // 심볼/인터벌 변경 시 서브패널 visible range 재동기화
  document.addEventListener('chart:candles-loaded', () => {
    setTimeout(() => {
      const mainChart = window.ChartCore?.chart;
      const range = mainChart?.timeScale().getVisibleLogicalRange();
      if (!range) return;
      Object.values(_subPanels).forEach(p => {
        try { p.chart.timeScale().setVisibleLogicalRange(range); } catch {}
      });
    }, 50);
  });

})();
