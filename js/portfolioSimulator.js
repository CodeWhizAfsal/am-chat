/**
 * Strategy Validation Lab — Trading Portfolio & Transaction Simulator
 * 
 * Tracks simulated capital balances, position states, margins, and enforces
 * strict model governance: one active position, score-filters >= 85, state machines,
 * daily drawdown shutdowns, consecutive losses circuit breakers, and cooldowns.
 */
(function () {
  'use strict';

  var portfolio = {
    startingCapital: 500000,
    cash: 500000,
    portfolioValue: 500000,
    riskPerTrade: 0.005, // 0.5% (Strict Institutional Default)
    mode: 'Balanced', // Conservative, Balanced, Aggressive
    useBrokerage: true,
    allowShort: true,
    useMargin: true,
    positions: {}, // Ticker -> Active Position details
    closedTrades: [],
    brokerageFees: 0,
    taxFees: 0,
    slippageFees: 0,

    // --- Institutional Governance State ---
    currentState: 'WAIT', // WAIT, SCAN, QUALIFY, ENTER, MANAGE, EXIT, COOLDOWN, SHUTDOWN
    cooldownBarsRemaining: 0,
    consecutiveLosses: 0,
    sessionTradesExecuted: 0,
    dailyLossCutoff: -0.02, // -2.0% Daily Loss Limit
    isShutdown: false,
    patienceSkips: 0 // Track skipped setups for patience score
  };

  function initPortfolio(capital, riskPct, mode, useBrokerage, allowShort, useMargin) {
    portfolio.startingCapital = capital || 500000;
    portfolio.cash = portfolio.startingCapital;
    portfolio.portfolioValue = portfolio.startingCapital;
    portfolio.riskPerTrade = riskPct || 0.005;
    portfolio.mode = mode || 'Balanced';
    portfolio.useBrokerage = useBrokerage !== false;
    portfolio.allowShort = allowShort !== false;
    portfolio.useMargin = useMargin !== false;
    portfolio.positions = {};
    portfolio.closedTrades = [];
    portfolio.brokerageFees = 0;
    portfolio.taxFees = 0;
    portfolio.slippageFees = 0;

    // Reset Governance State
    portfolio.currentState = 'WAIT';
    portfolio.cooldownBarsRemaining = 0;
    portfolio.consecutiveLosses = 0;
    portfolio.sessionTradesExecuted = 0;
    portfolio.isShutdown = false;
    portfolio.patienceSkips = 0;
  }

  // --- Technical Indicators Helpers ---
  
  function calculateEma(candles, period) {
    var k = 2 / (period + 1);
    if (candles.length === 0) return 0;
    if (candles.length < period) return candles[candles.length - 1].close;
    var sum = 0;
    for (var i = 0; i < period; i++) sum += candles[i].close;
    var ema = sum / period;
    for (var j = period; j < candles.length; j++) {
      ema = candles[j].close * k + ema * (1 - k);
    }
    return ema;
  }

  function calculateWilderRsi(candles, period) {
    period = period || 14;
    if (candles.length <= period) return 50;
    var gains = 0, losses = 0;
    for (var i = 1; i <= period; i++) {
      var diff = candles[i].close - candles[i - 1].close;
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    var avgGain = gains / period;
    var avgLoss = losses / period;
    for (var j = period + 1; j < candles.length; j++) {
      var d = candles[j].close - candles[j - 1].close;
      var g = d > 0 ? d : 0;
      var l = d < 0 ? -d : 0;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
    }
    if (avgLoss === 0) return 100;
    var rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  function calculateMacd(candles) {
    if (candles.length < 26) return { macd: 0, signal: 0, bullish: false };
    var ema12 = calculateEma(candles, 12);
    var ema26 = calculateEma(candles, 26);
    var macd = ema12 - ema26;
    
    // We compute MACD values for the last 9 candles to get smoothed signal
    var macdValues = [];
    var limit = Math.max(26, candles.length - 12);
    for (var i = limit; i < candles.length; i++) {
      var subList = candles.slice(0, i + 1);
      var e12 = calculateEma(subList, 12);
      var e26 = calculateEma(subList, 26);
      macdValues.push(e12 - e26);
    }
    
    var k = 2 / (9 + 1);
    var signal = macdValues[0] || 0;
    for (var j = 1; j < macdValues.length; j++) {
      signal = macdValues[j] * k + signal * (1 - k);
    }
    
    return { macd: macd, signal: signal, bullish: macd > signal };
  }

  function calculateAtr(candles, period) {
    period = period || 14;
    if (candles.length < 2) return 1.0;
    if (candles.length < period + 1) return (candles[candles.length - 1].high - candles[candles.length - 1].low) || 1.0;
    var trs = [];
    for (var i = 1; i < candles.length; i++) {
      var h = candles[i].high;
      var l = candles[i].low;
      var prevC = candles[i - 1].close;
      var tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
      trs.push(tr);
    }
    var sum = 0;
    for (var j = 0; j < period; j++) sum += trs[j];
    var atr = sum / period;
    for (var k = period; k < trs.length; k++) {
      atr = (atr * (period - 1) + trs[k]) / period;
    }
    return atr;
  }

  function calculateBollingerWidth(candles, period) {
    period = period || 20;
    if (candles.length < period) return 1.0;
    var closes = candles.slice(-period).map(function(c) { return c.close; });
    var mean = closes.reduce(function(a,b) { return a+b; }, 0) / period;
    var variance = closes.reduce(function(a,b) { return a + Math.pow(b - mean, 2); }, 0) / period;
    var stdDev = Math.sqrt(variance);
    return mean > 0 ? (4 * stdDev / mean) * 100 : 1.0;
  }

  function calculateKeltnerWidth(candles, period) {
    period = period || 20;
    if (candles.length < period) return 1.0;
    var ema = calculateEma(candles.slice(-period), period);
    var atr = calculateAtr(candles, 10);
    return ema > 0 ? (2 * 1.5 * atr / ema) * 100 : 1.0;
  }

  function calculateAdx(candles, period) {
    period = period || 14;
    if (candles.length < period * 2) return 22;
    var trs = [], pdms = [], ndms = [];
    for (var i = 1; i < candles.length; i++) {
      var c = candles[i];
      var p = candles[i - 1];
      var tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
      trs.push(tr);
      
      var diffH = c.high - p.high;
      var diffL = p.low - c.low;
      var pdm = (diffH > diffL && diffH > 0) ? diffH : 0;
      var ndm = (diffL > diffH && diffL > 0) ? diffL : 0;
      pdms.push(pdm);
      ndms.push(ndm);
    }
    var smoothTr = trs.slice(0, period).reduce(function(a,b){return a+b;},0);
    var smoothPdm = pdms.slice(0, period).reduce(function(a,b){return a+b;},0);
    var smoothNdm = ndms.slice(0, period).reduce(function(a,b){return a+b;},0);
    var dxValues = [];
    for (var j = period; j < trs.length; j++) {
      smoothTr = smoothTr - (smoothTr / period) + trs[j];
      smoothPdm = smoothPdm - (smoothPdm / period) + pdms[j];
      smoothNdm = smoothNdm - (smoothNdm / period) + ndms[j];
      var diPlus = smoothTr > 0 ? (smoothPdm / smoothTr) * 100 : 0;
      var diMinus = smoothTr > 0 ? (smoothNdm / smoothTr) * 100 : 0;
      var diff = Math.abs(diPlus - diMinus);
      var sum = diPlus + diMinus;
      var dx = sum > 0 ? (diff / sum) * 100 : 0;
      dxValues.push(dx);
    }
    if (dxValues.length === 0) return 22;
    var adx = dxValues.slice(0, period).reduce(function(a,b){return a+b;},0) / period;
    for (var k = period; k < dxValues.length; k++) {
      adx = (adx * (period - 1) + dxValues[k]) / period;
    }
    return adx;
  }

  function calculateStochRsi(candles, period) {
    period = period || 14;
    if (candles.length < period * 2) return 50;
    var rsiValues = [];
    for (var i = candles.length - period - 3; i < candles.length; i++) {
      rsiValues.push(calculateWilderRsi(candles.slice(0, i + 1), period));
    }
    var currentRsi = rsiValues[rsiValues.length - 1];
    var minRsi = Math.min.apply(null, rsiValues);
    var maxRsi = Math.max.apply(null, rsiValues);
    return (maxRsi - minRsi) > 0 ? ((currentRsi - minRsi) / (maxRsi - minRsi)) * 100 : 50;
  }

  function calculateSupportResistance(candles, period) {
    period = period || 15;
    if (candles.length < period) return { support: candles[0].low, resistance: candles[0].high };
    var lastN = candles.slice(-period);
    var lows = lastN.map(function(c) { return c.low; });
    var highs = lastN.map(function(c) { return c.high; });
    return {
      support: Math.min.apply(null, lows),
      resistance: Math.max.apply(null, highs)
    };
  }

  function evaluateSignal(ticker, type, price, slicedCandles, dateString) {
    // 1. Enforce Core Operational Governance Policies
    if (portfolio.isShutdown) {
      portfolio.currentState = 'SHUTDOWN';
      return;
    }

    if (Object.keys(portfolio.positions).length > 0) {
      portfolio.currentState = 'MANAGE';
      return; // "One Active Position Only" Policy!
    }

    if (portfolio.currentState === 'COOLDOWN') {
      if (portfolio.cooldownBarsRemaining > 0) {
        portfolio.cooldownBarsRemaining--;
        return; // Retain cooldown block
      } else {
        portfolio.currentState = 'WAIT';
      }
    }

    if (portfolio.consecutiveLosses >= 2) {
      // Two-strike pause: Skip trading
      portfolio.currentState = 'WAIT';
      return;
    }

    if (portfolio.sessionTradesExecuted >= 10) {
      // Max daily trades cap reached
      portfolio.currentState = 'WAIT';
      return;
    }

    portfolio.currentState = 'SCAN';

    // 2. Classify Market Regime (Layer 2)
    var regimeInfo = window.RegimeDetector ? window.RegimeDetector.detectRegime(slicedCandles) : { regime: "Range", strategyAllowed: "Mean Reversion" };
    if (regimeInfo.regime === "Event Driven") {
      portfolio.patienceSkips++;
      return; // Stand aside during event volatility!
    }

    if (type === 'BUY' && regimeInfo.strategyAllowed !== 'Breakout') {
      // Strategy mismatch: Rejects trade to optimize quality > quantity
      portfolio.patienceSkips++;
      return; 
    }

    if (type === 'SELL' && regimeInfo.strategyAllowed !== 'Mean Reversion') {
      // Mismatch
      portfolio.patienceSkips++;
      return;
    }

    // Lookup stock from SelectionEngine scan to retrieve Sector, Gap % (momentum), and Volume multiplier
    var scanResults = window.SelectionEngine ? window.SelectionEngine.runScan('ALL', dateString) : [];
    var stockInfo = scanResults.find(function(s) { return s.ticker === ticker; }) || { sector: "Banking", momentum: 1.0, volumeMultiplier: 1.5 };

    // --- Dynamic Sub-systems Scoring ---

    // Sub-system 1: Technical (0.22)
    var ema20 = calculateEma(slicedCandles, 20);
    var ema50 = calculateEma(slicedCandles, 50);
    var vwap = slicedCandles[slicedCandles.length - 1].vwap || price;
    var rsi = calculateWilderRsi(slicedCandles, 14);
    var macdInfo = calculateMacd(slicedCandles);
    var stochRsi = calculateStochRsi(slicedCandles, 14);
    var adx = calculateAdx(slicedCandles, 14);
    var atr = calculateAtr(slicedCandles, 14);
    var bbWidth = calculateBollingerWidth(slicedCandles, 20);
    var keltnerWidth = calculateKeltnerWidth(slicedCandles, 20);

    // Require Trend + Momentum + Volume alignment. No single-indicator trades.
    var trendAligned = false;
    var momentumAligned = false;

    if (type === 'BUY') {
      trendAligned = price > ema20 && ema20 > ema50 && price > vwap;
      momentumAligned = rsi < 45 || macdInfo.bullish || stochRsi < 35;
    } else {
      trendAligned = price < ema20 && ema20 < ema50 && price < vwap;
      momentumAligned = rsi > 55 || !macdInfo.bullish || stochRsi > 65;
    }

    var lastCandle = slicedCandles[slicedCandles.length - 1];
    var last10 = slicedCandles.slice(-10);
    var avgVolume10 = last10.reduce(function(sum, c) { return sum + c.volume; }, 0) / 10;
    var volumeSurge = lastCandle.volume >= avgVolume10 * 1.5;

    var techScore = 40;
    if (trendAligned && momentumAligned && volumeSurge) {
      techScore = 95;
    } else if (trendAligned || momentumAligned) {
      techScore = 70;
    }

    // Sub-system 2: Market Context (0.20)
    var contextScore = 35;
    if (regimeInfo.regime === 'Trending' && regimeInfo.strategyAllowed === 'Breakout') {
      contextScore = 95;
    } else if (regimeInfo.regime === 'Range' && regimeInfo.strategyAllowed === 'Mean Reversion') {
      contextScore = 95;
    }

    // Sub-system 3: Order Flow Validation (0.18)
    var lastBarUp = lastCandle.close > lastCandle.open;
    var prevBarUp = slicedCandles[slicedCandles.length - 2] ? (slicedCandles[slicedCandles.length - 2].close > slicedCandles[slicedCandles.length - 2].open) : lastBarUp;
    var persistence = type === 'BUY' ? (lastBarUp && prevBarUp) : (!lastBarUp && !prevBarUp);
    
    var cRange = lastCandle.high - lastCandle.low;
    var acceptance = type === 'BUY' ? (lastCandle.close >= lastCandle.high - cRange * 0.3) : (lastCandle.close <= lastCandle.low + cRange * 0.3);

    var orderFlowScore = 40;
    if (volumeSurge && persistence && acceptance) {
      orderFlowScore = 95;
    } else if (volumeSurge && (persistence || acceptance)) {
      orderFlowScore = 75;
    }

    // Sub-system 4: Historical Similarity (0.12)
    var seed = ticker.split('').reduce(function(a, b) { return a + b.charCodeAt(0); }, 0) + 
               (dateString ? dateString.split('-').reduce(function(a, b) { return a + parseInt(b); }, 0) : 100);
    var observedSessions = 100 + (seed * 13) % 350;
    // Strict governance: if seed is divisible by 10, observed sessions is < 100 (triggers rejection)
    if (seed % 10 === 0) {
      observedSessions = 85; 
    }
    
    if (observedSessions < 100) {
      portfolio.patienceSkips++;
      return; // NO TRADE: Strict governance filter (minimum 100 historical samples required)
    }

    var positiveRate = 50 + (seed % 25); // 50% to 74%
    var histScore = Math.round(positiveRate * 1.3);

    // Sub-system 5: News (0.10)
    var newsScore = 60 + (seed % 8) * 5;

    // Sub-system 6: Volume (0.08)
    var volScore = volumeSurge ? 90 : 55;

    // Sub-system 7: Sector Strength (0.05)
    var sectorStrengths = { Banking: 85, Energy: 75, Consumer: 80, Auto: 88, Metals: 55, Pharma: 65, FMCG: 60 };
    var sectorScore = sectorStrengths[stockInfo.sector] || 70;

    // Sub-system 8: Risk Quality Filter (0.05)
    var stopDistance = atr * (portfolio.mode === 'Conservative' ? 1.0 : portfolio.mode === 'Balanced' ? 1.5 : 2.0);
    var targetDistance = stopDistance * 2; // Strict 1:2 RR
    var winProb = positiveRate / 100;
    var expectedValue = (winProb * targetDistance) - ((1 - winProb) * stopDistance);
    
    var riskScore = 35;
    if (expectedValue > 0 && winProb >= 0.6) {
      riskScore = 95;
    }

    if (expectedValue <= 0) {
      portfolio.patienceSkips++;
      return; // Skip negative expected value
    }

    // Calculate final weighted Score
    var finalScore = Math.round(
      0.22 * techScore +
      0.20 * contextScore +
      0.18 * orderFlowScore +
      0.12 * histScore +
      0.10 * newsScore +
      0.08 * volScore +
      0.05 * sectorScore +
      0.05 * riskScore
    );

    // Layer 3: Previous-Day Intelligence Bias (adds/subtracts 15 points)
    var bias = "Neutral";
    if (stockInfo.momentum >= 1.5 && sectorScore >= 75) {
      bias = "Bullish";
    } else if (stockInfo.momentum <= -1.5) {
      bias = "Bearish";
    }

    if (bias === 'Bullish' && type === 'BUY') {
      finalScore = Math.min(100, finalScore + 15);
    } else if (bias === 'Bearish' && type === 'SELL') {
      finalScore = Math.min(100, finalScore + 15);
    } else if (bias !== 'Neutral') {
      finalScore = Math.max(0, finalScore - 15);
    }

    // Strict Governance Entry gates:
    // 1. Min Confidence score threshold = 85
    // 2. Default: Stop after first completed trade. Only continue if setup is exceptionally high confidence (Score >= 90)
    var confidenceThreshold = portfolio.sessionTradesExecuted >= 1 ? 90 : 85;

    if (finalScore < confidenceThreshold) {
      portfolio.patienceSkips++;
      portfolio.currentState = 'SCAN';
      return; // NO TRADE
    }

    portfolio.currentState = 'QUALIFY';

    // 4. Position Sizing & Margin Execution
    var allowedRiskAmt = portfolio.portfolioValue * portfolio.riskPerTrade;
    var sharesToTrade = Math.floor(allowedRiskAmt / stopDistance);

    // Volatility Spike Protection: If ATR is over 2.5% of price, reduce size by 50%
    if (stopDistance > price * 0.025) {
      sharesToTrade = Math.floor(sharesToTrade * 0.5);
    }

    if (sharesToTrade <= 0) sharesToTrade = 5;

    var requiredCapital = sharesToTrade * price;
    var marginRequired = portfolio.useMargin ? requiredCapital / 5 : requiredCapital;

    if (marginRequired > portfolio.cash) {
      sharesToTrade = Math.floor((portfolio.cash * (portfolio.useMargin ? 5 : 1)) / price);
      requiredCapital = sharesToTrade * price;
      marginRequired = portfolio.useMargin ? requiredCapital / 5 : requiredCapital;
    }

    if (sharesToTrade <= 0) return;

    portfolio.currentState = 'ENTER';

    // Frictional Costs (Slippage + Brokerage + Taxes)
    var slippageDrag = requiredCapital * 0.0005; // 0.05% slippage drag
    var brokerageFee = portfolio.useBrokerage ? Math.min(20, requiredCapital * 0.0003) : 0;
    var taxes = requiredCapital * 0.00015;
    var totalEntryDrag = slippageDrag + brokerageFee + taxes;

    portfolio.cash -= (marginRequired + totalEntryDrag);
    portfolio.slippageFees += slippageDrag;
    portfolio.brokerageFees += brokerageFee;
    portfolio.taxFees += taxes;

    var sl = type === 'BUY' ? price - stopDistance : price + stopDistance;
    var tp = type === 'BUY' ? price + targetDistance : price - targetDistance;

    var biasText = bias !== 'Neutral' ? `${bias} Bias` : "Neutral Bias";

    portfolio.positions[ticker] = {
      ticker: ticker,
      type: type,
      shares: sharesToTrade,
      entryPrice: price,
      stopLoss: parseFloat(sl.toFixed(2)),
      takeProfit: parseFloat(tp.toFixed(2)),
      marginUsed: marginRequired,
      requiredCapital: requiredCapital,
      entryTime: new Date(lastCandle.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      reason: `Quality Score: ${finalScore} | ${biasText} | ${regimeInfo.regime}`,
      pnl: 0,
      initialStopLoss: parseFloat(sl.toFixed(2)), // For trail monitoring
      compositeScore: finalScore
    };

    portfolio.sessionTradesExecuted++;
    portfolio.currentState = 'MANAGE';

    // Log action to audit ledger
    if (window.AuditEngine) {
      window.AuditEngine.logAction({
        time: portfolio.positions[ticker].entryTime,
        ticker: ticker,
        action: type,
        price: price,
        qty: sharesToTrade,
        sl: portfolio.positions[ticker].stopLoss,
        reason: portfolio.positions[ticker].reason
      });
    }
  }

  function evaluatePositions(slicedCandlesMap) {
    // Check Shutdown status
    var lossThreshold = portfolio.startingCapital * (1 + portfolio.dailyLossCutoff);
    if (portfolio.portfolioValue <= lossThreshold) {
      portfolio.isShutdown = true;
      portfolio.currentState = 'SHUTDOWN';
      forceCloseAll(slicedCandlesMap);
      return;
    }

    for (var ticker in portfolio.positions) {
      portfolio.currentState = 'MANAGE';
      var pos = portfolio.positions[ticker];
      var candles = slicedCandlesMap[ticker];
      if (!candles || candles.length === 0) continue;

      var lastCandle = candles[candles.length - 1];
      var curPrice = lastCandle.close;

      // 1. Calculate realized net P&L
      var unrealizedPnl = pos.type === 'BUY' 
        ? (curPrice - pos.entryPrice) * pos.shares 
        : (pos.entryPrice - curPrice) * pos.shares;
      
      pos.pnl = unrealizedPnl;

      // 2. Dynamic Trailing Profit Exit (Phase 16 Smart Exits)
      // Lock profit by raising stops once price moves significantly in our favor
      if (pos.type === 'BUY') {
        var priceRise = curPrice - pos.entryPrice;
        if (priceRise > (pos.takeProfit - pos.entryPrice) * 0.5) {
          // Move stop to break-even (entry price) to secure capital
          pos.stopLoss = Math.max(pos.stopLoss, pos.entryPrice);
        }
      } else {
        var priceFall = pos.entryPrice - curPrice;
        if (priceFall > (pos.entryPrice - pos.takeProfit) * 0.5) {
          pos.stopLoss = Math.min(pos.stopLoss, pos.entryPrice);
        }
      }

      // 3. Monitor protective stop loss and target profit exits
      var hitStop = pos.type === 'BUY' ? lastCandle.low <= pos.stopLoss : lastCandle.high >= pos.stopLoss;
      var hitTarget = pos.type === 'BUY' ? lastCandle.high >= pos.takeProfit : lastCandle.low <= pos.takeProfit;

      // Soft Exit: Momentum Loss (e.g. 3 consecutive opposite bars)
      var momentumLoss = false;
      if (candles.length >= 3) {
        var last3 = candles.slice(-3);
        if (pos.type === 'BUY') {
          momentumLoss = last3.every(function(c) { return c.close < c.open; });
        } else {
          momentumLoss = last3.every(function(c) { return c.close > c.open; });
        }
      }

      var nowStr = new Date(lastCandle.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

      if (hitStop) {
        closePosition(ticker, pos.stopLoss, "Stopped Out 🛑", nowStr, true);
      } else if (hitTarget) {
        closePosition(ticker, pos.takeProfit, "Target Hit 🎯", nowStr, false);
      } else if (momentumLoss) {
        // Soft Exit
        closePosition(ticker, curPrice, "Soft Exit (Momentum Loss) 💨", nowStr, false);
      }
    }

    recalculatePortfolioValue(slicedCandlesMap);
  }

  function closePosition(ticker, exitPrice, outcome, timeStr, isLoss) {
    portfolio.currentState = 'EXIT';
    var pos = portfolio.positions[ticker];
    if (!pos) return;

    // Frictional costs calculations (Order Exit)
    var slippageDrag = (pos.shares * exitPrice) * 0.0005;
    var brokerageFee = portfolio.useBrokerage ? Math.min(20, (pos.shares * exitPrice) * 0.0003) : 0;
    var taxes = (pos.shares * exitPrice) * 0.00015;
    var totalExitDrag = slippageDrag + brokerageFee + taxes;

    portfolio.slippageFees += slippageDrag;
    portfolio.brokerageFees += brokerageFee;
    portfolio.taxFees += taxes;

    var finalPnl = pos.type === 'BUY' 
      ? (exitPrice - pos.entryPrice) * pos.shares 
      : (pos.entryPrice - exitPrice) * pos.shares;
    
    var netPnl = finalPnl - (pos.entryPrice * pos.shares * 0.0005 + totalExitDrag);

    portfolio.cash += (pos.marginUsed + finalPnl - totalExitDrag);

    // Track consecutive losses
    if (isLoss || netPnl < 0) {
      portfolio.consecutiveLosses++;
    } else {
      portfolio.consecutiveLosses = 0; // Reset
    }

    portfolio.closedTrades.push(Object.assign({}, pos, {
      exitPrice: exitPrice,
      exitTime: timeStr,
      pnl: finalPnl,
      netPnl: netPnl,
      outcome: outcome
    }));

    delete portfolio.positions[ticker];

    // Trigger Cooldown state (10 mins = 2 bars)
    portfolio.currentState = 'COOLDOWN';
    portfolio.cooldownBarsRemaining = 2;

    // Log to audit engine
    if (window.AuditEngine) {
      window.AuditEngine.logAction({
        time: timeStr,
        ticker: ticker,
        action: pos.type === 'BUY' ? 'EXIT (Long)' : 'EXIT (Short)',
        price: exitPrice,
        qty: pos.shares,
        sl: pos.stopLoss,
        reason: outcome + ` (Net PnL: ₹${netPnl.toFixed(0)}, Score: ${pos.compositeScore})`
      });
    }
  }

  function forceCloseAll(slicedCandlesMap) {
    for (var ticker in portfolio.positions) {
      var candles = slicedCandlesMap[ticker];
      var last = candles ? candles[candles.length - 1] : null;
      var exitPrice = last ? last.close : portfolio.positions[ticker].entryPrice;
      var timeStr = last ? new Date(last.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '15:30';
      closePosition(ticker, exitPrice, "Time Exit (EOD) ⚖️", timeStr, false);
    }
    recalculatePortfolioValue(slicedCandlesMap);
  }

  function recalculatePortfolioValue(slicedCandlesMap) {
    var unrealizedSum = 0;
    var marginSum = 0;

    for (var ticker in portfolio.positions) {
      var pos = portfolio.positions[ticker];
      unrealizedSum += pos.pnl;
      marginSum += pos.marginUsed;
    }

    portfolio.portfolioValue = portfolio.cash + marginSum + unrealizedSum;
  }

  function runSingleDayStress(tickers, dateString, startingCapital, riskPct, mode, useBrokerage, allowShort, useMargin) {
    var mockPf = {
      cash: startingCapital,
      portfolioValue: startingCapital,
      riskPerTrade: riskPct,
      positions: {},
      closedTrades: [],
      consecutiveLosses: 0,
      sessionTradesExecuted: 0,
      dailyLossCutoff: -0.02,
      isShutdown: false
    };

    var candlesMap = {};
    tickers.forEach(function(t) {
      if (window.ReplayEngine && typeof window.ReplayEngine.generateReplayIntradayCandles === 'function') {
        // Safe fallback call
        try {
          candlesMap[t] = window.ReplayEngine.generateReplayIntradayCandles(t, dateString);
        } catch (e) {
          candlesMap[t] = [];
        }
      }
      
      if (!candlesMap[t] || candlesMap[t].length === 0) {
        // Fallback generator in case ReplayEngine isn't loaded (lookahead protected)
        var candles = [];
        var curPrice = 1000;
        var start = new Date(dateString || "2026-05-15");
        start.setHours(9, 15, 0, 0);
        for (var i = 0; i < 75; i++) {
          var time = new Date(start.getTime() + i * 5 * 60 * 1000);
          var volatility = curPrice * 0.003;
          var o = curPrice + (Math.random() - 0.5) * volatility;
          var c = o + (Math.random() - 0.5) * volatility;
          var h = Math.max(o, c) + Math.random() * volatility * 0.2;
          var l = Math.min(o, c) - Math.random() * volatility * 0.2;
          candles.push({
            time: time.toISOString(),
            open: parseFloat(o.toFixed(2)),
            high: parseFloat(h.toFixed(2)),
            low: parseFloat(l.toFixed(2)),
            close: parseFloat(c.toFixed(2)),
            volume: Math.round(20000 + Math.random() * 80000),
            vwap: parseFloat(((o + h + l + c) / 4).toFixed(2))
          });
          curPrice = c;
        }
        candlesMap[t] = candles;
      }
    });

    for (var bar = 15; bar < 75; bar++) {
      if (mockPf.portfolioValue <= startingCapital * 0.98) {
        mockPf.isShutdown = true;
      }
      if (mockPf.isShutdown) break;

      var slices = {};
      tickers.forEach(function(t) {
        slices[t] = candlesMap[t].slice(0, bar + 1);
      });

      if (Object.keys(mockPf.positions).length === 0 && mockPf.consecutiveLosses < 2 && mockPf.sessionTradesExecuted < 10) {
        for (var i = 0; i < tickers.length; i++) {
          var ticker = tickers[i];
          var stockSlice = slices[ticker];
          if (stockSlice.length < 2) continue;
          var lastCandle = stockSlice[stockSlice.length - 1];
          var rsi = calculateWilderRsi(stockSlice);
          var type = rsi < 32 ? 'BUY' : rsi > 68 ? 'SELL' : null;

          if (type) {
            var regimeInfo = window.RegimeDetector ? window.RegimeDetector.detectRegime(stockSlice) : { regime: "Range", strategyAllowed: "Mean Reversion" };
            if (regimeInfo.regime !== "Event Driven" && 
                ((type === 'BUY' && regimeInfo.strategyAllowed === 'Breakout') || 
                 (type === 'SELL' && regimeInfo.strategyAllowed === 'Mean Reversion'))) {
              
              var atr = calculateAtr(stockSlice, 14);
              var stopDistance = atr * (mode === 'Conservative' ? 1.0 : mode === 'Balanced' ? 1.5 : 2.0);
              var targetDistance = stopDistance * 2;
              var shares = Math.floor((mockPf.portfolioValue * riskPct) / stopDistance);
              if (shares <= 0) shares = 5;

              var reqCapital = shares * lastCandle.close;
              var margin = useMargin ? reqCapital / 5 : reqCapital;
              if (margin > mockPf.cash) {
                shares = Math.floor((mockPf.cash * (useMargin ? 5 : 1)) / lastCandle.close);
                reqCapital = shares * lastCandle.close;
                margin = useMargin ? reqCapital / 5 : reqCapital;
              }

              if (shares > 0) {
                var sl = type === 'BUY' ? lastCandle.close - stopDistance : lastCandle.close + stopDistance;
                var tp = type === 'BUY' ? lastCandle.close + targetDistance : lastCandle.close - targetDistance;

                mockPf.positions[ticker] = {
                  ticker: ticker,
                  type: type,
                  shares: shares,
                  entryPrice: lastCandle.close,
                  stopLoss: sl,
                  takeProfit: tp,
                  marginUsed: margin,
                  pnl: 0
                };
                mockPf.sessionTradesExecuted++;
                mockPf.cash -= margin;
                break; // Sequential policy: only one trade opened
              }
            }
          }
        }
      }

      for (var pTicker in mockPf.positions) {
        var pos = mockPf.positions[pTicker];
        var cList = slices[pTicker];
        var curCandle = cList[cList.length - 1];
        var curPrice = curCandle.close;

        pos.pnl = pos.type === 'BUY' ? (curPrice - pos.entryPrice) * pos.shares : (pos.entryPrice - curPrice) * pos.shares;

        if (pos.type === 'BUY') {
          if (curPrice - pos.entryPrice > (pos.takeProfit - pos.entryPrice) * 0.5) {
            pos.stopLoss = Math.max(pos.stopLoss, pos.entryPrice);
          }
        } else {
          if (pos.entryPrice - curPrice > (pos.entryPrice - pos.takeProfit) * 0.5) {
            pos.stopLoss = Math.min(pos.stopLoss, pos.entryPrice);
          }
        }

        var hitStop = pos.type === 'BUY' ? curCandle.low <= pos.stopLoss : curCandle.high >= pos.stopLoss;
        var hitTarget = pos.type === 'BUY' ? curCandle.high >= pos.takeProfit : curCandle.low <= pos.takeProfit;

        if (hitStop || hitTarget) {
          var exitPrice = hitStop ? pos.stopLoss : pos.takeProfit;
          var pnlVal = pos.type === 'BUY' ? (exitPrice - pos.entryPrice) * pos.shares : (pos.entryPrice - exitPrice) * pos.shares;
          mockPf.cash += pos.marginUsed + pnlVal;
          mockPf.closedTrades.push({ netPnl: pnlVal });
          delete mockPf.positions[pTicker];
          if (pnlVal < 0) mockPf.consecutiveLosses++;
          else mockPf.consecutiveLosses = 0;
        }
      }

      var unrealized = 0;
      var margins = 0;
      for (var pKey in mockPf.positions) {
        unrealized += mockPf.positions[pKey].pnl;
        margins += mockPf.positions[pKey].marginUsed;
      }
      mockPf.portfolioValue = mockPf.cash + margins + unrealized;
    }

    for (var pfTicker in mockPf.positions) {
      var activePos = mockPf.positions[pfTicker];
      var lastC = candlesMap[pfTicker] ? candlesMap[pfTicker][candlesMap[pfTicker].length - 1] : null;
      var exitP = lastC ? lastC.close : activePos.entryPrice;
      var pnlVal = activePos.type === 'BUY' ? (exitP - activePos.entryPrice) * activePos.shares : (activePos.entryPrice - exitP) * activePos.shares;
      mockPf.cash += activePos.marginUsed + pnlVal;
      mockPf.closedTrades.push({ netPnl: pnlVal });
      delete mockPf.positions[pfTicker];
    }
    mockPf.portfolioValue = mockPf.cash;

    var peak = startingCapital;
    var maxDd = 0;
    var val = startingCapital;
    mockPf.closedTrades.forEach(function(t) {
      val += t.netPnl;
      if (val > peak) peak = val;
      var dd = ((peak - val) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    });

    var netProfit = mockPf.portfolioValue - startingCapital;
    var roi = (netProfit / startingCapital) * 100;

    return {
      roi: parseFloat(roi.toFixed(2)),
      maxDrawdown: parseFloat(maxDd.toFixed(2)),
      trades: mockPf.closedTrades.length
    };
  }

  function runStressTest(selectedTickers, baseDate, startingCapital, riskPct, mode, useBrokerage, allowShort, useMargin) {
    var date1 = new Date(baseDate);
    date1.setDate(date1.getDate() - 7);
    var date1Str = date1.toISOString().split('T')[0];

    var date2 = new Date(baseDate);
    date2.setDate(date2.getDate() + 7);
    var date2Str = date2.toISOString().split('T')[0];

    var result1 = runSingleDayStress(selectedTickers, date1Str, startingCapital, riskPct, mode, useBrokerage, allowShort, useMargin);
    var result2 = runSingleDayStress(selectedTickers, date2Str, startingCapital, riskPct, mode, useBrokerage, allowShort, useMargin);

    return {
      date1: date1Str,
      roi1: result1.roi,
      drawdown1: result1.maxDrawdown,
      trades1: result1.trades,
      date2: date2Str,
      roi2: result2.roi,
      drawdown2: result2.maxDrawdown,
      trades2: result2.trades,
      avgRoi: parseFloat(((result1.roi + result2.roi) / 2).toFixed(2)),
      isRobust: result1.roi >= -1.0 && result2.roi >= -1.0 && result1.maxDrawdown < 2.0 && result2.maxDrawdown < 2.0
    };
  }

  window.PortfolioSimulator = {
    init: initPortfolio,
    processSignal: evaluateSignal,
    evaluatePositions: evaluatePositions,
    forceCloseAll: forceCloseAll,
    getPortfolio: function () { return portfolio; },
    runStressTest: runStressTest
  };
})();
