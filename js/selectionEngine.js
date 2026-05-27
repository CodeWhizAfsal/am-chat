/**
 * Strategy Validation Lab — Autonomous Stock Selection Engine
 * 
 * Filters and ranks the stock universe based on liquidity, momentum,
 * volume expansion, relative strength, and sector trends at the opening bell.
 */
(function () {
  'use strict';

  function runScan(universeType, dateString) {
    // Determine target universe list from StockDB
    var allStocks = window.StockDB ? window.StockDB.NSE_STOCKS : [];
    if (allStocks.length === 0) return [];

    var universe = [];
    if (universeType === 'NIFTY50') {
      // Pick first 50 stocks (which are Nifty 50 constituents in StockDB)
      universe = allStocks.slice(0, 50);
    } else {
      // Pick all 150 stocks
      universe = allStocks;
    }

    var scannedList = [];
    var seed = dateString ? dateString.split('-').reduce(function(a, b) { return a + parseInt(b); }, 0) : 100;

    universe.forEach(function (stock, idx) {
      var name = stock[0];
      var ticker = stock[1];
      var sector = stock[2];
      var basePrice = stock[3];

      // Introduce semi-random seed factors tied to the stock ticker and the specific audit date
      var charSum = ticker.split('').reduce(function(sum, char) { return sum + char.charCodeAt(0); }, 0);
      var stockSeed = (charSum + seed) % 100;

      // Simulate key intraday scanner parameters:
      // 1. Momentum score: percent rise/fall at opening 9:15-9:30 range (-3% to +4%)
      var simulatedMomentum = parseFloat(((stockSeed % 7) - 3 + (stockSeed * 0.01)).toFixed(2));
      // 2. Volume expansion: current volume vs typical 15-minute average (0.4x to 4.5x)
      var simulatedVolumeMultiplier = parseFloat((0.4 + (stockSeed % 9) * 0.5).toFixed(1));
      // 3. Volatility (ATR %)
      var atrPct = parseFloat((1.2 + (stockSeed % 4) * 0.4).toFixed(1));

      // Calculate composite AI Ranking Score
      // Weights: Momentum (40%), Volume Expansion (30%), Relative Strength (20%), Sector Trend (10%)
      var mScore = Math.min(100, Math.max(0, 50 + simulatedMomentum * 12));
      var vScore = Math.min(100, Math.max(0, (simulatedVolumeMultiplier / 4.5) * 100));
      var relativeStrength = 50 + (simulatedMomentum > 1 ? 25 : simulatedMomentum < -1 ? -25 : 5);
      
      var sectorStrengths = { Banking: 75, Energy: 60, Consumer: 80, Auto: 85, Metals: 45, Pharma: 55, FMCG: 50 };
      var sScore = sectorStrengths[sector] || 50;

      var compositeScore = Math.round(mScore * 0.4 + vScore * 0.3 + relativeStrength * 0.2 + sScore * 0.1);

      // Save ranked candidate
      scannedList.push({
        ticker: ticker,
        name: name,
        sector: sector,
        price: basePrice,
        score: compositeScore,
        momentum: simulatedMomentum,
        volumeMultiplier: simulatedVolumeMultiplier,
        atrPct: atrPct
      });
    });

    // Sort descending by score
    scannedList.sort(function (a, b) {
      return b.score - a.score;
    });

    return scannedList;
  }

  window.SelectionEngine = {
    runScan: runScan
  };
})();
