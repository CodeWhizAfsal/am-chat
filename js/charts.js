/**
 * FinanceCharts — Canvas-based charting library for the Personal Finance Manager.
 *
 * Provides bar, line, doughnut, progress-ring, and horizontal-bar charts
 * with smooth animation. All charts auto-size to their container and
 * render crisply on HiDPI / Retina displays.
 */
(function () {
  'use strict';

  /* ──────────────────── Shared constants ─────────────────────── */

  var FONT = 'Inter, sans-serif';
  var LABEL_COLOR = '#9ca3af';
  var GRID_COLOR = 'rgba(255, 255, 255, 0.08)';
  var ANIM_FRAMES = 60;

  /* ──────────────────── Utility helpers ──────────────────────── */

  /**
   * Ease-out cubic: decelerates towards the end.
   */
  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * Prepare a canvas: size it to its container, apply device-pixel-ratio
   * scaling, and return the 2D context.
   */
  function prepCanvas(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    var parent = canvas.parentElement;
    var w = parent.clientWidth || 300;
    var h = parent.clientHeight || 200;
    var dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    // Store logical dimensions on the context for convenience
    ctx._w = w;
    ctx._h = h;
    return ctx;
  }

  /**
   * Draw "No data" placeholder text centered on the canvas.
   */
  function drawNoData(ctx) {
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = '14px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No data to display', ctx._w / 2, ctx._h / 2);
  }

  /**
   * Calculate nice Y-axis max from the data, rounding up to a clean step.
   */
  function niceMax(maxVal) {
    if (maxVal <= 0) return 10;
    var order = Math.pow(10, Math.floor(Math.log10(maxVal)));
    var normalized = maxVal / order;
    var nice;
    if (normalized <= 1) nice = 1;
    else if (normalized <= 2) nice = 2;
    else if (normalized <= 5) nice = 5;
    else nice = 10;
    return nice * order;
  }

  /**
   * Abbreviate a number for axis labels (e.g. 15000 → "15K").
   */
  function shortNum(n, prefix) {
    prefix = prefix || '';
    if (n >= 10000000) return prefix + (n / 10000000).toFixed(1).replace(/\.0$/, '') + 'Cr';
    if (n >= 100000) return prefix + (n / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
    if (n >= 1000) return prefix + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return prefix + n;
  }

  /**
   * Draw Y-axis grid lines and labels.
   * Returns the Y-axis max value used.
   */
  function drawYAxis(ctx, maxVal, left, top, right, bottom, prefix, steps) {
    steps = steps || 5;
    var yMax = niceMax(maxVal);
    var range = bottom - top;

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '11px ' + FONT;

    for (var i = 0; i <= steps; i++) {
      var val = (yMax / steps) * i;
      var y = Math.round(bottom - (val / yMax) * range) + 0.5;

      // Grid line
      ctx.strokeStyle = GRID_COLOR;
      ctx.globalAlpha = 0.15;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Label
      ctx.fillStyle = LABEL_COLOR;
      ctx.fillText(shortNum(val, prefix), left - 6, y);
    }

    return yMax;
  }

  /* ════════════════════════════════════════════════════════════════
   *  BAR CHART (grouped)
   * ════════════════════════════════════════════════════════════════ */

  function barChart(canvasId, options) {
    var ctx = prepCanvas(canvasId);
    if (!ctx) return;

    var labels = options.labels || [];
    var datasets = options.datasets || [];
    var prefix = options.yPrefix || '';

    if (labels.length === 0 || datasets.length === 0 || datasets.every(function (ds) { return ds.data.length === 0; })) {
      drawNoData(ctx);
      return;
    }

    var W = ctx._w;
    var H = ctx._h;

    // Margins
    var padLeft = 60;
    var padRight = 20;
    var padTop = 20;
    var padBottom = 40;

    var chartLeft = padLeft;
    var chartRight = W - padRight;
    var chartTop = padTop;
    var chartBottom = H - padBottom;
    var chartW = chartRight - chartLeft;
    var chartH = chartBottom - chartTop;

    // Find global max
    var maxVal = 0;
    datasets.forEach(function (ds) {
      ds.data.forEach(function (v) { if (v > maxVal) maxVal = v; });
    });

    var yMax = drawYAxis(ctx, maxVal, chartLeft, chartTop, chartRight, chartBottom, prefix);

    // Bar geometry
    var numGroups = labels.length;
    var numDS = datasets.length;
    var groupWidth = chartW / numGroups;
    var barPad = groupWidth * 0.2;
    var totalBarSpace = groupWidth - barPad;
    var barW = totalBarSpace / numDS;
    var radius = Math.min(4, barW / 2);

    // Animate
    var frame = 0;
    function draw() {
      frame++;
      var progress = easeOut(Math.min(frame / ANIM_FRAMES, 1));

      // Clear chart area only (preserve axis labels drawn once)
      ctx.clearRect(chartLeft, chartTop - 1, chartW + 1, chartH + padBottom + 1);

      // Re-draw grid (it was cleared)
      drawYAxis(ctx, maxVal, chartLeft, chartTop, chartRight, chartBottom, prefix);

      // X-axis labels
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = '11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (var li = 0; li < labels.length; li++) {
        var gx = chartLeft + groupWidth * li + groupWidth / 2;
        ctx.fillText(labels[li], gx, chartBottom + 8);
      }

      // Draw bars
      datasets.forEach(function (ds, dsi) {
        ctx.fillStyle = ds.color || '#6c63ff';
        for (var bi = 0; bi < ds.data.length; bi++) {
          var val = ds.data[bi] * progress;
          var bh = yMax > 0 ? (val / yMax) * chartH : 0;
          var bx = Math.round(chartLeft + groupWidth * bi + barPad / 2 + barW * dsi);
          var by = Math.round(chartBottom - bh);
          var bw = Math.round(barW - 2);

          if (bh < 1) continue;

          // Rounded top bar
          ctx.beginPath();
          var r = Math.min(radius, bh / 2);
          ctx.moveTo(bx, chartBottom);
          ctx.lineTo(bx, by + r);
          ctx.quadraticCurveTo(bx, by, bx + r, by);
          ctx.lineTo(bx + bw - r, by);
          ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
          ctx.lineTo(bx + bw, chartBottom);
          ctx.closePath();
          ctx.fill();
        }
      });

      if (frame < ANIM_FRAMES) requestAnimationFrame(draw);
    }

    // Clear everything first, draw static elements, then animate
    ctx.clearRect(0, 0, W, H);
    draw();
  }

  /* ════════════════════════════════════════════════════════════════
   *  LINE CHART
   * ════════════════════════════════════════════════════════════════ */

  function lineChart(canvasId, options) {
    var ctx = prepCanvas(canvasId);
    if (!ctx) return;

    var labels = options.labels || [];
    var datasets = options.datasets || [];
    var prefix = options.yPrefix || '';

    if (labels.length === 0 || datasets.length === 0) {
      drawNoData(ctx);
      return;
    }

    var W = ctx._w;
    var H = ctx._h;
    var padLeft = 60;
    var padRight = 20;
    var padTop = 20;
    var padBottom = 40;

    var chartLeft = padLeft;
    var chartRight = W - padRight;
    var chartTop = padTop;
    var chartBottom = H - padBottom;
    var chartW = chartRight - chartLeft;
    var chartH = chartBottom - chartTop;

    var maxVal = 0;
    datasets.forEach(function (ds) {
      ds.data.forEach(function (v) { if (v > maxVal) maxVal = v; });
    });

    /**
     * Compute bezier control points for smooth curves.
     */
    function getControlPoints(pts) {
      var cps = [];
      for (var i = 0; i < pts.length; i++) {
        var prev = pts[i - 1] || pts[i];
        var curr = pts[i];
        var next = pts[i + 1] || pts[i];
        var next2 = pts[i + 2] || next;

        var cp1x = curr.x + (next.x - prev.x) / 6;
        var cp1y = curr.y + (next.y - prev.y) / 6;
        var cp2x = next.x - (next2.x - curr.x) / 6;
        var cp2y = next.y - (next2.y - curr.y) / 6;
        cps.push({ cp1x: cp1x, cp1y: cp1y, cp2x: cp2x, cp2y: cp2y });
      }
      return cps;
    }

    // Pre-calc data point positions
    var allSeries = datasets.map(function (ds) {
      var yMax = niceMax(maxVal);
      var pts = [];
      for (var i = 0; i < ds.data.length; i++) {
        var x = labels.length === 1 ? chartLeft + chartW / 2 : chartLeft + (i / (labels.length - 1)) * chartW;
        var y = yMax > 0 ? chartBottom - (ds.data[i] / yMax) * chartH : chartBottom;
        pts.push({ x: Math.round(x), y: Math.round(y) });
      }
      return { pts: pts, cps: getControlPoints(pts), color: ds.color || '#6c63ff', fill: ds.fill !== false, data: ds.data };
    });

    var frame = 0;
    function draw() {
      frame++;
      var progress = easeOut(Math.min(frame / ANIM_FRAMES, 1));

      ctx.clearRect(0, 0, W, H);
      var yMax = drawYAxis(ctx, maxVal, chartLeft, chartTop, chartRight, chartBottom, prefix);

      // X labels
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = '11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (var li = 0; li < labels.length; li++) {
        var lx = labels.length === 1 ? chartLeft + chartW / 2 : chartLeft + (li / (labels.length - 1)) * chartW;
        ctx.fillText(labels[li], lx, chartBottom + 8);
      }

      // Draw each dataset
      allSeries.forEach(function (s) {
        var pts = s.pts;
        var cps = s.cps;
        // Determine how many points to draw based on progress
        var totalPts = pts.length;
        var visibleFloat = (totalPts - 1) * progress + 1; // number of visible points (fractional)
        var visibleCount = Math.ceil(visibleFloat);
        if (visibleCount > totalPts) visibleCount = totalPts;

        if (visibleCount < 1) return;

        // Build path
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);

        for (var i = 0; i < visibleCount - 1; i++) {
          var t = (i + 1 < visibleCount - 1) ? 1 : (visibleFloat - Math.floor(visibleFloat) || 1);
          // Interpolated end point for partial segment
          var ex = pts[i].x + (pts[i + 1].x - pts[i].x) * t;
          var ey = pts[i].y + (pts[i + 1].y - pts[i].y) * t;

          if (t === 1) {
            ctx.bezierCurveTo(cps[i].cp1x, cps[i].cp1y, cps[i].cp2x, cps[i].cp2y, pts[i + 1].x, pts[i + 1].y);
          } else {
            // Partial: just line-to for simplicity at the very edge
            ctx.bezierCurveTo(cps[i].cp1x, cps[i].cp1y, cps[i].cp2x, cps[i].cp2y, ex, ey);
          }
        }
        ctx.stroke();

        // Gradient fill
        if (s.fill) {
          var lastIdx = Math.min(visibleCount - 1, pts.length - 1);
          var grad = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
          grad.addColorStop(0, s.color + '40');
          grad.addColorStop(1, s.color + '05');

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (var j = 0; j < visibleCount - 1; j++) {
            ctx.bezierCurveTo(cps[j].cp1x, cps[j].cp1y, cps[j].cp2x, cps[j].cp2y, pts[j + 1].x, pts[j + 1].y);
          }
          ctx.lineTo(pts[lastIdx].x, chartBottom);
          ctx.lineTo(pts[0].x, chartBottom);
          ctx.closePath();
          ctx.fill();
        }

        // Data point dots
        for (var k = 0; k < visibleCount; k++) {
          ctx.beginPath();
          ctx.arc(pts[k].x, pts[k].y, 4, 0, Math.PI * 2);
          ctx.fillStyle = s.color;
          ctx.fill();
          ctx.strokeStyle = '#0f0f23';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });

      if (frame < ANIM_FRAMES) requestAnimationFrame(draw);
    }

    draw();
  }

  /* ════════════════════════════════════════════════════════════════
   *  DOUGHNUT CHART
   * ════════════════════════════════════════════════════════════════ */

  function doughnutChart(canvasId, options) {
    var ctx = prepCanvas(canvasId);
    if (!ctx) return;

    var labels = options.labels || [];
    var dataArr = options.data || [];
    var colors = options.colors || [];
    var centerText = options.centerText || '';

    var total = dataArr.reduce(function (s, v) { return s + v; }, 0);

    if (dataArr.length === 0 || total === 0) {
      drawNoData(ctx);
      return;
    }

    var W = ctx._w;
    var H = ctx._h;

    // Reserve space for legend below
    var legendLineHeight = 18;
    var legendPadTop = 12;
    var legendLines = Math.ceil(labels.length / 2);
    var legendHeight = legendLines * legendLineHeight + legendPadTop;

    var availH = H - legendHeight;
    var cx = W / 2;
    var cy = availH / 2;
    var radius = Math.min(cx, cy) - 10;
    if (radius < 30) radius = 30;
    var thickness = radius * 0.3;
    var innerR = radius - thickness;

    // Precompute slices
    var slices = [];
    var startAngle = -Math.PI / 2;
    for (var i = 0; i < dataArr.length; i++) {
      var sweep = (dataArr[i] / total) * Math.PI * 2;
      slices.push({
        start: startAngle,
        end: startAngle + sweep,
        color: colors[i] || LABEL_COLOR,
        label: labels[i] || '',
        value: dataArr[i]
      });
      startAngle += sweep;
    }

    var frame = 0;
    function draw() {
      frame++;
      var progress = easeOut(Math.min(frame / ANIM_FRAMES, 1));

      ctx.clearRect(0, 0, W, H);

      var sweepProgress = progress * Math.PI * 2;
      var drawnAngle = -Math.PI / 2;

      slices.forEach(function (sl) {
        var sliceSweep = sl.end - sl.start;
        var drawSweep = Math.min(sliceSweep, sweepProgress - (sl.start - (-Math.PI / 2)));
        if (drawSweep <= 0) return;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, sl.start, sl.start + drawSweep);
        ctx.arc(cx, cy, innerR, sl.start + drawSweep, sl.start, true);
        ctx.closePath();
        ctx.fillStyle = sl.color;
        ctx.fill();
      });

      // Center text
      if (centerText && progress > 0.5) {
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 16px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(centerText, cx, cy);
      }

      // Legend (static, always drawn)
      if (progress >= 1) {
        drawDoughnutLegend(ctx, slices, total, W, availH + legendPadTop, legendLineHeight);
      }

      if (frame < ANIM_FRAMES) requestAnimationFrame(draw);
    }

    draw();
  }

  /**
   * Draw legend items for the doughnut chart as two columns below the ring.
   */
  function drawDoughnutLegend(ctx, slices, total, W, startY, lineH) {
    var colW = W / 2;
    ctx.font = '11px ' + FONT;
    ctx.textBaseline = 'middle';

    slices.forEach(function (sl, i) {
      var col = i % 2;
      var row = Math.floor(i / 2);
      var x = col * colW + 14;
      var y = startY + row * lineH + lineH / 2;

      // Color swatch
      ctx.fillStyle = sl.color;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = LABEL_COLOR;
      ctx.textAlign = 'left';
      var pct = total > 0 ? Math.round((sl.value / total) * 100) : 0;
      ctx.fillText(sl.label + ' · ' + pct + '%', x + 10, y);
    });
  }

  /* ════════════════════════════════════════════════════════════════
   *  PROGRESS RING
   * ════════════════════════════════════════════════════════════════ */

  function progressRing(canvasId, options) {
    var ctx = prepCanvas(canvasId);
    if (!ctx) return;

    var pct = Math.min(Math.max(options.percentage || 0, 0), 100);
    var color = options.color || '#6c63ff';
    var lineWidth = options.lineWidth || 8;
    var label = options.label || '';

    var W = ctx._w;
    var H = ctx._h;
    var cx = W / 2;
    var cy = H / 2 - (label ? 8 : 0);
    var radius = Math.min(cx, cy) - lineWidth - 4;
    if (radius < 10) radius = 10;

    var frame = 0;
    function draw() {
      frame++;
      var progress = easeOut(Math.min(frame / ANIM_FRAMES, 1));

      ctx.clearRect(0, 0, W, H);

      // Background ring
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Foreground arc
      var endAngle = -Math.PI / 2 + (pct / 100) * Math.PI * 2 * progress;
      if (pct > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, -Math.PI / 2, endAngle);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Percentage text
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 14px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(pct * progress) + '%', cx, cy);

      // Optional label
      if (label) {
        ctx.fillStyle = LABEL_COLOR;
        ctx.font = '11px ' + FONT;
        ctx.fillText(label, cx, cy + radius + lineWidth + 12);
      }

      if (frame < ANIM_FRAMES) requestAnimationFrame(draw);
    }

    draw();
  }

  /* ════════════════════════════════════════════════════════════════
   *  HORIZONTAL BAR CHART
   * ════════════════════════════════════════════════════════════════ */

  function horizontalBarChart(canvasId, options) {
    var ctx = prepCanvas(canvasId);
    if (!ctx) return;

    var labels = options.labels || [];
    var dataArr = options.data || [];
    var colors = options.colors || [];
    var prefix = options.xPrefix || '';

    if (labels.length === 0 || dataArr.length === 0) {
      drawNoData(ctx);
      return;
    }

    var W = ctx._w;
    var H = ctx._h;

    // Calculate label width dynamically
    ctx.font = '12px ' + FONT;
    var maxLabelW = 0;
    labels.forEach(function (l) {
      var m = ctx.measureText(l).width;
      if (m > maxLabelW) maxLabelW = m;
    });
    var labelAreaW = Math.min(maxLabelW + 16, W * 0.35);
    var padRight = 60;
    var padTop = 10;
    var padBottom = 10;
    var chartLeft = labelAreaW;
    var chartRight = W - padRight;
    var chartW = chartRight - chartLeft;

    var barCount = labels.length;
    var barH = Math.min(28, (H - padTop - padBottom) / barCount - 6);
    var gap = (H - padTop - padBottom - barH * barCount) / Math.max(barCount - 1, 1);
    if (gap < 4) gap = 4;
    var radius = Math.min(4, barH / 2);

    var maxVal = 0;
    dataArr.forEach(function (v) { if (v > maxVal) maxVal = v; });
    if (maxVal === 0) maxVal = 1;

    var frame = 0;
    function draw() {
      frame++;
      var progress = easeOut(Math.min(frame / ANIM_FRAMES, 1));

      ctx.clearRect(0, 0, W, H);

      for (var i = 0; i < barCount; i++) {
        var y = padTop + i * (barH + gap);
        var barW = (dataArr[i] / maxVal) * chartW * progress;
        var bx = chartLeft;
        var by = Math.round(y);
        var bw = Math.round(barW);
        var bHalf = Math.round(barH);

        // Label
        ctx.fillStyle = LABEL_COLOR;
        ctx.font = '12px ' + FONT;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(labels[i], chartLeft - 8, by + bHalf / 2);

        // Bar with rounded right end
        if (bw > 1) {
          var r = Math.min(radius, bw / 2);
          ctx.fillStyle = colors[i] || '#6c63ff';
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + bw - r, by);
          ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
          ctx.lineTo(bx + bw, by + bHalf - r);
          ctx.quadraticCurveTo(bx + bw, by + bHalf, bx + bw - r, by + bHalf);
          ctx.lineTo(bx, by + bHalf);
          ctx.closePath();
          ctx.fill();
        }

        // Value label at end
        ctx.fillStyle = LABEL_COLOR;
        ctx.font = '11px ' + FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(shortNum(Math.round(dataArr[i] * progress), prefix), bx + bw + 6, by + bHalf / 2);
      }

      if (frame < ANIM_FRAMES) requestAnimationFrame(draw);
    }

    draw();
  }

  /* ════════════════════════════════════════════════════════════════
   *  CANDLESTICK CHART (Interactive Zoom/Pan/Crosshair)
   * ════════════════════════════════════════════════════════════════ */

  function candlestickChart(canvasId, options) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;

    var data = options.data || [];
    var showVwap = options.showVwap !== false;
    var showOrb = options.showOrb !== false;
    var showSma = options.showSma === true;
    var showBbands = options.showBbands === true;

    if (data.length === 0) {
      var ctx = prepCanvas(canvasId);
      if (ctx) drawNoData(ctx);
      return;
    }

    // Sort data chronologically just in case
    data = data.slice().sort(function (a, b) {
      return new Date(a.time) - new Date(b.time);
    });

    // Calculate SMA-20 and Bollinger Bands dynamically on the entire dataset
    var smaPeriod = 20;
    for (var i = 0; i < data.length; i++) {
      if (i >= smaPeriod - 1) {
        var sum = 0;
        for (var k = 0; k < smaPeriod; k++) {
          sum += data[i - k].close;
        }
        var average = sum / smaPeriod;
        data[i].sma = average;

        var sqDiffSum = 0;
        for (var m = 0; m < smaPeriod; m++) {
          sqDiffSum += Math.pow(data[i - m].close - average, 2);
        }
        var stdDev = Math.sqrt(sqDiffSum / smaPeriod);
        data[i].bbUpper = average + 2 * stdDev;
        data[i].bbLower = average - 2 * stdDev;
      } else {
        data[i].sma = null;
        data[i].bbUpper = null;
        data[i].bbLower = null;
      }
    }

    // Initialize or retrieve state on the canvas element to persist zoom/pan/hover
    if (!canvas._chartState) {
      canvas._chartState = {
        zoom: Math.min(60, data.length),
        panOffset: 0,
        crosshair: null,
        isPanning: false,
        startX: 0,
        startPanOffset: 0
      };
    }
    var state = canvas._chartState;

    // Adjust zoom if data length changed
    state.zoom = Math.min(state.zoom, data.length);
    if (state.zoom < 10) state.zoom = Math.min(10, data.length);

    // Clamp pan offset
    state.panOffset = Math.max(0, Math.min(state.panOffset, data.length - state.zoom));

    // Event listener setup (only once per canvas)
    if (!canvas._listenersAttached) {
      canvas._listenersAttached = true;

      canvas.addEventListener('mousedown', function (e) {
        var rect = canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        state.isPanning = true;
        state.startX = x;
        state.startPanOffset = state.panOffset;
        canvas.style.cursor = 'grabbing';
      });

      canvas.addEventListener('mousemove', function (e) {
        var rect = canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;

        // Logical scale coords
        var w = rect.width;
        var h = rect.height;
        var logicalX = (x / w) * canvas.width / (window.devicePixelRatio || 1);
        var logicalY = (y / h) * canvas.height / (window.devicePixelRatio || 1);

        if (state.isPanning) {
          var dx = x - state.startX;
          // Calculate how many candles dx represents
          var candleWidth = (w - 75) / state.zoom; // 75px right margin for price labels
          var candlesMoved = Math.round(dx / candleWidth);
          state.panOffset = Math.max(0, Math.min(state.startPanOffset + candlesMoved, data.length - state.zoom));
          
          // Trigger redraw
          drawChart();
        } else {
          state.crosshair = { x: logicalX, y: logicalY };
          drawChart();
        }
      });

      window.addEventListener('mouseup', function () {
        if (state.isPanning) {
          state.isPanning = false;
          canvas.style.cursor = 'crosshair';
        }
      });

      canvas.addEventListener('mouseleave', function () {
        state.crosshair = null;
        if (state.isPanning) {
          state.isPanning = false;
          canvas.style.cursor = 'default';
        } else {
          drawChart();
        }
      });

      canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        var rect = canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var w = rect.width;

        // Zoom centered on the cursor if possible
        var candleWidth = (w - 75) / state.zoom;
        var cursorIdx = state.zoom - Math.round((w - 75 - x) / candleWidth);

        var zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
        var newZoom = Math.round(state.zoom * zoomFactor);
        newZoom = Math.max(15, Math.min(newZoom, Math.min(200, data.length)));

        // Adjust panOffset to zoom centered on cursor
        var zoomDiff = newZoom - state.zoom;
        state.zoom = newZoom;
        state.panOffset = Math.max(0, Math.min(state.panOffset - Math.round(zoomDiff * 0.5), data.length - state.zoom));

        drawChart();
      }, { passive: false });

      canvas.style.cursor = 'crosshair';
    }

    // The core drawing function
    function drawChart() {
      var ctx = prepCanvas(canvasId);
      if (!ctx) return;

      var W = ctx._w;
      var H = ctx._h;

      // Dividers & Margins
      var padLeft = 15;
      var padRight = 75; // Right-aligned Y axis
      var padTop = 30;
      var padBottom = 25;

      var chartLeft = padLeft;
      var chartRight = W - padRight;
      var chartTop = padTop;
      var chartBottom = H - padBottom;
      var chartW = chartRight - chartLeft;
      var chartH = chartBottom - chartTop;

      // Slice the data based on zoom and pan
      var endIdx = data.length - state.panOffset;
      var startIdx = Math.max(0, endIdx - state.zoom);
      var visibleData = data.slice(startIdx, endIdx);

      if (visibleData.length === 0) {
        drawNoData(ctx);
        return;
      }

      // Calculate price ranges for scaling
      var maxPrice = -Infinity;
      var minPrice = Infinity;
      var maxVolume = 0;

      visibleData.forEach(function (d) {
        if (d.high > maxPrice) maxPrice = d.high;
        if (d.low < minPrice) minPrice = d.low;
        if (d.volume > maxVolume) maxVolume = d.volume;
        
        // Include VWAP in range if shown
        if (showVwap && d.vwap != null) {
          if (d.vwap > maxPrice) maxPrice = d.vwap;
          if (d.vwap < minPrice) minPrice = d.vwap;
        }

        // Include SMA in range if shown
        if (showSma && d.sma != null) {
          if (d.sma > maxPrice) maxPrice = d.sma;
          if (d.sma < minPrice) minPrice = d.sma;
        }

        // Include Bollinger Bands in range if shown
        if (showBbands && d.bbUpper != null) {
          if (d.bbUpper > maxPrice) maxPrice = d.bbUpper;
          if (d.bbLower < minPrice) minPrice = d.bbLower;
        }
      });

      // Calculate ORB (first 15 minutes range) from data if it's intraday
      var orbHigh = null;
      var orbLow = null;
      if (showOrb) {
        var firstDayDate = data[0] ? new Date(data[0].time).toDateString() : '';
        var orbCandles = data.filter(function (d) {
          var dDate = new Date(d.time);
          if (dDate.toDateString() !== firstDayDate) return false;
          var hours = dDate.getHours();
          var mins = dDate.getMinutes();
          var timeVal = hours * 60 + mins;
          return timeVal >= (9*60 + 15) && timeVal <= (9*60 + 30);
        });

        if (orbCandles.length > 0) {
          orbHigh = Math.max.apply(null, orbCandles.map(function(d) { return d.high; }));
          orbLow = Math.min.apply(null, orbCandles.map(function(d) { return d.low; }));
          
          // Factor ORB into price range
          if (orbHigh > maxPrice) maxPrice = orbHigh;
          if (orbLow < minPrice) minPrice = orbLow;
        }
      }

      // If prices are identical or invalid
      if (maxPrice === minPrice) {
        maxPrice += 1;
        minPrice -= 1;
      }

      // Add a margin to top/bottom of price range
      var priceRange = maxPrice - minPrice;
      maxPrice += priceRange * 0.08;
      minPrice -= priceRange * 0.08;
      priceRange = maxPrice - minPrice;

      // Clear canvas
      ctx.fillStyle = '#0a0a0f'; // Dark obsidian body
      ctx.fillRect(0, 0, W, H);

      // Draw grid lines (horizontal price lines)
      var steps = 5;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '10px ' + FONT;
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;

      for (var i = 0; i <= steps; i++) {
        var priceVal = minPrice + (priceRange / steps) * i;
        var y = Math.round(chartBottom - (i / steps) * chartH) + 0.5;

        // Draw horizontal grid line
        ctx.beginPath();
        ctx.moveTo(chartLeft, y);
        ctx.lineTo(chartRight, y);
        ctx.stroke();

        // Draw price label on the right
        ctx.fillStyle = LABEL_COLOR;
        ctx.fillText('₹' + priceVal.toFixed(2), chartRight + 8, y);
      }

      // Draw vertical time grid lines
      var timeStep = Math.max(1, Math.round(state.zoom / 6));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      for (var j = 0; j < visibleData.length; j += timeStep) {
        var candleW = chartW / visibleData.length;
        var cx = chartLeft + j * candleW + candleW / 2;
        var cy = chartBottom + 6;

        // Draw vertical grid line
        ctx.beginPath();
        ctx.moveTo(cx, chartTop);
        ctx.lineTo(cx, chartBottom);
        ctx.stroke();

        // Format and draw time label
        var tDate = new Date(visibleData[j].time);
        var timeLabel = tDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
        if (state.zoom > 100 && j % (timeStep * 2) === 0) {
          timeLabel = (tDate.getDate()) + '/' + (tDate.getMonth() + 1) + ' ' + timeLabel;
        }

        ctx.fillStyle = LABEL_COLOR;
        ctx.fillText(timeLabel, cx, cy);
      }

      // Draw ORB Channels
      if (showOrb && orbHigh != null && orbLow != null) {
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);

        // ORB High
        var orbHighY = Math.round(chartBottom - ((orbHigh - minPrice) / priceRange) * chartH) + 0.5;
        ctx.strokeStyle = '#ec4899'; // Hot pink for ORB High
        ctx.beginPath();
        ctx.moveTo(chartLeft, orbHighY);
        ctx.lineTo(chartRight, orbHighY);
        ctx.stroke();
        ctx.fillStyle = '#ec4899';
        ctx.font = 'bold 9px ' + FONT;
        ctx.fillText('ORB HIGH: ₹' + orbHigh.toFixed(1), chartLeft + 8, orbHighY - 6);

        // ORB Low
        var orbLowY = Math.round(chartBottom - ((orbLow - minPrice) / priceRange) * chartH) + 0.5;
        ctx.strokeStyle = '#3b82f6'; // Neon blue for ORB Low
        ctx.beginPath();
        ctx.moveTo(chartLeft, orbLowY);
        ctx.lineTo(chartRight, orbLowY);
        ctx.stroke();
        ctx.fillStyle = '#3b82f6';
        ctx.fillText('ORB LOW: ₹' + orbLow.toFixed(1), chartLeft + 8, orbLowY + 6);

        ctx.setLineDash([]); // Reset
      }

      // Draw Bollinger Bands Shaded Area & Lines
      if (showBbands) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.02)';
        ctx.beginPath();
        var firstPoint = true;
        visibleData.forEach(function (d, idx) {
          if (d.bbUpper != null) {
            var x = chartLeft + idx * candleWidth + candleWidth / 2;
            var y = chartBottom - ((d.bbUpper - minPrice) / priceRange) * chartH;
            if (firstPoint) {
              ctx.moveTo(x, y);
              firstPoint = false;
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        
        for (var v = visibleData.length - 1; v >= 0; v--) {
          var dLower = visibleData[v];
          if (dLower.bbLower != null) {
            var xL = chartLeft + v * candleWidth + candleWidth / 2;
            var yL = chartBottom - ((dLower.bbLower - minPrice) / priceRange) * chartH;
            ctx.lineTo(xL, yL);
          }
        }
        ctx.closePath();
        ctx.fill();

        // Bollinger Bands dashed lines
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        ctx.beginPath();
        var firstU = true;
        visibleData.forEach(function (d, idx) {
          if (d.bbUpper != null) {
            var x = chartLeft + idx * candleWidth + candleWidth / 2;
            var y = chartBottom - ((d.bbUpper - minPrice) / priceRange) * chartH;
            if (firstU) { ctx.moveTo(x, y); firstU = false; }
            else { ctx.lineTo(x, y); }
          }
        });
        ctx.stroke();

        ctx.beginPath();
        var firstL = true;
        visibleData.forEach(function (d, idx) {
          if (d.bbLower != null) {
            var x = chartLeft + idx * candleWidth + candleWidth / 2;
            var y = chartBottom - ((d.bbLower - minPrice) / priceRange) * chartH;
            if (firstL) { ctx.moveTo(x, y); firstL = false; }
            else { ctx.lineTo(x, y); }
          }
        });
        ctx.stroke();

        ctx.setLineDash([]);
      }

      // Draw Candlesticks & Volumes
      var candleWidth = chartW / visibleData.length;
      var bodyWidth = candleWidth * 0.72;
      var vMaxH = chartH * 0.18;

      visibleData.forEach(function (d, idx) {
        var x = chartLeft + idx * candleWidth + candleWidth / 2;
        var yHigh = chartBottom - ((d.high - minPrice) / priceRange) * chartH;
        var yLow = chartBottom - ((d.low - minPrice) / priceRange) * chartH;
        var yOpen = chartBottom - ((d.open - minPrice) / priceRange) * chartH;
        var yClose = chartBottom - ((d.close - minPrice) / priceRange) * chartH;

        var isUp = d.close >= d.open;
        var candleColor = isUp ? '#10b981' : '#f43f5e';

        // Volume Bar
        var volH = maxVolume > 0 ? (d.volume / maxVolume) * vMaxH : 0;
        ctx.fillStyle = isUp ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)';
        ctx.fillRect(x - bodyWidth / 2, chartBottom - volH, bodyWidth, volH);
        
        ctx.strokeStyle = isUp ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - bodyWidth / 2, chartBottom - volH, bodyWidth, volH);

        // Wick
        ctx.strokeStyle = candleColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, Math.round(yHigh));
        ctx.lineTo(Math.round(x) + 0.5, Math.round(yLow));
        ctx.stroke();

        // Body
        ctx.fillStyle = candleColor;
        var yTop = Math.min(yOpen, yClose);
        var yBottom = Math.max(yOpen, yClose);
        var bodyH = Math.max(1.5, yBottom - yTop);
        ctx.fillRect(Math.round(x - bodyWidth / 2), Math.round(yTop), Math.round(bodyWidth), Math.round(bodyH));
      });

      // Draw VWAP line
      if (showVwap) {
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.beginPath();

        var firstPoint = true;
        visibleData.forEach(function (d, idx) {
          if (d.vwap != null) {
            var x = chartLeft + idx * candleWidth + candleWidth / 2;
            var y = chartBottom - ((d.vwap - minPrice) / priceRange) * chartH;
            if (firstPoint) {
              ctx.moveTo(x, y);
              firstPoint = false;
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        ctx.stroke();

        if (visibleData[visibleData.length - 1] && visibleData[visibleData.length - 1].vwap != null) {
          var finalD = visibleData[visibleData.length - 1];
          var finalX = chartLeft + (visibleData.length - 1) * candleWidth + candleWidth / 2;
          var finalY = chartBottom - ((finalD.vwap - minPrice) / priceRange) * chartH;
          ctx.fillStyle = '#a855f7';
          ctx.font = 'bold 9px ' + FONT;
          ctx.textAlign = 'left';
          ctx.fillText('VWAP', finalX + 12, finalY);
        }
      }

      // Draw SMA Line
      if (showSma) {
        ctx.strokeStyle = '#38bdf8'; // Sky blue
        ctx.lineWidth = 1.8;
        ctx.lineJoin = 'round';
        ctx.beginPath();

        var firstS = true;
        visibleData.forEach(function (d, idx) {
          if (d.sma != null) {
            var x = chartLeft + idx * candleWidth + candleWidth / 2;
            var y = chartBottom - ((d.sma - minPrice) / priceRange) * chartH;
            if (firstS) {
              ctx.moveTo(x, y);
              firstS = false;
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        ctx.stroke();

        if (visibleData[visibleData.length - 1] && visibleData[visibleData.length - 1].sma != null) {
          var finalD = visibleData[visibleData.length - 1];
          var finalX = chartLeft + (visibleData.length - 1) * candleWidth + candleWidth / 2;
          var finalY = chartBottom - ((finalD.sma - minPrice) / priceRange) * chartH;
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 9px ' + FONT;
          ctx.textAlign = 'left';
          ctx.fillText('SMA(20)', finalX + 12, finalY);
        }
      }

      // Draw Crosshair & Hover Tooltip
      if (state.crosshair) {
        var cx = state.crosshair.x;
        var cy = state.crosshair.y;

        if (cx >= chartLeft && cx <= chartRight && cy >= chartTop && cy <= chartBottom) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);

          ctx.beginPath();
          ctx.moveTo(cx, chartTop);
          ctx.lineTo(cx, chartBottom);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(chartLeft, cy);
          ctx.lineTo(chartRight, cy);
          ctx.stroke();

          ctx.setLineDash([]);

          var candleIdx = Math.floor((cx - chartLeft) / candleWidth);
          candleIdx = Math.max(0, Math.min(candleIdx, visibleData.length - 1));
          var hoveredCandle = visibleData[candleIdx];

          if (hoveredCandle) {
            ctx.fillStyle = 'rgba(15, 15, 25, 0.9)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            ctx.fillRect(chartLeft + 10, chartTop + 10, 340, 24);
            ctx.strokeRect(chartLeft + 10, chartTop + 10, 340, 24);

            ctx.fillStyle = '#ffffff';
            ctx.font = '11px ' + FONT;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            var tStr = new Date(hoveredCandle.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            var ohlcText = 
              'T: ' + tStr + ' ' +
              'O: ' + hoveredCandle.open.toFixed(1) + ' ' +
              'H: ' + hoveredCandle.high.toFixed(1) + ' ' +
              'L: ' + hoveredCandle.low.toFixed(1) + ' ' +
              'C: ' + hoveredCandle.close.toFixed(1) + ' ' +
              (hoveredCandle.sma ? 'S: ' + hoveredCandle.sma.toFixed(1) + ' ' : '') +
              'V: ' + shortNum(hoveredCandle.volume);

            ctx.fillText(ohlcText, chartLeft + 18, chartTop + 22);

            var hoverPrice = minPrice + ((chartBottom - cy) / chartH) * priceRange;
            ctx.fillStyle = '#4f46e5';
            ctx.fillRect(chartRight, cy - 8, padRight - 5, 16);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px ' + FONT;
            ctx.textAlign = 'center';
            ctx.fillText('₹' + hoverPrice.toFixed(2), chartRight + (padRight - 5)/2, cy);

            var hoverTime = new Date(hoveredCandle.time);
            var hoverTimeStr = hoverTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            ctx.fillStyle = '#4f46e5';
            ctx.fillRect(cx - 30, chartBottom, 60, 16);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px ' + FONT;
            ctx.textAlign = 'center';
            ctx.fillText(hoverTimeStr, cx, chartBottom + 8);
          }
        }
      }
    }

    drawChart();
    canvas.redrawChart = drawChart;
  }

  /* ════════════════════════════════════════════════════════════════
   *  CLEAR HELPER
   * ════════════════════════════════════════════════════════════════ */

  function clear(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /* ─────────────────── Public API ────────────────────────────── */

  window.FinanceCharts = {
    barChart: barChart,
    lineChart: lineChart,
    doughnutChart: doughnutChart,
    progressRing: progressRing,
    horizontalBarChart: horizontalBarChart,
    candlestickChart: candlestickChart,
    clear: clear
  };
})();
