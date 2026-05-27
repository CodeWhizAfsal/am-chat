/**
 * Strategy Validation Lab — Market Regime Detection Engine
 * 
 * Classifies market conditions (Trending, Range, High Volatility, Low Volatility, Event-Driven)
 * and determines allowed trading strategies to limit false signals.
 */
(function () {
  'use strict';

  function detectRegime(candles) {
    if (candles.length < 20) {
      return {
        regime: "Range",
        strategyAllowed: "Mean Reversion",
        volatility: 0.5
      };
    }

    var last20 = candles.slice(-20);
    var closePrices = last20.map(function (c) { return c.close; });
    var sum = closePrices.reduce(function (a, b) { return a + b; }, 0);
    var mean = sum / 20;
    
    // Variance and Volatility (ATR-like standard deviation %)
    var sqDiffSum = closePrices.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0);
    var stdDev = Math.sqrt(sqDiffSum / 20);
    var volatilityPct = (stdDev / mean) * 100;

    // Direct Directional Drift
    var firstPrice = last20[0].close;
    var lastPrice = last20[last20.length - 1].close;
    var driftPct = ((lastPrice - firstPrice) / firstPrice) * 100;

    var regime = "Range";
    var strategyAllowed = "Mean Reversion";

    // 1. Extreme Volatility Spike -> Event Driven (Stand Aside!)
    if (volatilityPct > 2.5) {
      regime = "Event Driven";
      strategyAllowed = "Stand Aside";
    }
    // 2. Strong Drift with Moderate Volatility -> Trending
    else if (Math.abs(driftPct) >= 0.8 && volatilityPct >= 0.5) {
      regime = "Trending";
      strategyAllowed = "Breakout";
    }
    // 3. High Volatility without Drift -> High Volatility Choppiness
    else if (volatilityPct >= 1.2 && Math.abs(driftPct) < 0.4) {
      regime = "High Volatility";
      strategyAllowed = "Mean Reversion";
    }
    // 4. Low Volatility without Drift -> Low Volatility Grind
    else if (volatilityPct < 0.4) {
      regime = "Low Volatility";
      strategyAllowed = "Mean Reversion";
    }

    return {
      regime: regime,
      strategyAllowed: strategyAllowed,
      volatility: parseFloat(volatilityPct.toFixed(2)),
      drift: parseFloat(driftPct.toFixed(2))
    };
  }

  window.RegimeDetector = {
    detectRegime: detectRegime
  };
})();
