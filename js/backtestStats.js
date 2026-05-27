/**
 * BacktestStats — Backtesting Statistics & Validation Engine
 * Production-grade module for a browser-based intraday trading workstation.
 *
 * Exposes: window.BacktestStats
 *
 * Modules:
 *   1. Walk-Forward Optimization
 *   2. Monte Carlo Permutation Test
 *   3. Deflated Sharpe Ratio (Bailey & Lopez de Prado 2014)
 *   4. Sharpe Ratio Calculator (+ Sortino, Calmar, Information Ratio)
 *   5. Transaction Cost Model (Indian exchange fee structure)
 *   6. Fill Rate Modeling
 *   7. SHAP-like Feature Importance
 *   8. Performance Attribution
 *   9. Equity Curve Analytics
 *  10. Strategy Health Score
 */
(function () {
  'use strict';

  /* ================================================================
   *  INTERNAL MATH UTILITIES
   * ================================================================ */

  var EULER_MASCHERONI = 0.5772156649015329;
  var SQRT2PI = Math.sqrt(2 * Math.PI);
  var ANNUALIZATION_FACTOR = Math.sqrt(252);
  var TRADING_DAYS_PER_YEAR = 252;

  /**
   * Standard Normal CDF — Abramowitz & Stegun rational approximation (formula 26.2.17).
   * Maximum absolute error ≈ 7.5 × 10⁻⁸.
   * @param {number} x
   * @returns {number} P(Z <= x)
   */
  function normCDF(x) {
    if (x === 0) return 0.5;
    var sign = x < 0 ? -1 : 1;
    var z = Math.abs(x);

    var b1 = 0.319381530;
    var b2 = -0.356563782;
    var b3 = 1.781477937;
    var b4 = -1.821255978;
    var b5 = 1.330274429;
    var p  = 0.2316419;

    var t = 1.0 / (1.0 + p * z);
    var t2 = t * t;
    var t3 = t2 * t;
    var t4 = t3 * t;
    var t5 = t4 * t;

    var pdf = Math.exp(-0.5 * z * z) / SQRT2PI;
    var cdf = 1.0 - pdf * (b1 * t + b2 * t2 + b3 * t3 + b4 * t4 + b5 * t5);

    return sign === -1 ? 1.0 - cdf : cdf;
  }

  /**
   * Arithmetic mean of an array.
   * @param {number[]} arr
   * @returns {number}
   */
  function mean(arr) {
    if (!arr || arr.length === 0) return 0;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) {
      sum += arr[i];
    }
    return sum / arr.length;
  }

  /**
   * Population or sample standard deviation.
   * @param {number[]} arr
   * @param {boolean} [sample=true] — if true use Bessel's correction (N-1)
   * @returns {number}
   */
  function stddev(arr, sample) {
    if (!arr || arr.length < 2) return 0;
    if (typeof sample === 'undefined') sample = true;
    var m = mean(arr);
    var ss = 0;
    for (var i = 0; i < arr.length; i++) {
      var d = arr[i] - m;
      ss += d * d;
    }
    return Math.sqrt(ss / (sample ? arr.length - 1 : arr.length));
  }

  /**
   * Downside deviation — standard deviation of negative excess returns only.
   * @param {number[]} returns
   * @param {number} [mar=0] — minimum acceptable return per period
   * @returns {number}
   */
  function downsideDeviation(returns, mar) {
    if (typeof mar === 'undefined') mar = 0;
    var sumSq = 0;
    var count = 0;
    for (var i = 0; i < returns.length; i++) {
      var diff = returns[i] - mar;
      if (diff < 0) {
        sumSq += diff * diff;
        count++;
      }
    }
    if (count === 0) return 0;
    return Math.sqrt(sumSq / returns.length); // full-length denominator (standard Sortino convention)
  }

  /**
   * Maximum drawdown and its duration from a return series.
   * @param {number[]} returns — period returns (not equity values)
   * @returns {{ maxDrawdown: number, peakIndex: number, troughIndex: number, durationPeriods: number }}
   */
  function computeMaxDrawdown(returns) {
    if (!returns || returns.length === 0) {
      return { maxDrawdown: 0, peakIndex: 0, troughIndex: 0, durationPeriods: 0 };
    }
    var equity = 1;
    var peak = 1;
    var maxDD = 0;
    var peakIdx = 0;
    var troughIdx = 0;
    var currentPeakIdx = 0;

    for (var i = 0; i < returns.length; i++) {
      equity *= (1 + returns[i]);
      if (equity > peak) {
        peak = equity;
        currentPeakIdx = i;
      }
      var dd = (peak - equity) / peak;
      if (dd > maxDD) {
        maxDD = dd;
        peakIdx = currentPeakIdx;
        troughIdx = i;
      }
    }
    return {
      maxDrawdown: maxDD,
      peakIndex: peakIdx,
      troughIndex: troughIdx,
      durationPeriods: troughIdx - peakIdx
    };
  }

  /**
   * Compute annualized Sharpe ratio from a period-return series.
   * @param {number[]} returns
   * @param {number} [rfPerPeriod=0]
   * @returns {number}
   */
  function computeSharpe(returns, rfPerPeriod) {
    if (!returns || returns.length < 2) return 0;
    if (typeof rfPerPeriod === 'undefined') rfPerPeriod = 0;
    var excessReturns = [];
    for (var i = 0; i < returns.length; i++) {
      excessReturns.push(returns[i] - rfPerPeriod);
    }
    var m = mean(excessReturns);
    var s = stddev(excessReturns, true);
    if (s === 0) return m > 0 ? Infinity : m < 0 ? -Infinity : 0;
    return (m / s) * ANNUALIZATION_FACTOR;
  }

  /**
   * Sample skewness (Fisher's definition).
   * @param {number[]} arr
   * @returns {number}
   */
  function skewness(arr) {
    if (!arr || arr.length < 3) return 0;
    var n = arr.length;
    var m = mean(arr);
    var s = stddev(arr, true);
    if (s === 0) return 0;
    var sum3 = 0;
    for (var i = 0; i < n; i++) {
      var d = (arr[i] - m) / s;
      sum3 += d * d * d;
    }
    return (n / ((n - 1) * (n - 2))) * sum3;
  }

  /**
   * Sample excess kurtosis (Fisher's definition).
   * @param {number[]} arr
   * @returns {number}
   */
  function kurtosis(arr) {
    if (!arr || arr.length < 4) return 0;
    var n = arr.length;
    var m = mean(arr);
    var s = stddev(arr, true);
    if (s === 0) return 0;
    var sum4 = 0;
    for (var i = 0; i < n; i++) {
      var d = (arr[i] - m) / s;
      sum4 += d * d * d * d;
    }
    var rawKurt = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) * sum4;
    var correction = (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
    return rawKurt - correction;
  }

  /**
   * Pearson correlation coefficient.
   * @param {number[]} xs
   * @param {number[]} ys
   * @returns {number}
   */
  function correlation(xs, ys) {
    var n = Math.min(xs.length, ys.length);
    if (n < 2) return 0;
    var mx = mean(xs.slice(0, n));
    var my = mean(ys.slice(0, n));
    var sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < n; i++) {
      var dx = xs[i] - mx;
      var dy = ys[i] - my;
      sxy += dx * dy;
      sxx += dx * dx;
      syy += dy * dy;
    }
    var denom = Math.sqrt(sxx * syy);
    if (denom === 0) return 0;
    return sxy / denom;
  }

  /**
   * Seeded pseudo-random number generator (Mulberry32).
   * @param {number} seed
   * @returns {function(): number} — returns values in [0, 1)
   */
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Fisher-Yates shuffle (in-place) using a supplied RNG.
   * @param {any[]} arr
   * @param {function(): number} rng
   * @returns {any[]} the mutated array
   */
  function shuffleArray(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /**
   * Sum of an array.
   * @param {number[]} arr
   * @returns {number}
   */
  function sum(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s;
  }

  /* ================================================================
   *  1. WALK-FORWARD OPTIMIZATION
   * ================================================================ */

  /**
   * Walk-Forward Test with expanding training windows and fixed-length test windows.
   *
   * Splits a return series into consecutive folds. Each fold trains (optimizes)
   * on all data up to the train boundary, then evaluates on the subsequent
   * fixed-length test window. Detects overfitting by comparing in-sample vs
   * out-of-sample Sharpe ratios.
   *
   * @param {number[]} returns — array of period returns
   * @param {number} trainWindowSize — minimum initial training window length
   * @param {number} testWindowSize  — fixed test window length per fold
   * @returns {{
   *   folds: Array<{
   *     trainPeriod: {start: number, end: number},
   *     testPeriod:  {start: number, end: number},
   *     inSampleSharpe: number,
   *     outOfSampleSharpe: number,
   *     outOfSampleReturn: number
   *   }>,
   *   aggregateOOSSharpe: number,
   *   degradationRatio: number,
   *   isOverfit: boolean
   * }}
   */
  function walkForwardTest(returns, trainWindowSize, testWindowSize) {
    if (!returns || returns.length === 0) {
      return { folds: [], aggregateOOSSharpe: 0, degradationRatio: 0, isOverfit: true };
    }

    var n = returns.length;
    var folds = [];
    var allOOSReturns = [];
    var isSharpesSum = 0;
    var oosSharpesSum = 0;
    var foldCount = 0;

    var trainEnd = trainWindowSize;

    while (trainEnd + testWindowSize <= n) {
      var trainSlice = returns.slice(0, trainEnd);
      var testSlice = returns.slice(trainEnd, trainEnd + testWindowSize);

      var isSharpe = computeSharpe(trainSlice, 0);
      var oosSharpe = computeSharpe(testSlice, 0);

      // Compute out-of-sample cumulative return
      var oosReturn = 1;
      for (var j = 0; j < testSlice.length; j++) {
        oosReturn *= (1 + testSlice[j]);
        allOOSReturns.push(testSlice[j]);
      }
      oosReturn -= 1;

      folds.push({
        trainPeriod: { start: 0, end: trainEnd - 1 },
        testPeriod: { start: trainEnd, end: trainEnd + testWindowSize - 1 },
        inSampleSharpe: isSharpe,
        outOfSampleSharpe: oosSharpe,
        outOfSampleReturn: oosReturn
      });

      isSharpesSum += isSharpe;
      oosSharpesSum += oosSharpe;
      foldCount++;

      // Advance: expanding train window absorbs previous test window
      trainEnd += testWindowSize;
    }

    var avgISSharpe = foldCount > 0 ? isSharpesSum / foldCount : 0;
    var aggregateOOSSharpe = computeSharpe(allOOSReturns, 0);
    var avgOOSSharpe = foldCount > 0 ? oosSharpesSum / foldCount : 0;

    var degradationRatio = (avgISSharpe !== 0) ? avgOOSSharpe / avgISSharpe : 0;

    return {
      folds: folds,
      aggregateOOSSharpe: aggregateOOSSharpe,
      degradationRatio: degradationRatio,
      isOverfit: degradationRatio < 0.5
    };
  }

  /* ================================================================
   *  2. MONTE CARLO PERMUTATION TEST
   * ================================================================ */

  /**
   * Monte Carlo Permutation Test for strategy significance.
   *
   * Computes the actual Sharpe ratio, then generates `numPermutations`
   * random shuffles of the return series and computes the Sharpe of each.
   * The p-value is the proportion of permuted Sharpes that equal or exceed
   * the actual Sharpe. Uses a seeded PRNG (Mulberry32) for reproducibility.
   *
   * @param {number[]} strategyReturns — array of period returns
   * @param {number}   [numPermutations=1000] — number of random shuffles
   * @param {number}   [seed=42] — PRNG seed for reproducibility
   * @returns {{
   *   actualSharpe: number,
   *   permutedSharpes: number[],
   *   pValue: number,
   *   isSignificant: boolean,
   *   confidenceLevel: string,
   *   percentile: number
   * }}
   */
  function monteCarloTest(strategyReturns, numPermutations, seed) {
    if (typeof numPermutations === 'undefined' || numPermutations === null) numPermutations = 1000;
    if (typeof seed === 'undefined' || seed === null) seed = 42;

    var actualSharpe = computeSharpe(strategyReturns, 0);
    var rng = mulberry32(seed);
    var permutedSharpes = [];
    var countGTE = 0;

    for (var p = 0; p < numPermutations; p++) {
      // Create a copy and shuffle
      var shuffled = strategyReturns.slice();
      shuffleArray(shuffled, rng);
      var permSharpe = computeSharpe(shuffled, 0);
      permutedSharpes.push(permSharpe);
      if (permSharpe >= actualSharpe) {
        countGTE++;
      }
    }

    var pValue = countGTE / numPermutations;

    // Determine percentile: how many permuted Sharpes are BELOW the actual
    var countBelow = 0;
    for (var i = 0; i < permutedSharpes.length; i++) {
      if (permutedSharpes[i] < actualSharpe) countBelow++;
    }
    var percentile = (countBelow / numPermutations) * 100;

    var confidenceLevel = 'not significant';
    if (pValue < 0.01) {
      confidenceLevel = '99%';
    } else if (pValue < 0.05) {
      confidenceLevel = '95%';
    }

    return {
      actualSharpe: actualSharpe,
      permutedSharpes: permutedSharpes,
      pValue: pValue,
      isSignificant: pValue < 0.05,
      confidenceLevel: confidenceLevel,
      percentile: percentile
    };
  }

  /* ================================================================
   *  3. DEFLATED SHARPE RATIO (DSR)
   * ================================================================ */

  /**
   * Deflated Sharpe Ratio — Bailey & Lopez de Prado (2014).
   *
   * Corrects the observed Sharpe ratio for multiple testing bias. The expected
   * maximum Sharpe under the null hypothesis is estimated using the order
   * statistics of the normal distribution.
   *
   * @param {number} observedSharpe — the strategy's observed (annualized) Sharpe ratio
   * @param {number} numTrials      — total number of strategy variants / parameter combos tested
   * @param {number} numReturns     — number of return observations
   * @param {number} skew           — sample skewness of returns
   * @param {number} kurt           — sample excess kurtosis of returns
   * @returns {{
   *   observedSharpe: number,
   *   expectedMaxSharpe: number,
   *   deflatedSR: number,
   *   dsr_pvalue: number,
   *   isSignificant: boolean,
   *   numTrials: number,
   *   haircut: number
   * }}
   */
  function deflatedSharpeRatio(observedSharpe, numTrials, numReturns, skew, kurt) {
    // Validate inputs
    if (numTrials < 1) numTrials = 1;
    if (numReturns < 2) numReturns = 2;
    if (typeof skew === 'undefined' || skew === null) skew = 0;
    if (typeof kurt === 'undefined' || kurt === null) kurt = 3;

    // 1. Expected maximum Sharpe ratio under the null (i.i.d. normal returns)
    //    E[max(SR)] ≈ sqrt(2 * ln(N)) * (1 - γ/(2*ln(N))) + γ / sqrt(2*ln(N))
    //    where γ = Euler-Mascheroni constant
    var expectedMaxSharpe;
    if (numTrials <= 1) {
      expectedMaxSharpe = 0;
    } else {
      var lnN = Math.log(numTrials);
      var sqrt2lnN = Math.sqrt(2 * lnN);
      expectedMaxSharpe = sqrt2lnN * (1 - EULER_MASCHERONI / (2 * lnN))
                        + EULER_MASCHERONI / sqrt2lnN;
    }

    // 2. Compute the standardised deflated Sharpe ratio (SR*)
    //    SR* = (SR_obs - E[max(SR)]) / σ(SR)
    //    where σ(SR)² = (1 - skew*SR + (kurt-3)/4 * SR²) / (numReturns - 1)
    //    (we use excess kurtosis directly, so kurt already has 3 subtracted if Fisher's;
    //     the formula uses raw kurtosis, hence kurt is treated as excess + 3 below)
    var sr = observedSharpe;
    var varianceNumerator = 1 - skew * sr + ((kurt - 3) / 4) * sr * sr;
    // Guard against negative variance from extreme inputs
    if (varianceNumerator < 0) varianceNumerator = 0;
    var srStdErr = Math.sqrt(varianceNumerator / (numReturns - 1));

    var srStar;
    if (srStdErr === 0) {
      srStar = sr > expectedMaxSharpe ? 6 : -6; // clamp to ±6σ
    } else {
      srStar = (sr - expectedMaxSharpe) / srStdErr;
    }

    // 3. DSR = Φ(SR*)
    var dsr = normCDF(srStar);

    // p-value: probability under H0 that observed SR exceeds expected max
    var dsr_pvalue = 1 - dsr;

    // Haircut: percentage reduction from observed to expected max Sharpe
    var haircut = (observedSharpe !== 0)
      ? Math.max(0, (observedSharpe - expectedMaxSharpe) / observedSharpe)
      : 0;

    return {
      observedSharpe: observedSharpe,
      expectedMaxSharpe: expectedMaxSharpe,
      deflatedSR: dsr,
      dsr_pvalue: dsr_pvalue,
      isSignificant: dsr_pvalue < 0.05,
      numTrials: numTrials,
      haircut: haircut
    };
  }

  /* ================================================================
   *  4. SHARPE RATIO CALCULATOR (+ Sortino, Calmar, Info Ratio)
   * ================================================================ */

  /**
   * Comprehensive risk-adjusted return metrics.
   *
   * @param {number[]} returns      — array of period (daily) returns
   * @param {number}   [riskFreeRate=0] — annualized risk-free rate (e.g. 0.05 for 5%)
   * @param {number[]} [benchmarkReturns] — optional benchmark returns for Information Ratio
   * @returns {{
   *   sharpe: number,
   *   sortino: number,
   *   calmar: number,
   *   informationRatio: number,
   *   annualizedReturn: number,
   *   annualizedVol: number,
   *   maxDrawdown: number
   * }}
   */
  function sharpeRatio(returns, riskFreeRate, benchmarkReturns) {
    if (!returns || returns.length === 0) {
      return {
        sharpe: 0, sortino: 0, calmar: 0, informationRatio: 0,
        annualizedReturn: 0, annualizedVol: 0, maxDrawdown: 0
      };
    }
    if (typeof riskFreeRate === 'undefined' || riskFreeRate === null) riskFreeRate = 0;

    var rfPerPeriod = riskFreeRate / TRADING_DAYS_PER_YEAR;

    // Excess returns
    var excessReturns = [];
    for (var i = 0; i < returns.length; i++) {
      excessReturns.push(returns[i] - rfPerPeriod);
    }

    var meanExcess = mean(excessReturns);
    var vol = stddev(excessReturns, true);
    var annualizedReturn = mean(returns) * TRADING_DAYS_PER_YEAR;
    var annualizedVol = vol * ANNUALIZATION_FACTOR;

    // Sharpe
    var sharpe = vol !== 0 ? (meanExcess / vol) * ANNUALIZATION_FACTOR : 0;

    // Sortino — downside deviation relative to risk-free rate
    var dd = downsideDeviation(returns, rfPerPeriod);
    var sortino = dd !== 0 ? (meanExcess / dd) * ANNUALIZATION_FACTOR : 0;

    // Calmar — annualized return / max drawdown
    var ddInfo = computeMaxDrawdown(returns);
    var maxDD = ddInfo.maxDrawdown;
    var calmar = maxDD !== 0 ? annualizedReturn / maxDD : 0;

    // Information Ratio — excess return vs benchmark / tracking error
    var informationRatio = 0;
    if (benchmarkReturns && benchmarkReturns.length > 0) {
      var activeReturns = [];
      var minLen = Math.min(returns.length, benchmarkReturns.length);
      for (var k = 0; k < minLen; k++) {
        activeReturns.push(returns[k] - benchmarkReturns[k]);
      }
      var activeMean = mean(activeReturns);
      var trackingError = stddev(activeReturns, true);
      informationRatio = trackingError !== 0 ? (activeMean / trackingError) * ANNUALIZATION_FACTOR : 0;
    }

    return {
      sharpe: sharpe,
      sortino: sortino,
      calmar: calmar,
      informationRatio: informationRatio,
      annualizedReturn: annualizedReturn,
      annualizedVol: annualizedVol,
      maxDrawdown: maxDD
    };
  }

  /* ================================================================
   *  5. TRANSACTION COST MODEL (Indian exchange fees)
   * ================================================================ */

  /**
   * Comprehensive transaction cost model for Indian equity markets.
   *
   * For each trade computes spread cost (Roll model), market impact
   * (square-root model), exchange fees (STT, SEBI turnover, stamp duty),
   * brokerage (discount-broker cap), and GST.
   *
   * @param {Array<{
   *   symbol: string,
   *   side: 'BUY'|'SELL',
   *   quantity: number,
   *   price: number,
   *   volume: number
   * }>} trades — list of executed / proposed trades
   * @param {Object} marketData — keyed by symbol
   * @param {number} marketData[symbol].dailyVolatility — σ (daily) for the symbol
   * @param {number} marketData[symbol].averageVolume   — average daily volume in shares
   * @param {number} marketData[symbol].bidAskSpread    — optional observed spread; if absent use Roll estimate
   * @param {number[]} [marketData[symbol].closePrices] — optional recent close prices for Roll model
   * @returns {{
   *   trades: Array<{
   *     symbol: string,
   *     spreadCost: number,
   *     marketImpact: number,
   *     exchangeFees: number,
   *     brokerage: number,
   *     gst: number,
   *     totalCost: number
   *   }>,
   *   aggregateCosts: number,
   *   costAsPercentOfGrossAlpha: number,
   *   netReturns: number
   * }}
   */
  function transactionCostModel(trades, marketData) {
    if (!trades || trades.length === 0) {
      return { trades: [], aggregateCosts: 0, costAsPercentOfGrossAlpha: 0, netReturns: 0 };
    }
    if (!marketData) marketData = {};

    var STT_RATE = 0.00025;            // 0.025% Securities Transaction Tax
    var SEBI_TURNOVER_RATE = 0.000001; // 0.0001%
    var STAMP_DUTY_RATE = 0.00003;     // 0.003%
    var GST_RATE = 0.18;               // 18% GST on brokerage
    var BROKERAGE_RATE = 0.0003;       // 0.03%
    var BROKERAGE_CAP = 20;            // ₹20 per order (discount broker)

    var tradeResults = [];
    var totalCosts = 0;
    var grossAlpha = 0;

    for (var i = 0; i < trades.length; i++) {
      var trade = trades[i];
      var sym = trade.symbol || '';
      var md = marketData[sym] || {};
      var turnover = trade.quantity * trade.price;
      var sigma = md.dailyVolatility || 0.02; // default 2% daily vol
      var avgVolume = md.averageVolume || 1000000;

      // 1. Bid-ask spread cost — Roll (1984) model estimate
      //    Roll spread = 2 * sqrt(-Cov(Δp_t, Δp_{t-1}))
      var spreadCost;
      if (md.bidAskSpread && md.bidAskSpread > 0) {
        spreadCost = md.bidAskSpread * turnover * 0.5; // pay half-spread per side
      } else if (md.closePrices && md.closePrices.length >= 3) {
        // Roll model: compute autocovariance of returns
        var priceReturns = [];
        for (var r = 1; r < md.closePrices.length; r++) {
          priceReturns.push(md.closePrices[r] - md.closePrices[r - 1]);
        }
        var autoCov = 0;
        if (priceReturns.length >= 2) {
          var mRet = mean(priceReturns);
          for (var r2 = 1; r2 < priceReturns.length; r2++) {
            autoCov += (priceReturns[r2] - mRet) * (priceReturns[r2 - 1] - mRet);
          }
          autoCov /= (priceReturns.length - 1);
        }
        var rollSpread = autoCov < 0 ? 2 * Math.sqrt(-autoCov) : sigma * trade.price * 0.01;
        spreadCost = rollSpread * trade.quantity * 0.5;
      } else {
        // Fallback: estimate spread as 0.5 * daily_vol * price
        spreadCost = 0.5 * sigma * trade.price * trade.quantity * 0.01;
      }

      // 2. Market impact — square-root model: σ * price * sqrt(Q / V)
      var volumeFraction = trade.quantity / avgVolume;
      var marketImpact = sigma * trade.price * Math.sqrt(volumeFraction) * trade.quantity;

      // 3. Exchange fees
      var stt = turnover * STT_RATE;
      var sebi = turnover * SEBI_TURNOVER_RATE;
      var stamp = turnover * STAMP_DUTY_RATE;
      var exchangeFees = stt + sebi + stamp;

      // 4. Brokerage
      var brokerage = Math.min(BROKERAGE_CAP, turnover * BROKERAGE_RATE);

      // 5. GST on brokerage
      var gst = brokerage * GST_RATE;

      var totalTradeCost = spreadCost + marketImpact + exchangeFees + brokerage + gst;

      tradeResults.push({
        symbol: sym,
        spreadCost: Math.round(spreadCost * 100) / 100,
        marketImpact: Math.round(marketImpact * 100) / 100,
        exchangeFees: Math.round(exchangeFees * 100) / 100,
        brokerage: Math.round(brokerage * 100) / 100,
        gst: Math.round(gst * 100) / 100,
        totalCost: Math.round(totalTradeCost * 100) / 100
      });

      totalCosts += totalTradeCost;

      // Gross alpha approximation: just accumulate turnover for cost-ratio
      grossAlpha += turnover;
    }

    var costPct = grossAlpha !== 0 ? (totalCosts / grossAlpha) * 100 : 0;

    return {
      trades: tradeResults,
      aggregateCosts: Math.round(totalCosts * 100) / 100,
      costAsPercentOfGrossAlpha: Math.round(costPct * 10000) / 10000,
      netReturns: Math.round((grossAlpha - totalCosts) * 100) / 100
    };
  }

  /* ================================================================
   *  6. FILL RATE MODELING
   * ================================================================ */

  /**
   * Realistic fill-rate model based on order-to-volume participation rate.
   *
   * Estimates the expected fill rate, filled quantity, average fill price
   * (including slippage), and price impact for a given order.
   *
   * @param {number} orderSize      — number of shares in the order
   * @param {number} averageVolume  — average daily volume for the instrument
   * @param {number} [urgency=0.5]  — urgency parameter in [0, 1]; higher = more aggressive
   * @param {number} [price]        — current reference price
   * @param {number} [volatility]   — daily volatility of the instrument (decimal)
   * @returns {{
   *   expectedFillRate: number,
   *   filledShares: number,
   *   avgFillPrice: number,
   *   priceImpact: number,
   *   participationRate: number
   * }}
   */
  function fillRateModel(orderSize, averageVolume, urgency, price, volatility) {
    if (typeof urgency === 'undefined' || urgency === null) urgency = 0.5;
    if (typeof price === 'undefined' || price === null) price = 100;
    if (typeof volatility === 'undefined' || volatility === null) volatility = 0.02;

    // Clamp urgency to [0, 1]
    urgency = Math.max(0, Math.min(1, urgency));

    var participationRate = (averageVolume > 0) ? orderSize / averageVolume : 1;

    // Base fill rate from participation brackets
    var baseFillRate;
    var limitFraction;  // fraction filled at limit price
    var marketFraction; // fraction filled at market price (with slippage)

    if (participationRate < 0.01) {
      // Very small order — almost certainly fills at limit
      baseFillRate = 0.95;
      limitFraction = 0.95;
      marketFraction = 0.05;
    } else if (participationRate <= 0.05) {
      // Moderate order — partial slippage
      baseFillRate = 0.80 + 0.15 * (1 - (participationRate - 0.01) / 0.04);
      limitFraction = 0.80;
      marketFraction = 0.20;
    } else if (participationRate <= 0.15) {
      // Large order — significant impact
      baseFillRate = 0.60 + 0.20 * (1 - (participationRate - 0.05) / 0.10);
      limitFraction = 0.60;
      marketFraction = 0.40;
    } else {
      // Very large order — severe impact, partial fill likely
      baseFillRate = Math.max(0.20, 0.60 - (participationRate - 0.15) * 2);
      limitFraction = baseFillRate * 0.5;
      marketFraction = 1 - limitFraction;
    }

    // Adjust fill rate by urgency — higher urgency pushes more to market orders
    var effectiveFillRate = baseFillRate + (1 - baseFillRate) * urgency * 0.5;
    effectiveFillRate = Math.min(1, effectiveFillRate);

    var filledShares = Math.round(orderSize * effectiveFillRate);

    // Price impact — square-root model: impact = σ * sqrt(participation)
    var priceImpact = volatility * Math.sqrt(participationRate) * (0.5 + 0.5 * urgency);
    priceImpact = Math.min(priceImpact, volatility * 3); // cap at 3σ

    // Weighted average fill price
    var limitPrice = price;
    var marketPrice = price * (1 + priceImpact);
    var effectiveLimitFrac = limitFraction / (limitFraction + marketFraction);
    var effectiveMarketFrac = marketFraction / (limitFraction + marketFraction);
    var avgFillPrice = limitPrice * effectiveLimitFrac + marketPrice * effectiveMarketFrac;
    avgFillPrice = Math.round(avgFillPrice * 100) / 100;

    return {
      expectedFillRate: Math.round(effectiveFillRate * 10000) / 10000,
      filledShares: filledShares,
      avgFillPrice: avgFillPrice,
      priceImpact: Math.round(priceImpact * 1000000) / 1000000,
      participationRate: Math.round(participationRate * 10000) / 10000
    };
  }

  /* ================================================================
   *  7. SHAP-LIKE FEATURE IMPORTANCE
   * ================================================================ */

  /**
   * Feature importance analysis via correlation with trade PnL.
   *
   * For each feature, computes Pearson correlation with PnL, ranks by
   * absolute importance, and detects importance drift by comparing
   * first-half vs second-half correlations.
   *
   * @param {Array<{pnl: number}>} trades — array of trades with PnL
   * @param {Array<Object>} featureVectors — parallel array; each object is { featureName: value, ... }
   * @returns {{
   *   features: Array<{
   *     name: string,
   *     importance: number,
   *     correlation: number,
   *     driftDetected: boolean,
   *     firstHalfCorr: number,
   *     secondHalfCorr: number
   *   }>,
   *   topPositiveFeatures: string[],
   *   topNegativeFeatures: string[],
   *   driftWarnings: string[]
   * }}
   */
  function featureImportance(trades, featureVectors) {
    if (!trades || !featureVectors || trades.length === 0 || featureVectors.length === 0) {
      return { features: [], topPositiveFeatures: [], topNegativeFeatures: [], driftWarnings: [] };
    }

    var n = Math.min(trades.length, featureVectors.length);
    var pnlArray = [];
    for (var i = 0; i < n; i++) {
      pnlArray.push(trades[i].pnl || 0);
    }

    // Discover feature names from the first feature vector
    var featureNames = [];
    var first = featureVectors[0];
    for (var key in first) {
      if (first.hasOwnProperty(key)) {
        featureNames.push(key);
      }
    }

    var halfIdx = Math.floor(n / 2);
    var features = [];
    var driftWarnings = [];

    for (var f = 0; f < featureNames.length; f++) {
      var fname = featureNames[f];

      // Extract feature column
      var featureCol = [];
      for (var j = 0; j < n; j++) {
        featureCol.push(featureVectors[j][fname] || 0);
      }

      // Full correlation
      var corr = correlation(featureCol, pnlArray);

      // First-half and second-half correlations
      var firstHalfFeature = featureCol.slice(0, halfIdx);
      var firstHalfPnl = pnlArray.slice(0, halfIdx);
      var secondHalfFeature = featureCol.slice(halfIdx);
      var secondHalfPnl = pnlArray.slice(halfIdx);

      var firstCorr = correlation(firstHalfFeature, firstHalfPnl);
      var secondCorr = correlation(secondHalfFeature, secondHalfPnl);

      // Drift detection: sign change OR magnitude change > 50%
      var signChanged = (firstCorr > 0 && secondCorr < 0) || (firstCorr < 0 && secondCorr > 0);
      var magnitudeChange = (Math.abs(firstCorr) > 0.001)
        ? Math.abs(Math.abs(secondCorr) - Math.abs(firstCorr)) / Math.abs(firstCorr)
        : Math.abs(secondCorr) > 0.05 ? 1 : 0;
      var driftDetected = signChanged || magnitudeChange > 0.5;

      if (driftDetected) {
        driftWarnings.push(
          fname + ': correlation shifted from ' + firstCorr.toFixed(4) +
          ' to ' + secondCorr.toFixed(4) +
          (signChanged ? ' (sign change)' : ' (magnitude change ' + (magnitudeChange * 100).toFixed(1) + '%)')
        );
      }

      features.push({
        name: fname,
        importance: Math.abs(corr),
        correlation: Math.round(corr * 10000) / 10000,
        driftDetected: driftDetected,
        firstHalfCorr: Math.round(firstCorr * 10000) / 10000,
        secondHalfCorr: Math.round(secondCorr * 10000) / 10000
      });
    }

    // Sort by absolute importance descending
    features.sort(function (a, b) { return b.importance - a.importance; });

    // Top positive and negative features
    var topPositiveFeatures = [];
    var topNegativeFeatures = [];
    for (var t = 0; t < features.length; t++) {
      if (features[t].correlation > 0) {
        topPositiveFeatures.push(features[t].name);
      } else if (features[t].correlation < 0) {
        topNegativeFeatures.push(features[t].name);
      }
    }

    return {
      features: features,
      topPositiveFeatures: topPositiveFeatures,
      topNegativeFeatures: topNegativeFeatures,
      driftWarnings: driftWarnings
    };
  }

  /* ================================================================
   *  8. PERFORMANCE ATTRIBUTION
   * ================================================================ */

  /**
   * Multi-dimensional performance attribution.
   *
   * Decomposes strategy returns into alpha (skill), beta (market exposure),
   * sector PnL, time-of-day PnL, and signal-model PnL.
   *
   * @param {Array<{
   *   pnl: number,
   *   marketReturn: number,
   *   sector: string,
   *   hour: number,
   *   model: string
   * }>} trades — each trade object with attribution fields
   * @returns {{
   *   alpha: number,
   *   beta: number,
   *   sectorPnL: Object<string, number>,
   *   hourlyPnL: Object<string, number>,
   *   modelPnL: Object<string, number>,
   *   bestHour: number,
   *   worstHour: number,
   *   bestSector: string,
   *   worstSector: string
   * }}
   */
  function performanceAttribution(trades) {
    if (!trades || trades.length === 0) {
      return {
        alpha: 0, beta: 0,
        sectorPnL: {}, hourlyPnL: {}, modelPnL: {},
        bestHour: 0, worstHour: 0, bestSector: '', worstSector: ''
      };
    }

    // Compute beta via OLS regression of trade PnL on market return
    var pnls = [];
    var marketRets = [];
    var sectorPnL = {};
    var hourlyPnL = {};
    var modelPnL = {};

    for (var i = 0; i < trades.length; i++) {
      var t = trades[i];
      var pnl = t.pnl || 0;
      var mktRet = t.marketReturn || 0;
      pnls.push(pnl);
      marketRets.push(mktRet);

      // Sector
      var sector = t.sector || 'Unknown';
      if (!sectorPnL.hasOwnProperty(sector)) sectorPnL[sector] = 0;
      sectorPnL[sector] += pnl;

      // Hour
      var hour = (typeof t.hour !== 'undefined' && t.hour !== null) ? t.hour : -1;
      var hourKey = String(hour);
      if (!hourlyPnL.hasOwnProperty(hourKey)) hourlyPnL[hourKey] = 0;
      hourlyPnL[hourKey] += pnl;

      // Model / signal type
      var model = t.model || 'Unknown';
      if (!modelPnL.hasOwnProperty(model)) modelPnL[model] = 0;
      modelPnL[model] += pnl;
    }

    // Beta: Cov(PnL, Mkt) / Var(Mkt)
    var mktMean = mean(marketRets);
    var pnlMean = mean(pnls);
    var covPnlMkt = 0;
    var varMkt = 0;
    for (var k = 0; k < pnls.length; k++) {
      var dPnl = pnls[k] - pnlMean;
      var dMkt = marketRets[k] - mktMean;
      covPnlMkt += dPnl * dMkt;
      varMkt += dMkt * dMkt;
    }
    var beta = varMkt !== 0 ? covPnlMkt / varMkt : 0;

    // Alpha = mean(PnL) - beta * mean(market return), total
    var totalPnL = sum(pnls);
    var totalMktContribution = beta * sum(marketRets);
    var alpha = totalPnL - totalMktContribution;

    // Find best/worst hour and sector
    var bestHour = 0, worstHour = 0;
    var bestHourPnL = -Infinity, worstHourPnL = Infinity;
    for (var h in hourlyPnL) {
      if (hourlyPnL.hasOwnProperty(h)) {
        if (hourlyPnL[h] > bestHourPnL) {
          bestHourPnL = hourlyPnL[h];
          bestHour = parseInt(h, 10);
        }
        if (hourlyPnL[h] < worstHourPnL) {
          worstHourPnL = hourlyPnL[h];
          worstHour = parseInt(h, 10);
        }
      }
    }

    var bestSector = '', worstSector = '';
    var bestSecPnL = -Infinity, worstSecPnL = Infinity;
    for (var s in sectorPnL) {
      if (sectorPnL.hasOwnProperty(s)) {
        if (sectorPnL[s] > bestSecPnL) {
          bestSecPnL = sectorPnL[s];
          bestSector = s;
        }
        if (sectorPnL[s] < worstSecPnL) {
          worstSecPnL = sectorPnL[s];
          worstSector = s;
        }
      }
    }

    return {
      alpha: Math.round(alpha * 100) / 100,
      beta: Math.round(beta * 10000) / 10000,
      sectorPnL: sectorPnL,
      hourlyPnL: hourlyPnL,
      modelPnL: modelPnL,
      bestHour: bestHour,
      worstHour: worstHour,
      bestSector: bestSector,
      worstSector: worstSector
    };
  }

  /* ================================================================
   *  9. EQUITY CURVE ANALYTICS
   * ================================================================ */

  /**
   * Comprehensive equity curve analytics.
   *
   * @param {number[]} equityCurve — array of equity values (absolute ₹ or normalised)
   * @returns {{
   *   maxDrawdown: number,
   *   maxDrawdownDuration: number,
   *   maxDrawdownStart: number,
   *   maxDrawdownEnd: number,
   *   recoveryTime: number,
   *   underwaterSeries: number[],
   *   rollingSharpe: number[],
   *   rollingSharpeWindow: number,
   *   longestWinStreak: number,
   *   longestLossStreak: number,
   *   currentStreak: { type: string, length: number },
   *   profitFactor: number,
   *   expectancyPerTrade: number,
   *   winRate: number,
   *   avgWin: number,
   *   avgLoss: number,
   *   totalReturn: number,
   *   numTrades: number
   * }}
   */
  function equityCurveAnalytics(equityCurve) {
    if (!equityCurve || equityCurve.length < 2) {
      return {
        maxDrawdown: 0, maxDrawdownDuration: 0, maxDrawdownStart: 0, maxDrawdownEnd: 0,
        recoveryTime: 0, underwaterSeries: [], rollingSharpe: [], rollingSharpeWindow: 20,
        longestWinStreak: 0, longestLossStreak: 0, currentStreak: { type: 'none', length: 0 },
        profitFactor: 0, expectancyPerTrade: 0, winRate: 0,
        avgWin: 0, avgLoss: 0, totalReturn: 0, numTrades: 0
      };
    }

    var n = equityCurve.length;

    // Convert equity curve to period returns
    var returns = [];
    for (var i = 1; i < n; i++) {
      returns.push(equityCurve[i - 1] !== 0
        ? (equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]
        : 0
      );
    }

    // --- Max Drawdown ---
    var peak = equityCurve[0];
    var maxDD = 0;
    var ddStart = 0, ddEnd = 0, currentDDStart = 0;

    for (var i2 = 0; i2 < n; i2++) {
      if (equityCurve[i2] > peak) {
        peak = equityCurve[i2];
        currentDDStart = i2;
      }
      var dd = (peak - equityCurve[i2]) / peak;
      if (dd > maxDD) {
        maxDD = dd;
        ddStart = currentDDStart;
        ddEnd = i2;
      }
    }

    var maxDrawdownDuration = ddEnd - ddStart;

    // Recovery time: how long after ddEnd until equity exceeds peak at ddStart
    var peakAtDDStart = equityCurve[ddStart];
    var recoveryTime = -1; // -1 means not yet recovered
    for (var r = ddEnd + 1; r < n; r++) {
      if (equityCurve[r] >= peakAtDDStart) {
        recoveryTime = r - ddEnd;
        break;
      }
    }
    if (recoveryTime === -1) {
      recoveryTime = n - ddEnd; // still in drawdown
    }

    // --- Underwater Series ---
    var underwaterSeries = [];
    var runningPeak = equityCurve[0];
    for (var u = 0; u < n; u++) {
      if (equityCurve[u] > runningPeak) runningPeak = equityCurve[u];
      underwaterSeries.push(runningPeak > 0 ? (equityCurve[u] - runningPeak) / runningPeak : 0);
    }

    // --- Rolling Sharpe (20-trade window) ---
    var ROLLING_WINDOW = 20;
    var rollingSharpe = [];
    for (var rs = 0; rs < returns.length; rs++) {
      if (rs < ROLLING_WINDOW - 1) {
        rollingSharpe.push(null);
      } else {
        var windowSlice = returns.slice(rs - ROLLING_WINDOW + 1, rs + 1);
        rollingSharpe.push(computeSharpe(windowSlice, 0));
      }
    }

    // --- Win/Loss Streak Analysis ---
    var wins = 0, losses = 0;
    var grossProfit = 0, grossLoss = 0;
    var longestWin = 0, longestLoss = 0;
    var currentWin = 0, currentLoss = 0;
    var lastType = 'none';

    for (var w = 0; w < returns.length; w++) {
      if (returns[w] > 0) {
        wins++;
        grossProfit += returns[w];
        currentWin++;
        currentLoss = 0;
        lastType = 'win';
        if (currentWin > longestWin) longestWin = currentWin;
      } else if (returns[w] < 0) {
        losses++;
        grossLoss += Math.abs(returns[w]);
        currentLoss++;
        currentWin = 0;
        lastType = 'loss';
        if (currentLoss > longestLoss) longestLoss = currentLoss;
      } else {
        // Flat period — don't break streaks
      }
    }

    var currentStreakLength = lastType === 'win' ? currentWin : (lastType === 'loss' ? currentLoss : 0);

    // --- Profit Factor ---
    var profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

    // --- Expectancy Per Trade ---
    var totalTrades = returns.length;
    var winRate = totalTrades > 0 ? wins / totalTrades : 0;
    var avgWin = wins > 0 ? grossProfit / wins : 0;
    var avgLoss = losses > 0 ? grossLoss / losses : 0;
    var expectancy = totalTrades > 0 ? (grossProfit - grossLoss) / totalTrades : 0;

    // --- Total Return ---
    var totalReturn = equityCurve[0] !== 0
      ? (equityCurve[n - 1] - equityCurve[0]) / equityCurve[0]
      : 0;

    return {
      maxDrawdown: Math.round(maxDD * 10000) / 10000,
      maxDrawdownDuration: maxDrawdownDuration,
      maxDrawdownStart: ddStart,
      maxDrawdownEnd: ddEnd,
      recoveryTime: recoveryTime,
      underwaterSeries: underwaterSeries,
      rollingSharpe: rollingSharpe,
      rollingSharpeWindow: ROLLING_WINDOW,
      longestWinStreak: longestWin,
      longestLossStreak: longestLoss,
      currentStreak: { type: lastType, length: currentStreakLength },
      profitFactor: Math.round(profitFactor * 10000) / 10000,
      expectancyPerTrade: Math.round(expectancy * 1000000) / 1000000,
      winRate: Math.round(winRate * 10000) / 10000,
      avgWin: Math.round(avgWin * 1000000) / 1000000,
      avgLoss: Math.round(avgLoss * 1000000) / 1000000,
      totalReturn: Math.round(totalReturn * 10000) / 10000,
      numTrades: totalTrades
    };
  }

  /* ================================================================
   *  10. STRATEGY HEALTH SCORE
   * ================================================================ */

  /**
   * Aggregates all metrics into a single 0–100 health score with letter grade.
   *
   * Scoring rubric:
   *   - Sharpe > 1.0:                     +20 pts
   *   - Sortino > 1.5:                    +10 pts
   *   - Max DD < 5%:                      +15 pts
   *   - DSR significant (p < 0.05):       +15 pts
   *   - Walk-forward degradation < 30%:   +10 pts
   *   - Profit factor > 1.5:              +10 pts
   *   - Monte Carlo p < 0.05:             +10 pts
   *   - Feature drift count = 0:          +10 pts
   *
   * @param {{
   *   sharpe?: number,
   *   sortino?: number,
   *   maxDrawdown?: number,
   *   dsrPValue?: number,
   *   walkForwardDegradation?: number,
   *   profitFactor?: number,
   *   monteCarloPValue?: number,
   *   featureDriftCount?: number
   * }} allMetrics
   * @returns {{
   *   score: number,
   *   grade: string,
   *   breakdown: Object<string, { earned: number, max: number, condition: string, met: boolean }>
   * }}
   */
  function strategyHealthScore(allMetrics) {
    if (!allMetrics) allMetrics = {};

    var breakdown = {};
    var score = 0;

    // Helper: register a criterion
    function criterion(name, max, conditionStr, met) {
      var earned = met ? max : 0;
      breakdown[name] = { earned: earned, max: max, condition: conditionStr, met: met };
      score += earned;
    }

    // 1. Sharpe > 1.0 → +20
    var sharpe = typeof allMetrics.sharpe === 'number' ? allMetrics.sharpe : null;
    criterion('sharpe', 20, 'Sharpe > 1.0', sharpe !== null && sharpe > 1.0);

    // 2. Sortino > 1.5 → +10
    var sortino = typeof allMetrics.sortino === 'number' ? allMetrics.sortino : null;
    criterion('sortino', 10, 'Sortino > 1.5', sortino !== null && sortino > 1.5);

    // 3. Max DD < 5% → +15
    var maxDD = typeof allMetrics.maxDrawdown === 'number' ? allMetrics.maxDrawdown : null;
    criterion('maxDrawdown', 15, 'Max Drawdown < 5%', maxDD !== null && maxDD < 0.05);

    // 4. DSR significant → +15
    var dsrP = typeof allMetrics.dsrPValue === 'number' ? allMetrics.dsrPValue : null;
    criterion('dsrSignificant', 15, 'DSR p-value < 0.05', dsrP !== null && dsrP < 0.05);

    // 5. Walk-forward degradation < 30% → +10
    var wfDeg = typeof allMetrics.walkForwardDegradation === 'number' ? allMetrics.walkForwardDegradation : null;
    // degradation = 1 - ratio;  so ratio > 0.7 means degradation < 30%
    criterion('walkForward', 10, 'WF degradation < 30%', wfDeg !== null && wfDeg < 0.30);

    // 6. Profit factor > 1.5 → +10
    var pf = typeof allMetrics.profitFactor === 'number' ? allMetrics.profitFactor : null;
    criterion('profitFactor', 10, 'Profit Factor > 1.5', pf !== null && pf > 1.5);

    // 7. Monte Carlo p < 0.05 → +10
    var mcP = typeof allMetrics.monteCarloPValue === 'number' ? allMetrics.monteCarloPValue : null;
    criterion('monteCarlo', 10, 'Monte Carlo p < 0.05', mcP !== null && mcP < 0.05);

    // 8. Feature drift count = 0 → +10
    var driftCount = typeof allMetrics.featureDriftCount === 'number' ? allMetrics.featureDriftCount : null;
    criterion('featureDrift', 10, 'No feature drift', driftCount !== null && driftCount === 0);

    // Grade mapping
    var grade;
    if (score >= 95) grade = 'A+';
    else if (score >= 80) grade = 'A';
    else if (score >= 65) grade = 'B';
    else if (score >= 50) grade = 'C';
    else if (score >= 35) grade = 'D';
    else grade = 'F';

    return {
      score: score,
      grade: grade,
      breakdown: breakdown
    };
  }

  /* ================================================================
   *  PUBLIC API
   * ================================================================ */

  window.BacktestStats = {
    /** Walk-Forward Optimization */
    walkForwardTest: walkForwardTest,

    /** Monte Carlo Permutation Test */
    monteCarloTest: monteCarloTest,

    /** Deflated Sharpe Ratio (Bailey & Lopez de Prado 2014) */
    deflatedSharpeRatio: deflatedSharpeRatio,

    /** Sharpe / Sortino / Calmar / Information Ratio Calculator */
    sharpeRatio: sharpeRatio,

    /** Transaction Cost Model (Indian market fee structure) */
    transactionCostModel: transactionCostModel,

    /** Fill Rate Modeling */
    fillRateModel: fillRateModel,

    /** SHAP-like Feature Importance */
    featureImportance: featureImportance,

    /** Performance Attribution */
    performanceAttribution: performanceAttribution,

    /** Equity Curve Analytics */
    equityCurveAnalytics: equityCurveAnalytics,

    /** Strategy Health Score (0-100 + letter grade) */
    strategyHealthScore: strategyHealthScore
  };

})();
