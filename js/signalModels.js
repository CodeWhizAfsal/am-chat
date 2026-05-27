/**
 * ============================================================================
 * SignalModels.js — Multi-Model Signal Generation Engine
 * ============================================================================
 *
 * Production-grade module that simulates institutional-quality ML model
 * predictions for an intraday trading workstation. Each model implements
 * real mathematical formulas (no random noise as signal).
 *
 * Models:
 *   A) Temporal Fusion Transformer (TFT) Simulator
 *   B) Deep Limit Order Book (DLOB) CNN+LSTM Simulator
 *   C) Hidden Markov Model (HMM) Regime Detection (Forward Algorithm)
 *   D) Reinforcement Learning Execution Agent Simulator
 *   E) Meta-Learner Signal Combiner (XGBoost-style)
 *
 * Exposed as: window.SignalModels
 *
 * @module SignalModels
 * @version 1.0.0
 */
(function () {
  'use strict';

  // =========================================================================
  // SHARED UTILITY FUNCTIONS
  // =========================================================================

  /**
   * Clamp a numeric value between a minimum and maximum.
   * @param {number} val - The value to clamp.
   * @param {number} lo  - Lower bound.
   * @param {number} hi  - Upper bound.
   * @returns {number}
   */
  function clamp(val, lo, hi) {
    return val < lo ? lo : val > hi ? hi : val;
  }

  /**
   * Compute the arithmetic mean of an array.
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
   * Compute the population standard deviation of an array.
   * @param {number[]} arr
   * @param {number}   [mu] - Pre-computed mean (optional).
   * @returns {number}
   */
  function stddev(arr, mu) {
    if (!arr || arr.length < 2) return 0;
    if (mu === undefined) mu = mean(arr);
    var ss = 0;
    for (var i = 0; i < arr.length; i++) ss += (arr[i] - mu) * (arr[i] - mu);
    return Math.sqrt(ss / arr.length);
  }

  /**
   * Z-score normalise a value given a mean and standard deviation.
   * Returns 0 if stddev is effectively zero.
   * @param {number} val
   * @param {number} mu
   * @param {number} sd
   * @returns {number}
   */
  function zscore(val, mu, sd) {
    return sd > 1e-12 ? (val - mu) / sd : 0;
  }

  /**
   * Compute softmax probabilities for an array of raw scores.
   * Numerically stabilised by subtracting the maximum.
   * @param {number[]} scores
   * @returns {number[]}
   */
  function softmax(scores) {
    var max = -Infinity;
    var i;
    for (i = 0; i < scores.length; i++) {
      if (scores[i] > max) max = scores[i];
    }
    var exps = [];
    var sumExp = 0;
    for (i = 0; i < scores.length; i++) {
      var e = Math.exp(scores[i] - max);
      exps.push(e);
      sumExp += e;
    }
    var out = [];
    for (i = 0; i < exps.length; i++) {
      out.push(sumExp > 0 ? exps[i] / sumExp : 1 / scores.length);
    }
    return out;
  }

  /**
   * Standard sigmoid function.
   * @param {number} x
   * @returns {number}
   */
  function sigmoid(x) {
    if (x >= 0) {
      return 1 / (1 + Math.exp(-x));
    }
    var ex = Math.exp(x);
    return ex / (1 + ex);
  }

  /**
   * Compute simple log-returns from an array of close prices.
   * @param {number[]} closes
   * @returns {number[]}
   */
  function logReturns(closes) {
    var ret = [];
    for (var i = 1; i < closes.length; i++) {
      ret.push(closes[i] > 0 && closes[i - 1] > 0
        ? Math.log(closes[i] / closes[i - 1])
        : 0);
    }
    return ret;
  }

  /**
   * Compute the Pearson correlation coefficient between two equal-length arrays.
   * @param {number[]} x
   * @param {number[]} y
   * @returns {number} Correlation in [-1, 1].
   */
  function pearsonCorrelation(x, y) {
    var n = Math.min(x.length, y.length);
    if (n < 3) return 0;
    var mx = mean(x.slice(0, n));
    var my = mean(y.slice(0, n));
    var num = 0, dx2 = 0, dy2 = 0;
    for (var i = 0; i < n; i++) {
      var dx = x[i] - mx;
      var dy = y[i] - my;
      num += dx * dy;
      dx2 += dx * dx;
      dy2 += dy * dy;
    }
    var denom = Math.sqrt(dx2 * dy2);
    return denom > 1e-12 ? num / denom : 0;
  }

  /**
   * Compute an Exponential Moving Average over an array.
   * @param {number[]} arr   - Input data.
   * @param {number}   span  - EMA span (period).
   * @returns {number[]} Array of same length with EMA values.
   */
  function ema(arr, span) {
    if (!arr || arr.length === 0) return [];
    var k = 2 / (span + 1);
    var out = [arr[0]];
    for (var i = 1; i < arr.length; i++) {
      out.push(arr[i] * k + out[i - 1] * (1 - k));
    }
    return out;
  }

  /**
   * Extract close prices from candle objects.
   * Accepts objects with a `close` or `c` property.
   * @param {Object[]} candles
   * @returns {number[]}
   */
  function extractCloses(candles) {
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      out.push(candles[i].close !== undefined ? candles[i].close : (candles[i].c || 0));
    }
    return out;
  }

  /**
   * Extract volumes from candle objects.
   * @param {Object[]} candles
   * @returns {number[]}
   */
  function extractVolumes(candles) {
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      out.push(candles[i].volume !== undefined ? candles[i].volume : (candles[i].v || 0));
    }
    return out;
  }

  /**
   * Extract high prices from candle objects.
   * @param {Object[]} candles
   * @returns {number[]}
   */
  function extractHighs(candles) {
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      out.push(candles[i].high !== undefined ? candles[i].high : (candles[i].h || 0));
    }
    return out;
  }

  /**
   * Extract low prices from candle objects.
   * @param {Object[]} candles
   * @returns {number[]}
   */
  function extractLows(candles) {
    var out = [];
    for (var i = 0; i < candles.length; i++) {
      out.push(candles[i].low !== undefined ? candles[i].low : (candles[i].l || 0));
    }
    return out;
  }

  // =========================================================================
  // MODEL A: TEMPORAL FUSION TRANSFORMER (TFT) SIMULATOR
  // =========================================================================

  /**
   * Simulate a Temporal Fusion Transformer's multi-horizon quantile
   * predictions over a lookback window.
   *
   * Steps:
   *   1. Compute attention weights using volume z-scores, absolute-return
   *      z-scores, and exponential recency decay.
   *   2. Extract temporal patterns: autocorrelation (mean-reversion
   *      tendency), EMA-20 slope (momentum persistence), and a GARCH(1,1)
   *      proxy (volatility clustering).
   *   3. Generate P10 / P50 / P90 quantile forecasts.
   *
   * @param {Object[]} candles  - Array of OHLCV candle objects.
   * @param {Object}   metadata - Optional metadata
   *   { sector: string, marketCap: number, eventCalendar: Object[] }.
   * @returns {{
   *   p10: number,
   *   p50: number,
   *   p90: number,
   *   confidence: number,
   *   attentionWeights: number[]
   * }}
   */
  function runTFT(candles, metadata) {
    var LOOKBACK = 60;
    metadata = metadata || {};

    // --- Fallback for insufficient data ---
    if (!candles || candles.length < 5) {
      return { p10: 0, p50: 0, p90: 0, confidence: 0, attentionWeights: [] };
    }

    // Use last LOOKBACK candles (or fewer if not enough)
    var window_size = Math.min(candles.length, LOOKBACK);
    var slice = candles.slice(candles.length - window_size);
    var closes = extractCloses(slice);
    var volumes = extractVolumes(slice);
    var returns = logReturns(closes);
    var n = closes.length;
    var nReturns = returns.length;

    // -----------------------------------------------------------------
    // STEP 1: Attention weights
    // -----------------------------------------------------------------
    // For each bar compute:
    //   attention_raw = volume_z + |return_z| + recency_weight
    // Then apply softmax.

    var volMu = mean(volumes);
    var volSd = stddev(volumes, volMu);
    var retMu = mean(returns);
    var retSd = stddev(returns, retMu);

    // Exponential recency decay  λ = 3 / n  so last bar ≈ e^0 = 1
    var decayLambda = 3.0 / n;
    var rawAttention = [];
    var i;

    for (i = 0; i < n; i++) {
      var volZ = zscore(volumes[i], volMu, volSd);
      var retZ = i > 0 ? Math.abs(zscore(returns[i - 1], retMu, retSd)) : 0;
      var recency = Math.exp(-decayLambda * (n - 1 - i));
      rawAttention.push(volZ + retZ + recency);
    }

    var attentionWeights = softmax(rawAttention);

    // -----------------------------------------------------------------
    // STEP 2a: Autocorrelation of returns (lag-1)
    //          corr(returns[t], returns[t-1])
    // -----------------------------------------------------------------
    var retX = [];
    var retY = [];
    for (i = 1; i < nReturns; i++) {
      retX.push(returns[i]);
      retY.push(returns[i - 1]);
    }
    var autocorr = pearsonCorrelation(retX, retY);
    // Positive autocorr → momentum; Negative → mean reversion

    // -----------------------------------------------------------------
    // STEP 2b: Momentum persistence — slope of EMA-20
    // -----------------------------------------------------------------
    var ema20 = ema(closes, 20);
    // Slope as (last EMA - EMA 5 bars ago) / 5-bar range, normalised
    var emaLast = ema20[ema20.length - 1];
    var emaLag = ema20[Math.max(0, ema20.length - 6)];
    var emaSlope = (emaLast - emaLag) / (Math.abs(emaLag) > 1e-12 ? emaLag : 1);

    // -----------------------------------------------------------------
    // STEP 2c: GARCH(1,1) proxy — exponentially weighted variance
    //          σ²_t = (1-λ) * r²_t + λ * σ²_{t-1},  λ = 0.94
    // -----------------------------------------------------------------
    var garchLambda = 0.94;
    var garchVar = nReturns > 0 ? returns[0] * returns[0] : 0;
    for (i = 1; i < nReturns; i++) {
      garchVar = (1 - garchLambda) * (returns[i] * returns[i]) + garchLambda * garchVar;
    }
    var garchVol = Math.sqrt(garchVar);

    // -----------------------------------------------------------------
    // STEP 3: Attention-weighted forecast features
    // -----------------------------------------------------------------
    // Attention-weighted mean return
    var attWeightedReturn = 0;
    for (i = 0; i < nReturns; i++) {
      // align attention with returns (returns[i] corresponds to bar i+1)
      attWeightedReturn += attentionWeights[i + 1] * returns[i];
    }

    // Blend momentum and mean-reversion signal
    // If autocorr > 0: momentum dominates → forecast follows recent trend
    // If autocorr < 0: mean reversion dominates → forecast fades recent trend
    var momentumWeight = clamp(0.5 + autocorr, 0, 1);
    var meanRevWeight = 1 - momentumWeight;

    var momentumForecast = attWeightedReturn + emaSlope * 0.5;
    var meanRevForecast = -attWeightedReturn * 0.6; // fade the move

    var medianForecast = momentumWeight * momentumForecast
      + meanRevWeight * meanRevForecast;

    // Sector / event calendar adjustments (mild bias)
    var sectorBias = 0;
    if (metadata.sector) {
      var sectorMap = {
        'Technology': 0.001, 'Healthcare': 0.0005, 'Financials': -0.0003,
        'Energy': -0.0005, 'Banking': 0.0002, 'Consumer': 0.0004,
        'Auto': 0.0003, 'Metals': -0.0004, 'Pharma': 0.0003, 'FMCG': 0.0001
      };
      sectorBias = sectorMap[metadata.sector] || 0;
    }
    medianForecast += sectorBias;

    // Convert log-return forecast → price forecast
    var lastClose = closes[closes.length - 1];
    var p50 = lastClose * Math.exp(medianForecast);

    // Downside volatility (semi-deviation of negative returns)
    var negRet = [];
    for (i = 0; i < nReturns; i++) {
      if (returns[i] < 0) negRet.push(returns[i]);
    }
    var downsideVol = negRet.length > 1 ? stddev(negRet) : garchVol;

    // Upside volatility (semi-deviation of positive returns)
    var posRet = [];
    for (i = 0; i < nReturns; i++) {
      if (returns[i] > 0) posRet.push(returns[i]);
    }
    var upsideVol = posRet.length > 1 ? stddev(posRet) : garchVol;

    // Quantile forecasts: z_0.10 ≈ -1.2816, z_0.90 ≈ 1.2816
    var z10 = -1.2816;
    var z90 = 1.2816;
    var p10 = lastClose * Math.exp(medianForecast + z10 * downsideVol);
    var p90 = lastClose * Math.exp(medianForecast + z90 * upsideVol);

    // Confidence: higher when GARCH vol is low and autocorrelation signal is strong
    var rawConf = (1 - clamp(garchVol * 10, 0, 0.8)) * (0.5 + 0.5 * Math.abs(autocorr));
    var confidence = clamp(Math.round(rawConf * 100), 5, 95);

    return {
      p10: parseFloat(p10.toFixed(4)),
      p50: parseFloat(p50.toFixed(4)),
      p90: parseFloat(p90.toFixed(4)),
      confidence: confidence,
      attentionWeights: attentionWeights.map(function (w) {
        return parseFloat(w.toFixed(6));
      })
    };
  }

  // =========================================================================
  // MODEL B: DEEP LIMIT ORDER BOOK (DLOB) CNN+LSTM SIMULATOR
  // =========================================================================

  /**
   * Simulate a CNN + LSTM model processing synthetic Level-2 order book
   * data derived from OHLCV candles.
   *
   * Steps:
   *   1. Construct synthetic L2 book (10 bid / 10 ask levels).
   *   2. CNN layer simulation: extract spatial features (bid-ask imbalance,
   *      volume concentration near BBO).
   *   3. LSTM layer simulation: track book shape changes over last 20 bars
   *      and detect order absorption.
   *   4. Platt Scaling calibration for probability output.
   *
   * @param {Object[]} candles - Array of OHLCV candle objects.
   * @returns {{
   *   direction: string,
   *   probability: number,
   *   bookImbalance: number,
   *   volumeConcentration: number
   * }}
   */
  function runDLOB(candles) {
    if (!candles || candles.length < 5) {
      return { direction: 'neutral', probability: 0.5, bookImbalance: 0, volumeConcentration: 0.5 };
    }

    var BOOK_LEVELS = 10;
    var LSTM_LOOKBACK = 20;
    var PLATT_A = 1.2;
    var PLATT_B = -0.3;

    var windowSize = Math.min(candles.length, LSTM_LOOKBACK);
    var slice = candles.slice(candles.length - windowSize);

    // -----------------------------------------------------------------
    // 1. CONSTRUCT SYNTHETIC L2 BOOK for each bar
    // -----------------------------------------------------------------
    // Tick size estimated from recent price level
    var lastCandle = slice[slice.length - 1];
    var lastClose = lastCandle.close !== undefined ? lastCandle.close : (lastCandle.c || 100);
    var tickSize = Math.max(0.01, lastClose * 0.0005); // 5 bps tick estimate

    /**
     * Build a synthetic L2 book snapshot from a single candle.
     * Volume distribution across levels follows a geometric decay from BBO.
     * @param {Object} candle
     * @returns {{ bidVols: number[], askVols: number[], bidPrices: number[], askPrices: number[] }}
     */
    function buildBook(candle) {
      var c = candle.close !== undefined ? candle.close : (candle.c || lastClose);
      var v = candle.volume !== undefined ? candle.volume : (candle.v || 0);
      var h = candle.high !== undefined ? candle.high : (candle.h || c);
      var l = candle.low !== undefined ? candle.low : (candle.l || c);
      var o = candle.open !== undefined ? candle.open : (candle.o || c);

      // Bid/ask skew from candle body direction
      var bodyRatio = c > 1e-12 ? (c - o) / c : 0;
      var bidFrac = 0.5 + clamp(bodyRatio * 5, -0.2, 0.2); // 0.3 – 0.7
      var askFrac = 1 - bidFrac;

      var totalBidVol = v * bidFrac;
      var totalAskVol = v * askFrac;

      // Geometric distribution parameter: 60% at level 1, decaying
      var decayFactor = 0.7;
      var bidVols = [];
      var askVols = [];
      var bidPrices = [];
      var askPrices = [];
      var bidNorm = 0;
      var askNorm = 0;
      var j;

      for (j = 0; j < BOOK_LEVELS; j++) {
        var weight = Math.pow(decayFactor, j);
        bidVols.push(weight);
        askVols.push(weight);
        bidNorm += weight;
        askNorm += weight;
        bidPrices.push(c - (j + 1) * tickSize);
        askPrices.push(c + (j + 1) * tickSize);
      }

      // Adjust volume distribution using high-low range
      // If price touched close to bid side more, skew bid volume deeper
      var rangeFrac = (h - l) > 1e-12 ? (c - l) / (h - l) : 0.5;

      for (j = 0; j < BOOK_LEVELS; j++) {
        bidVols[j] = (bidVols[j] / bidNorm) * totalBidVol;
        askVols[j] = (askVols[j] / askNorm) * totalAskVol;
        // Redistribute slightly based on range fraction
        bidVols[j] *= (0.8 + 0.4 * rangeFrac);
        askVols[j] *= (0.8 + 0.4 * (1 - rangeFrac));
      }

      return { bidVols: bidVols, askVols: askVols, bidPrices: bidPrices, askPrices: askPrices };
    }

    // Build book snapshots for each bar in the LSTM lookback
    var books = [];
    for (var b = 0; b < slice.length; b++) {
      books.push(buildBook(slice[b]));
    }

    // -----------------------------------------------------------------
    // 2. CNN LAYER: Spatial feature extraction on latest book
    // -----------------------------------------------------------------
    var latestBook = books[books.length - 1];

    // Feature 2a: Bid-ask imbalance across all levels
    //   Σ bidVol / (Σ bidVol + Σ askVol) → 0.5 = balanced
    var totalBid = 0, totalAsk = 0;
    for (var lv = 0; lv < BOOK_LEVELS; lv++) {
      totalBid += latestBook.bidVols[lv];
      totalAsk += latestBook.askVols[lv];
    }
    var bookImbalance = (totalBid + totalAsk) > 0
      ? (totalBid - totalAsk) / (totalBid + totalAsk)
      : 0; // range [-1, 1]: positive = bid heavy = bullish

    // Feature 2b: Volume concentration near BBO
    //   Proportion of total volume in top 3 levels vs rest
    var topBid = 0, topAsk = 0;
    for (lv = 0; lv < Math.min(3, BOOK_LEVELS); lv++) {
      topBid += latestBook.bidVols[lv];
      topAsk += latestBook.askVols[lv];
    }
    var volumeConcentration = (totalBid + totalAsk) > 0
      ? (topBid + topAsk) / (totalBid + totalAsk)
      : 0.5; // range [0, 1]: 1 = all volume at BBO

    // Feature 2c: Level-weighted pressure gradient
    //   Sum of (bidVol[i] - askVol[i]) * (1/(i+1)) to emphasise near levels
    var pressureGradient = 0;
    for (lv = 0; lv < BOOK_LEVELS; lv++) {
      pressureGradient += (latestBook.bidVols[lv] - latestBook.askVols[lv]) / (lv + 1);
    }
    // Normalise pressure gradient
    var pressureNorm = (totalBid + totalAsk) > 0
      ? pressureGradient / ((totalBid + totalAsk) * 0.5)
      : 0;

    // -----------------------------------------------------------------
    // 3. LSTM LAYER: Temporal evolution of book shape
    // -----------------------------------------------------------------
    // Track imbalance trajectory over the lookback window
    var imbalanceHistory = [];
    var concentrationHistory = [];
    for (b = 0; b < books.length; b++) {
      var bk = books[b];
      var tBid = 0, tAsk = 0, tTopBid = 0, tTopAsk = 0;
      for (lv = 0; lv < BOOK_LEVELS; lv++) {
        tBid += bk.bidVols[lv];
        tAsk += bk.askVols[lv];
        if (lv < 3) { tTopBid += bk.bidVols[lv]; tTopAsk += bk.askVols[lv]; }
      }
      imbalanceHistory.push((tBid + tAsk) > 0 ? (tBid - tAsk) / (tBid + tAsk) : 0);
      concentrationHistory.push((tBid + tAsk) > 0 ? (tTopBid + tTopAsk) / (tBid + tAsk) : 0.5);
    }

    // Trend of imbalance (simple linear slope over the window)
    var imbalanceSlope = 0;
    if (imbalanceHistory.length >= 3) {
      var xMu = (imbalanceHistory.length - 1) / 2;
      var num = 0, den = 0;
      for (var t = 0; t < imbalanceHistory.length; t++) {
        num += (t - xMu) * (imbalanceHistory[t] - mean(imbalanceHistory));
        den += (t - xMu) * (t - xMu);
      }
      imbalanceSlope = den > 1e-12 ? num / den : 0;
    }

    // Order absorption detection:
    // If concentration is dropping while price isn't moving → large resting
    // orders are being consumed. Measured as negative slope in concentration.
    var concentrationSlope = 0;
    if (concentrationHistory.length >= 3) {
      var cMu = mean(concentrationHistory);
      var cxMu = (concentrationHistory.length - 1) / 2;
      var cNum = 0, cDen = 0;
      for (t = 0; t < concentrationHistory.length; t++) {
        cNum += (t - cxMu) * (concentrationHistory[t] - cMu);
        cDen += (t - cxMu) * (t - cxMu);
      }
      concentrationSlope = cDen > 1e-12 ? cNum / cDen : 0;
    }

    // Absorption signal: concentration dropping while imbalance persists
    var absorptionScore = 0;
    if (concentrationSlope < -0.005 && Math.abs(bookImbalance) > 0.05) {
      // Orders are being eaten on the side with more volume → that side is absorbing
      absorptionScore = bookImbalance > 0 ? 0.15 : -0.15;
    }

    // -----------------------------------------------------------------
    // 4. COMBINE FEATURES & PLATT SCALING
    // -----------------------------------------------------------------
    // Weighted feature combination (simulates dense layer)
    var rawFeature = bookImbalance * 0.35
      + pressureNorm * 0.20
      + imbalanceSlope * 15.0   // scale up the slope since it's tiny
      + absorptionScore * 0.25
      + (volumeConcentration - 0.5) * 0.10;

    var rawScore = sigmoid(rawFeature * 3.0);

    // Platt Scaling calibration
    // calibrated_prob = 1 / (1 + exp(-(A * rawScore + B)))
    var calibratedProb = 1 / (1 + Math.exp(-(PLATT_A * rawScore + PLATT_B)));

    // Determine direction
    var direction = 'neutral';
    if (calibratedProb > 0.55) direction = 'up';
    else if (calibratedProb < 0.45) direction = 'down';

    return {
      direction: direction,
      probability: parseFloat(calibratedProb.toFixed(4)),
      bookImbalance: parseFloat(bookImbalance.toFixed(4)),
      volumeConcentration: parseFloat(volumeConcentration.toFixed(4))
    };
  }

  // =========================================================================
  // MODEL C: HIDDEN MARKOV MODEL (HMM) REGIME DETECTION
  // =========================================================================

  /**
   * Hidden Markov Model with 4 hidden states and 27 discretised observable
   * feature combinations.  Uses the Forward Algorithm with log-space scaling
   * to prevent underflow.
   *
   * Hidden States:
   *   0 = Trending Up
   *   1 = Trending Down
   *   2 = Mean-Reverting (Range)
   *   3 = High-Volatility Choppy
   *
   * Observable features (discretised into 3 bins each → 3×3×3 = 27 symbols):
   *   - Realised volatility: low (0), medium (1), high (2)
   *   - Return autocorrelation: negative (0), zero (1), positive (2)
   *   - Spread proxy:          tight (0), normal (1), wide (2)
   *
   * @param {Object[]} candles - Array of OHLCV candle objects.
   * @returns {{
   *   states: string[],
   *   probabilities: number[],
   *   currentRegime: string,
   *   confidence: number,
   *   transitionMatrix: number[][]
   * }}
   */
  function runHMM(candles) {
    var STATE_LABELS = ['Trending Up', 'Trending Down', 'Mean-Reverting', 'High-Vol Choppy'];
    var NUM_STATES = 4;
    var NUM_SYMBOLS = 27; // 3^3

    // Default return for insufficient data
    if (!candles || candles.length < 10) {
      return {
        states: STATE_LABELS,
        probabilities: [0.25, 0.25, 0.25, 0.25],
        currentRegime: 'Mean-Reverting',
        confidence: 0,
        transitionMatrix: [
          [0.7, 0.1, 0.15, 0.05],
          [0.1, 0.7, 0.15, 0.05],
          [0.15, 0.15, 0.6, 0.10],
          [0.10, 0.10, 0.40, 0.40]
        ]
      };
    }

    // -----------------------------------------------------------------
    // TRANSITION MATRIX  A[i][j] = P(state_j | state_i)
    // -----------------------------------------------------------------
    var A = [
      // from Trending Up:   stays 70%, down 10%, range 15%, high-vol 5%
      [0.70, 0.10, 0.15, 0.05],
      // from Trending Down: up 10%, stays 70%, range 15%, high-vol 5%
      [0.10, 0.70, 0.15, 0.05],
      // from Mean-Reverting: up 15%, down 15%, stays 60%, high-vol 10%
      [0.15, 0.15, 0.60, 0.10],
      // from High-Vol:       up 10%, down 10%, range 40%, stays 40%
      [0.10, 0.10, 0.40, 0.40]
    ];

    // -----------------------------------------------------------------
    // EMISSION PROBABILITIES  B[state][symbol]
    // -----------------------------------------------------------------
    // Build structured emission table per state.
    // Symbol index = volBucket * 9 + autocorrBucket * 3 + spreadBucket
    //
    // Each state has a characteristic emission profile defined as independent
    // marginal distributions over the three features, then combined.

    // Marginals: [low, med, high] for vol;  [neg, zero, pos] for autocorr;  [tight, normal, wide] for spread
    var marginals = [
      // State 0: Trending Up — moderate vol, positive autocorr, tightish spread
      { vol: [0.15, 0.60, 0.25], ac: [0.10, 0.25, 0.65], sp: [0.40, 0.45, 0.15] },
      // State 1: Trending Down — moderate-high vol, positive autocorr (trend persists), wider spread
      { vol: [0.10, 0.45, 0.45], ac: [0.10, 0.25, 0.65], sp: [0.15, 0.40, 0.45] },
      // State 2: Mean-Reverting — low vol, negative autocorr, tight spread
      { vol: [0.55, 0.35, 0.10], ac: [0.60, 0.25, 0.15], sp: [0.50, 0.35, 0.15] },
      // State 3: High-Vol Choppy — high vol, near-zero autocorr, wide spread
      { vol: [0.05, 0.25, 0.70], ac: [0.30, 0.45, 0.25], sp: [0.10, 0.30, 0.60] }
    ];

    var B = [];
    var s, vb, ab, sb;
    for (s = 0; s < NUM_STATES; s++) {
      var row = [];
      for (vb = 0; vb < 3; vb++) {
        for (ab = 0; ab < 3; ab++) {
          for (sb = 0; sb < 3; sb++) {
            row.push(marginals[s].vol[vb] * marginals[s].ac[ab] * marginals[s].sp[sb]);
          }
        }
      }
      // Normalise to ensure sums to 1
      var rowSum = 0;
      for (var ri = 0; ri < row.length; ri++) rowSum += row[ri];
      for (ri = 0; ri < row.length; ri++) row[ri] /= rowSum;
      B.push(row);
    }

    // -----------------------------------------------------------------
    // INITIAL STATE DISTRIBUTION  π
    // -----------------------------------------------------------------
    var pi = [0.25, 0.25, 0.30, 0.20];

    // -----------------------------------------------------------------
    // DISCRETISE OBSERVATIONS from candle data
    // -----------------------------------------------------------------
    // Use a rolling window of 10 bars to compute features at each step
    var closes = extractCloses(candles);
    var highs = extractHighs(candles);
    var lows = extractLows(candles);
    var volumes = extractVolumes(candles);
    var rets = logReturns(closes);

    // Generate observation sequence
    var observations = [];
    var FEAT_WINDOW = 10;

    for (var t = FEAT_WINDOW; t < candles.length; t++) {
      // Realised volatility over the last FEAT_WINDOW bars
      var retSlice = rets.slice(t - FEAT_WINDOW, t);
      var rv = stddev(retSlice);

      // Autocorrelation of returns (lag-1) over window
      var rx = [], ry = [];
      for (var k = 1; k < retSlice.length; k++) {
        rx.push(retSlice[k]);
        ry.push(retSlice[k - 1]);
      }
      var ac = pearsonCorrelation(rx, ry);

      // Spread proxy: average (high - low) / close over window
      var spreadSum = 0;
      for (k = t - FEAT_WINDOW; k < t; k++) {
        var spread = (highs[k] - lows[k]) / (closes[k] > 0 ? closes[k] : 1);
        spreadSum += spread;
      }
      var avgSpread = spreadSum / FEAT_WINDOW;

      // Discretise
      // Vol buckets: thresholds based on typical intraday returns
      var volBucket = rv < 0.005 ? 0 : (rv < 0.015 ? 1 : 2);
      // Autocorr buckets
      var acBucket = ac < -0.15 ? 0 : (ac < 0.15 ? 1 : 2);
      // Spread buckets
      var spBucket = avgSpread < 0.005 ? 0 : (avgSpread < 0.015 ? 1 : 2);

      var symbol = volBucket * 9 + acBucket * 3 + spBucket;
      observations.push(symbol);
    }

    if (observations.length === 0) {
      return {
        states: STATE_LABELS,
        probabilities: [0.25, 0.25, 0.25, 0.25],
        currentRegime: 'Mean-Reverting',
        confidence: 0,
        transitionMatrix: A
      };
    }

    // -----------------------------------------------------------------
    // FORWARD ALGORITHM WITH SCALING
    // -----------------------------------------------------------------
    // α_scaled[t][s] = scaled forward probability at time t, state s
    // c[t] = scaling factor at time t
    var T = observations.length;
    var alpha = []; // T x NUM_STATES
    var scalingFactors = [];

    // Initialisation: α_0(s) = π(s) * B[s][O_0]
    var alpha0 = [];
    var c0 = 0;
    for (s = 0; s < NUM_STATES; s++) {
      var val = pi[s] * B[s][observations[0]];
      alpha0.push(val);
      c0 += val;
    }
    // Scale
    c0 = c0 > 1e-300 ? 1 / c0 : 1;
    for (s = 0; s < NUM_STATES; s++) {
      alpha0[s] *= c0;
    }
    alpha.push(alpha0);
    scalingFactors.push(c0);

    // Induction: α_t(j) = [Σ_i α_{t-1}(i) * A[i][j]] * B[j][O_t]
    for (t = 1; t < T; t++) {
      var alphaT = [];
      var ct = 0;
      for (var j = 0; j < NUM_STATES; j++) {
        var sum = 0;
        for (var i = 0; i < NUM_STATES; i++) {
          sum += alpha[t - 1][i] * A[i][j];
        }
        var v = sum * B[j][observations[t]];
        alphaT.push(v);
        ct += v;
      }
      // Scale
      ct = ct > 1e-300 ? 1 / ct : 1;
      for (j = 0; j < NUM_STATES; j++) {
        alphaT[j] *= ct;
      }
      alpha.push(alphaT);
      scalingFactors.push(ct);
    }

    // -----------------------------------------------------------------
    // EXTRACT STATE PROBABILITIES AT FINAL TIME STEP
    // -----------------------------------------------------------------
    // The scaled forward variables at the last step, when normalised,
    // give P(state | observations).
    var finalAlpha = alpha[T - 1];
    var alphaSum = 0;
    for (s = 0; s < NUM_STATES; s++) alphaSum += finalAlpha[s];
    var probs = [];
    for (s = 0; s < NUM_STATES; s++) {
      probs.push(alphaSum > 1e-12 ? finalAlpha[s] / alphaSum : 0.25);
    }

    // Determine current regime (argmax)
    var maxProb = -1;
    var maxState = 0;
    for (s = 0; s < NUM_STATES; s++) {
      if (probs[s] > maxProb) {
        maxProb = probs[s];
        maxState = s;
      }
    }

    // Confidence: 1 − entropy / max_entropy
    var entropy = 0;
    for (s = 0; s < NUM_STATES; s++) {
      if (probs[s] > 1e-12) entropy -= probs[s] * Math.log(probs[s]);
    }
    var maxEntropy = Math.log(NUM_STATES);
    var confidence = clamp(Math.round((1 - entropy / maxEntropy) * 100), 0, 100);

    return {
      states: STATE_LABELS,
      probabilities: probs.map(function (p) { return parseFloat(p.toFixed(4)); }),
      currentRegime: STATE_LABELS[maxState],
      confidence: confidence,
      transitionMatrix: A
    };
  }

  // =========================================================================
  // MODEL D: REINFORCEMENT LEARNING EXECUTION AGENT SIMULATOR
  // =========================================================================

  /**
   * Simulate an RL execution agent that maps state features to a discrete
   * action space using a tabular Q-value approximation with softmax policy.
   *
   * Includes Almgren-Chriss market impact cost estimation.
   *
   * @param {Object[]} candles        - Array of OHLCV candle objects.
   * @param {Object}   currentPosition - { shares, avgCost, side }
   *   side: 'long' | 'short' | 'flat'
   * @param {Object}   portfolioState  - { equity, cashAvailable, adv, sessionBarsRemaining, sessionTotalBars }
   *   adv = average daily volume (shares)
   * @returns {{
   *   action: string,
   *   actionProbabilities: { buy: number, sell: number, hold: number, close: number },
   *   expectedReward: number,
   *   marketImpactEstimate: number,
   *   almgrenChrissCost: number
   * }}
   */
  function runRLAgent(candles, currentPosition, portfolioState) {
    var ACTIONS = ['BUY', 'SELL', 'HOLD', 'CLOSE'];

    // Defaults
    currentPosition = currentPosition || { shares: 0, avgCost: 0, side: 'flat' };
    portfolioState = portfolioState || { equity: 100000, cashAvailable: 100000, adv: 1000000, sessionBarsRemaining: 200, sessionTotalBars: 375 };

    if (!candles || candles.length < 5) {
      return {
        action: 'HOLD',
        actionProbabilities: { buy: 0.15, sell: 0.15, hold: 0.60, close: 0.10 },
        expectedReward: 0,
        marketImpactEstimate: 0,
        almgrenChrissCost: 0
      };
    }

    var closes = extractCloses(candles);
    var volumes = extractVolumes(candles);
    var rets = logReturns(closes);
    var n = closes.length;
    var lastClose = closes[n - 1];

    // -----------------------------------------------------------------
    // STATE FEATURES
    // -----------------------------------------------------------------

    // Feature 1: Position P&L normalised by equity
    var positionPnl = 0;
    if (currentPosition.shares !== 0 && currentPosition.avgCost > 0) {
      var pnlPerShare = currentPosition.side === 'short'
        ? currentPosition.avgCost - lastClose
        : lastClose - currentPosition.avgCost;
      positionPnl = (pnlPerShare * Math.abs(currentPosition.shares))
        / (portfolioState.equity > 0 ? portfolioState.equity : 100000);
    }
    var positionPnlNorm = clamp(positionPnl * 100, -5, 5) / 5; // [-1, 1]

    // Feature 2: Time remaining in session  (0 = session end, 1 = session start)
    var totalBars = portfolioState.sessionTotalBars || 375;
    var remainBars = portfolioState.sessionBarsRemaining !== undefined
      ? portfolioState.sessionBarsRemaining : totalBars;
    var timeRemaining = clamp(remainBars / totalBars, 0, 1);

    // Feature 3: Volatility regime score (from rolling realised vol)
    var recentRets = rets.slice(-20);
    var rv = stddev(recentRets);
    var volRegime = rv < 0.005 ? -1 : (rv < 0.015 ? 0 : 1);
    var volRegimeNorm = volRegime / 1.0; // [-1, 1]

    // Feature 4: Momentum score (normalised EMA-10 slope)
    var ema10 = ema(closes, 10);
    var ema10Last = ema10[ema10.length - 1];
    var ema10Lag = ema10[Math.max(0, ema10.length - 6)];
    var momentumScore = ema10Lag > 1e-12
      ? clamp((ema10Last - ema10Lag) / ema10Lag * 50, -1, 1)
      : 0;

    // Feature 5: Mean reversion score (z-score of price vs EMA-20)
    var ema20 = ema(closes, 20);
    var ema20Last = ema20[ema20.length - 1];
    var ema20Sd = stddev(closes.slice(-20));
    var meanRevScore = ema20Sd > 1e-12
      ? clamp(-(lastClose - ema20Last) / ema20Sd, -1, 1) // negative z-score → buy signal
      : 0;

    // -----------------------------------------------------------------
    // Q-VALUE ESTIMATION (Simulated Policy Network)
    // -----------------------------------------------------------------
    // Weights matrix: W[action][feature] — pre-trained approximation
    // Features: [positionPnlNorm, timeRemaining, volRegimeNorm, momentumScore, meanRevScore, bias]
    var features = [positionPnlNorm, timeRemaining, volRegimeNorm, momentumScore, meanRevScore, 1.0];

    // Weight matrix designed to encode reasonable trading logic:
    var W = [
      // BUY:   prefer when momentum positive, mean reversion says buy, not end of session, low vol
      [ -0.3,  0.4, -0.5,  1.2,  0.9, -0.2 ],
      // SELL:  prefer when momentum negative, mean reversion says sell, not end of session
      [  0.3,  0.4, -0.3, -1.2, -0.9, -0.2 ],
      // HOLD:  prefer when low conviction, position doing ok
      [  0.1,  0.2,  0.0,  0.1,  0.1,  0.6 ],
      // CLOSE: prefer when position has PnL, session ending, high vol
      [  0.5, -1.5,  0.8, -0.2, -0.1,  0.0 ]
    ];

    // If flat, CLOSE action is not meaningful → penalise heavily
    if (currentPosition.side === 'flat' || currentPosition.shares === 0) {
      W[3] = [ 0, 0, 0, 0, 0, -5.0 ];
    }

    var qValues = [];
    for (var a = 0; a < ACTIONS.length; a++) {
      var q = 0;
      for (var f = 0; f < features.length; f++) {
        q += W[a][f] * features[f];
      }
      qValues.push(q);
    }

    // -----------------------------------------------------------------
    // ALMGREN-CHRISS MARKET IMPACT PENALTY
    // -----------------------------------------------------------------
    // impact_cost = σ * √(shares / ADV) * urgency_factor
    // urgency_factor increases as session nears end
    var sigma = rv > 0 ? rv : 0.01; // annualised volatility proxy
    var shares = Math.abs(currentPosition.shares) || 100; // hypothetical trade size
    var adv = portfolioState.adv || 1000000;
    var urgencyFactor = 1 + 2 * (1 - timeRemaining); // 1 at open, 3 at close

    var almgrenChrissCost = sigma * Math.sqrt(shares / adv) * urgencyFactor;
    var marketImpactBps = almgrenChrissCost * 10000; // in basis points

    // Apply impact penalty to BUY and SELL actions (trading has cost)
    qValues[0] -= almgrenChrissCost * 5;  // BUY
    qValues[1] -= almgrenChrissCost * 5;  // SELL
    qValues[3] -= almgrenChrissCost * 3;  // CLOSE (less penalty since it reduces risk)

    // -----------------------------------------------------------------
    // SOFTMAX POLICY → Action probabilities
    // -----------------------------------------------------------------
    var actionProbs = softmax(qValues);

    // Choose action = argmax Q (greedy policy)
    var bestQ = -Infinity;
    var bestAction = 2; // default HOLD
    for (a = 0; a < qValues.length; a++) {
      if (qValues[a] > bestQ) {
        bestQ = qValues[a];
        bestAction = a;
      }
    }

    // Expected reward estimate (weighted average of Q-values)
    var expectedReward = 0;
    for (a = 0; a < qValues.length; a++) {
      expectedReward += actionProbs[a] * qValues[a];
    }

    return {
      action: ACTIONS[bestAction],
      actionProbabilities: {
        buy:   parseFloat(actionProbs[0].toFixed(4)),
        sell:  parseFloat(actionProbs[1].toFixed(4)),
        hold:  parseFloat(actionProbs[2].toFixed(4)),
        close: parseFloat(actionProbs[3].toFixed(4))
      },
      expectedReward: parseFloat(expectedReward.toFixed(6)),
      marketImpactEstimate: parseFloat(marketImpactBps.toFixed(2)),
      almgrenChrissCost: parseFloat(almgrenChrissCost.toFixed(6))
    };
  }

  // =========================================================================
  // META-LEARNER: SIGNAL COMBINER
  // =========================================================================

  /**
   * Combine signals from all four models using regime-dependent weighting
   * and non-linear combination (XGBoost-style gradient-boosted blend).
   *
   * @param {Object} tftOutput  - Output from runTFT().
   * @param {Object} dlobOutput - Output from runDLOB().
   * @param {Object} hmmOutput  - Output from runHMM().
   * @param {Object} rlOutput   - Output from runRLAgent().
   * @returns {{
   *   signal: number,
   *   direction: string,
   *   confidence: number,
   *   modelContributions: { tft: number, dlob: number, hmm: number, rl: number },
   *   regimeUsed: string
   * }}
   */
  function combineSignals(tftOutput, dlobOutput, hmmOutput, rlOutput) {
    tftOutput  = tftOutput  || { p10: 0, p50: 0, p90: 0, confidence: 50 };
    dlobOutput = dlobOutput || { direction: 'neutral', probability: 0.5, bookImbalance: 0 };
    hmmOutput  = hmmOutput  || { currentRegime: 'Mean-Reverting', probabilities: [0.25, 0.25, 0.25, 0.25], confidence: 0 };
    rlOutput   = rlOutput   || { action: 'HOLD', actionProbabilities: { buy: 0.25, sell: 0.25, hold: 0.25, close: 0.25 }, expectedReward: 0 };

    // -----------------------------------------------------------------
    // STEP 1: Normalise model outputs to [-1, 1]
    // -----------------------------------------------------------------

    // TFT signal: based on P50 relative to midpoint of P10–P90 range
    var tftSignal = 0;
    if (tftOutput.p90 !== tftOutput.p10 && tftOutput.p90 > 0) {
      var midpoint = (tftOutput.p10 + tftOutput.p90) / 2;
      var halfRange = (tftOutput.p90 - tftOutput.p10) / 2;
      tftSignal = halfRange > 1e-12 ? clamp((tftOutput.p50 - midpoint) / halfRange, -1, 1) : 0;
    }

    // DLOB signal: probability mapped to [-1, 1]
    var dlobSignal = 0;
    if (dlobOutput.direction === 'up') {
      dlobSignal = (dlobOutput.probability - 0.5) * 2; // [0, 1]
    } else if (dlobOutput.direction === 'down') {
      dlobSignal = -(1 - dlobOutput.probability) * 2 + (dlobOutput.probability - 0.5) * 2;
      // Simpler: map prob 0.45..0 → -0.1..-1
      dlobSignal = (dlobOutput.probability - 0.5) * 2;
    } else {
      dlobSignal = (dlobOutput.probability - 0.5) * 2; // near zero for neutral
    }
    dlobSignal = clamp(dlobSignal, -1, 1);

    // HMM signal: trending up → positive, trending down → negative
    var hmmProbs = hmmOutput.probabilities || [0.25, 0.25, 0.25, 0.25];
    var hmmSignal = clamp(hmmProbs[0] - hmmProbs[1], -1, 1); // P(up) - P(down)

    // RL signal: buy probability - sell probability
    var rlBuy  = rlOutput.actionProbabilities ? rlOutput.actionProbabilities.buy  : 0.25;
    var rlSell = rlOutput.actionProbabilities ? rlOutput.actionProbabilities.sell : 0.25;
    var rlSignal = clamp(rlBuy - rlSell, -1, 1);

    // -----------------------------------------------------------------
    // STEP 2: Regime-dependent weighting
    // -----------------------------------------------------------------
    var regime = hmmOutput.currentRegime || 'Mean-Reverting';

    var weights;
    if (regime === 'Trending Up' || regime === 'Trending Down') {
      // Trending: TFT 0.4, DLOB 0.2, RL 0.3, HMM 0.1
      weights = { tft: 0.40, dlob: 0.20, rl: 0.30, hmm: 0.10 };
    } else if (regime === 'Mean-Reverting') {
      // Ranging: TFT 0.2, DLOB 0.3, RL 0.3, HMM 0.2
      weights = { tft: 0.20, dlob: 0.30, rl: 0.30, hmm: 0.20 };
    } else {
      // High-Vol Choppy: TFT 0.1, DLOB 0.1, RL 0.4, HMM 0.4
      weights = { tft: 0.10, dlob: 0.10, rl: 0.40, hmm: 0.40 };
    }

    // -----------------------------------------------------------------
    // STEP 3: Weighted combination with tanh saturation
    // -----------------------------------------------------------------
    var linearCombo = weights.tft  * tftSignal
      + weights.dlob * dlobSignal
      + weights.hmm  * hmmSignal
      + weights.rl   * rlSignal;

    // Non-linear tanh saturation for signal compression
    // Amplify by 2.5 before tanh so moderate signals still have impact
    var signal = Math.tanh(linearCombo * 2.5);

    // -----------------------------------------------------------------
    // STEP 4: Direction and confidence
    // -----------------------------------------------------------------
    var direction = 'HOLD';
    if (signal > 0.3) direction = 'BUY';
    else if (signal < -0.3) direction = 'SELL';

    // Confidence: combination of model agreements and signal strength
    // Agreement factor: how many models agree on the direction
    var modelSignals = [tftSignal, dlobSignal, hmmSignal, rlSignal];
    var positiveCount = 0, negativeCount = 0;
    for (var m = 0; m < modelSignals.length; m++) {
      if (modelSignals[m] > 0.05) positiveCount++;
      else if (modelSignals[m] < -0.05) negativeCount++;
    }
    var agreementFactor = Math.max(positiveCount, negativeCount) / 4;

    // Blend signal strength and agreement
    var rawConfidence = (Math.abs(signal) * 0.6 + agreementFactor * 0.4) * 100;

    // Incorporate individual model confidences where available
    var tftConf = tftOutput.confidence || 50;
    var hmmConf = hmmOutput.confidence || 50;
    var avgModelConf = (tftConf + hmmConf) / 2;
    rawConfidence = rawConfidence * 0.7 + avgModelConf * 0.3;

    var confidence = clamp(Math.round(rawConfidence), 0, 100);

    // Individual model contributions (how much each model contributed)
    var contributions = {
      tft:  parseFloat((weights.tft  * tftSignal).toFixed(4)),
      dlob: parseFloat((weights.dlob * dlobSignal).toFixed(4)),
      hmm:  parseFloat((weights.hmm  * hmmSignal).toFixed(4)),
      rl:   parseFloat((weights.rl   * rlSignal).toFixed(4))
    };

    return {
      signal: parseFloat(signal.toFixed(4)),
      direction: direction,
      confidence: confidence,
      modelContributions: contributions,
      regimeUsed: regime
    };
  }

  // =========================================================================
  // MODEL DESCRIPTIONS (for UI rendering)
  // =========================================================================

  /**
   * Return human-readable descriptions of every model in the engine,
   * suitable for rendering in a UI tooltip or info panel.
   *
   * @returns {Object} Keyed by model ID with name, description, inputs,
   *   outputs, and methodology fields.
   */
  function getModelDescriptions() {
    return {
      tft: {
        id: 'tft',
        name: 'Temporal Fusion Transformer (TFT)',
        description: 'Simulates a multi-horizon quantile forecasting model with attention-weighted feature extraction over a 60-bar lookback window.',
        inputs: ['OHLCV candles', 'sector metadata', 'market cap', 'event calendar'],
        outputs: ['P10 / P50 / P90 price quantiles', 'confidence score', 'attention weight vector'],
        methodology: [
          'Exponential-decay recency weighting combined with volume and return z-scores form an attention mechanism.',
          'Lag-1 autocorrelation measures mean-reversion tendency.',
          'EMA-20 slope captures momentum persistence.',
          'GARCH(1,1) proxy (λ=0.94 EWMA variance) models volatility clustering.',
          'Asymmetric semi-deviation used for downside (P10) and upside (P90) quantiles.'
        ]
      },
      dlob: {
        id: 'dlob',
        name: 'Deep Limit Order Book (DLOB)',
        description: 'CNN + LSTM simulation that constructs synthetic Level-2 order book data from OHLCV and extracts directional signals from book shape dynamics.',
        inputs: ['OHLCV candles'],
        outputs: ['direction (up/down/neutral)', 'calibrated probability', 'book imbalance', 'volume concentration'],
        methodology: [
          'Synthetic L2 book: 10 bid + 10 ask levels with geometric volume decay from BBO.',
          'CNN layer: bid-ask imbalance, volume concentration near BBO, level-weighted pressure gradient.',
          'LSTM layer: imbalance trend slope, concentration slope, order-absorption detection.',
          'Platt Scaling (A=1.2, B=-0.3) calibrates raw sigmoid output to probability.'
        ]
      },
      hmm: {
        id: 'hmm',
        name: 'Hidden Markov Model (HMM)',
        description: 'Four-state HMM with 27 discretised observation symbols. Uses the Forward Algorithm with scaling to infer current market regime probabilities.',
        inputs: ['OHLCV candles'],
        outputs: ['state probabilities [4]', 'current regime label', 'confidence score', 'transition matrix'],
        methodology: [
          'States: Trending Up, Trending Down, Mean-Reverting, High-Vol Choppy.',
          'Observable features: realised volatility, return autocorrelation, spread proxy — each discretised into 3 bins.',
          'Emission probabilities constructed from independent marginal distributions per state.',
          'Forward algorithm with scaling factors prevents numerical underflow.',
          'Confidence derived from 1 − normalised entropy of posterior state distribution.'
        ]
      },
      rl: {
        id: 'rl',
        name: 'Reinforcement Learning Execution Agent',
        description: 'Simulates a DQN-style agent mapping state features to discrete actions (BUY / SELL / HOLD / CLOSE) with Almgren-Chriss market impact penalisation.',
        inputs: ['OHLCV candles', 'current position', 'portfolio state (equity, ADV, session timing)'],
        outputs: ['recommended action', 'action probability distribution', 'expected reward', 'market impact estimate (bps)', 'Almgren-Chriss cost'],
        methodology: [
          'State features: normalised PnL, session time remaining, volatility regime, momentum score, mean-reversion score.',
          'Q-values computed via linear weight matrix (simulated dense layer).',
          'Softmax policy converts Q-values to action probabilities.',
          'Almgren-Chriss: impact = σ × √(shares/ADV) × urgency_factor.',
          'Impact cost penalises trade actions proportionally.'
        ]
      },
      metaLearner: {
        id: 'metaLearner',
        name: 'Meta-Learner Signal Combiner',
        description: 'XGBoost-style gradient-boosted signal combination with regime-dependent weighting and tanh saturation.',
        inputs: ['TFT output', 'DLOB output', 'HMM output', 'RL output'],
        outputs: ['combined signal [-1, 1]', 'direction (BUY/SELL/HOLD)', 'confidence 0-100', 'per-model contributions', 'regime used'],
        methodology: [
          'Each model output normalised to [-1, 1] signal range.',
          'Regime-dependent weight allocation: trending favours TFT+RL, ranging favours DLOB+RL, high-vol favours RL+HMM.',
          'Linear weighted combination passed through tanh(2.5x) for saturation.',
          'Confidence blends signal strength, model agreement factor, and individual model confidence.'
        ]
      }
    };
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  window.SignalModels = {
    /** @see runTFT */
    runTFT: runTFT,
    /** @see runDLOB */
    runDLOB: runDLOB,
    /** @see runHMM */
    runHMM: runHMM,
    /** @see runRLAgent */
    runRLAgent: runRLAgent,
    /** @see combineSignals */
    combineSignals: combineSignals,
    /** @see getModelDescriptions */
    getModelDescriptions: getModelDescriptions
  };

})();
