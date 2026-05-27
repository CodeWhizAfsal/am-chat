/**
 * ============================================================================
 * Microstructure Feature Engineering Module
 * ============================================================================
 * Production-grade market microstructure analytics for browser-based
 * intraday trading workstations. Implements institutional-level features
 * derived from candlestick (OHLCV + VWAP) data.
 *
 * Exposed as: window.MicrostructureEngine
 *
 * Models implemented:
 *   1.  Order Flow Imbalance (OFI)
 *   2.  Trade Imbalance
 *   3.  Queue Imbalance at Top of Book
 *   4.  VWAP Deviation (anchored)
 *   5.  Amihud Illiquidity Ratio
 *   6.  Roll Model (Bid-Ask Spread)
 *   7.  Kyle's Lambda (Price Impact)
 *   8.  Hasbrouck Information Share
 *   9.  Garman-Klass Volatility
 *  10.  Realized Volatility
 *  11.  Z-Score Normalizer
 *  12.  VWAP Resampling
 *
 * @author  Finance Manager Trading System
 * @version 1.0.0
 * ============================================================================
 */
(function() {
    'use strict';

    /* ======================================================================
     * CONSTANTS
     * ==================================================================== */

    /** Default number of trading days per year for annualization. */
    var TRADING_DAYS_PER_YEAR = 252;

    /** Default intraday bars per day (assumes 5-min bars over 6.5 hr session). */
    var DEFAULT_BARS_PER_DAY = 78;

    /** Minimum denominator threshold to avoid division-by-zero artifacts. */
    var EPSILON = 1e-12;

    /* ======================================================================
     * INTERNAL HELPERS
     * ==================================================================== */

    /**
     * Clamp a number to a finite value; return fallback on NaN / Infinity.
     * @param {number} val
     * @param {number} [fallback=0]
     * @returns {number}
     */
    function safeNum(val, fallback) {
        if (typeof fallback === 'undefined') { fallback = 0; }
        if (typeof val !== 'number' || !isFinite(val)) { return fallback; }
        return val;
    }

    /**
     * Return the natural logarithm, guarded against non-positive input.
     * @param {number} x
     * @returns {number}
     */
    function safeLn(x) {
        if (x <= 0) { return 0; }
        return Math.log(x);
    }

    /**
     * Compute arithmetic mean of a numeric array.
     * @param {number[]} arr
     * @returns {number}
     */
    function mean(arr) {
        if (!arr || arr.length === 0) { return 0; }
        var s = 0;
        for (var i = 0; i < arr.length; i++) { s += arr[i]; }
        return s / arr.length;
    }

    /**
     * Compute population variance of a numeric array.
     * @param {number[]} arr
     * @returns {number}
     */
    function variance(arr) {
        if (!arr || arr.length < 2) { return 0; }
        var m = mean(arr);
        var s = 0;
        for (var i = 0; i < arr.length; i++) {
            var d = arr[i] - m;
            s += d * d;
        }
        return s / arr.length;
    }

    /**
     * Compute sample standard deviation of a numeric array.
     * Uses Bessel's correction (n-1 denominator).
     * @param {number[]} arr
     * @returns {number}
     */
    function stddev(arr) {
        if (!arr || arr.length < 2) { return 0; }
        var m = mean(arr);
        var s = 0;
        for (var i = 0; i < arr.length; i++) {
            var d = arr[i] - m;
            s += d * d;
        }
        return Math.sqrt(s / (arr.length - 1));
    }

    /**
     * Compute covariance between two equal-length numeric arrays (population).
     * @param {number[]} xs
     * @param {number[]} ys
     * @returns {number}
     */
    function covariance(xs, ys) {
        if (!xs || !ys || xs.length < 2 || xs.length !== ys.length) { return 0; }
        var mx = mean(xs);
        var my = mean(ys);
        var s = 0;
        for (var i = 0; i < xs.length; i++) {
            s += (xs[i] - mx) * (ys[i] - my);
        }
        return s / xs.length;
    }

    /**
     * Validate a candles array. Returns true if usable.
     * @param {Object[]} candles
     * @param {number}   [minLength=1]
     * @returns {boolean}
     */
    function validCandles(candles, minLength) {
        if (typeof minLength === 'undefined') { minLength = 1; }
        return Array.isArray(candles) && candles.length >= minLength;
    }

    /**
     * Get the last N elements of an array (or the whole array if shorter).
     * @param {Array} arr
     * @param {number} n
     * @returns {Array}
     */
    function tail(arr, n) {
        if (!arr) { return []; }
        if (arr.length <= n) { return arr.slice(); }
        return arr.slice(arr.length - n);
    }

    /**
     * Approximate bid-side volume from a single candle.
     * Uses the candle body and shadow proportions to infer buying pressure.
     * @param {Object} c - Candle {open, high, low, close, volume}
     * @returns {number}
     */
    function approxBidVolume(c) {
        var range = c.high - c.low;
        if (range < EPSILON) {
            return c.volume * 0.5;
        }
        var ratio = c.close >= c.open
            ? (c.close - c.low) / range
            : (c.open - c.low) / range;
        return c.volume * ratio;
    }

    /**
     * Sign function returning -1, 0, or 1.
     * @param {number} x
     * @returns {number}
     */
    function sign(x) {
        if (x > 0) { return 1; }
        if (x < 0) { return -1; }
        return 0;
    }

    /* ======================================================================
     * 1. ORDER FLOW IMBALANCE  (OFI)
     * ==================================================================== */

    /**
     * Compute rolling Order Flow Imbalance from candle data.
     *
     * Since Level-2 order book data is unavailable, bid/ask volumes are
     * approximated from candle geometry:
     *   bid_vol  = volume × (close ≥ open ? (close−low)/(high−low) : (open−low)/(high−low))
     *   ask_vol  = volume − bid_vol
     *   OFI_bar  = (Δbid_vol − Δask_vol) / total_volume
     *
     * The function returns the mean OFI over the trailing `window` bars.
     *
     * @param {Object[]} candles - Array of {time, open, high, low, close, volume, vwap}.
     * @param {number}   [window=10] - Lookback window in bars.
     * @returns {number} Rolling OFI value (positive = buy pressure).
     */
    function computeOFI(candles, window) {
        if (typeof window === 'undefined' || window < 1) { window = 10; }
        if (!validCandles(candles, 2)) { return 0; }

        var subset = tail(candles, window + 1);
        if (subset.length < 2) { return 0; }

        var ofiValues = [];
        for (var i = 1; i < subset.length; i++) {
            var bidCurr = approxBidVolume(subset[i]);
            var askCurr = subset[i].volume - bidCurr;
            var bidPrev = approxBidVolume(subset[i - 1]);
            var askPrev = subset[i - 1].volume - bidPrev;

            var deltaBid = bidCurr - bidPrev;
            var deltaAsk = askCurr - askPrev;
            var totalVol = subset[i].volume + subset[i - 1].volume;

            if (totalVol < EPSILON) {
                ofiValues.push(0);
            } else {
                ofiValues.push((deltaBid - deltaAsk) / totalVol);
            }
        }

        return safeNum(mean(ofiValues));
    }

    /* ======================================================================
     * 2. TRADE IMBALANCE
     * ==================================================================== */

    /**
     * Compute rolling Trade Imbalance.
     *
     * Each candle is classified:
     *   buyer-initiated  if close > (high + low) / 2
     *   seller-initiated otherwise
     *
     * Trade Imbalance = (buyer_count − seller_count) / total  over the window.
     *
     * @param {Object[]} candles
     * @param {number}   [window=10]
     * @returns {number} Value in [-1, 1].
     */
    function computeTradeImbalance(candles, window) {
        if (typeof window === 'undefined' || window < 1) { window = 10; }
        if (!validCandles(candles, 1)) { return 0; }

        var subset = tail(candles, window);
        var buyers = 0;
        var sellers = 0;

        for (var i = 0; i < subset.length; i++) {
            var mid = (subset[i].high + subset[i].low) / 2;
            if (subset[i].close > mid) {
                buyers++;
            } else {
                sellers++;
            }
        }

        var total = buyers + sellers;
        if (total === 0) { return 0; }
        return safeNum((buyers - sellers) / total);
    }

    /* ======================================================================
     * 3. QUEUE IMBALANCE AT TOP OF BOOK
     * ==================================================================== */

    /**
     * Approximate queue imbalance from a single candle.
     *
     *   ratio = (close − low) / (high − low)    — bid pressure proxy
     *   Queue Imbalance = 2 × ratio − 1          — normalized to [−1, 1]
     *
     * @param {Object} candle - Single candle object.
     * @returns {number} Value in [-1, 1].
     */
    function computeQueueImbalance(candle) {
        if (!candle || typeof candle !== 'object') { return 0; }
        var range = candle.high - candle.low;
        if (range < EPSILON) { return 0; }
        var ratio = (candle.close - candle.low) / range;
        return safeNum(2 * ratio - 1);
    }

    /* ======================================================================
     * 4. VWAP DEVIATION
     * ==================================================================== */

    /**
     * Compute VWAP deviation for the most recent candle relative to
     * anchored session VWAP computed from the beginning of the candles array.
     *
     *   Anchored VWAP = Σ(typical_price × volume) / Σ(volume)
     *   Deviation     = (close − VWAP) / VWAP × 100  (percentage)
     *
     * If candles carry a `.vwap` field, the last candle's VWAP is used
     * as a cross-check, but the anchored calculation from raw data is
     * preferred for consistency.
     *
     * @param {Object[]} candles
     * @returns {number} Percentage deviation from VWAP.
     */
    function computeVWAPDeviation(candles) {
        if (!validCandles(candles, 1)) { return 0; }

        var cumPV = 0;
        var cumVol = 0;

        for (var i = 0; i < candles.length; i++) {
            var c = candles[i];
            var typicalPrice = (c.high + c.low + c.close) / 3;
            var vol = c.volume || 0;
            cumPV += typicalPrice * vol;
            cumVol += vol;
        }

        if (cumVol < EPSILON) { return 0; }

        var anchoredVWAP = cumPV / cumVol;
        if (Math.abs(anchoredVWAP) < EPSILON) { return 0; }

        var lastClose = candles[candles.length - 1].close;
        return safeNum((lastClose - anchoredVWAP) / anchoredVWAP * 100);
    }

    /* ======================================================================
     * 5. AMIHUD ILLIQUIDITY RATIO
     * ==================================================================== */

    /**
     * Compute rolling Amihud Illiquidity Ratio.
     *
     *   amihud_i = |r_i| / volume_i
     *   result   = mean(amihud) over trailing `window` bars
     *
     * Higher values indicate less liquidity (larger price impact per
     * unit of volume).
     *
     * @param {Object[]} candles
     * @param {number}   [window=20]
     * @returns {number} Average Amihud ratio (non-negative).
     */
    function computeAmihudRatio(candles, window) {
        if (typeof window === 'undefined' || window < 1) { window = 20; }
        if (!validCandles(candles, 2)) { return 0; }

        var subset = tail(candles, window + 1);
        if (subset.length < 2) { return 0; }

        var ratios = [];
        for (var i = 1; i < subset.length; i++) {
            var prevClose = subset[i - 1].close;
            if (Math.abs(prevClose) < EPSILON || subset[i].volume < EPSILON) {
                ratios.push(0);
                continue;
            }
            var ret = Math.abs((subset[i].close - prevClose) / prevClose);
            ratios.push(ret / subset[i].volume);
        }

        return safeNum(mean(ratios));
    }

    /* ======================================================================
     * 6. ROLL MODEL  (Bid-Ask Spread Estimation)
     * ==================================================================== */

    /**
     * Estimate the effective bid-ask spread using the Roll (1984) model.
     *
     *   Roll Spread = 2 × √(−Cov(r_t, r_{t−1}))
     *
     * If the first-order autocovariance of returns is non-negative
     * (which violates the Roll model assumption), the spread estimate
     * is set to zero.
     *
     * @param {Object[]} candles
     * @param {number}   [window=20] - Number of bars for return series.
     * @returns {number} Estimated spread (non-negative).
     */
    function computeRollSpread(candles, window) {
        if (typeof window === 'undefined' || window < 1) { window = 20; }
        if (!validCandles(candles, 3)) { return 0; }

        var subset = tail(candles, window + 1);
        if (subset.length < 3) { return 0; }

        // Build return series
        var returns = [];
        for (var i = 1; i < subset.length; i++) {
            var prev = subset[i - 1].close;
            if (Math.abs(prev) < EPSILON) {
                returns.push(0);
            } else {
                returns.push((subset[i].close - prev) / prev);
            }
        }

        if (returns.length < 2) { return 0; }

        // Compute Cov(r_t, r_{t-1})
        var rt = returns.slice(1);
        var rtMinus1 = returns.slice(0, returns.length - 1);
        var cov = covariance(rt, rtMinus1);

        if (cov >= 0) { return 0; }
        return safeNum(2 * Math.sqrt(-cov));
    }

    /* ======================================================================
     * 7. KYLE'S LAMBDA  (Price Impact Coefficient)
     * ==================================================================== */

    /**
     * Estimate Kyle's Lambda via simple OLS.
     *
     *   Δprice = α + λ × signed_volume + ε
     *   signed_volume = volume × sign(close − open)
     *   λ = Cov(Δprice, signed_volume) / Var(signed_volume)
     *
     * Lambda captures how much price moves per unit of signed order flow.
     * A higher lambda indicates lower market depth.
     *
     * @param {Object[]} candles
     * @param {number}   [window=20]
     * @returns {number} Estimated Kyle's Lambda.
     */
    function computeKyleLambda(candles, window) {
        if (typeof window === 'undefined' || window < 1) { window = 20; }
        if (!validCandles(candles, 2)) { return 0; }

        var subset = tail(candles, window + 1);
        if (subset.length < 2) { return 0; }

        var deltaPrice = [];
        var signedVol = [];

        for (var i = 1; i < subset.length; i++) {
            var dp = subset[i].close - subset[i - 1].close;
            var sv = subset[i].volume * sign(subset[i].close - subset[i].open);
            deltaPrice.push(dp);
            signedVol.push(sv);
        }

        var varSV = variance(signedVol);
        if (varSV < EPSILON) { return 0; }

        var covDPSV = covariance(deltaPrice, signedVol);
        return safeNum(covDPSV / varSV);
    }

    /* ======================================================================
     * 8. HASBROUCK INFORMATION SHARE
     * ==================================================================== */

    /**
     * Simplified Hasbrouck Information Share.
     *
     * Measures the proportion of total return variance attributable to
     * trade-correlated returns (returns on bars classified as
     * buyer-initiated vs. all returns).
     *
     *   info_share = Var(trade-correlated returns) / Var(all returns)
     *
     * Trade-correlated returns are those on bars where a trade direction
     * can be identified (close ≠ open). Returns on neutral bars are
     * excluded from the numerator.
     *
     * @param {Object[]} candles
     * @param {number}   [window=20]
     * @returns {number} Information share in [0, 1].
     */
    function computeHasbrouckShare(candles, window) {
        if (typeof window === 'undefined' || window < 1) { window = 20; }
        if (!validCandles(candles, 2)) { return 0; }

        var subset = tail(candles, window + 1);
        if (subset.length < 2) { return 0; }

        var allReturns = [];
        var tradeCorrelated = [];

        for (var i = 1; i < subset.length; i++) {
            var prev = subset[i - 1].close;
            if (Math.abs(prev) < EPSILON) { continue; }

            var ret = (subset[i].close - prev) / prev;
            allReturns.push(ret);

            // Trade-correlated: signed return when there is a directional bar
            var direction = sign(subset[i].close - subset[i].open);
            if (direction !== 0) {
                tradeCorrelated.push(ret * direction * direction); // abs contribution; direction^2 = 1
            }
        }

        var varTotal = variance(allReturns);
        if (varTotal < EPSILON) { return 0; }

        var varTrade = variance(tradeCorrelated);
        var share = varTrade / varTotal;

        // Clamp to [0, 1]
        if (share < 0) { share = 0; }
        if (share > 1) { share = 1; }
        return safeNum(share);
    }

    /* ======================================================================
     * 9. GARMAN-KLASS VOLATILITY
     * ==================================================================== */

    /**
     * Compute Garman-Klass (1980) volatility estimator.
     *
     *   GK_i = 0.5 × ln(H/L)² − (2ln2 − 1) × ln(C/O)²
     *   σ²   = mean(GK_i)
     *   σ    = √(σ²)           (per-bar)
     *
     * Optionally annualized:
     *   σ_annual = σ × √(252 × bars_per_day)
     *
     * The GK estimator is ~7.4× more efficient than close-to-close
     * volatility when prices follow geometric Brownian motion.
     *
     * @param {Object[]} candles
     * @param {boolean}  [annualize=true]
     * @param {number}   [barsPerDay] - Override for bars per day (default 78).
     * @returns {number} Volatility estimate.
     */
    function computeGarmanKlassVol(candles, annualize, barsPerDay) {
        if (typeof annualize === 'undefined') { annualize = true; }
        if (typeof barsPerDay === 'undefined') { barsPerDay = DEFAULT_BARS_PER_DAY; }
        if (!validCandles(candles, 1)) { return 0; }

        var coeff = 2 * Math.LN2 - 1; // ≈ 0.3863
        var gkValues = [];

        for (var i = 0; i < candles.length; i++) {
            var c = candles[i];
            if (c.low <= 0 || c.open <= 0) { continue; }

            var lnHL = safeLn(c.high / c.low);
            var lnCO = safeLn(c.close / c.open);
            var gk = 0.5 * lnHL * lnHL - coeff * lnCO * lnCO;
            gkValues.push(gk);
        }

        if (gkValues.length === 0) { return 0; }

        var avgGK = mean(gkValues);
        if (avgGK < 0) { avgGK = 0; } // Guard against numerical artifact
        var vol = Math.sqrt(avgGK);

        if (annualize) {
            vol *= Math.sqrt(TRADING_DAYS_PER_YEAR * barsPerDay);
        }

        return safeNum(vol);
    }

    /* ======================================================================
     * 10. REALIZED VOLATILITY
     * ==================================================================== */

    /**
     * Compute realized volatility from log-returns.
     *
     *   r_i  = ln(C_i / C_{i−1})
     *   RV   = std(r)               (sample std dev)
     *
     * Optionally annualized:
     *   RV_annual = RV × √(252 × bars_per_day)
     *
     * @param {Object[]} candles
     * @param {boolean}  [annualize=true]
     * @param {number}   [barsPerDay] - Override for bars per day (default 78).
     * @returns {number} Realized volatility.
     */
    function computeRealizedVol(candles, annualize, barsPerDay) {
        if (typeof annualize === 'undefined') { annualize = true; }
        if (typeof barsPerDay === 'undefined') { barsPerDay = DEFAULT_BARS_PER_DAY; }
        if (!validCandles(candles, 2)) { return 0; }

        var logReturns = [];
        for (var i = 1; i < candles.length; i++) {
            var prev = candles[i - 1].close;
            if (prev <= 0) { continue; }
            logReturns.push(safeLn(candles[i].close / prev));
        }

        if (logReturns.length < 2) { return 0; }

        var vol = stddev(logReturns);

        if (annualize) {
            vol *= Math.sqrt(TRADING_DAYS_PER_YEAR * barsPerDay);
        }

        return safeNum(vol);
    }

    /* ======================================================================
     * 11. Z-SCORE NORMALIZER
     * ==================================================================== */

    /**
     * Compute rolling z-scores for a numeric series.
     *
     *   z_i = (x_i − μ_window) / σ_window
     *
     * Only uses past data (no lookahead bias): for index i the window is
     * [i − window + 1, i].
     *
     * Returns an array the same length as input. Early values where the
     * full window is not yet available use whatever data is present
     * (minimum 2 observations required for a valid z-score; otherwise 0).
     *
     * @param {number[]} values - Raw feature series.
     * @param {number}   [window=20] - Lookback window.
     * @returns {number[]} Z-score series.
     */
    function zScoreNormalize(values, window) {
        if (typeof window === 'undefined' || window < 2) { window = 20; }
        if (!Array.isArray(values) || values.length === 0) { return []; }

        var result = [];
        for (var i = 0; i < values.length; i++) {
            var start = Math.max(0, i - window + 1);
            var slice = values.slice(start, i + 1);

            if (slice.length < 2) {
                result.push(0);
                continue;
            }

            var m = mean(slice);
            var sd = stddev(slice);

            if (sd < EPSILON) {
                result.push(0);
            } else {
                result.push(safeNum((values[i] - m) / sd));
            }
        }

        return result;
    }

    /* ======================================================================
     * 12. VWAP RESAMPLING
     * ==================================================================== */

    /**
     * Resample candles into fixed-duration VWAP bars.
     *
     * Groups input candles by `barSizeMinutes` intervals and computes:
     *   vwap_close = Σ(typical_price × volume) / Σ(volume)
     *
     * Each output bar contains {time, open, high, low, close, volume, vwap}.
     *
     * Candle `.time` values are interpreted as millisecond timestamps
     * (or seconds — the function auto-detects based on magnitude).
     *
     * @param {Object[]} candles - Input candle array.
     * @param {number}   [barSizeMinutes=5] - Desired bar size in minutes.
     * @returns {Object[]} Array of resampled VWAP bars.
     */
    function resampleVWAP(candles, barSizeMinutes) {
        if (typeof barSizeMinutes === 'undefined' || barSizeMinutes < 1) {
            barSizeMinutes = 5;
        }
        if (!validCandles(candles, 1)) { return []; }

        var barMs = barSizeMinutes * 60 * 1000;

        /**
         * Normalize timestamp to milliseconds.
         * If a value looks like seconds (< 1e12), multiply by 1000.
         */
        function toMs(t) {
            if (typeof t === 'number') {
                return t < 1e12 ? t * 1000 : t;
            }
            // Attempt Date parse
            var d = new Date(t);
            return isNaN(d.getTime()) ? 0 : d.getTime();
        }

        // Sort by time
        var sorted = candles.slice().sort(function(a, b) {
            return toMs(a.time) - toMs(b.time);
        });

        var bars = [];
        var bucketStart = Math.floor(toMs(sorted[0].time) / barMs) * barMs;
        var bucketCandles = [];

        for (var i = 0; i < sorted.length; i++) {
            var tMs = toMs(sorted[i].time);
            var thisBucket = Math.floor(tMs / barMs) * barMs;

            if (thisBucket !== bucketStart && bucketCandles.length > 0) {
                bars.push(buildVWAPBar(bucketStart, bucketCandles));
                bucketCandles = [];
                bucketStart = thisBucket;
            }
            bucketCandles.push(sorted[i]);
        }

        // Flush last bucket
        if (bucketCandles.length > 0) {
            bars.push(buildVWAPBar(bucketStart, bucketCandles));
        }

        return bars;
    }

    /**
     * Build a single VWAP bar from a group of candles.
     * @param {number}   bucketTime - Bucket start timestamp (ms).
     * @param {Object[]} group      - Candles in this bucket.
     * @returns {Object} Aggregated bar.
     */
    function buildVWAPBar(bucketTime, group) {
        var openPrice = group[0].open;
        var highPrice = -Infinity;
        var lowPrice = Infinity;
        var closePrice = group[group.length - 1].close;
        var totalVol = 0;
        var cumPV = 0;

        for (var j = 0; j < group.length; j++) {
            var c = group[j];
            if (c.high > highPrice) { highPrice = c.high; }
            if (c.low < lowPrice) { lowPrice = c.low; }
            var tp = (c.high + c.low + c.close) / 3;
            var v = c.volume || 0;
            cumPV += tp * v;
            totalVol += v;
        }

        var vwapClose = totalVol > EPSILON ? cumPV / totalVol : closePrice;

        return {
            time: bucketTime,
            open: openPrice,
            high: highPrice,
            low: lowPrice,
            close: vwapClose,
            volume: totalVol,
            vwap: vwapClose
        };
    }

    /* ======================================================================
     * COMPOSITE FEATURE VECTOR
     * ==================================================================== */

    /**
     * Compute a composite feature vector containing ALL microstructure
     * features for the most recent bar in the supplied candle series.
     *
     * Also produces rolling z-scores for the primary features to
     * facilitate cross-feature comparison and signal generation.
     *
     * @param {Object[]} candles - Full session candle array.
     * @param {Object}   [config] - Optional configuration overrides.
     * @param {number}   [config.ofiWindow=10]
     * @param {number}   [config.tradeImbalanceWindow=10]
     * @param {number}   [config.amihudWindow=20]
     * @param {number}   [config.rollWindow=20]
     * @param {number}   [config.kyleWindow=20]
     * @param {number}   [config.hasbrouckWindow=20]
     * @param {number}   [config.zScoreWindow=20]
     * @param {boolean}  [config.annualize=true]
     * @param {number}   [config.barsPerDay=78]
     * @returns {Object} Feature vector with z-scores.
     */
    function computeFeatureVector(candles, config) {
        var cfg = config || {};
        var ofiWin        = cfg.ofiWindow || 10;
        var tiWin         = cfg.tradeImbalanceWindow || 10;
        var amihudWin     = cfg.amihudWindow || 20;
        var rollWin       = cfg.rollWindow || 20;
        var kyleWin       = cfg.kyleWindow || 20;
        var hasbrouckWin  = cfg.hasbrouckWindow || 20;
        var zWin          = cfg.zScoreWindow || 20;
        var doAnnualize   = typeof cfg.annualize !== 'undefined' ? cfg.annualize : true;
        var bpd           = cfg.barsPerDay || DEFAULT_BARS_PER_DAY;

        // Default result for edge cases
        var emptyResult = {
            ofi: 0,
            tradeImbalance: 0,
            queueImbalance: 0,
            vwapDeviation: 0,
            amihudRatio: 0,
            rollSpread: 0,
            kyleLambda: 0,
            hasbrouckShare: 0,
            garmanKlassVol: 0,
            realizedVol: 0,
            zScores: {
                ofi: 0,
                tradeImbalance: 0,
                queueImbalance: 0,
                vwapDeviation: 0,
                amihudRatio: 0,
                rollSpread: 0,
                kyleLambda: 0,
                hasbrouckShare: 0,
                garmanKlassVol: 0,
                realizedVol: 0
            }
        };

        if (!validCandles(candles, 1)) { return emptyResult; }

        // Compute scalar features for the latest bar / window
        var ofi             = computeOFI(candles, ofiWin);
        var tradeImbalance  = computeTradeImbalance(candles, tiWin);
        var queueImbalance  = computeQueueImbalance(candles[candles.length - 1]);
        var vwapDeviation   = computeVWAPDeviation(candles);
        var amihudRatio     = computeAmihudRatio(candles, amihudWin);
        var rollSpread      = computeRollSpread(candles, rollWin);
        var kyleLambda      = computeKyleLambda(candles, kyleWin);
        var hasbrouckShare  = computeHasbrouckShare(candles, hasbrouckWin);
        var garmanKlassVol  = computeGarmanKlassVol(candles, doAnnualize, bpd);
        var realizedVol     = computeRealizedVol(candles, doAnnualize, bpd);

        // Build rolling series for z-score computation.
        // For each feature, compute it on all possible trailing sub-windows
        // of the candles array so we get a time series.
        var featureNames = [
            'ofi', 'tradeImbalance', 'queueImbalance', 'vwapDeviation',
            'amihudRatio', 'rollSpread', 'kyleLambda', 'hasbrouckShare',
            'garmanKlassVol', 'realizedVol'
        ];

        var series = {};
        for (var f = 0; f < featureNames.length; f++) {
            series[featureNames[f]] = [];
        }

        // Walk forward through candles, computing each feature at each point
        var minBars = 2; // minimum candles needed for most features
        for (var k = minBars; k <= candles.length; k++) {
            var sub = candles.slice(0, k);
            var lastCandle = sub[sub.length - 1];

            series.ofi.push(computeOFI(sub, ofiWin));
            series.tradeImbalance.push(computeTradeImbalance(sub, tiWin));
            series.queueImbalance.push(computeQueueImbalance(lastCandle));
            series.vwapDeviation.push(computeVWAPDeviation(sub));
            series.amihudRatio.push(computeAmihudRatio(sub, amihudWin));
            series.rollSpread.push(computeRollSpread(sub, rollWin));
            series.kyleLambda.push(computeKyleLambda(sub, kyleWin));
            series.hasbrouckShare.push(computeHasbrouckShare(sub, hasbrouckWin));
            series.garmanKlassVol.push(computeGarmanKlassVol(sub, doAnnualize, bpd));
            series.realizedVol.push(computeRealizedVol(sub, doAnnualize, bpd));
        }

        // Compute z-scores; take the last value for current bar
        var zScores = {};
        for (var z = 0; z < featureNames.length; z++) {
            var name = featureNames[z];
            var zArr = zScoreNormalize(series[name], zWin);
            zScores[name] = zArr.length > 0 ? safeNum(zArr[zArr.length - 1]) : 0;
        }

        return {
            ofi: ofi,
            tradeImbalance: tradeImbalance,
            queueImbalance: queueImbalance,
            vwapDeviation: vwapDeviation,
            amihudRatio: amihudRatio,
            rollSpread: rollSpread,
            kyleLambda: kyleLambda,
            hasbrouckShare: hasbrouckShare,
            garmanKlassVol: garmanKlassVol,
            realizedVol: realizedVol,
            zScores: zScores
        };
    }

    /* ======================================================================
     * PUBLIC API
     * ==================================================================== */

    window.MicrostructureEngine = {
        /** @see computeOFI */
        computeOFI: computeOFI,

        /** @see computeTradeImbalance */
        computeTradeImbalance: computeTradeImbalance,

        /** @see computeQueueImbalance */
        computeQueueImbalance: computeQueueImbalance,

        /** @see computeVWAPDeviation */
        computeVWAPDeviation: computeVWAPDeviation,

        /** @see computeAmihudRatio */
        computeAmihudRatio: computeAmihudRatio,

        /** @see computeRollSpread */
        computeRollSpread: computeRollSpread,

        /** @see computeKyleLambda */
        computeKyleLambda: computeKyleLambda,

        /** @see computeHasbrouckShare */
        computeHasbrouckShare: computeHasbrouckShare,

        /** @see computeGarmanKlassVol */
        computeGarmanKlassVol: computeGarmanKlassVol,

        /** @see computeRealizedVol */
        computeRealizedVol: computeRealizedVol,

        /** @see zScoreNormalize */
        zScoreNormalize: zScoreNormalize,

        /** @see computeFeatureVector */
        computeFeatureVector: computeFeatureVector,

        /** @see resampleVWAP */
        resampleVWAP: resampleVWAP
    };

})();
