/**
 * StockDB — Comprehensive Indian Stock & Mutual Fund Database
 * 
 * Provides searchable autocomplete data for NSE-listed stocks
 * and AMFI API integration for mutual fund search + live NAV.
 */
(function () {
  'use strict';

  /* ════════════════════════════════════════════════════════════
   *  NSE STOCK DATABASE (Top 150 by market cap, May 2026)
   *  Format: [Name, Ticker, Sector, Approximate Price (₹)]
   * ════════════════════════════════════════════════════════════ */

  var NSE_STOCKS = [
    // Nifty 50 + Next 50 + Popular Mid-Caps
    ['Reliance Industries', 'RELIANCE', 'Energy', 2950],
    ['Tata Consultancy Services', 'TCS', 'IT Services', 3780],
    ['HDFC Bank', 'HDFCBANK', 'Banking', 1680],
    ['Infosys', 'INFY', 'IT Services', 1520],
    ['ICICI Bank', 'ICICIBANK', 'Banking', 1280],
    ['Bharti Airtel', 'BHARTIARTL', 'Telecom', 1640],
    ['State Bank of India', 'SBIN', 'Banking', 830],
    ['ITC', 'ITC', 'FMCG', 440],
    ['Hindustan Unilever', 'HINDUNILVR', 'FMCG', 2380],
    ['Kotak Mahindra Bank', 'KOTAKBANK', 'Banking', 1780],
    ['Larsen & Toubro', 'LT', 'Industrial', 3550],
    ['Axis Bank', 'AXISBANK', 'Banking', 1180],
    ['Bajaj Finance', 'BAJFINANCE', 'Finance', 7250],
    ['Maruti Suzuki', 'MARUTI', 'Auto', 12800],
    ['Asian Paints', 'ASIANPAINT', 'Consumer', 2450],
    ['HCL Technologies', 'HCLTECH', 'IT Services', 1620],
    ['Sun Pharma', 'SUNPHARMA', 'Pharma', 1750],
    ['Titan Company', 'TITAN', 'Consumer', 3250],
    ['Wipro', 'WIPRO', 'IT Services', 450],
    ['Tata Motors', 'TATAMOTORS', 'Auto', 980],
    ['Adani Enterprises', 'ADANIENT', 'Industrial', 3150],
    ['NTPC', 'NTPC', 'Energy', 390],
    ['Power Grid Corp', 'POWERGRID', 'Energy', 320],
    ['Bajaj Finserv', 'BAJAJFINSV', 'Finance', 1680],
    ['Nestle India', 'NESTLEIND', 'FMCG', 2550],
    ['Tech Mahindra', 'TECHM', 'IT Services', 1580],
    ['Mahindra & Mahindra', 'M&M', 'Auto', 2850],
    ['UltraTech Cement', 'ULTRACEMCO', 'Industrial', 11200],
    ['Tata Steel', 'TATASTEEL', 'Metals', 165],
    ['IndusInd Bank', 'INDUSINDBK', 'Banking', 1450],
    ['Adani Ports', 'ADANIPORTS', 'Industrial', 1380],
    ['JSW Steel', 'JSWSTEEL', 'Metals', 920],
    ['Grasim Industries', 'GRASIM', 'Industrial', 2680],
    ['BPCL', 'BPCL', 'Energy', 340],
    ['Coal India', 'COALINDIA', 'Energy', 480],
    ['Hindalco', 'HINDALCO', 'Metals', 640],
    ['Cipla', 'CIPLA', 'Pharma', 1520],
    ['Dr. Reddys Labs', 'DRREDDY', 'Pharma', 6450],
    ['Divis Laboratories', 'DIVISLAB', 'Pharma', 5200],
    ['Eicher Motors', 'EICHERMOT', 'Auto', 4650],
    ['Hero MotoCorp', 'HEROMOTOCO', 'Auto', 5850],
    ['Bajaj Auto', 'BAJAJ-AUTO', 'Auto', 9200],
    ['Britannia', 'BRITANNIA', 'FMCG', 5450],
    ['SBI Life Insurance', 'SBILIFE', 'Finance', 1580],
    ['HDFC Life Insurance', 'HDFCLIFE', 'Finance', 680],
    ['Dmart (Avenue Supermarts)', 'DMART', 'Consumer', 4250],
    ['Godrej Consumer', 'GODREJCP', 'FMCG', 1280],
    ['Pidilite Industries', 'PIDILITIND', 'Consumer', 2850],
    ['Havells India', 'HAVELLS', 'Consumer', 1650],
    ['Tata Consumer Products', 'TATACONSUM', 'FMCG', 1150],
    ['SBI Cards', 'SBICARD', 'Finance', 780],
    ['Apollo Hospitals', 'APOLLOHOSP', 'Healthcare', 6850],
    ['Berger Paints', 'BERGEPAINT', 'Consumer', 580],
    ['Dabur India', 'DABUR', 'FMCG', 560],
    ['Marico', 'MARICO', 'FMCG', 630],
    ['Siemens', 'SIEMENS', 'Industrial', 6450],
    ['ABB India', 'ABB', 'Industrial', 7250],
    ['Trent', 'TRENT', 'Consumer', 5850],
    ['Vedanta', 'VEDL', 'Metals', 440],
    ['ONGC', 'ONGC', 'Energy', 280],
    ['Indian Oil Corp', 'IOC', 'Energy', 175],
    ['Bharat Electronics', 'BEL', 'Industrial', 280],
    ['HAL', 'HAL', 'Industrial', 4850],
    ['LTIMindtree', 'LTIM', 'IT Services', 5650],
    ['Persistent Systems', 'PERSISTENT', 'IT Services', 5200],
    ['Coforge', 'COFORGE', 'IT Services', 6850],
    ['Mphasis', 'MPHASIS', 'IT Services', 2850],
    ['L&T Technology', 'LTTS', 'IT Services', 4950],
    ['Zomato', 'ZOMATO', 'Technology', 250],
    ['Paytm (One97)', 'PAYTM', 'Technology', 850],
    ['Nykaa (FSN E-Commerce)', 'NYKAA', 'Technology', 190],
    ['PolicyBazaar', 'POLICYBZR', 'Technology', 1650],
    ['Info Edge (Naukri)', 'NAUKRI', 'Technology', 6850],
    ['Varun Beverages', 'VBL', 'FMCG', 1650],
    ['Torrent Pharma', 'TORNTPHARM', 'Pharma', 3250],
    ['Lupin', 'LUPIN', 'Pharma', 2050],
    ['Aurobindo Pharma', 'AUROPHARMA', 'Pharma', 1250],
    ['Biocon', 'BIOCON', 'Pharma', 350],
    ['DLF', 'DLF', 'Real Estate', 850],
    ['Godrej Properties', 'GODREJPROP', 'Real Estate', 2750],
    ['Oberoi Realty', 'OBEROIRLTY', 'Real Estate', 1950],
    ['Prestige Estates', 'PRESTIGE', 'Real Estate', 1450],
    ['Max Healthcare', 'MAXHEALTH', 'Healthcare', 850],
    ['Fortis Healthcare', 'FORTIS', 'Healthcare', 480],
    ['PB Fintech', 'POLICYBZR', 'Finance', 1650],
    ['IRCTC', 'IRCTC', 'Technology', 950],
    ['Dixon Technologies', 'DIXON', 'Technology', 12500],
    ['Kaynes Technology', 'KAYNES', 'Technology', 5200],
    ['Mazagon Dock', 'MAZDOCK', 'Industrial', 4250],
    ['Cochin Shipyard', 'COCHINSHIP', 'Industrial', 2250],
    ['Bank of Baroda', 'BANKBARODA', 'Banking', 280],
    ['Punjab National Bank', 'PNB', 'Banking', 125],
    ['Canara Bank', 'CANBK', 'Banking', 115],
    ['Union Bank', 'UNIONBANK', 'Banking', 145],
    ['Federal Bank', 'FEDERALBNK', 'Banking', 195],
    ['IDFC First Bank', 'IDFCFIRSTB', 'Banking', 82],
    ['Bandhan Bank', 'BANDHANBNK', 'Banking', 215],
    ['ICICI Prudential', 'ICICIPRULI', 'Finance', 680],
    ['ICICI Lombard', 'ICICIGI', 'Finance', 1750],
    ['Max Financial', 'MFSL', 'Finance', 1050],
    ['Muthoot Finance', 'MUTHOOTFIN', 'Finance', 1950],
    ['Manappuram Finance', 'MANAPPURAM', 'Finance', 210],
    ['Shriram Finance', 'SHRIRAMFIN', 'Finance', 2650],
    ['Cholamandalam', 'CHOLAFIN', 'Finance', 1380],
    ['Page Industries', 'PAGEIND', 'Consumer', 42500],
    ['Colgate-Palmolive', 'COLPAL', 'FMCG', 2850],
    ['Emami', 'EMAMILTD', 'FMCG', 680],
    ['Jubilant Foodworks', 'JUBLFOOD', 'Consumer', 620],
    ['Tata Power', 'TATAPOWER', 'Energy', 430],
    ['Adani Green Energy', 'ADANIGREEN', 'Energy', 1850],
    ['Adani Total Gas', 'ATGL', 'Energy', 750],
    ['Gujarat Gas', 'GUJGASLTD', 'Energy', 580],
    ['Petronet LNG', 'PETRONET', 'Energy', 340],
    ['Indraprastha Gas', 'IGL', 'Energy', 480],
    ['ACC', 'ACC', 'Industrial', 2450],
    ['Ambuja Cements', 'AMBUJACEM', 'Industrial', 620],
    ['Shree Cement', 'SHREECEM', 'Industrial', 26500],
    ['Dalmia Bharat', 'DALBHARAT', 'Industrial', 1850],
    ['Ramco Cements', 'RAMCOCEM', 'Industrial', 950],
    ['Crompton Greaves', 'CROMPTON', 'Consumer', 380],
    ['Voltas', 'VOLTAS', 'Consumer', 1650],
    ['Whirlpool', 'WHIRLPOOL', 'Consumer', 1450],
    ['Astral', 'ASTRAL', 'Industrial', 2150],
    ['Polycab India', 'POLYCAB', 'Industrial', 6250],
    ['KEI Industries', 'KEI', 'Industrial', 4250],
    ['Deepak Nitrite', 'DEEPAKNTR', 'Consumer', 2450],
    ['PI Industries', 'PIIND', 'Consumer', 3850],
    ['SRF', 'SRF', 'Consumer', 2350],
    ['Aarti Industries', 'AARTIIND', 'Consumer', 680],
    ['Indian Hotels', 'INDHOTEL', 'Consumer', 650],
    ['Lemon Tree Hotels', 'LEMONTREE', 'Consumer', 145],
    ['Bharti Hexacom', 'BHARTIHEXA', 'Telecom', 1450],
    ['Vodafone Idea', 'IDEA', 'Telecom', 15],
    ['Rail Vikas Nigam', 'RVNL', 'Industrial', 280],
    ['IREDA', 'IREDA', 'Finance', 240],
    ['NHPC', 'NHPC', 'Energy', 95],
    ['SJVN', 'SJVN', 'Energy', 130],
    ['Suzlon Energy', 'SUZLON', 'Energy', 58],
    ['Tata Elxsi', 'TATAELXSI', 'IT Services', 6850],
    ['KPIT Technologies', 'KPITTECH', 'IT Services', 1450],
    ['Cyient', 'CYIENT', 'IT Services', 1850]
  ];

  /* ════════════════════════════════════════════════════════════
   *  SEARCH STOCKS (fuzzy match on name or ticker)
   * ════════════════════════════════════════════════════════════ */

  function searchStocks(query) {
    if (!query || query.length < 1) return [];
    var q = query.toLowerCase();
    var results = [];
    for (var i = 0; i < NSE_STOCKS.length; i++) {
      var s = NSE_STOCKS[i];
      var name = s[0].toLowerCase();
      var ticker = s[1].toLowerCase();
      if (name.indexOf(q) !== -1 || ticker.indexOf(q) !== -1) {
        results.push({
          name: s[0],
          ticker: s[1],
          sector: s[2],
          price: s[3]
        });
      }
      if (results.length >= 8) break; // cap at 8 results
    }
    // Sort: exact ticker match first, then starts-with name, then contains
    results.sort(function (a, b) {
      var aTickerExact = a.ticker.toLowerCase() === q ? 0 : 1;
      var bTickerExact = b.ticker.toLowerCase() === q ? 0 : 1;
      if (aTickerExact !== bTickerExact) return aTickerExact - bTickerExact;
      var aStartsWith = a.name.toLowerCase().indexOf(q) === 0 ? 0 : 1;
      var bStartsWith = b.name.toLowerCase().indexOf(q) === 0 ? 0 : 1;
      return aStartsWith - bStartsWith;
    });
    return results;
  }

  /* ════════════════════════════════════════════════════════════
   *  SEARCH MUTUAL FUNDS (via AMFI API — mfapi.in)
   * ════════════════════════════════════════════════════════════ */

  var mfSearchCache = {};
  var mfSearchTimeout = null;

  function searchMutualFunds(query, callback) {
    if (!query || query.length < 2) { callback([]); return; }

    // Check cache
    var cacheKey = query.toLowerCase();
    if (mfSearchCache[cacheKey]) {
      callback(mfSearchCache[cacheKey]);
      return;
    }

    // Debounce
    if (mfSearchTimeout) clearTimeout(mfSearchTimeout);
    mfSearchTimeout = setTimeout(function () {
      fetch('https://api.mfapi.in/mf/search?q=' + encodeURIComponent(query))
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var results = (data || []).slice(0, 8).map(function (item) {
            return {
              schemeCode: item.schemeCode,
              name: item.schemeName
            };
          });
          mfSearchCache[cacheKey] = results;
          callback(results);
        })
        .catch(function () { callback([]); });
    }, 300);
  }

  /**
   * Fetch latest NAV for a mutual fund scheme
   * @param {number} schemeCode - AMFI scheme code
   * @param {function} callback - called with { nav, date } or null
   */
  function fetchMFNav(schemeCode, callback) {
    fetch('https://api.mfapi.in/mf/' + schemeCode + '/latest')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.data && data.data.length > 0) {
          callback({
            nav: parseFloat(data.data[0].nav),
            date: data.data[0].date
          });
        } else {
          callback(null);
        }
      })
      .catch(function () { callback(null); });
  }

  /**
   * Fetch NAV for a specific date
   * @param {number} schemeCode
   * @param {string} date - DD-MM-YYYY format
   * @param {function} callback
   */
  function fetchMFNavByDate(schemeCode, date, callback) {
    // mfapi.in doesn't support date-specific queries easily,
    // so we fetch all data and find closest date
    fetch('https://api.mfapi.in/mf/' + schemeCode)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.data) { callback(null); return; }
        // Date format in API is DD-MM-YYYY
        var found = data.data.find(function (entry) {
          return entry.date === date;
        });
        if (found) {
          callback({ nav: parseFloat(found.nav), date: found.date });
        } else {
          // Find closest date
          var targetParts = date.split('-');
          var targetTime = new Date(targetParts[2] + '-' + targetParts[1] + '-' + targetParts[0]).getTime();
          var closest = null;
          var closestDiff = Infinity;
          for (var i = 0; i < Math.min(data.data.length, 365); i++) {
            var entry = data.data[i];
            var parts = entry.date.split('-');
            var t = new Date(parts[2] + '-' + parts[1] + '-' + parts[0]).getTime();
            var diff = Math.abs(t - targetTime);
            if (diff < closestDiff) {
              closestDiff = diff;
              closest = entry;
            }
          }
          if (closest) {
            callback({ nav: parseFloat(closest.nav), date: closest.date });
          } else {
            callback(null);
          }
        }
      })
      .catch(function () { callback(null); });
  }

  /* ════════════════════════════════════════════════════════════
   *  YAHOO FINANCE — Live Stock Prices via CORS proxy
   * ════════════════════════════════════════════════════════════ */

  var CORS_PROXIES = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url='
  ];

  var priceCache = {};
  var CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Fetch live stock price from Yahoo Finance.
   * Tries multiple CORS proxies for reliability.
   *
   * @param {string} ticker  NSE ticker (e.g. 'RELIANCE')
   * @param {function} callback  Called with price data object or null
   */
  function fetchYahooPrice(ticker, callback) {
    if (!ticker) { callback(null); return; }

    // Check cache
    var cacheKey = ticker.toUpperCase();
    var cached = priceCache[cacheKey];
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      callback(cached.data);
      return;
    }

    var yahooTicker = ticker.toUpperCase() + '.NS';
    var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
      encodeURIComponent(yahooTicker) + '?interval=1d&range=1d';

    tryProxies(url, 0, function (json) {
      if (!json) { callback(null); return; }

      try {
        var result = json.chart.result[0];
        var meta = result.meta;
        var quote = result.indicators.quote[0];

        var currentPrice = meta.regularMarketPrice;
        var previousClose = meta.chartPreviousClose || meta.previousClose;
        var change = currentPrice - previousClose;
        var changePct = previousClose > 0 ? ((change / previousClose) * 100) : 0;

        // Day high/low from quote data
        var highs = quote.high || [];
        var lows = quote.low || [];
        var volumes = quote.volume || [];
        var dayHigh = highs.length > 0 ? Math.max.apply(null, highs.filter(Boolean)) : currentPrice;
        var dayLow = lows.length > 0 ? Math.min.apply(null, lows.filter(Boolean)) : currentPrice;
        var volume = volumes.length > 0 ? volumes.reduce(function (a, b) { return (a || 0) + (b || 0); }, 0) : 0;

        var data = {
          ticker: ticker.toUpperCase(),
          name: meta.shortName || meta.longName || ticker,
          price: currentPrice,
          previousClose: previousClose,
          change: change,
          changePct: changePct,
          dayHigh: dayHigh,
          dayLow: dayLow,
          volume: volume,
          currency: meta.currency || 'INR',
          exchange: meta.exchangeName || 'NSE',
          marketState: meta.marketState || 'CLOSED',
          timestamp: Date.now()
        };

        // Cache it
        priceCache[cacheKey] = { data: data, timestamp: Date.now() };
        callback(data);
      } catch (e) {
        console.warn('[StockDB] Failed to parse Yahoo data for', ticker, e);
        callback(null);
      }
    });
  }

  /**
   * Fetch historical price for a specific date+time from Yahoo Finance.
   * Uses 5-minute intraday intervals for dates within 7 days,
   * daily close for older dates.
   *
   * @param {string} ticker   NSE ticker
   * @param {string} dateStr  YYYY-MM-DD format
   * @param {string} [timeStr]  HH:MM format (optional, for intraday precision)
   * @param {function} callback  Called with { price, date, time } or null
   */
  function fetchYahooHistorical(ticker, dateStr, timeStr, callback) {
    // Support old signature: fetchYahooHistorical(ticker, dateStr, callback)
    if (typeof timeStr === 'function') {
      callback = timeStr;
      timeStr = null;
    }
    if (!ticker || !dateStr) { callback(null); return; }

    var yahooTicker = ticker.toUpperCase() + '.NS';
    var dateParts = dateStr.split('-');
    var targetDate = new Date(
      Number(dateParts[0]),
      Number(dateParts[1]) - 1,
      Number(dateParts[2])
    );

    // If time is given, set it on the target
    var targetHour = 15, targetMin = 30; // default to market close
    if (timeStr) {
      var timeParts = timeStr.split(':');
      targetHour = Number(timeParts[0]);
      targetMin = Number(timeParts[1]) || 0;
    }
    targetDate.setHours(targetHour, targetMin, 0, 0);

    var now = new Date();
    var daysDiff = Math.floor((now.getTime() - targetDate.getTime()) / 86400000);

    // Use intraday 5m interval for dates within 7 days (Yahoo limit for 5m data)
    var useIntraday = timeStr && daysDiff <= 7 && daysDiff >= 0;
    var interval = useIntraday ? '5m' : '1d';

    // Period: 1 day range around target for daily, exact day for intraday
    var period1, period2;
    if (useIntraday) {
      // Start of target day (4 AM IST = before market open)
      var dayStart = new Date(targetDate);
      dayStart.setHours(4, 0, 0, 0);
      period1 = Math.floor(dayStart.getTime() / 1000);
      // End of target day (8 PM IST = after market close)
      var dayEnd = new Date(targetDate);
      dayEnd.setHours(20, 0, 0, 0);
      period2 = Math.floor(dayEnd.getTime() / 1000);
    } else {
      period1 = Math.floor(targetDate.getTime() / 1000) - (3 * 86400);
      period2 = Math.floor(targetDate.getTime() / 1000) + (3 * 86400);
    }

    var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
      encodeURIComponent(yahooTicker) +
      '?period1=' + period1 + '&period2=' + period2 + '&interval=' + interval;

    tryProxies(url, 0, function (json) {
      if (!json) { callback(null); return; }

      try {
        var result = json.chart.result[0];
        var timestamps = result.timestamp || [];
        var quote = result.indicators.quote[0];
        var closes = quote.close || [];
        var opens = quote.open || [];
        var highs = quote.high || [];
        var lows = quote.low || [];

        if (timestamps.length === 0) { callback(null); return; }

        // Find the closest timestamp to our target
        var targetEpoch = targetDate.getTime() / 1000;
        var bestIdx = 0;
        var bestDiff = Infinity;
        for (var i = 0; i < timestamps.length; i++) {
          if (closes[i] == null) continue; // skip null candles
          var diff = Math.abs(timestamps[i] - targetEpoch);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
          }
        }

        if (closes[bestIdx] != null) {
          var matchedDate = new Date(timestamps[bestIdx] * 1000);
          var matchedTimeStr =
            String(matchedDate.getHours()).padStart(2, '0') + ':' +
            String(matchedDate.getMinutes()).padStart(2, '0');

          callback({
            price: closes[bestIdx],
            open: opens[bestIdx],
            high: highs[bestIdx],
            low: lows[bestIdx],
            date: matchedDate.toISOString().slice(0, 10),
            time: matchedTimeStr,
            interval: interval,
            isIntraday: useIntraday
          });
        } else {
          callback(null);
        }
      } catch (e) {
        console.warn('[StockDB] Failed to parse Yahoo historical data', e);
        callback(null);
      }
    });
  }

  /**
   * Try CORS proxies in sequence until one succeeds.
   * @private
   */
  function tryProxies(url, proxyIndex, callback) {
    if (proxyIndex >= CORS_PROXIES.length) {
      callback(null);
      return;
    }

    var proxyUrl = CORS_PROXIES[proxyIndex] + encodeURIComponent(url);

    fetch(proxyUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        callback(data);
      })
      .catch(function () {
        // Try next proxy
        tryProxies(url, proxyIndex + 1, callback);
      });
  }

  /**
   * Fetch a series of candles (OHLCV) from Yahoo Finance.
   * Tries multiple CORS proxies.
   *
   * @param {string} ticker  NSE ticker (e.g. 'RELIANCE')
   * @param {string} interval  '1m', '5m', '15m', or '1d'
   * @param {string} range  '1d', '5d', '1mo', '1y'
   * @param {function} callback  Called with array of candles or null
   */
  function fetchYahooIntradaySeries(ticker, interval, range, callback) {
    if (!ticker) { callback(null); return; }

    var yahooTicker = ticker.toUpperCase() + '.NS';
    var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
      encodeURIComponent(yahooTicker) + '?interval=' + interval + '&range=' + range;

    tryProxies(url, 0, function (json) {
      if (!json) { callback(null); return; }

      try {
        var result = json.chart.result[0];
        var timestamps = result.timestamp || [];
        var quote = result.indicators.quote[0];
        var opens = quote.open || [];
        var highs = quote.high || [];
        var lows = quote.low || [];
        var closes = quote.close || [];
        var volumes = quote.volume || [];

        // Build candles list
        var candles = [];
        var accumVolume = 0;
        var accumTypicalPriceVolume = 0;

        for (var i = 0; i < timestamps.length; i++) {
          if (opens[i] == null || highs[i] == null || lows[i] == null || closes[i] == null) {
            continue;
          }

          var time = new Date(timestamps[i] * 1000).toISOString();
          var open = parseFloat(opens[i]);
          var high = parseFloat(highs[i]);
          var low = parseFloat(lows[i]);
          var close = parseFloat(closes[i]);
          var volume = parseFloat(volumes[i] || 0);

          // Calculate VWAP (Volume Weighted Average Price)
          var typicalPrice = (high + low + close) / 3;
          
          if (i > 0 && timestamps[i-1]) {
            var prevDate = new Date(timestamps[i-1] * 1000).toDateString();
            var currDate = new Date(timestamps[i] * 1000).toDateString();
            if (prevDate !== currDate) {
              accumVolume = 0;
              accumTypicalPriceVolume = 0;
            }
          }

          accumVolume += volume;
          accumTypicalPriceVolume += typicalPrice * volume;
          var vwap = accumVolume > 0 ? accumTypicalPriceVolume / accumVolume : typicalPrice;

          candles.push({
            time: time,
            open: open,
            high: high,
            low: low,
            close: close,
            volume: volume,
            vwap: vwap
          });
        }

        callback(candles);
      } catch (e) {
        console.warn('[StockDB] Failed to parse Yahoo intraday series for', ticker, e);
        callback(null);
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
   *  PUBLIC API
   * ════════════════════════════════════════════════════════════ */

  window.StockDB = {
    searchStocks: searchStocks,
    searchMutualFunds: searchMutualFunds,
    fetchMFNav: fetchMFNav,
    fetchMFNavByDate: fetchMFNavByDate,
    fetchYahooPrice: fetchYahooPrice,
    fetchYahooHistorical: fetchYahooHistorical,
    fetchYahooIntradaySeries: fetchYahooIntradaySeries,
    NSE_STOCKS: NSE_STOCKS
  };

})();
