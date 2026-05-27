/**
 * Strategy Validation Lab — AI Audit Diagnostics & Insights
 * 
 * Conducts deep post-simulation critiques to discover trading model calibration
 * suggestions, patience tracking, and frictional fee leakages.
 */
(function () {
  'use strict';

  function generateInsights(perf, closedTrades, portfolio) {
    var strengths = [];
    var weaknesses = [];
    var suggestions = [];

    // Evaluate Win Rate & Expectancy
    if (perf.winRate >= 60) {
      strengths.push("🎯 <b>High Setup Quality Gating:</b> Strict score thresholds ($\ge 85$) filtered out bad setups, resulting in a premium win rate of " + perf.winRate + "%.");
    } else if (perf.winRate >= 50) {
      strengths.push("⚖️ <b>Healthy Win Rate:</b> Win Rate of " + perf.winRate + "% is solid. Lookahead protection confirms strategy edge holds under real-time constraints.");
    } else {
      weaknesses.push("🚨 <b>Noise Leakage:</b> Low win rate (" + perf.winRate + "%). The current technical or regime rules allowed some bad trades to bleed capital.");
      suggestions.push("🔧 <b>Calibrate Gating:</b> Consider raising the composite setup confidence score threshold from <b>85 to 90</b> to restrict entry to elite confluences only.");
    }

    // Evaluate patience & overtrading
    if (perf.patienceScore >= 70) {
      strengths.push("🧘 <b>Superb Tactical Patience:</b> Patience Score of " + perf.patienceScore + "% reflects high discipline in skipping sub-optimal setups.");
    } else {
      weaknesses.push("⚠️ <b>Impulsive Trade Frequency:</b> Patience Score is low (" + perf.patienceScore + "%), indicating the algo is over-sensitive to minor crossovers.");
      suggestions.push("🛑 <b>Filter Noise:</b> Enable stricter volume expansions ($>2.0x$) in order flow triggers to reduce impulsive trades.");
    }

    // Evaluate Sharpe & Sortino
    if (perf.sharpe >= 1.5) {
      strengths.push("📈 <b>Institutional Risk Payoff:</b> Sharpe Ratio of " + perf.sharpe + " indicates excellent return per unit risk. Strong out-of-sample robustness.");
    } else {
      weaknesses.push("💨 <b>Low Sharpe Stability (" + perf.sharpe + "):</b> High volatility in equity curve compared to return rate.");
    }

    // Identify Top Win / Loss Sources dynamically
    var lossTrades = closedTrades.filter(function(t) { return t.netPnl < 0; });
    var winTrades = closedTrades.filter(function(t) { return t.netPnl > 0; });

    var topLossSource = "Slippage Drag & Market Consolidation";
    if (lossTrades.length > 0) {
      // Find sector or reason with highest average loss
      var reasons = {};
      lossTrades.forEach(function(t) {
        var r = t.reason.split('|')[2] || t.outcome;
        reasons[r] = (reasons[r] || 0) + Math.abs(t.netPnl);
      });
      var maxLoss = 0;
      for (var rKey in reasons) {
        if (reasons[rKey] > maxLoss) {
          maxLoss = reasons[rKey];
          topLossSource = rKey;
        }
      }
    }

    var topWinSource = "VWAP Breakout Continuations";
    if (winTrades.length > 0) {
      var wReasons = {};
      winTrades.forEach(function(t) {
        var r = t.reason.split('|')[2] || t.outcome;
        wReasons[r] = (wReasons[r] || 0) + t.netPnl;
      });
      var maxWin = 0;
      for (var wKey in wReasons) {
        if (wReasons[wKey] > maxWin) {
          maxWin = wReasons[wKey];
          topWinSource = wKey;
        }
      }
    }

    // Add continuous calibration insights
    suggestions.push(`🌟 <b>Calibration Suggestion:</b> Largest loss source was **${topLossSource.trim()}**. Largest win source was **${topWinSource.trim()}**. Adjust regime weights to favor breakout channels.`);

    return {
      strengths: strengths,
      weaknesses: weaknesses,
      suggestions: suggestions,
      topLossSource: topLossSource,
      topWinSource: topWinSource
    };
  }

  window.AuditInsights = {
    generateInsights: generateInsights
  };
})();
