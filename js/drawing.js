// ===== drawing.js =====
// TradingView-style drawing tools overlay

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────
  let chart, candleSeries;
  let container;            // #tradingChart element
  let canvas, ctx;

  let activeTool = 'cursor';
  let isMagnetOn = false;

  let drawings = [];        // completed drawings
  let selectedId = null;
  let hoveredId  = null;

  let isDrawing  = false;
  let drawPoints = [];      // {price, time}[] — in-progress points
  let snapInfo   = null;    // {x, y} | null — current magnet snap target

  let mouseX = 0, mouseY = 0;

  let isDragging     = false;
  let dragStart      = null;   // {x, y} pixels at drag start
  let dragOrigPoints = null;   // deep-copy of points before drag

  let currentSymbol = 'BTCUSDT';
  let fibModalId    = null;
  let rafId         = null;

  // ── Constants ─────────────────────────────────────────────────────────────
  const MAGNET_THRESHOLD = 15;
  const HIT_THRESHOLD    = 7;

  const REQUIRED_POINTS = {
    cursor: 0, trendline: 2, ray: 2,
    hline: 1,  vline: 1,    rect: 2,
    fib_ret: 2, fib_channel: 3,
  };

  const DEFAULT_STYLE = { color: '#f0b90b', lineWidth: 2, lineStyle: 'solid' };

  function DEFAULT_FIB_LEVELS() {
    return [
      { value:  0,     visible: true,  color: '#787b86' },
      { value:  0.236, visible: true,  color: '#f7525f' },
      { value:  0.382, visible: true,  color: '#ff9800' },
      { value:  0.5,   visible: true,  color: '#4caf50' },
      { value:  0.618, visible: true,  color: '#00bcd4' },
      { value:  0.786, visible: true,  color: '#2962ff' },
      { value:  1,     visible: true,  color: '#787b86' },
      { value:  1.618, visible: false, color: '#f7525f' },
      { value:  2.618, visible: false, color: '#f7525f' },
      { value: -0.618, visible: false, color: '#787b86' },
    ];
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    const core = window.ChartCore;
    if (!core || !core.chart || !core.candleSeries) return;
    chart        = core.chart;
    candleSeries = core.candleSeries;
    container    = document.getElementById('tradingChart');
    if (!container) return;

    setupCanvas();
    setupToolbarEvents();
    setupFibModalEvents();
    setupContextMenuEvents();
    setupChartSubscriptions();
    loadDrawings(currentSymbol);
    scheduleRender();

    // Symbol change — save current, load new
    document.addEventListener('symbol:change', ({ detail: { symbol } }) => {
      saveDrawings(currentSymbol);
      currentSymbol = symbol;
      selectedId    = null;
      isDrawing     = false;
      drawPoints    = [];
      snapInfo      = null;
      loadDrawings(symbol);
      scheduleRender();
    });

    document.addEventListener('keydown', onKeyDown);
  }

  // ── Canvas ────────────────────────────────────────────────────────────────
  function setupCanvas() {
    canvas = document.createElement('canvas');
    canvas.id = 'drawingCanvas';
    canvas.style.cssText =
      'position:absolute;inset:0;z-index:2;pointer-events:none;display:block;';
    container.appendChild(canvas);
    syncSize();

    new ResizeObserver(() => { syncSize(); scheduleRender(); }).observe(container);

    // Attach all pointer events to the container; canvas starts pointer-events:none
    // so Lightweight Charts pan/zoom works normally in cursor mode.
    container.addEventListener('mousemove',    onMouseMove);
    container.addEventListener('mousedown',    onMouseDown);
    container.addEventListener('mouseup',      onMouseUp);
    container.addEventListener('click',        onMouseClick);
    container.addEventListener('dblclick',     onDblClick);
    container.addEventListener('contextmenu',  onContextMenu);
    container.addEventListener('wheel',        () => scheduleRender(), { passive: true });
  }

  function syncSize() {
    const dpr = window.devicePixelRatio || 1;
    const w   = container.clientWidth;
    const h   = container.clientHeight;
    canvas.width        = Math.round(w * dpr);
    canvas.height       = Math.round(h * dpr);
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
  }

  function cW() { return container.clientWidth; }
  function cH() { return container.clientHeight; }

  // ── Coordinate helpers ────────────────────────────────────────────────────

  // Convert stored timestamp → pixel x, with cross-timeframe interpolation.
  // When the chart timeframe changes, stored timestamps may not align with
  // new candle timestamps. We interpolate between surrounding candles to
  // maintain exact visual position across timeframe changes.
  function timeToX(time) {
    const x = chart.timeScale().timeToCoordinate(time);
    if (x !== null) return x;

    // Interpolate between the two surrounding candles
    const candles = window.ChartCore.getCandles();
    if (!candles.length) return null;

    let lo = null, hi = null;
    for (const c of candles) {
      if (c.time <= time) lo = c;
      if (c.time >= time && hi === null) hi = c;
    }
    const xLo = lo ? chart.timeScale().timeToCoordinate(lo.time) : null;
    const xHi = hi ? chart.timeScale().timeToCoordinate(hi.time) : null;

    if (lo && hi && lo.time !== hi.time && xLo !== null && xHi !== null) {
      const t = (time - lo.time) / (hi.time - lo.time);
      return xLo + t * (xHi - xLo);
    }
    return xLo ?? xHi;
  }

  function ptToPixel(price, time) {
    const x = timeToX(time);
    const y = candleSeries.priceToCoordinate(price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  function pixelToPt(x, y) {
    const time  = chart.timeScale().coordinateToTime(x);
    const price = candleSeries.coordinateToPrice(y);
    if (time === null || price === null) return null;
    return { price, time };
  }

  // ── Magnet ────────────────────────────────────────────────────────────────
  function applyMagnet(mx, my) {
    if (!isMagnetOn) { snapInfo = null; return { x: mx, y: my }; }

    const candles  = window.ChartCore.getCandles();
    let bestDist   = MAGNET_THRESHOLD;
    let best       = null;

    for (const c of candles) {
      const cx = chart.timeScale().timeToCoordinate(c.time);
      if (cx === null) continue;
      for (const f of ['open', 'high', 'low', 'close']) {
        const cy = candleSeries.priceToCoordinate(c[f]);
        if (cy === null) continue;
        const d = Math.hypot(cx - mx, cy - my);
        if (d < bestDist) { bestDist = d; best = { x: cx, y: cy }; }
      }
    }
    snapInfo = best;
    return best ?? { x: mx, y: my };
  }

  // ── Toolbar ───────────────────────────────────────────────────────────────
  function setupToolbarEvents() {
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        setTool(btn.dataset.tool);
      });
    });

    const magnetBtn = document.getElementById('magnetBtn');
    if (magnetBtn) {
      magnetBtn.addEventListener('click', e => {
        e.stopPropagation();
        isMagnetOn = !isMagnetOn;
        magnetBtn.classList.toggle('drawing-tool-btn--on', isMagnetOn);
        magnetBtn.title = isMagnetOn ? '자석 ON' : '자석 OFF';
      });
    }

    const clearBtn = document.getElementById('clearDrawingsBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (!drawings.length) return;
        drawings   = [];
        selectedId = null;
        saveDrawings(currentSymbol);
        scheduleRender();
      });
    }
  }

  function setTool(tool) {
    activeTool = tool;
    isDrawing  = false;
    drawPoints = [];
    snapInfo   = null;

    document.querySelectorAll('[data-tool]').forEach(btn =>
      btn.classList.toggle('drawing-tool-btn--active', btn.dataset.tool === tool));

    const drawing = (tool !== 'cursor');
    canvas.style.pointerEvents  = drawing ? 'auto' : 'none';
    container.style.cursor      = drawing ? 'crosshair' : '';

    scheduleRender();
  }

  // ── Mouse event handlers ──────────────────────────────────────────────────
  function relPos(e) {
    const r = container.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onMouseMove(e) {
    const { x, y } = relPos(e);
    mouseX = x; mouseY = y;

    if (activeTool === 'cursor') {
      // Hover detection
      const id = hitTest(x, y);
      if (id !== hoveredId) {
        hoveredId = id;
        container.style.cursor = id ? 'pointer' : '';
        scheduleRender();
      }

      // Drag selected drawing
      if (isDragging && selectedId && dragStart && dragOrigPoints) {
        const now  = pixelToPt(x, y);
        const orig = pixelToPt(dragStart.x, dragStart.y);
        if (now && orig) {
          const dp = now.price - orig.price;
          const dt = now.time  - orig.time;
          const d  = drawings.find(d => d.id === selectedId);
          if (d) {
            d.points = dragOrigPoints.map(p => ({ price: p.price + dp, time: p.time + dt }));
            saveDrawings(currentSymbol);
            scheduleRender();
          }
        }
      }
      return;
    }

    // Drawing mode — update snap preview
    applyMagnet(x, y);
    scheduleRender();
  }

  function onMouseDown(e) {
    if (e.button !== 0 || activeTool !== 'cursor') return;
    const { x, y } = relPos(e);
    const id = hitTest(x, y);
    selectedId = id;
    if (id) {
      isDragging     = true;
      dragStart      = { x, y };
      const d        = drawings.find(d => d.id === id);
      dragOrigPoints = d ? d.points.map(p => ({ ...p })) : null;
    }
    scheduleRender();
  }

  function onMouseUp() {
    if (isDragging) {
      isDragging     = false;
      dragStart      = null;
      dragOrigPoints = null;
    }
  }

  function onMouseClick(e) {
    if (activeTool === 'cursor') return;
    const { x, y } = relPos(e);
    const snapped   = applyMagnet(x, y);
    const pt        = pixelToPt(snapped.x, snapped.y);
    if (!pt) return;

    // Single-click tools
    if (activeTool === 'hline') { finishDrawing({ type: 'hline', points: [pt] }); return; }
    if (activeTool === 'vline') { finishDrawing({ type: 'vline', points: [pt] }); return; }

    drawPoints.push(pt);
    isDrawing = true;

    if (drawPoints.length >= (REQUIRED_POINTS[activeTool] || 1)) {
      finishDrawing({ type: activeTool, points: [...drawPoints] });
    }
    scheduleRender();
  }

  function onDblClick(e) {
    if (activeTool !== 'cursor') return;
    const { x, y } = relPos(e);
    const id = hitTest(x, y);
    if (!id) return;
    const d = drawings.find(d => d.id === id);
    if (d && (d.type === 'fib_ret' || d.type === 'fib_channel')) openFibModal(id);
  }

  function onContextMenu(e) {
    e.preventDefault();
    if (activeTool !== 'cursor') return;
    const { x, y } = relPos(e);
    const id = hitTest(x, y);
    if (id) { selectedId = id; scheduleRender(); }
    showContextMenu(e.clientX, e.clientY, id);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (isDrawing) {
        isDrawing = false; drawPoints = []; scheduleRender();
      } else if (activeTool !== 'cursor') {
        setTool('cursor');
      } else {
        selectedId = null; scheduleRender();
      }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') &&
        selectedId && document.activeElement === document.body) {
      e.preventDefault();
      deleteDrawing(selectedId);
    }
  }

  // ── Drawing lifecycle ─────────────────────────────────────────────────────
  function finishDrawing({ type, points }) {
    const isFib = (type === 'fib_ret' || type === 'fib_channel');
    const id    = 'drw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    drawings.push({
      id, type, points,
      style:     { ...DEFAULT_STYLE },
      fibLevels: isFib ? loadDefaultFibLevels(type) : null,
    });
    isDrawing  = false;
    drawPoints = [];
    snapInfo   = null;
    saveDrawings(currentSymbol);
    scheduleRender();
  }

  function deleteDrawing(id) {
    drawings   = drawings.filter(d => d.id !== id);
    if (selectedId === id) selectedId = null;
    if (hoveredId  === id) hoveredId  = null;
    saveDrawings(currentSymbol);
    scheduleRender();
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  function saveDrawings(symbol) {
    try { localStorage.setItem(`ct_drawings_${symbol}`, JSON.stringify(drawings)); }
    catch (_) {}
  }

  function loadDrawings(symbol) {
    try {
      const raw = localStorage.getItem(`ct_drawings_${symbol}`);
      drawings  = raw ? JSON.parse(raw) : [];
    } catch (_) { drawings = []; }
  }

  function saveDefaultFibLevels(type, levels) {
    try { localStorage.setItem(`ct_fib_defaults_${type}`, JSON.stringify(levels)); }
    catch (_) {}
  }

  function loadDefaultFibLevels(type) {
    try {
      const raw = localStorage.getItem(`ct_fib_defaults_${type}`);
      return raw ? JSON.parse(raw) : DEFAULT_FIB_LEVELS();
    } catch (_) { return DEFAULT_FIB_LEVELS(); }
  }

  // ── Hit testing ───────────────────────────────────────────────────────────
  function hitTest(mx, my) {
    for (let i = drawings.length - 1; i >= 0; i--) {
      if (isHit(drawings[i], mx, my)) return drawings[i].id;
    }
    return null;
  }

  function isHit(d, mx, my) {
    const w = cW(), h = cH();
    switch (d.type) {
      case 'hline': {
        const y = candleSeries.priceToCoordinate(d.points[0].price);
        return y !== null && Math.abs(my - y) < HIT_THRESHOLD;
      }
      case 'vline': {
        const x = timeToX(d.points[0].time);
        return x !== null && Math.abs(mx - x) < HIT_THRESHOLD;
      }
      case 'trendline': {
        const p = d.points.map(p => ptToPixel(p.price, p.time));
        if (!p[0] || !p[1]) return false;
        const e = extendLine(p[0].x, p[0].y, p[1].x, p[1].y, w, h);
        return e ? distSeg(mx, my, e[0], e[1], e[2], e[3]) < HIT_THRESHOLD : false;
      }
      case 'ray': {
        const p = d.points.map(p => ptToPixel(p.price, p.time));
        if (!p[0] || !p[1]) return false;
        const r = extendRay(p[0].x, p[0].y, p[1].x, p[1].y, w, h);
        return r ? distSeg(mx, my, r[0], r[1], r[2], r[3]) < HIT_THRESHOLD : false;
      }
      case 'rect': {
        const p = d.points.map(p => ptToPixel(p.price, p.time));
        if (!p[0] || !p[1]) return false;
        return onRectBorder(mx, my, p[0].x, p[0].y, p[1].x, p[1].y);
      }
      case 'fib_ret': {
        if (d.points.length < 2) return false;
        const [fp1, fp2] = d.points;
        for (const lv of (d.fibLevels || DEFAULT_FIB_LEVELS())) {
          if (!lv.visible) continue;
          const price = fp1.price + lv.value * (fp2.price - fp1.price);
          const y     = candleSeries.priceToCoordinate(price);
          if (y !== null && Math.abs(my - y) < HIT_THRESHOLD) return true;
        }
        return false;
      }
      case 'fib_channel': {
        for (const ln of getFibChannelLines(d)) {
          if (distSeg(mx, my, ln[0], ln[1], ln[2], ln[3]) < HIT_THRESHOLD) return true;
        }
        return false;
      }
    }
    return false;
  }

  function onRectBorder(mx, my, x1, y1, x2, y2) {
    const minX = Math.min(x1,x2), maxX = Math.max(x1,x2);
    const minY = Math.min(y1,y2), maxY = Math.max(y1,y2);
    const T = HIT_THRESHOLD;
    if (mx < minX-T || mx > maxX+T || my < minY-T || my > maxY+T) return false;
    return Math.abs(mx-minX)<T || Math.abs(mx-maxX)<T ||
           Math.abs(my-minY)<T || Math.abs(my-maxY)<T;
  }

  function distSeg(px, py, ax, ay, bx, by) {
    const dx = bx-ax, dy = by-ay;
    const l2 = dx*dx + dy*dy;
    if (l2 === 0) return Math.hypot(px-ax, py-ay);
    const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / l2));
    return Math.hypot(px-(ax+t*dx), py-(ay+t*dy));
  }

  // ── Line geometry ─────────────────────────────────────────────────────────
  // Extend the infinite line through (x1,y1)→(x2,y2) to canvas bounds.
  function extendLine(x1, y1, x2, y2, w, h) {
    if (x1===x2 && y1===y2) return null;
    if (x1===x2) return [x1, 0, x1, h];
    if (y1===y2) return [0, y1, w, y1];
    const m = (y2-y1)/(x2-x1);
    const b = y1 - m*x1;
    const pts = [];
    const add = (x, y) => { if (x>=0&&x<=w&&y>=0&&y<=h) pts.push([x,y]); };
    add(0,       b);
    add(w,       m*w+b);
    add(-b/m,    0);
    add((h-b)/m, h);
    // Remove near-duplicates
    const uniq = pts.filter((p, i) => !pts.slice(0,i).some(q => Math.hypot(p[0]-q[0],p[1]-q[1])<1));
    if (uniq.length < 2) return null;
    return [...uniq[0], ...uniq[uniq.length-1]];
  }

  // Extend a ray from (x1,y1) through (x2,y2) to canvas edge.
  function extendRay(x1, y1, x2, y2, w, h) {
    if (x1===x2 && y1===y2) return null;
    const dx = x2-x1, dy = y2-y1;
    let tMax = 1e9;
    if (dx > 0)  tMax = Math.min(tMax, (w-x1)/dx);
    else if (dx < 0) tMax = Math.min(tMax, -x1/dx);
    if (dy > 0)  tMax = Math.min(tMax, (h-y1)/dy);
    else if (dy < 0) tMax = Math.min(tMax, -y1/dy);
    return [x1, y1, x1+dx*tMax, y1+dy*tMax];
  }

  // ── Fibonacci Channel lines ───────────────────────────────────────────────
  // Lines are parallel to the P1→P2 baseline in price/time space.
  // P3 defines the 1.0-level offset (channel width in price units).
  function getFibChannelLines(d) {
    if (d.points.length < 3) return [];
    const [p1, p2, p3] = d.points;
    const dt = p2.time - p1.time;
    if (dt === 0) return [];
    const slope           = (p2.price - p1.price) / dt; // price per second
    const baselineAtP3    = p1.price + slope * (p3.time - p1.time);
    const width           = p3.price - baselineAtP3;
    const w = cW(), h = cH();
    const lines = [];
    for (const lv of (d.fibLevels || DEFAULT_FIB_LEVELS())) {
      if (!lv.visible) continue;
      // Two anchor pixels for this level's parallel line
      const pa = ptToPixel(p1.price + lv.value * width, p1.time);
      const pb = ptToPixel(p2.price + lv.value * width, p2.time);
      if (!pa || !pb) continue;
      const ext = extendLine(pa.x, pa.y, pb.x, pb.y, w, h);
      if (ext) lines.push([ext[0], ext[1], ext[2], ext[3], lv.color, lv.value]);
    }
    return lines;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function scheduleRender() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = null; render(); });
  }

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cW(), cH());

    for (const d of drawings) {
      drawShape(d, d.id === selectedId, d.id === hoveredId);
    }

    if (isDrawing && activeTool !== 'cursor' && drawPoints.length > 0) {
      renderPreview();
    }

    // Magnet snap indicator
    if (snapInfo && isMagnetOn && activeTool !== 'cursor') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(snapInfo.x, snapInfo.y, 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#f0b90b';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.restore();
    }
  }

  function renderPreview() {
    const snapped = (isMagnetOn && snapInfo) ? snapInfo : { x: mouseX, y: mouseY };
    const mousePt = pixelToPt(snapped.x, snapped.y);
    if (!mousePt) return;

    const allPts = [...drawPoints, mousePt];

    // When only 1 point placed and tool needs 2+, just show the anchor dot
    if (allPts.length < 2 && activeTool !== 'hline' && activeTool !== 'vline') {
      const px = ptToPixel(allPts[0].price, allPts[0].time);
      if (px) drawAnchorDot(px.x, px.y);
      return;
    }

    const isFib = (activeTool === 'fib_ret' || activeTool === 'fib_channel');
    const preview = {
      id: '__preview__', type: activeTool,
      points:    allPts,
      style:     { ...DEFAULT_STYLE, color: DEFAULT_STYLE.color + '99' },
      fibLevels: isFib ? loadDefaultFibLevels(activeTool) : null,
    };
    drawShape(preview, false, false);

    // Anchor dots for already-placed points
    for (const pt of drawPoints) {
      const px = ptToPixel(pt.price, pt.time);
      if (px) drawAnchorDot(px.x, px.y);
    }
  }

  function applyCtxStyle(style, selected) {
    ctx.strokeStyle = selected ? '#e0e0e0' : style.color;
    ctx.lineWidth   = style.lineWidth;
    if      (style.lineStyle === 'dashed') ctx.setLineDash([8, 4]);
    else if (style.lineStyle === 'dotted') ctx.setLineDash([2, 4]);
    else ctx.setLineDash([]);
  }

  function drawShape(d, selected, hovered) {
    if (!ctx) return;
    const w = cW(), h = cH();
    ctx.save();
    applyCtxStyle(d.style, selected);
    if (hovered && !selected) ctx.globalAlpha = 0.8;

    const pts = d.points.map(p => ptToPixel(p.price, p.time));

    switch (d.type) {
      case 'trendline': {
        if (!pts[0] || !pts[1]) break;
        const e = extendLine(pts[0].x, pts[0].y, pts[1].x, pts[1].y, w, h);
        if (e) strokeLine(e[0], e[1], e[2], e[3]);
        if (selected) { drawAnchorDot(pts[0].x, pts[0].y); drawAnchorDot(pts[1].x, pts[1].y); }
        break;
      }
      case 'ray': {
        if (!pts[0] || !pts[1]) break;
        const r = extendRay(pts[0].x, pts[0].y, pts[1].x, pts[1].y, w, h);
        if (r) strokeLine(r[0], r[1], r[2], r[3]);
        if (selected) { drawAnchorDot(pts[0].x, pts[0].y); drawAnchorDot(pts[1].x, pts[1].y); }
        break;
      }
      case 'hline': {
        const y = candleSeries.priceToCoordinate(d.points[0].price);
        if (y === null) break;
        strokeLine(0, y, w, y);
        drawPriceLabel(d.points[0].price, y, selected ? '#e0e0e0' : d.style.color);
        break;
      }
      case 'vline': {
        const x = timeToX(d.points[0].time);
        if (x === null) break;
        strokeLine(x, 0, x, h);
        break;
      }
      case 'rect': {
        if (!pts[0] || !pts[1]) break;
        const rx = Math.min(pts[0].x, pts[1].x);
        const ry = Math.min(pts[0].y, pts[1].y);
        const rw = Math.abs(pts[1].x - pts[0].x);
        const rh = Math.abs(pts[1].y - pts[0].y);
        ctx.save();
        ctx.globalAlpha = (selected || hovered) ? 0.15 : 0.08;
        ctx.fillStyle   = d.style.color;
        ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.fill();
        ctx.restore();
        ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.stroke();
        if (selected) { drawAnchorDot(pts[0].x, pts[0].y); drawAnchorDot(pts[1].x, pts[1].y); }
        break;
      }
      case 'fib_ret': {
        if (d.points.length < 2) break;
        const [fp1, fp2] = d.points;
        const levels = d.fibLevels || DEFAULT_FIB_LEVELS();
        for (const lv of levels) {
          if (!lv.visible) continue;
          const price = fp1.price + lv.value * (fp2.price - fp1.price);
          const ly    = candleSeries.priceToCoordinate(price);
          if (ly === null) continue;
          ctx.save();
          ctx.strokeStyle = selected ? '#e0e0e0' : lv.color;
          ctx.lineWidth   = d.style.lineWidth;
          ctx.setLineDash([]);
          strokeLine(0, ly, w, ly);
          ctx.font      = '10px monospace';
          ctx.fillStyle = selected ? '#e0e0e0' : lv.color;
          ctx.textAlign = 'right';
          ctx.fillText(`${lv.value}  ${price.toFixed(2)}`, w - 6, ly - 3);
          ctx.restore();
        }
        // Dashed vertical markers at anchor times
        const ax1 = timeToX(fp1.time), ax2 = timeToX(fp2.time);
        ctx.save();
        ctx.strokeStyle = d.style.color + '55';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth   = 1;
        if (ax1 !== null) strokeLine(ax1, 0, ax1, h);
        if (ax2 !== null) strokeLine(ax2, 0, ax2, h);
        ctx.restore();
        if (selected) {
          if (pts[0]) drawAnchorDot(pts[0].x, pts[0].y);
          if (pts[1]) drawAnchorDot(pts[1].x, pts[1].y);
        }
        break;
      }
      case 'fib_channel': {
        if (d.points.length < 2) break;
        if (d.points.length === 2) {
          // Show baseline only during 3rd-point placement
          if (pts[0] && pts[1]) strokeLine(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
          break;
        }
        const lines = getFibChannelLines(d);
        for (const [ax, ay, bx, by, color, val] of lines) {
          ctx.save();
          ctx.strokeStyle = selected ? '#e0e0e0' : color;
          ctx.lineWidth   = d.style.lineWidth;
          ctx.setLineDash([]);
          strokeLine(ax, ay, bx, by);
          ctx.font      = '10px monospace';
          ctx.fillStyle = selected ? '#e0e0e0' : color;
          ctx.textAlign = 'left';
          // Label near the left end of the line
          const lx = Math.min(ax, bx), ly = ax < bx ? ay : by;
          ctx.fillText(String(val), lx + 4, ly - 3);
          ctx.restore();
        }
        if (selected) pts.forEach(p => p && drawAnchorDot(p.x, p.y));
        break;
      }
    }
    ctx.restore();
  }

  function strokeLine(x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function drawAnchorDot(x, y) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle   = '#1e2026';
    ctx.fill();
    ctx.strokeStyle = '#f0b90b';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawPriceLabel(price, y, color) {
    ctx.save();
    ctx.font      = '11px monospace';
    ctx.fillStyle = color || '#848e9c';
    ctx.textAlign = 'right';
    ctx.setLineDash([]);
    ctx.fillText(price.toFixed(2), cW() - 6, y - 3);
    ctx.restore();
  }

  // ── Context menu ──────────────────────────────────────────────────────────
  function setupContextMenuEvents() {
    const menu = document.getElementById('drawingContextMenu');
    if (!menu) return;

    document.getElementById('ctxMenuDelete')?.addEventListener('click', e => {
      e.stopPropagation();
      const id = menu.dataset.targetId;
      if (id) deleteDrawing(id);
      hideCtxMenu();
    });

    document.getElementById('ctxMenuSettings')?.addEventListener('click', e => {
      e.stopPropagation();
      const id = menu.dataset.targetId;
      if (id) openFibModal(id);
      hideCtxMenu();
    });

    document.addEventListener('click', hideCtxMenu);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideCtxMenu(); });
  }

  function showContextMenu(clientX, clientY, id) {
    const menu = document.getElementById('drawingContextMenu');
    if (!menu || !id) return;
    menu.dataset.targetId = id;
    // Keep within viewport
    const vw = window.innerWidth, vh = window.innerHeight;
    const mw = 130, mh = 70;
    menu.style.left    = Math.min(clientX, vw - mw) + 'px';
    menu.style.top     = Math.min(clientY, vh - mh) + 'px';
    menu.style.display = 'block';
    // Show settings only for fib tools
    const d          = drawings.find(d => d.id === id);
    const hasFib     = d && (d.type === 'fib_ret' || d.type === 'fib_channel');
    const settingsEl = document.getElementById('ctxMenuSettings');
    if (settingsEl) settingsEl.style.display = hasFib ? '' : 'none';
  }

  function hideCtxMenu() {
    const m = document.getElementById('drawingContextMenu');
    if (m) m.style.display = 'none';
  }

  // ── Fibonacci settings modal ──────────────────────────────────────────────
  function setupFibModalEvents() {
    document.getElementById('fibModalClose')?.addEventListener('click', closeFibModal);
    document.getElementById('fibModalCancel')?.addEventListener('click', closeFibModal);
    document.getElementById('fibModalConfirm')?.addEventListener('click', applyFibSettings);
    document.getElementById('fibModalAddLevel')?.addEventListener('click', () => {
      addFibLevelRow(document.getElementById('fibLevelsContainer'),
        { value: 0, visible: true, color: '#ffffff' });
    });
    document.getElementById('fibModalOverlay')?.addEventListener('click', e => {
      if (e.target === document.getElementById('fibModalOverlay')) closeFibModal();
    });
  }

  function openFibModal(id) {
    const d = drawings.find(d => d.id === id);
    if (!d) return;
    fibModalId = id;
    const titleEl = document.getElementById('fibModalTitle');
    if (titleEl) titleEl.textContent =
      d.type === 'fib_ret' ? '피보나치 되돌림 설정' : '피보나치 채널 설정';
    const cont = document.getElementById('fibLevelsContainer');
    if (!cont) return;
    cont.innerHTML = '';
    (d.fibLevels || DEFAULT_FIB_LEVELS()).forEach(lv => addFibLevelRow(cont, lv));
    document.getElementById('fibModalOverlay').style.display = 'flex';
  }

  function closeFibModal() {
    fibModalId = null;
    const el = document.getElementById('fibModalOverlay');
    if (el) el.style.display = 'none';
  }

  function applyFibSettings() {
    if (!fibModalId) { closeFibModal(); return; }
    const d = drawings.find(d => d.id === fibModalId);
    if (!d) { closeFibModal(); return; }
    const rows   = document.querySelectorAll('#fibLevelsContainer .fib-level-row');
    const levels = [];
    rows.forEach(row => {
      const v   = parseFloat(row.querySelector('.fib-lv-val').value);
      const c   = row.querySelector('.fib-lv-color').value;
      const vis = row.querySelector('.fib-lv-vis').checked;
      if (!isNaN(v)) levels.push({ value: v, color: c, visible: vis });
    });
    d.fibLevels = levels.sort((a, b) => a.value - b.value);
    saveDefaultFibLevels(d.type, d.fibLevels);
    saveDrawings(currentSymbol);
    scheduleRender();
    closeFibModal();
  }

  function addFibLevelRow(cont, lv) {
    const row = document.createElement('div');
    row.className = 'fib-level-row';
    row.innerHTML = `
      <input class="fib-lv-vis"   type="checkbox" ${lv.visible ? 'checked' : ''} title="표시" />
      <input class="fib-lv-val"   type="number"   value="${lv.value}" step="0.001" />
      <input class="fib-lv-color" type="color"    value="${lv.color}" />
      <button class="fib-lv-del" title="삭제">✕</button>
    `;
    row.querySelector('.fib-lv-del').addEventListener('click', () => row.remove());
    cont.appendChild(row);
  }

  // ── Chart subscriptions ───────────────────────────────────────────────────
  function setupChartSubscriptions() {
    // Re-render on scroll, zoom, or any crosshair move
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => scheduleRender());
    chart.subscribeCrosshairMove(() => scheduleRender());
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    // chart.js's DOMContentLoaded handler runs first (script order),
    // setting window.ChartCore synchronously before we get here.
    if (window.ChartCore) {
      init();
    } else {
      document.addEventListener('chart:candles-loaded', init, { once: true });
    }
  });

})();
