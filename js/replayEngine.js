/**
 * Strategy Validation Lab — Lookahead-Protected Replay Engine
 * 
 * Manages chronological walk-forward progression of simulated price ticks,
 * providing strict lookahead-protection for algorithms and portfolio managers.
 */
(function () {
  'use strict';

  var replayInterval = null;
  var currentBarIndex = 0;
  var speedMultiplier = 1;
  var fullSessionCandles = {}; // Ticker -> Candle Array
  var isPlaying = false;
  var onTickFn = null;
  var onCompleteFn = null;

  function initReplay(tickers, dateString, onTick, onComplete) {
    stopReplay();
    
    currentBarIndex = 15; // Start at index 15 to allow indicator initialization
    fullSessionCandles = {};
    onTickFn = onTick;
    onCompleteFn = onComplete;
    isPlaying = false;

    // Load full-day intraday series for each selected ticker
    tickers.forEach(function (ticker) {
      // Use standard synthetic day candle generator (defined in StockDB or generated locally)
      fullSessionCandles[ticker] = generateReplayIntradayCandles(ticker, dateString);
    });

    // Also load NIFTY benchmark index candles
    fullSessionCandles['NIFTY'] = generateReplayIntradayCandles('NIFTY', dateString);
  }

  function startReplay(speed) {
    if (replayInterval) clearInterval(replayInterval);
    isPlaying = true;
    speedMultiplier = speed || 1;

    if (speedMultiplier === 9999) {
      // Instant execution: loop synchronously
      runInstantReplay();
      return;
    }

    var baseTickMs = 1500; // 1x = 1.5 seconds per 5m bar
    var tickSpeed = Math.round(baseTickMs / speedMultiplier);

    replayInterval = setInterval(function () {
      stepForward();
    }, tickSpeed);
  }

  function stopReplay() {
    isPlaying = false;
    if (replayInterval) {
      clearInterval(replayInterval);
      replayInterval = null;
    }
  }

  function stepForward() {
    // Check if we reached end of 75-candle intraday session
    var maxIndex = 74; // 75 bars
    if (currentBarIndex > maxIndex) {
      stopReplay();
      if (onCompleteFn) onCompleteFn();
      return;
    }

    // SLICE CODES - 100% Lookahead Protection!
    // Extract candles strictly up to currentBarIndex for each ticker
    var slices = {};
    for (var ticker in fullSessionCandles) {
      slices[ticker] = fullSessionCandles[ticker].slice(0, currentBarIndex + 1);
    }

    // Call dynamic UI/portfolio update callback
    if (onTickFn) {
      onTickFn(slices, currentBarIndex, maxIndex);
    }

    currentBarIndex++;
  }

  function runInstantReplay() {
    var maxIndex = 74;
    while (currentBarIndex <= maxIndex) {
      var slices = {};
      for (var ticker in fullSessionCandles) {
        slices[ticker] = fullSessionCandles[ticker].slice(0, currentBarIndex + 1);
      }
      if (onTickFn) {
        onTickFn(slices, currentBarIndex, maxIndex);
      }
      currentBarIndex++;
    }
    isPlaying = false;
    if (onCompleteFn) onCompleteFn();
  }

  function getProgressionPercentage(maxIndex) {
    return Math.round((currentBarIndex / maxIndex) * 100);
  }

  /* ──────────────── Private Intraday Generator ───────────────────────── */

  function generateReplayIntradayCandles(ticker, dateString) {
    var candles = [];
    var basePrice = 1000;
    
    if (ticker === 'NIFTY') {
      basePrice = 22500;
    } else if (window.StockDB) {
      var match = window.StockDB.NSE_STOCKS.find(function(s) { return s[1] === ticker; });
      if (match) basePrice = match[3];
    }

    var startTime = new Date();
    if (dateString) {
      startTime = new Date(dateString);
    }
    startTime.setHours(9, 15, 0, 0);

    var curPrice = basePrice;
    
    // Seed variance based on ticker name and date
    var charSum = ticker.split('').reduce(function(a, b) { return a + b.charCodeAt(0); }, 0);
    var dateSum = dateString ? dateString.split('-').reduce(function(a, b) { return a + parseInt(b); }, 0) : 100;
    var seed = (charSum + dateSum) % 50;

    // Upward or downward trend bias
    var trendBias = ((seed % 9) - 4) * (basePrice * 0.0001); 
    var accumVolume = 0;
    var accumTypicalPriceVolume = 0;

    for (var i = 0; i < 75; i++) {
      var time = new Date(startTime.getTime() + i * 5 * 60 * 1000);
      
      var volatility = basePrice * 0.0035;
      var o = curPrice + (Math.random() - 0.5) * volatility;
      var c = o + trendBias + (Math.random() - 0.5) * volatility;
      var h = Math.max(o, c) + Math.random() * volatility * 0.3;
      var l = Math.min(o, c) - Math.random() * volatility * 0.3;
      var vol = Math.round(15000 + Math.random() * 85000);

      var typicalPrice = (h + l + c) / 3;
      accumVolume += vol;
      accumTypicalPriceVolume += typicalPrice * vol;
      var vwap = accumTypicalPriceVolume / accumVolume;

      candles.push({
        time: time.toISOString(),
        open: parseFloat(o.toFixed(2)),
        high: parseFloat(h.toFixed(2)),
        low: parseFloat(l.toFixed(2)),
        close: parseFloat(c.toFixed(2)),
        volume: vol,
        vwap: parseFloat(vwap.toFixed(2))
      });

      curPrice = c;
    }
    return candles;
  }

  window.ReplayEngine = {
    initReplay: initReplay,
    startReplay: startReplay,
    stopReplay: stopReplay,
    getPlaying: function () { return isPlaying; },
    getProgression: getProgressionPercentage
  };
})();
