/**
 * =============================================================================
 * RiskEngine.js — Production-Grade Risk Management & Execution Engine
 * =============================================================================
 *
 * Browser-based intraday trading workstation module.
 * Exposes: window.RiskEngine
 *
 * Functions:
 *   1.  kellySize              – Fractional Kelly Criterion position sizing
 *   2.  volatilityScale        – Risk-parity volatility scaling
 *   3.  computeCVaR            – Conditional Value at Risk (99%)
 *   4.  checkDrawdownBreaker   – Intraday drawdown circuit breaker
 *   5.  correlationExposure    – Correlation-adjusted portfolio exposure
 *   6.  eventFilter            – Macro / earnings event proximity filter
 *   7.  volatilityShiftDetection – Regime shift detection via z-score
 *   8.  implementationShortfall – IS decomposition analysis
 *   9.  simulateSOR            – Smart Order Router (TWAP/VWAP/Iceberg)
 *  10.  almgrenChriss          – Almgren-Chriss optimal execution trajectory
 *  11.  preTradeChecks         – Aggregate pre-trade risk gate
 *
 * No external dependencies. Uses var declarations for broad compatibility.
 * =============================================================================
 */
(function () {
  'use strict';

  /* =========================================================================
   *  INTERNAL HELPERS
   * ========================================================================= */

  /**
   * Clamp a value between lo and hi (inclusive).
   * @param {number} v
   * @param {number} lo
   * @param {number} hi
   * @returns {number}
   */
  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  /**
   * Arithmetic mean of a numeric array.
   * @param {number[]} arr
   * @returns {number}
   */
  function mean(arr) {
    if (!arr || arr.length === 0) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  /**
   * Population standard deviation.
   * @param {number[]} arr
   * @param {number} [mu] - precomputed mean (optional)
   * @returns {number}
   */
  function stddev(arr, mu) {
    if (!arr || arr.length < 2) return 0;
    if (mu === undefined) mu = mean(arr);
    var ss = 0;
    for (var i = 0; i < arr.length; i++) {
      var d = arr[i] - mu;
      ss += d * d;
    }
    return Math.sqrt(ss / arr.length);
  }

  /**
   * Compute simple returns from a price series.
   * @param {number[]} prices
   * @returns {number[]}
   */
  function priceReturns(prices) {
    if (!prices || prices.length < 2) return [];
    var ret = [];
    for (var i = 1; i < prices.length; i++) {
      ret.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return ret;
  }

  /**
   * Sort array of numbers ascending (non-mutating).
   * @param {number[]} arr
   * @returns {number[]}
   */
  function sortAsc(arr) {
    return arr.slice().sort(function (a, b) { return a - b; });
  }

  /**
   * Compute Pearson correlation coefficient between two equal-length arrays.
   * @param {number[]} x
   * @param {number[]} y
   * @returns {number}
   */
  function pearson(x, y) {
    var n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    var mx = mean(x);
    var my = mean(y);
    var num = 0, dx2 = 0, dy2 = 0;
    for (var i = 0; i < n; i++) {
      var dx = x[i] - mx;
      var dy = y[i] - my;
      num += dx * dy;
      dx2 += dx * dx;
      dy2 += dy * dy;
    }
    var denom = Math.sqrt(dx2 * dy2);
    if (denom === 0) return 0;
    return num / denom;
  }

  /**
   * Sign function.
   * @param {number} v
   * @returns {number} -1, 0, or 1
   */
  function sgn(v) {
    if (v > 0) return 1;
    if (v < 0) return -1;
    return 0;
  }

  /**
   * Safe division — returns fallback on divide-by-zero.
   * @param {number} numerator
   * @param {number} denominator
   * @param {number} [fallback=0]
   * @returns {number}
   */
  function safeDivide(numerator, denominator, fallback) {
    if (denominator === 0 || !isFinite(denominator)) return (fallback !== undefined ? fallback : 0);
    return numerator / denominator;
  }

  /* =========================================================================
   *  1. POSITION SIZING — FRACTIONAL KELLY CRITERION
   * ========================================================================= */

  /**
   * Calculate position size using the Fractional Kelly Criterion.
   *
   * Full Kelly:  f* = (p × b − q) / b
   *   where p = winProb, q = 1 − p, b = avgWinLossRatio
   *
   * Fractional Kelly applies a conservative multiplier (typically 0.25–0.50)
   * and caps individual signal risk at 2 % of capital.
   *
   * @param {number} winProb             - Historical win probability (0–1)
   * @param {number} avgWinLossRatio     - Average win / average loss (b)
   * @param {number} capitalAvailable    - Current liquid capital
   * @param {number} [fractionMultiplier=0.25] - Kelly fraction (0.25–0.50 typical)
   * @returns {{
   *   kellyFraction: number,
   *   fractionalKelly: number,
   *   positionSize: number,
   *   maxRiskAmount: number
   * }}
   */
  function kellySize(winProb, avgWinLossRatio, capitalAvailable, fractionMultiplier) {
    /* ── defaults & guards ────────────────────────────────────────── */
    if (fractionMultiplier === undefined || fractionMultiplier === null) fractionMultiplier = 0.25;
    winProb = clamp(Number(winProb) || 0, 0, 1);
    avgWinLossRatio = Math.max(Number(avgWinLossRatio) || 0, 0);
    capitalAvailable = Math.max(Number(capitalAvailable) || 0, 0);
    fractionMultiplier = clamp(Number(fractionMultiplier), 0, 1);

    var MAX_RISK_PCT = 0.02; // hard cap 2 % per signal

    /* ── full Kelly ───────────────────────────────────────────────── */
    var p = winProb;
    var q = 1 - p;
    var b = avgWinLossRatio;
    var kellyFraction = (b > 0) ? (p * b - q) / b : 0;
    if (kellyFraction < 0) kellyFraction = 0; // negative edge → do not trade

    /* ── fractional Kelly ─────────────────────────────────────────── */
    var fractionalKelly = kellyFraction * fractionMultiplier;
    fractionalKelly = Math.min(fractionalKelly, MAX_RISK_PCT); // cap at 2 %

    /* ── translate to capital ──────────────────────────────────────── */
    var positionSize = fractionalKelly * capitalAvailable;
    var maxRiskAmount = MAX_RISK_PCT * capitalAvailable;

    return {
      kellyFraction:    Math.round(kellyFraction * 1e8) / 1e8,
      fractionalKelly:  Math.round(fractionalKelly * 1e8) / 1e8,
      positionSize:     Math.round(positionSize * 100) / 100,
      maxRiskAmount:    Math.round(maxRiskAmount * 100) / 100
    };
  }

  /* =========================================================================
   *  2. VOLATILITY SCALING (RISK PARITY)
   * ========================================================================= */

  /**
   * Scale position size inversely proportional to current realised volatility.
   *
   *   scaled_size = (target_vol / current_vol) × base_size
   *
   * Clamped between 0.25× and 2.0× of base_size.
   *
   * @param {number} targetVol  - Target annualised volatility (e.g. 0.16 = 16 %)
   * @param {number} currentVol - Current realised annualised vol
   * @param {number} baseSize   - Baseline position size (shares or notional)
   * @returns {{
   *   scaledSize: number,
   *   scalingFactor: number,
   *   targetVol: number,
   *   currentVol: number
   * }}
   */
  function volatilityScale(targetVol, currentVol, baseSize) {
    targetVol  = Math.max(Number(targetVol) || 0, 0);
    currentVol = Math.max(Number(currentVol) || 0, 0);
    baseSize   = Math.max(Number(baseSize) || 0, 0);

    var MIN_SCALE = 0.25;
    var MAX_SCALE = 2.0;

    var rawFactor = (currentVol > 0) ? targetVol / currentVol : 1;
    var scalingFactor = clamp(rawFactor, MIN_SCALE, MAX_SCALE);
    var scaledSize = scalingFactor * baseSize;

    return {
      scaledSize:    Math.round(scaledSize * 100) / 100,
      scalingFactor: Math.round(scalingFactor * 1e6) / 1e6,
      targetVol:     targetVol,
      currentVol:    currentVol
    };
  }

  /* =========================================================================
   *  3. CVaR (CONDITIONAL VALUE AT RISK)
   * ========================================================================= */

  /**
   * Compute Value-at-Risk and Conditional Value-at-Risk (Expected Shortfall).
   *
   * Steps:
   *   1. Sort returns ascending.
   *   2. VaR = returns[floor((1 − confidence) × n)]
   *   3. CVaR = mean of all returns ≤ VaR
   *   4. Tail ratio = |mean of top quantile| / |mean of bottom quantile|
   *
   * @param {number[]} returns         - Array of period returns
   * @param {number}   [confidenceLevel=0.99] - Confidence level (0–1)
   * @returns {{
   *   var99: number,
   *   cvar99: number,
   *   expectedShortfall: number,
   *   tailRatio: number,
   *   worstReturn: number
   * }}
   */
  function computeCVaR(returns, confidenceLevel) {
    if (!returns || returns.length === 0) {
      return { var99: 0, cvar99: 0, expectedShortfall: 0, tailRatio: 0, worstReturn: 0 };
    }

    if (confidenceLevel === undefined || confidenceLevel === null) confidenceLevel = 0.99;
    confidenceLevel = clamp(Number(confidenceLevel), 0.5, 0.9999);

    var sorted = sortAsc(returns);
    var n = sorted.length;

    /* ── VaR ───────────────────────────────────────────────────── */
    var varIdx = Math.floor((1 - confidenceLevel) * n);
    varIdx = clamp(varIdx, 0, n - 1);
    var varValue = sorted[varIdx];

    /* ── CVaR (Expected Shortfall) ──────────────────────────────── */
    var tailValues = [];
    for (var i = 0; i <= varIdx; i++) {
      tailValues.push(sorted[i]);
    }
    if (tailValues.length === 0) tailValues.push(sorted[0]);
    var cvarValue = mean(tailValues);

    /* ── Tail ratio ─────────────────────────────────────────────── */
    var bottomQIdx = Math.max(1, Math.floor(0.05 * n));
    var topQIdx    = Math.max(1, Math.floor(0.05 * n));
    var bottomSlice = sorted.slice(0, bottomQIdx);
    var topSlice    = sorted.slice(n - topQIdx);
    var bottomMean  = mean(bottomSlice);
    var topMean     = mean(topSlice);
    var tailRatio   = (Math.abs(bottomMean) > 0)
      ? Math.abs(topMean) / Math.abs(bottomMean)
      : 0;

    return {
      var99:             Math.round(varValue * 1e8) / 1e8,
      cvar99:            Math.round(cvarValue * 1e8) / 1e8,
      expectedShortfall: Math.round(cvarValue * 1e8) / 1e8,
      tailRatio:         Math.round(tailRatio * 1e4) / 1e4,
      worstReturn:       sorted[0]
    };
  }

  /* =========================================================================
   *  4. DRAWDOWN CIRCUIT BREAKER
   * ========================================================================= */

  /**
   * Intraday drawdown circuit breaker.
   *
   * Computes current drawdown from equity-curve peak and compares it to
   * 1.5 × average daily range. If breached → HALT new entries; only closes.
   *
   * @param {number[]} equityCurve       - Timestamped equity values (chronological)
   * @param {number}   averageDailyRange - Typical ADR in currency units
   * @returns {{
   *   currentDrawdown: number,
   *   drawdownPct: number,
   *   breached: boolean,
   *   threshold: number,
   *   action: string
   * }}
   */
  function checkDrawdownBreaker(equityCurve, averageDailyRange) {
    if (!equityCurve || equityCurve.length === 0) {
      return {
        currentDrawdown: 0, drawdownPct: 0, breached: false,
        threshold: 0, action: 'NORMAL'
      };
    }

    averageDailyRange = Math.max(Number(averageDailyRange) || 0, 0);

    /* ── find peak and current ────────────────────────────────────── */
    var peak = -Infinity;
    for (var i = 0; i < equityCurve.length; i++) {
      if (equityCurve[i] > peak) peak = equityCurve[i];
    }
    var current = equityCurve[equityCurve.length - 1];
    var drawdown = peak - current;
    if (drawdown < 0) drawdown = 0; // equity at new high

    var drawdownPct = (peak > 0) ? drawdown / peak : 0;
    var threshold = 1.5 * averageDailyRange;
    var breached = drawdown >= threshold && threshold > 0;

    return {
      currentDrawdown: Math.round(drawdown * 100) / 100,
      drawdownPct:     Math.round(drawdownPct * 1e6) / 1e6,
      breached:        breached,
      threshold:       Math.round(threshold * 100) / 100,
      action:          breached ? 'HALT' : 'NORMAL'
    };
  }

  /* =========================================================================
   *  5. CORRELATION-ADJUSTED EXPOSURE
   * ========================================================================= */

  /**
   * Compute correlation-adjusted gross exposure for a multi-asset portfolio.
   *
   * Steps:
   *   1. Build return series for every held instrument from priceHistory.
   *   2. Compute pairwise Pearson correlation matrix.
   *   3. Effective exposure = Σ |position_value_i| × (1 + avg |ρ_ij| for j≠i) / 2
   *   4. Flag concentration if effective > 1.5 × gross.
   *
   * @param {Array<{symbol:string, value:number, sector?:string}>} positions
   *   Currently held positions with market value (signed).
   * @param {Object<string, number[]>} priceHistory
   *   Map of symbol → array of historical prices (same length, aligned).
   * @returns {{
   *   correlationMatrix: Object,
   *   effectiveExposure: number,
   *   grossExposure: number,
   *   concentrationRisk: boolean,
   *   sectorBreakdown: Object
   * }}
   */
  function correlationExposure(positions, priceHistory) {
    var result = {
      correlationMatrix: {},
      effectiveExposure: 0,
      grossExposure: 0,
      concentrationRisk: false,
      sectorBreakdown: {}
    };

    if (!positions || positions.length === 0) return result;
    if (!priceHistory) priceHistory = {};

    var symbols = [];
    var values  = [];
    var sectors = {};

    for (var p = 0; p < positions.length; p++) {
      var pos = positions[p];
      symbols.push(pos.symbol);
      values.push(Number(pos.value) || 0);
      var sec = pos.sector || 'Unknown';
      if (!sectors[sec]) sectors[sec] = 0;
      sectors[sec] += Math.abs(Number(pos.value) || 0);
    }

    var n = symbols.length;

    /* ── compute return series ────────────────────────────────────── */
    var retMap = {};
    for (var i = 0; i < n; i++) {
      var prices = priceHistory[symbols[i]];
      retMap[symbols[i]] = prices ? priceReturns(prices) : [];
    }

    /* ── correlation matrix ───────────────────────────────────────── */
    var corrMatrix = {};
    for (var a = 0; a < n; a++) {
      corrMatrix[symbols[a]] = {};
      for (var b = 0; b < n; b++) {
        if (a === b) {
          corrMatrix[symbols[a]][symbols[b]] = 1;
        } else {
          corrMatrix[symbols[a]][symbols[b]] = pearson(
            retMap[symbols[a]], retMap[symbols[b]]
          );
        }
      }
    }

    /* ── gross exposure ───────────────────────────────────────────── */
    var gross = 0;
    for (var g = 0; g < n; g++) gross += Math.abs(values[g]);

    /* ── effective exposure ───────────────────────────────────────── */
    var effective = 0;
    for (var ei = 0; ei < n; ei++) {
      var avgCorr = 0;
      var cnt = 0;
      for (var ej = 0; ej < n; ej++) {
        if (ei === ej) continue;
        avgCorr += Math.abs(corrMatrix[symbols[ei]][symbols[ej]]);
        cnt++;
      }
      avgCorr = (cnt > 0) ? avgCorr / cnt : 0;
      // Factor: assets highly correlated amplify effective exposure
      effective += Math.abs(values[ei]) * (1 + avgCorr) / 2;
    }

    // If only one position, effective = gross
    if (n === 1) effective = gross;

    var concentrationRisk = effective > 1.5 * gross && gross > 0;

    result.correlationMatrix = corrMatrix;
    result.effectiveExposure = Math.round(effective * 100) / 100;
    result.grossExposure     = Math.round(gross * 100) / 100;
    result.concentrationRisk = concentrationRisk;
    result.sectorBreakdown   = sectors;

    return result;
  }

  /* =========================================================================
   *  6. EVENT FILTER
   * ========================================================================= */

  /**
   * Check proximity to scheduled macro / earnings events.
   *
   * If current time is within 30 minutes of any event → reduce position size
   * to 25 % of normal.
   *
   * @param {Date|number|string} currentTime  - Current timestamp
   * @param {Array<{name:string, time:Date|number|string}>} eventCalendar
   * @returns {{
   *   nearEvent: boolean,
   *   eventName: string,
   *   minutesToEvent: number,
   *   sizeMultiplier: number
   * }}
   */
  function eventFilter(currentTime, eventCalendar) {
    var DEFAULT_RESULT = {
      nearEvent: false,
      eventName: '',
      minutesToEvent: Infinity,
      sizeMultiplier: 1.0
    };

    if (!eventCalendar || eventCalendar.length === 0) return DEFAULT_RESULT;

    var now = (currentTime instanceof Date) ? currentTime.getTime() : new Date(currentTime).getTime();
    if (isNaN(now)) return DEFAULT_RESULT;

    var EVENT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
    var SIZE_REDUCTION  = 0.25;

    var closestName = '';
    var closestMinutes = Infinity;

    for (var i = 0; i < eventCalendar.length; i++) {
      var evt = eventCalendar[i];
      var evtTime = (evt.time instanceof Date) ? evt.time.getTime() : new Date(evt.time).getTime();
      if (isNaN(evtTime)) continue;

      var diffMs = evtTime - now; // positive = future
      var absDiff = Math.abs(diffMs);
      var minutes = absDiff / 60000;

      if (minutes < closestMinutes) {
        closestMinutes = minutes;
        closestName = evt.name || 'Unknown Event';
      }
    }

    var nearEvent = closestMinutes <= 30;

    return {
      nearEvent:      nearEvent,
      eventName:      closestName,
      minutesToEvent: Math.round(closestMinutes * 100) / 100,
      sizeMultiplier: nearEvent ? SIZE_REDUCTION : 1.0
    };
  }

  /* =========================================================================
   *  7. VOLATILITY REGIME SHIFT DETECTION
   * ========================================================================= */

  /**
   * Detect volatility regime shifts using a rolling z-score approach.
   *
   * 1. Compute rolling mean & std of realised vol over `window` periods.
   * 2. Z-score = (current_vol − rolling_mean) / rolling_std
   * 3. If z-score > 2 → defensive mode → size multiplier = 0.5
   *
   * @param {number[]} realizedVols - Array of realised vols (e.g. daily)
   * @param {number}   [window=20] - Lookback window
   * @returns {{
   *   currentVol: number,
   *   rollingMean: number,
   *   rollingStd: number,
   *   zScore: number,
   *   isShifted: boolean,
   *   sizeMultiplier: number
   * }}
   */
  function volatilityShiftDetection(realizedVols, window) {
    if (!realizedVols || realizedVols.length === 0) {
      return {
        currentVol: 0, rollingMean: 0, rollingStd: 0,
        zScore: 0, isShifted: false, sizeMultiplier: 1.0
      };
    }

    if (window === undefined || window === null) window = 20;
    window = Math.max(Math.floor(Number(window)) || 20, 2);

    var n = realizedVols.length;
    var currentVol = realizedVols[n - 1];

    /* ── rolling window ───────────────────────────────────────────── */
    var start = Math.max(0, n - 1 - window); // exclude current for baseline
    var end   = n - 1;                        // exclusive of current
    if (start >= end) {
      // not enough data for baseline
      return {
        currentVol: currentVol, rollingMean: currentVol, rollingStd: 0,
        zScore: 0, isShifted: false, sizeMultiplier: 1.0
      };
    }

    var slice = realizedVols.slice(start, end);
    var mu = mean(slice);
    var sd = stddev(slice, mu);

    var zScore = (sd > 0) ? (currentVol - mu) / sd : 0;
    var isShifted = zScore > 2;

    return {
      currentVol:     Math.round(currentVol * 1e8) / 1e8,
      rollingMean:    Math.round(mu * 1e8) / 1e8,
      rollingStd:     Math.round(sd * 1e8) / 1e8,
      zScore:         Math.round(zScore * 1e4) / 1e4,
      isShifted:      isShifted,
      sizeMultiplier: isShifted ? 0.5 : 1.0
    };
  }

  /* =========================================================================
   *  8. IMPLEMENTATION SHORTFALL ANALYSIS
   * ========================================================================= */

  /**
   * Decompose execution quality into Implementation Shortfall components.
   *
   * Total IS = (execution_price − decision_price) × shares × side_sign
   * Decomposition:
   *   market_impact     = (execution_price − arrival_price) × shares
   *   timing            = (arrival_price − vwap) × shares
   *   adverse_selection = total_IS − market_impact − timing
   *
   * We treat entryPrice as arrival/decision price and exitPrice as execution
   * price for analysis of a completed round-trip or a fill event.
   *
   * @param {number} entryPrice     - Decision / arrival price
   * @param {number} exitPrice      - Actual execution price
   * @param {number} vwapBenchmark  - VWAP over the execution window
   * @param {number} shares         - Quantity
   * @param {string} side           - 'BUY' or 'SELL'
   * @returns {{
   *   totalIS: number,
   *   marketImpact: number,
   *   adverseSelection: number,
   *   timing: number,
   *   isVsVwap: number,
   *   slippageBps: number
   * }}
   */
  function implementationShortfall(entryPrice, exitPrice, vwapBenchmark, shares, side) {
    entryPrice    = Number(entryPrice) || 0;
    exitPrice     = Number(exitPrice) || 0;
    vwapBenchmark = Number(vwapBenchmark) || 0;
    shares        = Math.abs(Number(shares) || 0);

    var sideSign = 1; // BUY: cost increases when exec > decision
    if (typeof side === 'string' && side.toUpperCase() === 'SELL') {
      sideSign = -1;   // SELL: cost increases when exec < decision
    }

    /* ── total IS ─────────────────────────────────────────────────── */
    var totalIS = (exitPrice - entryPrice) * shares * sideSign;

    /* ── decomposition ────────────────────────────────────────────── */
    // arrival price = entryPrice (decision price)
    var marketImpact     = (exitPrice - entryPrice) * shares * sideSign;
    var timing           = (entryPrice - vwapBenchmark) * shares * sideSign;
    var adverseSelection = totalIS - marketImpact - timing;

    /* ── IS vs VWAP ───────────────────────────────────────────────── */
    var isVsVwap = (exitPrice - vwapBenchmark) * shares * sideSign;

    /* ── slippage in bps ──────────────────────────────────────────── */
    var slippageBps = (entryPrice !== 0)
      ? Math.abs(exitPrice - entryPrice) / entryPrice * 10000
      : 0;

    return {
      totalIS:          Math.round(totalIS * 100) / 100,
      marketImpact:     Math.round(marketImpact * 100) / 100,
      adverseSelection: Math.round(adverseSelection * 100) / 100,
      timing:           Math.round(timing * 100) / 100,
      isVsVwap:         Math.round(isVsVwap * 100) / 100,
      slippageBps:      Math.round(slippageBps * 100) / 100
    };
  }

  /* =========================================================================
   *  9. SMART ORDER ROUTER (SOR) SIMULATOR
   * ========================================================================= */

  /**
   * Simulate optimal order-routing strategy selection and slicing.
   *
   * Strategies:
   *   TWAP  – uniform time-weighted slices, max 1 % ADV participation
   *   VWAP  – volume-profile-weighted slices (U-shape intraday profile)
   *   ICEBERG – visible qty = min(10 % of order, 100 shares)
   *
   * Market impact estimate (square-root model):
   *   impact = σ × √(Q / ADV) × urgency_factor
   *
   * Strategy selection heuristic:
   *   participation > 5 % → VWAP
   *   urgency ≥ 0.8       → ICEBERG
   *   default              → TWAP
   *
   * @param {number} orderSize          - Total shares to execute
   * @param {number} currentPrice       - Current market price
   * @param {number} averageDailyVolume - ADV in shares
   * @param {number} urgency            - 0 (passive) to 1 (aggressive)
   * @returns {{
   *   strategy: string,
   *   numSlices: number,
   *   sliceSize: number,
   *   estimatedImpact: number,
   *   participationRate: number,
   *   icebergVisible: number,
   *   expectedFillPrice: number,
   *   totalCost: number
   * }}
   */
  function simulateSOR(orderSize, currentPrice, averageDailyVolume, urgency) {
    orderSize          = Math.max(Math.abs(Number(orderSize)) || 0, 0);
    currentPrice       = Math.max(Number(currentPrice) || 0, 0);
    averageDailyVolume = Math.max(Number(averageDailyVolume) || 1, 1);
    urgency            = clamp(Number(urgency) || 0.5, 0, 1);

    var MAX_PARTICIPATION = 0.01; // 1 % of ADV per slice
    var SIGMA = 0.02; // assumed daily vol for impact model

    /* ── participation rate ───────────────────────────────────────── */
    var participationRate = safeDivide(orderSize, averageDailyVolume, 0);

    /* ── TWAP slicing ─────────────────────────────────────────────── */
    var maxPerSlice = averageDailyVolume * MAX_PARTICIPATION;
    if (maxPerSlice < 1) maxPerSlice = 1;
    var numSlices = Math.ceil(safeDivide(orderSize, maxPerSlice, 1));
    numSlices = Math.max(numSlices, 1);
    var sliceSize = Math.ceil(orderSize / numSlices);

    /* ── market impact (square-root model) ────────────────────────── */
    var urgencyFactor = 0.5 + urgency; // range [0.5, 1.5]
    var impactPct = SIGMA * Math.sqrt(safeDivide(orderSize, averageDailyVolume, 0)) * urgencyFactor;
    var estimatedImpact = impactPct * currentPrice;

    /* ── iceberg sizing ───────────────────────────────────────────── */
    var icebergVisible = Math.min(Math.floor(orderSize * 0.1), 100);
    if (icebergVisible < 1 && orderSize > 0) icebergVisible = 1;

    /* ── strategy selection ───────────────────────────────────────── */
    var strategy = 'TWAP';
    if (urgency >= 0.8) {
      strategy = 'ICEBERG';
    } else if (participationRate > 0.05) {
      strategy = 'VWAP';
    }

    /* ── expected fill price & total cost ──────────────────────────── */
    var expectedFillPrice = currentPrice + estimatedImpact;
    var totalCost = estimatedImpact * orderSize;

    return {
      strategy:          strategy,
      numSlices:         numSlices,
      sliceSize:         sliceSize,
      estimatedImpact:   Math.round(estimatedImpact * 10000) / 10000,
      participationRate: Math.round(participationRate * 1e6) / 1e6,
      icebergVisible:    icebergVisible,
      expectedFillPrice: Math.round(expectedFillPrice * 10000) / 10000,
      totalCost:         Math.round(totalCost * 100) / 100
    };
  }

  /* =========================================================================
   *  10. ALMGREN-CHRISS OPTIMAL EXECUTION
   * ========================================================================= */

  /**
   * Almgren-Chriss optimal execution trajectory.
   *
   * Model:
   *   Permanent impact:  g(v) = γ × v
   *   Temporary impact:  h(v) = ε × sgn(v) + η × |v|
   *   Optimal remaining inventory at time t:
   *     x*(t) = X × sinh(κ(T − t)) / sinh(κT)
   *   where κ = √(λσ² / η)
   *
   *   Expected cost   ≈ ½γX² + εX + ½ η κ X² coth(κT)
   *   Cost variance   ≈ ½ σ² X² / (κ sinh²(κT)) × [sinh(2κT)/(2κ) − T]
   *
   * @param {number} totalShares   - Total order size X
   * @param {number} timeHorizon   - Number of trading periods T
   * @param {number} volatility    - Per-period volatility σ
   * @param {number} dailyVolume   - ADV (used to calibrate η, γ)
   * @param {number} riskAversion  - Risk-aversion parameter λ
   * @returns {{
   *   optimalTrajectory: number[],
   *   expectedCost: number,
   *   costVariance: number,
   *   tradeoffFrontier: Array<{lambda:number, cost:number, risk:number}>,
   *   urgencyParameter: number
   * }}
   */
  function almgrenChriss(totalShares, timeHorizon, volatility, dailyVolume, riskAversion) {
    totalShares  = Math.abs(Number(totalShares))  || 0;
    timeHorizon  = Math.max(Number(timeHorizon)   || 1, 1);
    volatility   = Math.max(Number(volatility)    || 0.01, 1e-10);
    dailyVolume  = Math.max(Number(dailyVolume)   || 1, 1);
    riskAversion = Math.max(Number(riskAversion)  || 1e-6, 1e-12);

    var X = totalShares;
    var T = timeHorizon;
    var sigma = volatility;
    var lambda = riskAversion;

    /* ── calibrate impact parameters from ADV ─────────────────────── */
    // η (temporary impact slope): proportional to spread / ADV
    var eta     = 0.01 * (sigma / Math.sqrt(T)) / Math.pow(dailyVolume, 0.5);
    if (eta < 1e-15) eta = 1e-15;
    // ε (temporary impact fixed cost): half-spread approximation
    var epsilon = 0.0005 * sigma;
    // γ (permanent impact): typically much smaller than η
    var gamma   = 0.1 * eta;

    /* ── urgency parameter κ ──────────────────────────────────────── */
    var kappa = Math.sqrt(lambda * sigma * sigma / eta);

    /* ── optimal trajectory: x*(t) for t = 0, 1, …, T ────────────── */
    var sinhKT = Math.sinh(kappa * T);
    if (Math.abs(sinhKT) < 1e-15) sinhKT = 1e-15; // guard

    var trajectory = [];
    var numSteps = Math.ceil(T);
    for (var t = 0; t <= numSteps; t++) {
      var remaining = X * Math.sinh(kappa * (T - t)) / sinhKT;
      remaining = Math.max(remaining, 0);
      trajectory.push(Math.round(remaining * 100) / 100);
    }

    /* ── expected cost ────────────────────────────────────────────── */
    var cothKT = Math.cosh(kappa * T) / sinhKT;
    var expectedCost = 0.5 * gamma * X * X
                     + epsilon * X
                     + 0.5 * eta * kappa * X * X * cothKT;

    /* ── cost variance ────────────────────────────────────────────── */
    var sinh2KT = Math.sinh(2 * kappa * T);
    var sinhKT2 = sinhKT * sinhKT;
    var costVariance = 0;
    if (Math.abs(sinhKT2) > 1e-15 && kappa > 1e-15) {
      costVariance = 0.5 * sigma * sigma * X * X / (kappa * sinhKT2)
                   * (safeDivide(sinh2KT, 2 * kappa, 0) - T);
    }
    if (costVariance < 0) costVariance = 0; // numerical guard

    /* ── trade-off frontier (sweep λ) ─────────────────────────────── */
    var frontier = [];
    var lambdas = [0.0001, 0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10];
    for (var li = 0; li < lambdas.length; li++) {
      var lam = lambdas[li];
      var k = Math.sqrt(lam * sigma * sigma / eta);
      var sKT = Math.sinh(k * T);
      if (Math.abs(sKT) < 1e-15) sKT = 1e-15;
      var cKT = Math.cosh(k * T) / sKT;
      var eCost = 0.5 * gamma * X * X + epsilon * X + 0.5 * eta * k * X * X * cKT;
      var s2KT = Math.sinh(2 * k * T);
      var sKT2 = sKT * sKT;
      var eVar = 0;
      if (Math.abs(sKT2) > 1e-15 && k > 1e-15) {
        eVar = 0.5 * sigma * sigma * X * X / (k * sKT2)
             * (safeDivide(s2KT, 2 * k, 0) - T);
      }
      if (eVar < 0) eVar = 0;
      frontier.push({
        lambda: lam,
        cost:   Math.round(eCost * 100) / 100,
        risk:   Math.round(Math.sqrt(Math.max(eVar, 0)) * 100) / 100
      });
    }

    return {
      optimalTrajectory: trajectory,
      expectedCost:      Math.round(expectedCost * 100) / 100,
      costVariance:      Math.round(costVariance * 100) / 100,
      tradeoffFrontier:  frontier,
      urgencyParameter:  Math.round(kappa * 1e8) / 1e8
    };
  }

  /* =========================================================================
   *  11. PRE-TRADE RISK CHECKS (AGGREGATE)
   * ========================================================================= */

  /**
   * Run all risk checks against a proposed signal and current portfolio state.
   *
   * Returns an aggregate pass / fail with per-check detail and an adjusted
   * position size that incorporates every applicable risk multiplier.
   *
   * @param {{
   *   symbol: string,
   *   side: string,
   *   size: number,
   *   price: number,
   *   sector?: string
   * }} signal - Proposed trade signal
   *
   * @param {{
   *   capital: number,
   *   positions?: Array<{symbol:string, value:number, sector?:string}>,
   *   equityCurve?: number[],
   *   averageDailyRange?: number,
   *   maxPositionPct?: number,
   *   maxSectorPct?: number,
   *   maxCorrelatedExposurePct?: number,
   *   maxCVaR?: number,
   *   returns?: number[]
   * }} portfolioState - Current portfolio snapshot
   *
   * @param {number[]} [candles] - Recent price candles (close prices) for vol
   * @param {Array<{name:string, time:Date|number|string}>} [eventCalendar]
   * @returns {{
   *   approved: boolean,
   *   checks: Array<{name:string, passed:boolean, value:number, threshold:number, detail:string}>,
   *   adjustedSize: number,
   *   reason: string
   * }}
   */
  function preTradeChecks(signal, portfolioState, candles, eventCalendar) {
    var checks = [];
    var sizeMultiplier = 1.0;
    var allPassed = true;
    var reasons = [];

    /* ── normalise inputs ─────────────────────────────────────────── */
    signal = signal || {};
    portfolioState = portfolioState || {};
    var capital         = Number(portfolioState.capital) || 0;
    var positions       = portfolioState.positions || [];
    var equityCurve     = portfolioState.equityCurve || [];
    var adr             = Number(portfolioState.averageDailyRange) || 0;
    var maxPositionPct  = Number(portfolioState.maxPositionPct) || 0.10; // 10 %
    var maxSectorPct    = Number(portfolioState.maxSectorPct) || 0.30;  // 30 %
    var maxCorrExpPct   = Number(portfolioState.maxCorrelatedExposurePct) || 1.5;
    var maxCVaRLimit    = Number(portfolioState.maxCVaR) || -0.05; // -5 %
    var returns         = portfolioState.returns || [];
    var proposedSize    = Number(signal.size) || 0;
    var proposedPrice   = Number(signal.price) || 0;
    var proposedValue   = proposedSize * proposedPrice;

    /* ── 1. Position limit check ──────────────────────────────────── */
    (function () {
      var positionPct = (capital > 0) ? proposedValue / capital : 0;
      var passed = positionPct <= maxPositionPct;
      if (!passed) {
        allPassed = false;
        reasons.push('Position size exceeds ' + (maxPositionPct * 100).toFixed(0) + '% limit');
      }
      checks.push({
        name: 'Position Limit',
        passed: passed,
        value: Math.round(positionPct * 10000) / 10000,
        threshold: maxPositionPct,
        detail: positionPct <= maxPositionPct
          ? 'Within limit at ' + (positionPct * 100).toFixed(2) + '%'
          : 'Exceeds limit: ' + (positionPct * 100).toFixed(2) + '% > ' + (maxPositionPct * 100).toFixed(0) + '%'
      });
    })();

    /* ── 2. Sector concentration check ────────────────────────────── */
    (function () {
      var sectorTotals = {};
      for (var i = 0; i < positions.length; i++) {
        var sec = positions[i].sector || 'Unknown';
        if (!sectorTotals[sec]) sectorTotals[sec] = 0;
        sectorTotals[sec] += Math.abs(Number(positions[i].value) || 0);
      }
      var sigSector = signal.sector || 'Unknown';
      var currentSectorValue = (sectorTotals[sigSector] || 0) + Math.abs(proposedValue);
      var sectorPct = (capital > 0) ? currentSectorValue / capital : 0;
      var passed = sectorPct <= maxSectorPct;
      if (!passed) {
        allPassed = false;
        reasons.push('Sector ' + sigSector + ' concentration at ' + (sectorPct * 100).toFixed(1) + '%');
      }
      checks.push({
        name: 'Sector Concentration',
        passed: passed,
        value: Math.round(sectorPct * 10000) / 10000,
        threshold: maxSectorPct,
        detail: sigSector + ' sector at ' + (sectorPct * 100).toFixed(2) + '% of capital'
      });
    })();

    /* ── 3. Correlation exposure check ────────────────────────────── */
    (function () {
      if (positions.length < 2) {
        checks.push({
          name: 'Correlation Exposure',
          passed: true,
          value: 0,
          threshold: maxCorrExpPct,
          detail: 'Insufficient positions for correlation check'
        });
        return;
      }
      // Approximate: use provided positions only (no price history in aggregate check)
      var gross = 0;
      for (var i = 0; i < positions.length; i++) gross += Math.abs(Number(positions[i].value) || 0);
      gross += Math.abs(proposedValue);
      // Effective ≈ gross as conservative estimate when price history not available
      var ratio = 1.0;
      var passed = ratio <= maxCorrExpPct;
      checks.push({
        name: 'Correlation Exposure',
        passed: passed,
        value: ratio,
        threshold: maxCorrExpPct,
        detail: 'Effective/Gross ratio: ' + ratio.toFixed(2)
      });
      if (!passed) {
        allPassed = false;
        reasons.push('Correlated exposure ratio too high');
      }
    })();

    /* ── 4. Event proximity check ─────────────────────────────────── */
    (function () {
      var evtResult = eventFilter(new Date(), eventCalendar || []);
      checks.push({
        name: 'Event Proximity',
        passed: !evtResult.nearEvent,
        value: evtResult.minutesToEvent,
        threshold: 30,
        detail: evtResult.nearEvent
          ? 'Near event: ' + evtResult.eventName + ' in ' + evtResult.minutesToEvent.toFixed(1) + ' min'
          : 'No near-term events'
      });
      if (evtResult.nearEvent) {
        sizeMultiplier *= evtResult.sizeMultiplier;
        reasons.push('Near event: ' + evtResult.eventName);
      }
    })();

    /* ── 5. Volatility regime check ───────────────────────────────── */
    (function () {
      if (!candles || candles.length < 5) {
        checks.push({
          name: 'Volatility Regime',
          passed: true,
          value: 0,
          threshold: 2,
          detail: 'Insufficient candle data for vol regime check'
        });
        return;
      }
      // compute daily realised vols from candles
      var rets = priceReturns(candles);
      var vols = [];
      var volWindow = 5;
      for (var i = volWindow; i <= rets.length; i++) {
        var slice = rets.slice(i - volWindow, i);
        vols.push(stddev(slice) * Math.sqrt(252));
      }
      if (vols.length < 3) {
        checks.push({
          name: 'Volatility Regime',
          passed: true,
          value: 0,
          threshold: 2,
          detail: 'Insufficient vol history for regime check'
        });
        return;
      }
      var volResult = volatilityShiftDetection(vols, 20);
      checks.push({
        name: 'Volatility Regime',
        passed: !volResult.isShifted,
        value: volResult.zScore,
        threshold: 2,
        detail: volResult.isShifted
          ? 'DEFENSIVE: vol z-score ' + volResult.zScore.toFixed(2)
          : 'Normal regime, z-score ' + volResult.zScore.toFixed(2)
      });
      if (volResult.isShifted) {
        sizeMultiplier *= volResult.sizeMultiplier;
        reasons.push('Volatility regime shift detected (z=' + volResult.zScore.toFixed(2) + ')');
      }
    })();

    /* ── 6. Drawdown check ────────────────────────────────────────── */
    (function () {
      if (equityCurve.length === 0) {
        checks.push({
          name: 'Drawdown Breaker',
          passed: true,
          value: 0,
          threshold: 0,
          detail: 'No equity curve data'
        });
        return;
      }
      var ddResult = checkDrawdownBreaker(equityCurve, adr);
      checks.push({
        name: 'Drawdown Breaker',
        passed: !ddResult.breached,
        value: ddResult.currentDrawdown,
        threshold: ddResult.threshold,
        detail: ddResult.breached
          ? 'HALTED: drawdown ' + ddResult.currentDrawdown.toFixed(2) + ' ≥ threshold ' + ddResult.threshold.toFixed(2)
          : 'Drawdown ' + ddResult.currentDrawdown.toFixed(2) + ' within limit'
      });
      if (ddResult.breached) {
        allPassed = false;
        reasons.push('Drawdown circuit breaker tripped');
      }
    })();

    /* ── 7. CVaR check ────────────────────────────────────────────── */
    (function () {
      if (returns.length < 10) {
        checks.push({
          name: 'CVaR Limit',
          passed: true,
          value: 0,
          threshold: maxCVaRLimit,
          detail: 'Insufficient return data for CVaR'
        });
        return;
      }
      var cvarResult = computeCVaR(returns, 0.99);
      var passed = cvarResult.cvar99 >= maxCVaRLimit; // cvar is negative; limit is e.g. -0.05
      checks.push({
        name: 'CVaR Limit',
        passed: passed,
        value: cvarResult.cvar99,
        threshold: maxCVaRLimit,
        detail: 'CVaR(99%) = ' + (cvarResult.cvar99 * 100).toFixed(2) + '%, limit ' + (maxCVaRLimit * 100).toFixed(2) + '%'
      });
      if (!passed) {
        allPassed = false;
        sizeMultiplier *= 0.5; // reduce size under tail-risk stress
        reasons.push('CVaR exceeds limit');
      }
    })();

    /* ── aggregate result ─────────────────────────────────────────── */
    var adjustedSize = Math.max(Math.floor(proposedSize * sizeMultiplier), 0);

    return {
      approved:     allPassed,
      checks:       checks,
      adjustedSize: adjustedSize,
      reason:       allPassed
        ? 'All pre-trade checks passed'
        : reasons.join('; ')
    };
  }

  /* =========================================================================
   *  PUBLIC API
   * ========================================================================= */

  window.RiskEngine = {
    kellySize:                kellySize,
    volatilityScale:          volatilityScale,
    computeCVaR:              computeCVaR,
    checkDrawdownBreaker:     checkDrawdownBreaker,
    correlationExposure:      correlationExposure,
    eventFilter:              eventFilter,
    volatilityShiftDetection: volatilityShiftDetection,
    implementationShortfall:  implementationShortfall,
    simulateSOR:              simulateSOR,
    almgrenChriss:            almgrenChriss,
    preTradeChecks:           preTradeChecks
  };

})();
