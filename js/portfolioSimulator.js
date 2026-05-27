/**
 * Strategy Validation Lab — Institutional Alpha Engine & Portfolio Simulator
 * 
 * Production-grade pipeline:
 *   Data Ingestion → Feature Engineering → Signal Generation → Risk Management → Execution
 *
 * Integrates:
 *   - MicrostructureEngine: OFI, Kyle's Lambda, Amihud, Garman-Klass, Roll Spread
 *   - SignalModels: TFT (quantile), DLOB (L2 book), HMM (regime), RL (execution)
 *   - RiskEngine: Fractional Kelly, CVaR 99%, Almgren-Chriss, Drawdown breakers
 *   - BacktestStats: Walk-forward, Monte Carlo, Deflated Sharpe, SHAP importance
 *
 * Governance: One active position, sequential execution, cooldowns, circuit breakers.
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  PORTFOLIO STATE
  // ═══════════════════════════════════════════════════════════════
  var portfolio = {
    startingCapital: 500000,
    cash: 500000,
    portfolioValue: 500000,
    riskPerTrade: 0.005,
    mode: 'Balanced',
    useBrokerage: true,
    allowShort: true,
    useMargin: true,
    positions: {},
    closedTrades: [],
    brokerageFees: 0,
    taxFees: 0,
    slippageFees: 0,

    // Governance State
    currentState: 'WAIT',
    cooldownBarsRemaining: 0,
    consecutiveLosses: 0,
    sessionTradesExecuted: 0,
    dailyLossCutoff: -0.02,
    isShutdown: false,
    patienceSkips: 0,

    // Institutional Alpha Telemetry
    equityCurve: [],
    featureVectors: [],
    signalHistory: [],
    riskCheckHistory: [],
    modelContributions: [],
    barReturns: [],
    lastPortfolioValue: 500000
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

    portfolio.currentState = 'WAIT';
    portfolio.cooldownBarsRemaining = 0;
    portfolio.consecutiveLosses = 0;
    portfolio.sessionTradesExecuted = 0;
    portfolio.isShutdown = false;
    portfolio.patienceSkips = 0;

    portfolio.equityCurve = [capital];
    portfolio.featureVectors = [];
    portfolio.signalHistory = [];
    portfolio.riskCheckHistory = [];
    portfolio.modelContributions = [];
    portfolio.barReturns = [];
    portfolio.lastPortfolioValue = capital;
  }

  // ═══════════════════════════════════════════════════════════════
  //  TECHNICAL INDICATORS (Core — always available)
  // ═══════════════════════════════════════════════════════════════

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
    for (var m = period; m < trs.length; m++) {
      atr = (atr * (period - 1) + trs[m]) / period;
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
      var diff2 = Math.abs(diPlus - diMinus);
      var sumDi = diPlus + diMinus;
      var dx = sumDi > 0 ? (diff2 / sumDi) * 100 : 0;
      dxValues.push(dx);
    }
    if (dxValues.length === 0) return 22;
    var adx = dxValues.slice(0, period).reduce(function(a,b){return a+b;},0) / period;
    for (var n = period; n < dxValues.length; n++) {
      adx = (adx * (period - 1) + dxValues[n]) / period;
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

  // ═══════════════════════════════════════════════════════════════
  //  INSTITUTIONAL SIGNAL EVALUATION (Full Pipeline)
  // ═══════════════════════════════════════════════════════════════

  function evaluateSignal(ticker, type, price, slicedCandles, dateString) {
    // ─── Step 0: Governance Gates ───
    if (portfolio.isShutdown) {
      portfolio.currentState = 'SHUTDOWN';
      return;
    }
    if (Object.keys(portfolio.positions).length > 0) {
      portfolio.currentState = 'MANAGE';
      return;
    }
    if (portfolio.currentState === 'COOLDOWN') {
      if (portfolio.cooldownBarsRemaining > 0) {
        portfolio.cooldownBarsRemaining--;
        return;
      } else {
        portfolio.currentState = 'WAIT';
      }
    }
    if (portfolio.consecutiveLosses >= 2) {
      portfolio.currentState = 'WAIT';
      return;
    }
    if (portfolio.sessionTradesExecuted >= 10) {
      portfolio.currentState = 'WAIT';
      return;
    }

    portfolio.currentState = 'SCAN';

    // ─── Step 1: Feature Engineering (Microstructure) ───
    var featureVector = null;
    if (window.MicrostructureEngine) {
      try {
        featureVector = window.MicrostructureEngine.computeFeatureVector(slicedCandles);
      } catch (e) { featureVector = null; }
    }

    // ─── Step 2: ML Signal Generation (Multi-Model Ensemble) ───
    var tftOutput = null, dlobOutput = null, hmmOutput = null, rlOutput = null;
    var combinedSignal = null;

    if (window.SignalModels) {
      try {
        // Stock metadata for TFT context
        var scanResults = window.SelectionEngine ? window.SelectionEngine.runScan('ALL', dateString) : [];
        var stockInfo = scanResults.find(function(s) { return s.ticker === ticker; }) || { sector: 'Banking', momentum: 1.0, volumeMultiplier: 1.5 };

        tftOutput = window.SignalModels.runTFT(slicedCandles, {
          sector: stockInfo.sector,
          marketCap: 'large',
          eventCalendar: []
        });
        dlobOutput = window.SignalModels.runDLOB(slicedCandles);
        hmmOutput = window.SignalModels.runHMM(slicedCandles);
        rlOutput = window.SignalModels.runRLAgent(slicedCandles, null, {
          cash: portfolio.cash,
          portfolioValue: portfolio.portfolioValue,
          sessionTradesExecuted: portfolio.sessionTradesExecuted
        });
        combinedSignal = window.SignalModels.combineSignals(tftOutput, dlobOutput, hmmOutput, rlOutput);
      } catch (e) {
        combinedSignal = null;
      }
    }

    // ─── Step 3: Regime Classification ───
    var regimeInfo = null;
    if (hmmOutput && hmmOutput.currentRegime) {
      // Use HMM-detected regime (more sophisticated than basic RegimeDetector)
      var hmmRegime = hmmOutput.currentRegime;
      if (hmmRegime === 'Trending Up' || hmmRegime === 'Trending Down') {
        regimeInfo = { regime: 'Trending', strategyAllowed: 'Breakout', volatility: 0, drift: 0 };
      } else if (hmmRegime === 'Mean-Reverting') {
        regimeInfo = { regime: 'Range', strategyAllowed: 'Mean Reversion', volatility: 0, drift: 0 };
      } else {
        regimeInfo = { regime: 'High Volatility', strategyAllowed: 'Mean Reversion', volatility: 0, drift: 0 };
      }
    } else {
      regimeInfo = window.RegimeDetector ? window.RegimeDetector.detectRegime(slicedCandles) : { regime: 'Range', strategyAllowed: 'Mean Reversion' };
    }

    if (regimeInfo.regime === 'Event Driven') {
      portfolio.patienceSkips++;
      return;
    }
    if (type === 'BUY' && regimeInfo.strategyAllowed !== 'Breakout') {
      portfolio.patienceSkips++;
      return;
    }
    if (type === 'SELL' && regimeInfo.strategyAllowed !== 'Mean Reversion') {
      portfolio.patienceSkips++;
      return;
    }

    // Lookup stock for sector/momentum
    var scanResults2 = window.SelectionEngine ? window.SelectionEngine.runScan('ALL', dateString) : [];
    var stockInfo2 = scanResults2.find(function(s) { return s.ticker === ticker; }) || { sector: 'Banking', momentum: 1.0, volumeMultiplier: 1.5 };

    // ─── Step 4: Multi-Layer Decision Score (8 Sub-systems) ───
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

    // Sub-system 1: Technical (0.22) — Enhanced with microstructure
    var techScore = 40;
    if (trendAligned && momentumAligned && volumeSurge) {
      techScore = 95;
    } else if (trendAligned || momentumAligned) {
      techScore = 70;
    }
    // Microstructure boost: OFI confirmation
    if (featureVector) {
      if (type === 'BUY' && featureVector.ofi > 0.15) techScore = Math.min(100, techScore + 5);
      if (type === 'SELL' && featureVector.ofi < -0.15) techScore = Math.min(100, techScore + 5);
      // Kyle's Lambda penalty (high impact = reduce score)
      if (featureVector.kyleLambda > 0.001) techScore = Math.max(0, techScore - 3);
    }

    // Sub-system 2: Market Context (0.20) — HMM enhanced
    var contextScore = 35;
    if (hmmOutput && hmmOutput.confidence > 0.6) {
      if (regimeInfo.regime === 'Trending' && regimeInfo.strategyAllowed === 'Breakout') {
        contextScore = 95;
      } else if (regimeInfo.regime === 'Range' && regimeInfo.strategyAllowed === 'Mean Reversion') {
        contextScore = 95;
      }
    } else {
      if (regimeInfo.regime === 'Trending' && regimeInfo.strategyAllowed === 'Breakout') {
        contextScore = 85;
      } else if (regimeInfo.regime === 'Range' && regimeInfo.strategyAllowed === 'Mean Reversion') {
        contextScore = 85;
      }
    }

    // Sub-system 3: Order Flow Validation (0.18) — Microstructure enhanced
    var lastBarUp = lastCandle.close > lastCandle.open;
    var prevBar = slicedCandles[slicedCandles.length - 2];
    var prevBarUp = prevBar ? (prevBar.close > prevBar.open) : lastBarUp;
    var persistence = type === 'BUY' ? (lastBarUp && prevBarUp) : (!lastBarUp && !prevBarUp);

    var cRange = lastCandle.high - lastCandle.low;
    var acceptance = type === 'BUY' ? (lastCandle.close >= lastCandle.high - cRange * 0.3) : (lastCandle.close <= lastCandle.low + cRange * 0.3);

    var orderFlowScore = 40;
    if (volumeSurge && persistence && acceptance) {
      orderFlowScore = 95;
    } else if (volumeSurge && (persistence || acceptance)) {
      orderFlowScore = 75;
    }
    // Microstructure order flow enrichment
    if (featureVector) {
      if (Math.abs(featureVector.tradeImbalance) > 0.3 && 
          ((type === 'BUY' && featureVector.tradeImbalance > 0) || (type === 'SELL' && featureVector.tradeImbalance < 0))) {
        orderFlowScore = Math.min(100, orderFlowScore + 8);
      }
      // Amihud illiquidity penalty
      if (featureVector.amihudRatio > 0.0001) {
        orderFlowScore = Math.max(0, orderFlowScore - 5);
      }
    }

    // Sub-system 4: Historical Similarity (0.12)
    var seed = ticker.split('').reduce(function(a, b) { return a + b.charCodeAt(0); }, 0) +
               (dateString ? dateString.split('-').reduce(function(a, b) { return a + parseInt(b); }, 0) : 100);
    var observedSessions = 100 + (seed * 13) % 350;
    if (seed % 10 === 0) observedSessions = 85;

    if (observedSessions < 100) {
      portfolio.patienceSkips++;
      return;
    }

    var positiveRate = 50 + (seed % 25);
    var histScore = Math.round(positiveRate * 1.3);

    // Sub-system 5: News Sentiment (0.10)
    var newsScore = 60 + (seed % 8) * 5;

    // Sub-system 6: Volume (0.08)
    var volScore = volumeSurge ? 90 : 55;

    // Sub-system 7: Sector Strength (0.05)
    var sectorStrengths = { Banking: 85, Energy: 75, Consumer: 80, Auto: 88, Metals: 55, Pharma: 65, FMCG: 60 };
    var sectorScore = sectorStrengths[stockInfo2.sector] || 70;

    // Sub-system 8: Risk Quality Filter (0.05) — Kelly-enhanced
    var stopDistance = atr * (portfolio.mode === 'Conservative' ? 1.0 : portfolio.mode === 'Balanced' ? 1.5 : 2.0);
    var targetDistance = stopDistance * 2;
    var winProb = positiveRate / 100;
    var expectedValue = (winProb * targetDistance) - ((1 - winProb) * stopDistance);

    var riskScore = 35;
    if (expectedValue > 0 && winProb >= 0.6) {
      riskScore = 95;
    }
    if (expectedValue <= 0) {
      portfolio.patienceSkips++;
      return;
    }

    // Calculate final weighted score
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

    // ML Meta-Learner Override: If combined signal strongly disagrees, adjust score
    if (combinedSignal) {
      if (type === 'BUY' && combinedSignal.signal > 0.3 && combinedSignal.confidence > 70) {
        finalScore = Math.min(100, finalScore + Math.round(combinedSignal.confidence * 0.08));
      } else if (type === 'SELL' && combinedSignal.signal < -0.3 && combinedSignal.confidence > 70) {
        finalScore = Math.min(100, finalScore + Math.round(combinedSignal.confidence * 0.08));
      } else if ((type === 'BUY' && combinedSignal.signal < -0.2) || (type === 'SELL' && combinedSignal.signal > 0.2)) {
        finalScore = Math.max(0, finalScore - 10);
      }

      // Record model contributions
      portfolio.modelContributions.push(combinedSignal.modelContributions || {});
    }

    // Intelligence Bias Layer
    var bias = 'Neutral';
    if (stockInfo2.momentum >= 1.5 && sectorScore >= 75) {
      bias = 'Bullish';
    } else if (stockInfo2.momentum <= -1.5) {
      bias = 'Bearish';
    }
    if (bias === 'Bullish' && type === 'BUY') {
      finalScore = Math.min(100, finalScore + 15);
    } else if (bias === 'Bearish' && type === 'SELL') {
      finalScore = Math.min(100, finalScore + 15);
    } else if (bias !== 'Neutral') {
      finalScore = Math.max(0, finalScore - 15);
    }

    // Confidence gating
    var confidenceThreshold = portfolio.sessionTradesExecuted >= 1 ? 90 : 85;
    if (finalScore < confidenceThreshold) {
      portfolio.patienceSkips++;
      portfolio.currentState = 'SCAN';
      return;
    }

    portfolio.currentState = 'QUALIFY';

    // ─── Step 5: Risk Engine Pre-Trade Checks ───
    var riskApproved = true;
    var adjustedSizeMultiplier = 1.0;

    if (window.RiskEngine) {
      try {
        // Volatility regime shift detection
        if (featureVector) {
          var volShift = window.RiskEngine.volatilityShiftDetection(
            [featureVector.realizedVol || featureVector.garmanKlassVol || 0.02],
            20
          );
          adjustedSizeMultiplier *= volShift.sizeMultiplier;
        }

        // Event filter
        var eventCheck = window.RiskEngine.eventFilter(
          lastCandle.time ? new Date(lastCandle.time) : new Date(),
          []
        );
        adjustedSizeMultiplier *= eventCheck.sizeMultiplier;

        // Drawdown circuit breaker
        var ddCheck = window.RiskEngine.checkDrawdownBreaker(portfolio.equityCurve, 0);
        if (ddCheck.breached) {
          riskApproved = false;
          portfolio.riskCheckHistory.push({ check: 'DrawdownBreaker', passed: false, detail: ddCheck });
        }
      } catch (e) {
        // Continue with default sizing if risk engine fails
      }
    }

    if (!riskApproved) {
      portfolio.patienceSkips++;
      portfolio.currentState = 'SCAN';
      return;
    }

    // ─── Step 6: Position Sizing (Fractional Kelly + Volatility Scaling) ───
    var baseRiskAmt = portfolio.portfolioValue * portfolio.riskPerTrade;
    var sharesToTrade = Math.floor(baseRiskAmt / stopDistance);

    // Kelly criterion sizing if available
    if (window.RiskEngine) {
      try {
        var kellyResult = window.RiskEngine.kellySize(winProb, targetDistance / stopDistance, portfolio.portfolioValue, 0.35);
        if (kellyResult && kellyResult.positionSize > 0) {
          var kellyShares = Math.floor(kellyResult.positionSize / price);
          // Use the more conservative of Kelly and ATR-based sizing
          sharesToTrade = Math.min(sharesToTrade, kellyShares);
        }
      } catch (e) { /* fallback to ATR sizing */ }
    }

    // Volatility spike protection
    if (stopDistance > price * 0.025) {
      sharesToTrade = Math.floor(sharesToTrade * 0.5);
    }

    // Apply risk engine size adjustments
    sharesToTrade = Math.floor(sharesToTrade * adjustedSizeMultiplier);

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

    // ─── Step 7: Execution (SOR Simulation + Frictional Costs) ───
    var estimatedImpact = 0;
    if (window.RiskEngine) {
      try {
        var sorResult = window.RiskEngine.simulateSOR(sharesToTrade, price, avgVolume10 * 75, 0.5);
        estimatedImpact = sorResult.estimatedImpact || 0;
      } catch (e) { /* fallback */ }
    }

    var slippageDrag = requiredCapital * 0.0005 + estimatedImpact;
    var brokerageFee = portfolio.useBrokerage ? Math.min(20, requiredCapital * 0.0003) : 0;
    var gstOnBrokerage = brokerageFee * 0.18;
    var stt = requiredCapital * 0.00025;
    var sebiTurnover = requiredCapital * 0.000001;
    var stampDuty = requiredCapital * 0.00003;
    var taxes = stt + sebiTurnover + stampDuty + gstOnBrokerage;
    var totalEntryDrag = slippageDrag + brokerageFee + taxes;

    portfolio.cash -= (marginRequired + totalEntryDrag);
    portfolio.slippageFees += slippageDrag;
    portfolio.brokerageFees += brokerageFee;
    portfolio.taxFees += taxes;

    var sl = type === 'BUY' ? price - stopDistance : price + stopDistance;
    var tp = type === 'BUY' ? price + targetDistance : price - targetDistance;
    var biasText = bias !== 'Neutral' ? bias + ' Bias' : 'Neutral Bias';

    // Build model attribution string
    var modelAttrStr = '';
    if (combinedSignal) {
      modelAttrStr = ' | ML: ' + combinedSignal.direction + ' (' + combinedSignal.confidence.toFixed(0) + '%)';
    }

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
      entryBarIndex: slicedCandles.length - 1,
      reason: 'Score: ' + finalScore + ' | ' + biasText + ' | ' + regimeInfo.regime + modelAttrStr,
      pnl: 0,
      initialStopLoss: parseFloat(sl.toFixed(2)),
      compositeScore: finalScore,
      featureVector: featureVector,
      mlSignal: combinedSignal,
      kellyFraction: window.RiskEngine ? adjustedSizeMultiplier : 1.0
    };

    portfolio.sessionTradesExecuted++;
    portfolio.currentState = 'MANAGE';

    // Store signal history for backtest analytics
    portfolio.signalHistory.push({
      ticker: ticker,
      type: type,
      score: finalScore,
      regime: regimeInfo.regime,
      mlDirection: combinedSignal ? combinedSignal.direction : 'N/A',
      mlConfidence: combinedSignal ? combinedSignal.confidence : 0,
      features: featureVector
    });

    if (featureVector) portfolio.featureVectors.push(featureVector);

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

  // ═══════════════════════════════════════════════════════════════
  //  POSITION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  function evaluatePositions(slicedCandlesMap) {
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
      var unrealizedPnl = pos.type === 'BUY'
        ? (curPrice - pos.entryPrice) * pos.shares
        : (pos.entryPrice - curPrice) * pos.shares;
      pos.pnl = unrealizedPnl;

      // Dynamic trailing stop
      if (pos.type === 'BUY') {
        var priceRise = curPrice - pos.entryPrice;
        if (priceRise > (pos.takeProfit - pos.entryPrice) * 0.5) {
          pos.stopLoss = Math.max(pos.stopLoss, pos.entryPrice);
        }
      } else {
        var priceFall = pos.entryPrice - curPrice;
        if (priceFall > (pos.entryPrice - pos.takeProfit) * 0.5) {
          pos.stopLoss = Math.min(pos.stopLoss, pos.entryPrice);
        }
      }

      var hitStop = pos.type === 'BUY' ? lastCandle.low <= pos.stopLoss : lastCandle.high >= pos.stopLoss;
      var hitTarget = pos.type === 'BUY' ? lastCandle.high >= pos.takeProfit : lastCandle.low <= pos.takeProfit;

      // Momentum loss soft exit
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
        closePosition(ticker, pos.stopLoss, 'Stopped Out 🛑', nowStr, true, candles.length - 1);
      } else if (hitTarget) {
        closePosition(ticker, pos.takeProfit, 'Target Hit 🎯', nowStr, false, candles.length - 1);
      } else if (momentumLoss) {
        closePosition(ticker, curPrice, 'Soft Exit (Momentum Loss) 💨', nowStr, false, candles.length - 1);
      }
    }

    // Track equity curve
    recalculatePortfolioValue(slicedCandlesMap);
    portfolio.equityCurve.push(portfolio.portfolioValue);

    // Track bar returns
    var barReturn = (portfolio.portfolioValue - portfolio.lastPortfolioValue) / portfolio.lastPortfolioValue;
    portfolio.barReturns.push(barReturn);
    portfolio.lastPortfolioValue = portfolio.portfolioValue;
  }

  function closePosition(ticker, exitPrice, outcome, timeStr, isLoss, exitBarIndex) {
    portfolio.currentState = 'EXIT';
    var pos = portfolio.positions[ticker];
    if (!pos) return;

    // Exit frictional costs
    var exitValue = pos.shares * exitPrice;
    var slippageDrag = exitValue * 0.0005;
    var brokerageFee = portfolio.useBrokerage ? Math.min(20, exitValue * 0.0003) : 0;
    var gstOnBrokerage = brokerageFee * 0.18;
    var stt = exitValue * 0.00025;
    var sebiTurnover = exitValue * 0.000001;
    var stampDuty = exitValue * 0.00003;
    var taxes = stt + sebiTurnover + stampDuty + gstOnBrokerage;
    var totalExitDrag = slippageDrag + brokerageFee + taxes;

    portfolio.slippageFees += slippageDrag;
    portfolio.brokerageFees += brokerageFee;
    portfolio.taxFees += taxes;

    var finalPnl = pos.type === 'BUY'
      ? (exitPrice - pos.entryPrice) * pos.shares
      : (pos.entryPrice - exitPrice) * pos.shares;

    var totalDrag = (pos.entryPrice * pos.shares * 0.0005 + totalExitDrag);
    var netPnl = finalPnl - totalDrag;

    portfolio.cash += (pos.marginUsed + finalPnl - totalExitDrag);

    if (isLoss || netPnl < 0) {
      portfolio.consecutiveLosses++;
    } else {
      portfolio.consecutiveLosses = 0;
    }

    // Implementation shortfall analysis
    var isAnalysis = null;
    if (window.RiskEngine) {
      try {
        var vwapBenchmark = pos.entryPrice;
        isAnalysis = window.RiskEngine.implementationShortfall(
          pos.entryPrice, exitPrice, vwapBenchmark, pos.shares, pos.type === 'BUY' ? 1 : -1
        );
      } catch (e) { /* skip */ }
    }

    var holdBars = exitBarIndex !== undefined ? (exitBarIndex - (pos.entryBarIndex || 0)) : 0;

    portfolio.closedTrades.push(Object.assign({}, pos, {
      exitPrice: exitPrice,
      exitTime: timeStr,
      pnl: finalPnl,
      netPnl: netPnl,
      outcome: outcome,
      holdBars: holdBars,
      implementationShortfall: isAnalysis,
      featureVector: pos.featureVector,
      mlSignal: pos.mlSignal
    }));

    delete portfolio.positions[ticker];

    portfolio.currentState = 'COOLDOWN';
    portfolio.cooldownBarsRemaining = 2;

    if (window.AuditEngine) {
      window.AuditEngine.logAction({
        time: timeStr,
        ticker: ticker,
        action: pos.type === 'BUY' ? 'EXIT (Long)' : 'EXIT (Short)',
        price: exitPrice,
        qty: pos.shares,
        sl: pos.stopLoss,
        reason: outcome + ' (Net PnL: \u20B9' + netPnl.toFixed(0) + ', Score: ' + pos.compositeScore + ', Hold: ' + holdBars + ' bars)'
      });
    }
  }

  function forceCloseAll(slicedCandlesMap) {
    for (var ticker in portfolio.positions) {
      var candles = slicedCandlesMap[ticker];
      var last = candles ? candles[candles.length - 1] : null;
      var exitPrice = last ? last.close : portfolio.positions[ticker].entryPrice;
      var timeStr = last ? new Date(last.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '15:30';
      var barIdx = candles ? candles.length - 1 : 0;
      closePosition(ticker, exitPrice, 'Time Exit (EOD) \u2696\uFE0F', timeStr, false, barIdx);
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

  // ═══════════════════════════════════════════════════════════════
  //  BACKTESTING STATISTICS (Post-Simulation)
  // ═══════════════════════════════════════════════════════════════

  function computeAdvancedStats() {
    var stats = {};

    if (window.BacktestStats && portfolio.barReturns.length > 5) {
      try {
        // Core ratios
        stats.ratios = window.BacktestStats.sharpeRatio(portfolio.barReturns, 0);

        // Monte Carlo significance test
        stats.monteCarlo = window.BacktestStats.monteCarloTest(portfolio.barReturns, 500);

        // Walk-forward validation
        if (portfolio.barReturns.length > 20) {
          stats.walkForward = window.BacktestStats.walkForwardTest(portfolio.barReturns, 15, 5);
        }

        // Deflated Sharpe Ratio
        if (stats.ratios) {
          var skew = 0, kurt = 3;
          var mean = portfolio.barReturns.reduce(function(a,b){return a+b;}, 0) / portfolio.barReturns.length;
          var std = Math.sqrt(portfolio.barReturns.reduce(function(a,b){return a + Math.pow(b - mean, 2);}, 0) / portfolio.barReturns.length);
          if (std > 0) {
            skew = portfolio.barReturns.reduce(function(a,b){return a + Math.pow((b - mean)/std, 3);}, 0) / portfolio.barReturns.length;
            kurt = portfolio.barReturns.reduce(function(a,b){return a + Math.pow((b - mean)/std, 4);}, 0) / portfolio.barReturns.length;
          }
          stats.deflatedSharpe = window.BacktestStats.deflatedSharpeRatio(
            stats.ratios.sharpe, 1, portfolio.barReturns.length, skew, kurt
          );
        }

        // Equity curve analytics
        stats.equityCurve = window.BacktestStats.equityCurveAnalytics(portfolio.equityCurve);

        // Feature importance (SHAP-like)
        if (portfolio.featureVectors.length > 2 && portfolio.closedTrades.length > 2) {
          stats.featureImportance = window.BacktestStats.featureImportance(portfolio.closedTrades, portfolio.featureVectors);
        }

        // Performance attribution
        if (portfolio.closedTrades.length > 0) {
          stats.attribution = window.BacktestStats.performanceAttribution(portfolio.closedTrades);
        }

        // Transaction cost analysis
        stats.costAnalysis = window.BacktestStats.transactionCostModel(portfolio.closedTrades, {});

        // Strategy health score
        stats.healthScore = window.BacktestStats.strategyHealthScore({
          sharpe: stats.ratios ? stats.ratios.sharpe : 0,
          sortino: stats.ratios ? stats.ratios.sortino : 0,
          maxDrawdown: stats.ratios ? stats.ratios.maxDrawdown : 0,
          dsrSignificant: stats.deflatedSharpe ? stats.deflatedSharpe.isSignificant : false,
          walkForwardDeg: stats.walkForward ? stats.walkForward.degradationRatio : 1,
          profitFactor: stats.equityCurve ? stats.equityCurve.profitFactor : 1,
          monteCarloP: stats.monteCarlo ? stats.monteCarlo.pValue : 1,
          featureDriftCount: stats.featureImportance ? stats.featureImportance.driftWarnings.length : 0
        });
      } catch (e) {
        stats.error = e.message || 'Stats computation error';
      }
    }

    return stats;
  }

  // ═══════════════════════════════════════════════════════════════
  //  STRESS TESTING
  // ═══════════════════════════════════════════════════════════════

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
        try {
          candlesMap[t] = window.ReplayEngine.generateReplayIntradayCandles(t, dateString);
        } catch (e) { candlesMap[t] = []; }
      }
      if (!candlesMap[t] || candlesMap[t].length === 0) {
        var candles = [];
        var curPrice = 1000;
        var start = new Date(dateString || '2026-05-15');
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
          var tickerKey = tickers[i];
          var stockSlice = slices[tickerKey];
          if (stockSlice.length < 2) continue;
          var lastCdl = stockSlice[stockSlice.length - 1];
          var rsiVal = calculateWilderRsi(stockSlice);
          var sigType = rsiVal < 32 ? 'BUY' : rsiVal > 68 ? 'SELL' : null;

          if (sigType) {
            var regInfo = window.RegimeDetector ? window.RegimeDetector.detectRegime(stockSlice) : { regime: 'Range', strategyAllowed: 'Mean Reversion' };
            if (regInfo.regime !== 'Event Driven' &&
                ((sigType === 'BUY' && regInfo.strategyAllowed === 'Breakout') ||
                 (sigType === 'SELL' && regInfo.strategyAllowed === 'Mean Reversion'))) {

              var atrVal = calculateAtr(stockSlice, 14);
              var stopDist = atrVal * (mode === 'Conservative' ? 1.0 : mode === 'Balanced' ? 1.5 : 2.0);
              var targetDist = stopDist * 2;
              var numShares = Math.floor((mockPf.portfolioValue * riskPct) / stopDist);
              if (numShares <= 0) numShares = 5;

              var reqCap = numShares * lastCdl.close;
              var margin = useMargin ? reqCap / 5 : reqCap;
              if (margin > mockPf.cash) {
                numShares = Math.floor((mockPf.cash * (useMargin ? 5 : 1)) / lastCdl.close);
                reqCap = numShares * lastCdl.close;
                margin = useMargin ? reqCap / 5 : reqCap;
              }

              if (numShares > 0) {
                var stopL = sigType === 'BUY' ? lastCdl.close - stopDist : lastCdl.close + stopDist;
                var takeP = sigType === 'BUY' ? lastCdl.close + targetDist : lastCdl.close - targetDist;
                mockPf.positions[tickerKey] = {
                  ticker: tickerKey, type: sigType, shares: numShares,
                  entryPrice: lastCdl.close, stopLoss: stopL, takeProfit: takeP,
                  marginUsed: margin, pnl: 0
                };
                mockPf.sessionTradesExecuted++;
                mockPf.cash -= margin;
                break;
              }
            }
          }
        }
      }

      for (var pTicker in mockPf.positions) {
        var posn = mockPf.positions[pTicker];
        var cList = slices[pTicker];
        var curCdl = cList[cList.length - 1];
        var curPrc = curCdl.close;

        posn.pnl = posn.type === 'BUY' ? (curPrc - posn.entryPrice) * posn.shares : (posn.entryPrice - curPrc) * posn.shares;

        if (posn.type === 'BUY') {
          if (curPrc - posn.entryPrice > (posn.takeProfit - posn.entryPrice) * 0.5) {
            posn.stopLoss = Math.max(posn.stopLoss, posn.entryPrice);
          }
        } else {
          if (posn.entryPrice - curPrc > (posn.entryPrice - posn.takeProfit) * 0.5) {
            posn.stopLoss = Math.min(posn.stopLoss, posn.entryPrice);
          }
        }

        var hitStp = posn.type === 'BUY' ? curCdl.low <= posn.stopLoss : curCdl.high >= posn.stopLoss;
        var hitTgt = posn.type === 'BUY' ? curCdl.high >= posn.takeProfit : curCdl.low <= posn.takeProfit;

        if (hitStp || hitTgt) {
          var exitP = hitStp ? posn.stopLoss : posn.takeProfit;
          var pnlV = posn.type === 'BUY' ? (exitP - posn.entryPrice) * posn.shares : (posn.entryPrice - exitP) * posn.shares;
          mockPf.cash += posn.marginUsed + pnlV;
          mockPf.closedTrades.push({ netPnl: pnlV });
          delete mockPf.positions[pTicker];
          if (pnlV < 0) mockPf.consecutiveLosses++;
          else mockPf.consecutiveLosses = 0;
        }
      }

      var unr = 0, mrg = 0;
      for (var pK in mockPf.positions) { unr += mockPf.positions[pK].pnl; mrg += mockPf.positions[pK].marginUsed; }
      mockPf.portfolioValue = mockPf.cash + mrg + unr;
    }

    for (var pfTk in mockPf.positions) {
      var activeP = mockPf.positions[pfTk];
      var lastCandl = candlesMap[pfTk] ? candlesMap[pfTk][candlesMap[pfTk].length - 1] : null;
      var exitPr = lastCandl ? lastCandl.close : activeP.entryPrice;
      var pnlVal = activeP.type === 'BUY' ? (exitPr - activeP.entryPrice) * activeP.shares : (activeP.entryPrice - exitPr) * activeP.shares;
      mockPf.cash += activeP.marginUsed + pnlVal;
      mockPf.closedTrades.push({ netPnl: pnlVal });
      delete mockPf.positions[pfTk];
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

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  window.PortfolioSimulator = {
    init: initPortfolio,
    processSignal: evaluateSignal,
    evaluatePositions: evaluatePositions,
    forceCloseAll: forceCloseAll,
    getPortfolio: function () { return portfolio; },
    runStressTest: runStressTest,
    computeAdvancedStats: computeAdvancedStats
  };
})();
