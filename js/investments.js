/**
 * InvestmentsView — Stocks, Mutual Funds & SIP Tracker
 *
 * Provides a comprehensive portfolio management interface with:
 *   - Portfolio KPI overview (total invested, current value, returns, XIRR)
 *   - Tabbed sections for Stocks, Mutual Funds, SIPs
 *   - Asset allocation doughnut chart
 *   - Full CRUD modals for each investment type
 */
(function () {
  'use strict';

  var store = window.FinanceStore;
  var activeTab = 'stocks';

  /* ════════════════════════════════════════════════════════════
   *  SECTOR / CATEGORY CONSTANTS
   * ════════════════════════════════════════════════════════════ */

  var STOCK_SECTORS = [
    'Technology', 'Finance', 'Healthcare', 'Energy', 'Consumer',
    'Industrial', 'Telecom', 'Auto', 'Pharma', 'FMCG',
    'Real Estate', 'Metals', 'IT Services', 'Banking', 'Other'
  ];

  var MF_CATEGORIES = [
    'Large Cap', 'Mid Cap', 'Small Cap', 'Multi Cap', 'Flexi Cap',
    'ELSS (Tax Saver)', 'Index Fund', 'Sectoral', 'Debt Fund',
    'Hybrid', 'Liquid Fund', 'International', 'Other'
  ];

  var SECTOR_ICONS = {
    'Technology': '💻', 'Finance': '🏦', 'Healthcare': '🏥', 'Energy': '⚡',
    'Consumer': '🛒', 'Industrial': '🏭', 'Telecom': '📡', 'Auto': '🚗',
    'Pharma': '💊', 'FMCG': '🛍️', 'Real Estate': '🏠', 'Metals': '⛏️',
    'IT Services': '🖥️', 'Banking': '🏧', 'Other': '📊',
    'Large Cap': '📈', 'Mid Cap': '📊', 'Small Cap': '🔬',
    'Multi Cap': '🎯', 'Flexi Cap': '🔄', 'ELSS (Tax Saver)': '🏷️',
    'Index Fund': '📉', 'Sectoral': '🏢', 'Debt Fund': '🔒',
    'Hybrid': '⚖️', 'Liquid Fund': '💧', 'International': '🌍'
  };

  /* ════════════════════════════════════════════════════════════
   *  RENDER
   * ════════════════════════════════════════════════════════════ */

  function render() {
    var container = document.getElementById('view-container');
    if (!container) return;

    var summary = store.getPortfolioSummary();
    var fmt = store.formatCurrency;

    var returnClass = summary.totalReturns >= 0 ? 'text-success' : 'text-danger';
    var returnSign = summary.totalReturns >= 0 ? '+' : '';
    var returnPctStr = summary.returnPct.toFixed(2);

    container.innerHTML =
      /* ── Portfolio KPIs ── */
      '<div class="grid-4 stagger-in" style="margin-bottom:28px;">' +

        '<div class="kpi-card balance">' +
          '<div class="kpi-icon balance-icon">💼</div>' +
          '<div class="kpi-body">' +
            '<div class="kpi-value">' + fmt(summary.totalInvested) + '</div>' +
            '<div class="kpi-label">Total Invested</div>' +
          '</div>' +
        '</div>' +

        '<div class="kpi-card income">' +
          '<div class="kpi-icon income-icon">📊</div>' +
          '<div class="kpi-body">' +
            '<div class="kpi-value">' + fmt(summary.totalCurrent) + '</div>' +
            '<div class="kpi-label">Current Value</div>' +
          '</div>' +
        '</div>' +

        '<div class="kpi-card ' + (summary.totalReturns >= 0 ? 'savings' : 'expense') + '">' +
          '<div class="kpi-icon ' + (summary.totalReturns >= 0 ? 'savings-icon' : 'expense-icon') + '">' +
            (summary.totalReturns >= 0 ? '📈' : '📉') +
          '</div>' +
          '<div class="kpi-body">' +
            '<div class="kpi-value ' + returnClass + '">' + returnSign + fmt(summary.totalReturns) + '</div>' +
            '<div class="kpi-label">Total Returns</div>' +
            '<span class="kpi-change ' + (summary.totalReturns >= 0 ? 'positive' : 'negative') + '">' +
              returnSign + returnPctStr + '%' +
            '</span>' +
          '</div>' +
        '</div>' +

        '<div class="kpi-card balance">' +
          '<div class="kpi-icon balance-icon">🎯</div>' +
          '<div class="kpi-body">' +
            '<div class="kpi-value">' + (summary.stocks.count + summary.mutualFunds.count + summary.sips.count) + '</div>' +
            '<div class="kpi-label">Total Holdings</div>' +
            '<span class="kpi-change positive" style="background:var(--primary-glow);color:var(--primary-light);border-color:rgba(99,102,241,0.1)">' +
              summary.stocks.count + ' Stocks · ' + summary.mutualFunds.count + ' MF · ' + summary.sips.activeSips + ' SIPs' +
            '</span>' +
          '</div>' +
        '</div>' +

      '</div>' +

      /* ── Asset Allocation + Tabs ── */
      '<div class="grid-2-1" style="margin-bottom:28px;">' +

        /* Left: Tabbed content */
        '<div class="card">' +
          '<div class="inv-tabs" style="display:flex;gap:4px;margin-bottom:20px;background:var(--bg-input);border-radius:var(--radius-md);padding:4px;">' +
            '<button class="inv-tab-btn ' + (activeTab === 'stocks' ? 'active' : '') + '" data-inv-tab="stocks">' +
              '📊 Stocks <span class="inv-tab-count">' + summary.stocks.count + '</span></button>' +
            '<button class="inv-tab-btn ' + (activeTab === 'mutual_funds' ? 'active' : '') + '" data-inv-tab="mutual_funds">' +
              '📈 Mutual Funds <span class="inv-tab-count">' + summary.mutualFunds.count + '</span></button>' +
            '<button class="inv-tab-btn ' + (activeTab === 'sips' ? 'active' : '') + '" data-inv-tab="sips">' +
              '🔄 SIPs <span class="inv-tab-count">' + summary.sips.count + '</span></button>' +
          '</div>' +
          '<div id="inv-tab-content"></div>' +
        '</div>' +

        /* Right: Allocation chart */
        '<div class="card">' +
          '<div class="card-header"><h3 class="card-title">Asset Allocation</h3></div>' +
          '<div class="chart-container" style="max-width:280px;margin:0 auto;">' +
            '<canvas id="inv-allocation-chart"></canvas>' +
          '</div>' +
          '<div style="margin-top:20px;">' +
            buildAllocationBars(summary, fmt) +
          '</div>' +
        '</div>' +

      '</div>';

    /* ── Header actions ── */
    var headerActions = document.getElementById('header-actions');
    if (headerActions) {
      headerActions.innerHTML =
        '<button class="btn btn-primary" id="btn-add-investment">' +
          '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
          ' Add Investment' +
        '</button>';
      document.getElementById('btn-add-investment').addEventListener('click', function () {
        showAddInvestmentModal();
      });
    }

    /* ── Bind tab clicks ── */
    container.querySelectorAll('.inv-tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeTab = btn.getAttribute('data-inv-tab');
        container.querySelectorAll('.inv-tab-btn').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-inv-tab') === activeTab);
        });
        renderTabContent();
      });
    });

    renderTabContent();

    /* ── Allocation chart ── */
    if (summary.allocation.length > 0) {
      setTimeout(function () {
        window.FinanceCharts.doughnutChart('inv-allocation-chart', {
          labels: summary.allocation.map(function (a) { return a.label; }),
          data: summary.allocation.map(function (a) { return a.value; }),
          colors: summary.allocation.map(function (a) { return a.color; }),
          centerText: fmt(summary.totalCurrent)
        });
      }, 100);
    }
  }

  /* ════════════════════════════════════════════════════════════
   *  ALLOCATION BARS HELPER
   * ════════════════════════════════════════════════════════════ */

  function buildAllocationBars(summary, fmt) {
    var total = summary.totalCurrent || 1;
    var items = [
      { label: 'Stocks', value: summary.stocks.current, color: '#6366f1', icon: '📊' },
      { label: 'Mutual Funds', value: summary.mutualFunds.current, color: '#10b981', icon: '📈' },
      { label: 'SIPs', value: summary.sips.current, color: '#f59e0b', icon: '🔄' }
    ];
    var html = '';
    items.forEach(function (item) {
      var pct = ((item.value / total) * 100).toFixed(1);
      html +=
        '<div style="margin-bottom:14px;">' +
          '<div class="flex-between" style="margin-bottom:6px;">' +
            '<span style="font-size:0.85rem;font-weight:600;">' + item.icon + ' ' + item.label + '</span>' +
            '<span style="font-size:0.82rem;color:var(--text-secondary);">' + fmt(item.value) + ' (' + pct + '%)</span>' +
          '</div>' +
          '<div class="progress-bar">' +
            '<div class="progress-fill" style="width:' + pct + '%;background:' + item.color + ';"></div>' +
          '</div>' +
        '</div>';
    });
    return html;
  }

  /* ════════════════════════════════════════════════════════════
   *  TAB CONTENT RENDERERS
   * ════════════════════════════════════════════════════════════ */

  function renderTabContent() {
    var el = document.getElementById('inv-tab-content');
    if (!el) return;

    switch (activeTab) {
      case 'stocks': renderStocksTab(el); break;
      case 'mutual_funds': renderMFTab(el); break;
      case 'sips': renderSIPsTab(el); break;
    }
  }

  /* ── Stocks Tab ── */
  function renderStocksTab(el) {
    var stocks = store.getInvestments('stock');
    var fmt = store.formatCurrency;

    if (stocks.length === 0) {
      el.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-state-icon">📊</div>' +
          '<div class="empty-state-text">No stock holdings yet</div>' +
          '<div class="empty-state-subtext">Add your first stock to start tracking your portfolio</div>' +
        '</div>';
      return;
    }

    var html = '<div class="table-wrapper"><table class="data-table"><thead><tr>' +
      '<th>Stock</th><th>Sector</th><th>Qty</th><th>Buy Price</th><th>Current Price</th><th>Invested</th><th>Current</th><th>P&L</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    stocks.forEach(function (s) {
      var invested = s.quantity * s.buyPrice;
      var current = s.quantity * (s.currentPrice || s.buyPrice);
      var pnl = current - invested;
      var pnlPct = invested > 0 ? ((pnl / invested) * 100).toFixed(2) : '0.00';
      var pnlClass = pnl >= 0 ? 'amount-income' : 'amount-expense';
      var pnlSign = pnl >= 0 ? '+' : '';
      var icon = SECTOR_ICONS[s.sector] || '📊';

      html += '<tr>' +
        '<td><div style="display:flex;align-items:center;gap:10px;">' +
          '<span style="font-size:1.2rem;">' + icon + '</span>' +
          '<div><div style="font-weight:600;">' + escHtml(s.name) + '</div>' +
            (s.ticker ? '<div style="font-size:0.75rem;color:var(--text-muted);">' + escHtml(s.ticker) + '</div>' : '') +
          '</div></div></td>' +
        '<td><span class="badge badge-category">' + escHtml(s.sector || 'Other') + '</span></td>' +
        '<td style="font-weight:600;">' + s.quantity + '</td>' +
        '<td>' + fmt(s.buyPrice) + '</td>' +
        '<td>' + fmt(s.currentPrice || s.buyPrice) + '</td>' +
        '<td>' + fmt(invested) + '</td>' +
        '<td style="font-weight:600;">' + fmt(current) + '</td>' +
        '<td class="' + pnlClass + '">' + pnlSign + fmt(pnl) + ' (' + pnlSign + pnlPct + '%)</td>' +
        '<td><div class="table-actions">' +
          '<button class="btn btn-sm btn-secondary inv-edit-btn" data-id="' + s.id + '">Edit</button>' +
          '<button class="btn btn-sm btn-danger inv-del-btn" data-id="' + s.id + '">Del</button>' +
        '</div></td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';
    el.innerHTML = html;
    bindTableActions(el);
  }

  /* ── Mutual Funds Tab ── */
  function renderMFTab(el) {
    var mfs = store.getInvestments('mutual_fund');
    var fmt = store.formatCurrency;

    if (mfs.length === 0) {
      el.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-state-icon">📈</div>' +
          '<div class="empty-state-text">No mutual fund holdings yet</div>' +
          '<div class="empty-state-subtext">Add your first mutual fund to track your investments</div>' +
        '</div>';
      return;
    }

    var html = '<div class="table-wrapper"><table class="data-table"><thead><tr>' +
      '<th>Fund Name</th><th>Category</th><th>Units</th><th>Buy NAV</th><th>Current NAV</th><th>Invested</th><th>Current</th><th>P&L</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    mfs.forEach(function (m) {
      var invested = m.units * m.navAtBuy;
      var current = m.units * (m.currentNav || m.navAtBuy);
      var pnl = current - invested;
      var pnlPct = invested > 0 ? ((pnl / invested) * 100).toFixed(2) : '0.00';
      var pnlClass = pnl >= 0 ? 'amount-income' : 'amount-expense';
      var pnlSign = pnl >= 0 ? '+' : '';
      var icon = SECTOR_ICONS[m.category] || '📈';

      html += '<tr>' +
        '<td><div style="display:flex;align-items:center;gap:10px;">' +
          '<span style="font-size:1.2rem;">' + icon + '</span>' +
          '<div style="font-weight:600;">' + escHtml(m.name) + '</div>' +
        '</div></td>' +
        '<td><span class="badge badge-category">' + escHtml(m.category || 'Other') + '</span></td>' +
        '<td style="font-weight:600;">' + m.units.toFixed(3) + '</td>' +
        '<td>' + fmt(m.navAtBuy) + '</td>' +
        '<td>' + fmt(m.currentNav || m.navAtBuy) + '</td>' +
        '<td>' + fmt(invested) + '</td>' +
        '<td style="font-weight:600;">' + fmt(current) + '</td>' +
        '<td class="' + pnlClass + '">' + pnlSign + fmt(pnl) + ' (' + pnlSign + pnlPct + '%)</td>' +
        '<td><div class="table-actions">' +
          '<button class="btn btn-sm btn-secondary inv-edit-btn" data-id="' + m.id + '">Edit</button>' +
          '<button class="btn btn-sm btn-danger inv-del-btn" data-id="' + m.id + '">Del</button>' +
        '</div></td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';
    el.innerHTML = html;
    bindTableActions(el);
  }

  /* ── SIPs Tab ── */
  function renderSIPsTab(el) {
    var sips = store.getInvestments('sip');
    var fmt = store.formatCurrency;

    if (sips.length === 0) {
      el.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-state-icon">🔄</div>' +
          '<div class="empty-state-text">No SIPs yet</div>' +
          '<div class="empty-state-subtext">Start a Systematic Investment Plan to build wealth steadily</div>' +
        '</div>';
      return;
    }

    var html = '';
    sips.forEach(function (s) {
      var pnl = (s.currentValue || 0) - (s.totalInvested || 0);
      var pnlPct = s.totalInvested > 0 ? ((pnl / s.totalInvested) * 100).toFixed(2) : '0.00';
      var pnlClass = pnl >= 0 ? 'text-success' : 'text-danger';
      var pnlSign = pnl >= 0 ? '+' : '';

      html +=
        '<div class="loan-item-card" style="margin-bottom:16px;">' +
          '<div class="loan-card-header">' +
            '<div class="loan-card-title-block">' +
              '<span class="loan-card-icon" style="background:var(--warning-light);color:var(--warning);">🔄</span>' +
              '<div>' +
                '<div class="loan-card-title">' + escHtml(s.fundName) + '</div>' +
                '<div style="font-size:0.8rem;color:var(--text-muted);">' +
                  fmt(s.amount) + ' / ' + (s.frequency || 'monthly') +
                  ' · SIP Date: ' + (s.sipDate || 1) + 'th' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<span class="badge ' + (s.active ? 'badge-active' : 'badge-inactive') + '">' +
              (s.active ? '● Active' : '○ Paused') +
            '</span>' +
          '</div>' +

          '<div class="loan-card-kpi-grid" style="grid-template-columns:repeat(4,1fr);">' +
            '<div class="loan-kpi">' +
              '<div class="loan-kpi-label">Monthly SIP</div>' +
              '<div class="loan-kpi-value">' + fmt(s.amount) + '</div>' +
            '</div>' +
            '<div class="loan-kpi">' +
              '<div class="loan-kpi-label">Total Invested</div>' +
              '<div class="loan-kpi-value">' + fmt(s.totalInvested || 0) + '</div>' +
            '</div>' +
            '<div class="loan-kpi">' +
              '<div class="loan-kpi-label">Current Value</div>' +
              '<div class="loan-kpi-value">' + fmt(s.currentValue || 0) + '</div>' +
            '</div>' +
            '<div class="loan-kpi">' +
              '<div class="loan-kpi-label">Returns</div>' +
              '<div class="loan-kpi-value ' + pnlClass + '">' + pnlSign + fmt(pnl) + ' (' + pnlSign + pnlPct + '%)</div>' +
            '</div>' +
          '</div>' +

          '<div class="loan-card-footer" style="margin-top:12px;">' +
            '<span style="font-size:0.82rem;color:var(--text-muted);">Started: ' + store.formatDate(s.startDate || s.createdAt) + '</span>' +
            '<div class="loan-card-actions">' +
              '<button class="btn btn-sm btn-secondary inv-edit-btn" data-id="' + s.id + '">Edit</button>' +
              '<button class="btn btn-sm ' + (s.active ? 'btn-secondary' : 'btn-success') + ' inv-toggle-sip" data-id="' + s.id + '">' +
                (s.active ? 'Pause' : 'Resume') +
              '</button>' +
              '<button class="btn btn-sm btn-danger inv-del-btn" data-id="' + s.id + '">Delete</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    });

    el.innerHTML = html;
    bindTableActions(el);

    /* SIP toggle active/pause */
    el.querySelectorAll('.inv-toggle-sip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var sip = store.getInvestments('sip').find(function (s) { return s.id === id; });
        if (sip) {
          store.updateInvestment(id, { active: !sip.active });
          App.showToast(sip.active ? 'SIP paused' : 'SIP resumed', 'info');
          render();
        }
      });
    });
  }

  /* ════════════════════════════════════════════════════════════
   *  TABLE ACTION BINDINGS
   * ════════════════════════════════════════════════════════════ */

  function bindTableActions(el) {
    el.querySelectorAll('.inv-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var inv = store.getInvestments().find(function (i) { return i.id === id; });
        if (inv) showEditInvestmentModal(inv);
      });
    });

    el.querySelectorAll('.inv-del-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        App.confirm('Delete this investment? This cannot be undone.').then(function (ok) {
          if (ok) {
            store.deleteInvestment(id);
            App.showToast('Investment deleted', 'info');
            render();
          }
        });
      });
    });
  }

  /* ════════════════════════════════════════════════════════════
   *  ADD INVESTMENT MODAL
   * ════════════════════════════════════════════════════════════ */

  function showAddInvestmentModal(prefillType) {
    var invType = prefillType || activeTab.replace('mutual_funds', 'mutual_fund').replace('stocks', 'stock').replace('sips', 'sip');

    var html =
      '<div class="modal-header">' +
        '<h3 class="modal-title">Add Investment</h3>' +
        '<button class="modal-close" onclick="App.hideModal()">&times;</button>' +
      '</div>' +
      '<div class="modal-body">' +

        '<div class="form-group">' +
          '<label class="form-label">Investment Type</label>' +
          '<div class="segmented-control" id="inv-type-seg">' +
            '<button class="seg-btn ' + (invType === 'stock' ? 'active' : '') + '" data-val="stock">📊 Stock</button>' +
            '<button class="seg-btn ' + (invType === 'mutual_fund' ? 'active' : '') + '" data-val="mutual_fund">📈 Mutual Fund</button>' +
            '<button class="seg-btn ' + (invType === 'sip' ? 'active' : '') + '" data-val="sip">🔄 SIP</button>' +
          '</div>' +
        '</div>' +

        '<div id="inv-form-fields">' + getFormFields(invType) + '</div>' +

      '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-secondary" onclick="App.hideModal()">Cancel</button>' +
        '<button class="btn btn-primary" id="inv-save-btn">Add Investment</button>' +
      '</div>';

    App.showModal(html);
    bindAutocomplete(invType);

    /* Type toggle */
    document.querySelectorAll('#inv-type-seg .seg-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        invType = btn.getAttribute('data-val');
        document.querySelectorAll('#inv-type-seg .seg-btn').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-val') === invType);
        });
        document.getElementById('inv-form-fields').innerHTML = getFormFields(invType);
        bindAutocomplete(invType);
      });
    });

    /* Save */
    document.getElementById('inv-save-btn').addEventListener('click', function () {
      var invData = collectFormData(invType);
      if (!invData) return;
      invData.type = invType;
      store.addInvestment(invData);
      App.hideModal();
      App.showToast('Investment added successfully!', 'success');
      activeTab = invType === 'mutual_fund' ? 'mutual_funds' : invType + 's';
      render();
    });
  }

  /* ════════════════════════════════════════════════════════════
   *  EDIT INVESTMENT MODAL
   * ════════════════════════════════════════════════════════════ */

  function showEditInvestmentModal(inv) {
    var html =
      '<div class="modal-header">' +
        '<h3 class="modal-title">Edit Investment</h3>' +
        '<button class="modal-close" onclick="App.hideModal()">&times;</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div id="inv-form-fields">' + getFormFields(inv.type, inv) + '</div>' +
      '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn btn-secondary" onclick="App.hideModal()">Cancel</button>' +
        '<button class="btn btn-primary" id="inv-save-btn">Save Changes</button>' +
      '</div>';

    App.showModal(html);
    bindAutocomplete(inv.type);

    document.getElementById('inv-save-btn').addEventListener('click', function () {
      var updates = collectFormData(inv.type);
      if (!updates) return;
      store.updateInvestment(inv.id, updates);
      App.hideModal();
      App.showToast('Investment updated!', 'success');
      render();
    });
  }

  /* ════════════════════════════════════════════════════════════
   *  FORM FIELDS BUILDER
   * ════════════════════════════════════════════════════════════ */

  function getFormFields(type, existing) {
    var v = existing || {};
    var today = new Date().toISOString().slice(0, 10);

    if (type === 'stock') {
      return (
        '<div class="form-row">' +
          '<div class="form-group" style="flex:2;">' +
            '<label class="form-label">Stock Name *</label>' +
            '<div class="autocomplete-wrap" id="ac-stock-wrap">' +
              '<input class="form-input" id="inv-name" value="' + escAttr(v.name || '') + '" placeholder="Type to search NSE stocks..." autocomplete="off">' +
              '<div class="autocomplete-dropdown" id="ac-stock-dd"></div>' +
            '</div>' +
          '</div>' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Ticker</label>' +
            '<input class="form-input" id="inv-ticker" value="' + escAttr(v.ticker || '') + '" placeholder="e.g. RELIANCE" readonly style="opacity:0.7;cursor:default;">' +
          '</div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Sector</label>' +
            '<select class="form-select" id="inv-sector">' +
              STOCK_SECTORS.map(function (s) {
                return '<option value="' + s + '"' + (v.sector === s ? ' selected' : '') + '>' + s + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Quantity *</label>' +
            '<input type="number" class="form-input" id="inv-qty" value="' + (v.quantity || '') + '" placeholder="0" min="0">' +
          '</div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Buy Price (₹) *</label>' +
            '<input type="number" class="form-input" id="inv-buy-price" value="' + (v.buyPrice || '') + '" placeholder="0.00" step="0.01">' +
            '<div class="form-hint" id="inv-price-hint" style="display:none;"></div>' +
          '</div>' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Current Price (₹)</label>' +
            '<input type="number" class="form-input" id="inv-current-price" value="' + (v.currentPrice || '') + '" placeholder="0.00" step="0.01">' +
          '</div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Buy Date</label>' +
            '<input type="date" class="form-input" id="inv-date" value="' + (v.buyDate || today) + '" max="' + today + '">' +
          '</div>' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Buy Time <span style="font-size:0.7rem;color:var(--text-muted);">(NSE: 9:15–15:30)</span></label>' +
            '<input type="time" class="form-input" id="inv-time" value="' + (v.buyTime || getNowTime()) + '">' +
          '</div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Notes</label>' +
          '<input class="form-input" id="inv-notes" value="' + escAttr(v.notes || '') + '" placeholder="Optional notes...">' +
        '</div>'
      );
    }

    if (type === 'mutual_fund') {
      return (
        '<div class="form-group">' +
          '<label class="form-label">Fund Name * <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(Type to search AMFI database)</span></label>' +
          '<div class="autocomplete-wrap" id="ac-mf-wrap">' +
            '<input class="form-input" id="inv-name" value="' + escAttr(v.name || '') + '" placeholder="Type to search mutual funds..." autocomplete="off">' +
            '<div class="autocomplete-dropdown" id="ac-mf-dd"></div>' +
          '</div>' +
          '<input type="hidden" id="inv-scheme-code" value="' + (v.schemeCode || '') + '">' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Category</label>' +
            '<select class="form-select" id="inv-category">' +
              MF_CATEGORIES.map(function (c) {
                return '<option value="' + c + '"' + (v.category === c ? ' selected' : '') + '>' + c + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Units *</label>' +
            '<input type="number" class="form-input" id="inv-units" value="' + (v.units || '') + '" placeholder="0.000" step="0.001">' +
          '</div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">NAV at Buy (₹) *</label>' +
            '<input type="number" class="form-input" id="inv-nav-buy" value="' + (v.navAtBuy || '') + '" placeholder="0.00" step="0.01">' +
            '<div class="form-hint" id="inv-nav-hint" style="display:none;"></div>' +
          '</div>' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Current NAV (₹)</label>' +
            '<input type="number" class="form-input" id="inv-nav-current" value="' + (v.currentNav || '') + '" placeholder="0.00" step="0.01">' +
          '</div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Buy Date</label>' +
            '<input type="date" class="form-input" id="inv-date" value="' + (v.buyDate || today) + '" max="' + today + '">' +
          '</div>' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Buy Time</label>' +
            '<input type="time" class="form-input" id="inv-time" value="' + (v.buyTime || getNowTime()) + '">' +
          '</div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Notes</label>' +
          '<input class="form-input" id="inv-notes" value="' + escAttr(v.notes || '') + '" placeholder="Optional notes...">' +
        '</div>'
      );
    }

    if (type === 'sip') {
      return (
        '<div class="form-group">' +
          '<label class="form-label">Fund Name * <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(Type to search)</span></label>' +
          '<div class="autocomplete-wrap" id="ac-sip-wrap">' +
            '<input class="form-input" id="inv-fund-name" value="' + escAttr(v.fundName || '') + '" placeholder="Type to search mutual funds..." autocomplete="off">' +
            '<div class="autocomplete-dropdown" id="ac-sip-dd"></div>' +
          '</div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">SIP Amount (₹) *</label>' +
            '<input type="number" class="form-input" id="inv-amount" value="' + (v.amount || '') + '" placeholder="5000">' +
          '</div>' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Frequency</label>' +
            '<select class="form-select" id="inv-frequency">' +
              '<option value="monthly"' + (v.frequency === 'monthly' ? ' selected' : '') + '>Monthly</option>' +
              '<option value="quarterly"' + (v.frequency === 'quarterly' ? ' selected' : '') + '>Quarterly</option>' +
              '<option value="weekly"' + (v.frequency === 'weekly' ? ' selected' : '') + '>Weekly</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">SIP Date (Day of Month)</label>' +
            '<input type="number" class="form-input" id="inv-sip-date" value="' + (v.sipDate || 1) + '" min="1" max="28">' +
          '</div>' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Start Date</label>' +
            '<input type="date" class="form-input" id="inv-start-date" value="' + (v.startDate || today) + '" max="' + today + '">' +
          '</div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Total Invested (₹)</label>' +
            '<input type="number" class="form-input" id="inv-total-invested" value="' + (v.totalInvested || 0) + '">' +
          '</div>' +
          '<div class="form-group" style="flex:1;">' +
            '<label class="form-label">Current Value (₹)</label>' +
            '<input type="number" class="form-input" id="inv-current-value" value="' + (v.currentValue || 0) + '">' +
          '</div>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Notes</label>' +
          '<input class="form-input" id="inv-notes" value="' + escAttr(v.notes || '') + '" placeholder="Optional notes...">' +
        '</div>'
      );
    }

    return '';
  }

  /* ════════════════════════════════════════════════════════════
   *  AUTOCOMPLETE BINDING
   *  Called after modal/form fields are inserted into the DOM
   * ════════════════════════════════════════════════════════════ */

  function bindAutocomplete(type) {
    if (type === 'stock') {
      bindStockAutocomplete();
    } else if (type === 'mutual_fund') {
      bindMFAutocomplete('inv-name', 'ac-mf-dd', function (item) {
        var nameInput = document.getElementById('inv-name');
        if (nameInput) nameInput.value = item.name;
        var schemeInput = document.getElementById('inv-scheme-code');
        if (schemeInput) schemeInput.value = item.schemeCode;
        // Fetch latest NAV
        var hint = document.getElementById('inv-nav-hint');
        if (hint) {
          hint.style.display = 'block';
          hint.innerHTML = '<span style="color:var(--info);">⏳ Fetching latest NAV...</span>';
        }
        window.StockDB.fetchMFNav(item.schemeCode, function (data) {
          if (data && hint) {
            hint.innerHTML = '<span style="color:var(--success);">✓ Latest NAV: ₹' + data.nav.toFixed(4) + ' (as of ' + data.date + ')</span>';
            var navCurrent = document.getElementById('inv-nav-current');
            if (navCurrent && !navCurrent.value) navCurrent.value = data.nav.toFixed(4);
            var navBuy = document.getElementById('inv-nav-buy');
            if (navBuy && !navBuy.value) navBuy.value = data.nav.toFixed(4);
          } else if (hint) {
            hint.innerHTML = '<span style="color:var(--text-muted);">NAV data unavailable</span>';
          }
        });
      });
    } else if (type === 'sip') {
      bindMFAutocomplete('inv-fund-name', 'ac-sip-dd', function (item) {
        var nameInput = document.getElementById('inv-fund-name');
        if (nameInput) nameInput.value = item.name;
      });
    }
  }

  function bindStockAutocomplete() {
    var input = document.getElementById('inv-name');
    var dropdown = document.getElementById('ac-stock-dd');
    if (!input || !dropdown) return;

    var debounceTimer = null;
    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        if (q.length < 1) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }
        var results = window.StockDB.searchStocks(q);
        if (results.length === 0) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }

        var html = '';
        results.forEach(function (r) {
          html +=
            '<div class="ac-item" data-name="' + escAttr(r.name) + '" data-ticker="' + escAttr(r.ticker) + '" data-sector="' + escAttr(r.sector) + '" data-price="' + r.price + '">' +
              '<div class="ac-item-main">' +
                '<span class="ac-item-name">' + escHtml(r.name) + '</span>' +
                '<span class="ac-item-ticker">' + escHtml(r.ticker) + '</span>' +
              '</div>' +
              '<div class="ac-item-meta">' +
                '<span class="ac-item-sector">' + escHtml(r.sector) + '</span>' +
                '<span class="ac-item-price">₹' + r.price.toLocaleString('en-IN') + '</span>' +
              '</div>' +
            '</div>';
        });
        dropdown.innerHTML = html;
        dropdown.style.display = 'block';

        // Click on item
        dropdown.querySelectorAll('.ac-item').forEach(function (item) {
          item.addEventListener('click', function () {
            var selectedName = item.getAttribute('data-name');
            var selectedTicker = item.getAttribute('data-ticker');
            var selectedSector = item.getAttribute('data-sector');
            var fallbackPrice = item.getAttribute('data-price');

            input.value = selectedName;
            var tickerInput = document.getElementById('inv-ticker');
            if (tickerInput) tickerInput.value = selectedTicker;
            var sectorSelect = document.getElementById('inv-sector');
            if (sectorSelect) sectorSelect.value = selectedSector;

            dropdown.innerHTML = '';
            dropdown.style.display = 'none';

            // Show loading hint and fetch live price from Yahoo Finance
            var hint = document.getElementById('inv-price-hint');
            if (hint) {
              hint.style.display = 'block';
              hint.innerHTML =
                '<div class="yf-loading">' +
                  '<span class="yf-spinner"></span>' +
                  '<span style="color:var(--info);">Fetching live price from Yahoo Finance...</span>' +
                '</div>';
            }

            window.StockDB.fetchYahooPrice(selectedTicker, function (data) {
              var currentPriceInput = document.getElementById('inv-current-price');
              var buyPriceInput = document.getElementById('inv-buy-price');

              if (data) {
                // Fill in live prices
                if (currentPriceInput) currentPriceInput.value = data.price.toFixed(2);
                if (buyPriceInput && !buyPriceInput.value) buyPriceInput.value = data.price.toFixed(2);

                // Build rich price hint
                var changeSign = data.change >= 0 ? '+' : '';
                var changeColor = data.change >= 0 ? 'var(--success)' : 'var(--danger)';
                var marketIcon = data.marketState === 'REGULAR' ? '🟢' : '🔴';
                var marketLabel = data.marketState === 'REGULAR' ? 'Market Open' : 'Market Closed';

                if (hint) {
                  hint.innerHTML =
                    '<div class="yf-price-card">' +
                      '<div class="yf-price-row">' +
                        '<span class="yf-live-badge">' + marketIcon + ' Yahoo Finance · ' + marketLabel + '</span>' +
                      '</div>' +
                      '<div class="yf-price-row" style="margin-top:6px;">' +
                        '<span class="yf-price-main">₹' + data.price.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + '</span>' +
                        '<span class="yf-price-change" style="color:' + changeColor + ';">' +
                          changeSign + data.change.toFixed(2) + ' (' + changeSign + data.changePct.toFixed(2) + '%)' +
                        '</span>' +
                      '</div>' +
                      '<div class="yf-price-meta">' +
                        '<span>Day: ₹' + data.dayLow.toFixed(2) + ' – ₹' + data.dayHigh.toFixed(2) + '</span>' +
                        '<span>Prev Close: ₹' + data.previousClose.toFixed(2) + '</span>' +
                        (data.volume > 0 ? '<span>Vol: ' + formatVolume(data.volume) + '</span>' : '') +
                      '</div>' +
                    '</div>';
                }
              } else {
                // Fallback to static price
                if (currentPriceInput && !currentPriceInput.value) currentPriceInput.value = fallbackPrice;
                if (hint) {
                  hint.innerHTML =
                    '<span style="color:var(--warning);">⚠ Could not fetch live price. Using approximate: ₹' +
                    Number(fallbackPrice).toLocaleString('en-IN') + '</span>';
                }
              }
            });
          });
        });
      }, 150);
    });

    // Close on click outside
    document.addEventListener('click', function (e) {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });

    // Close on escape
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { dropdown.style.display = 'none'; }
    });

    // Date/Time change → fetch historical price from Yahoo
    var dateInput = document.getElementById('inv-date');
    var timeInput = document.getElementById('inv-time');

    function onDateTimeChange() {
      var ticker = getVal('inv-ticker');
      var date = dateInput ? dateInput.value : '';
      var time = timeInput ? timeInput.value : '';
      var today = new Date().toISOString().slice(0, 10);
      if (!ticker || !date) return;

      // If today's date, just refetch live price
      if (date === today && !time) return;

      var hint = document.getElementById('inv-price-hint');
      var timeLabel = time ? ' at ' + time : '';
      if (hint) {
        hint.style.display = 'block';
        hint.innerHTML =
          '<div class="yf-loading">' +
            '<span class="yf-spinner"></span>' +
            '<span style="color:var(--info);">Fetching price on ' + store.formatDate(date) + timeLabel + '...</span>' +
          '</div>';
      }

      window.StockDB.fetchYahooHistorical(ticker, date, time || null, function (data) {
        if (data && hint) {
          var buyPriceInput = document.getElementById('inv-buy-price');
          if (buyPriceInput) buyPriceInput.value = data.price.toFixed(2);

          var priceLabel = data.isIntraday
            ? 'price at ' + data.time + ' on ' + store.formatDate(data.date) + ' (5min candle)'
            : 'closing price on ' + store.formatDate(data.date);

          var intradayMeta = '';
          if (data.isIntraday && data.open != null) {
            intradayMeta =
              '<div class="yf-price-meta" style="margin-top:6px;">' +
                '<span>O: ₹' + data.open.toFixed(2) + '</span>' +
                '<span>H: ₹' + data.high.toFixed(2) + '</span>' +
                '<span>L: ₹' + data.low.toFixed(2) + '</span>' +
                '<span>C: ₹' + data.price.toFixed(2) + '</span>' +
              '</div>';
          }

          hint.innerHTML =
            '<div class="yf-price-card">' +
              '<div class="yf-price-row">' +
                '<span class="yf-live-badge">' + (data.isIntraday ? '⏱️' : '📅') + ' Yahoo Finance · ' + (data.isIntraday ? 'Intraday' : 'Historical') + ' Price</span>' +
              '</div>' +
              '<div class="yf-price-row" style="margin-top:4px;">' +
                '<span class="yf-price-main">₹' + data.price.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + '</span>' +
                '<span style="font-size:0.75rem;color:var(--text-muted);">' + priceLabel + '</span>' +
              '</div>' +
              intradayMeta +
            '</div>';
        } else if (hint) {
          hint.innerHTML = '<span style="color:var(--warning);">⚠ Price not available for this date/time</span>';
        }
      });
    }

    if (dateInput) dateInput.addEventListener('change', onDateTimeChange);
    if (timeInput) timeInput.addEventListener('change', onDateTimeChange);
  }

  function bindMFAutocomplete(inputId, dropdownId, onSelect) {
    var input = document.getElementById(inputId);
    var dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (q.length < 2) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }

      window.StockDB.searchMutualFunds(q, function (results) {
        if (results.length === 0) {
          dropdown.innerHTML = '<div class="ac-empty">No funds found for "' + escHtml(q) + '"</div>';
          dropdown.style.display = 'block';
          return;
        }

        var html = '';
        results.forEach(function (r) {
          html +=
            '<div class="ac-item ac-mf-item" data-name="' + escAttr(r.name) + '" data-code="' + r.schemeCode + '">' +
              '<span class="ac-item-name" style="font-size:0.82rem;">' + escHtml(r.name) + '</span>' +
            '</div>';
        });
        dropdown.innerHTML = html;
        dropdown.style.display = 'block';

        dropdown.querySelectorAll('.ac-item').forEach(function (item) {
          item.addEventListener('click', function () {
            onSelect({
              name: item.getAttribute('data-name'),
              schemeCode: item.getAttribute('data-code')
            });
            dropdown.innerHTML = '';
            dropdown.style.display = 'none';
          });
        });
      });
    });

    document.addEventListener('click', function (e) {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { dropdown.style.display = 'none'; }
    });
  }

  /* ════════════════════════════════════════════════════════════
   *  COLLECT FORM DATA
   * ════════════════════════════════════════════════════════════ */

  function collectFormData(type) {
    if (type === 'stock') {
      var name = getVal('inv-name');
      var qty = getVal('inv-qty');
      var buyPrice = getVal('inv-buy-price');
      if (!name || !qty || !buyPrice) {
        App.showToast('Please fill required fields (Name, Qty, Buy Price)', 'warning');
        return null;
      }
      return {
        name: name,
        ticker: getVal('inv-ticker'),
        sector: getVal('inv-sector'),
        quantity: Number(qty),
        buyPrice: Number(buyPrice),
        currentPrice: Number(getVal('inv-current-price')) || Number(buyPrice),
        buyDate: getVal('inv-date'),
        buyTime: getVal('inv-time'),
        notes: getVal('inv-notes')
      };
    }

    if (type === 'mutual_fund') {
      var mfName = getVal('inv-name');
      var units = getVal('inv-units');
      var navBuy = getVal('inv-nav-buy');
      if (!mfName || !units || !navBuy) {
        App.showToast('Please fill required fields (Fund Name, Units, NAV)', 'warning');
        return null;
      }
      return {
        name: mfName,
        category: getVal('inv-category'),
        units: Number(units),
        navAtBuy: Number(navBuy),
        currentNav: Number(getVal('inv-nav-current')) || Number(navBuy),
        buyDate: getVal('inv-date'),
        buyTime: getVal('inv-time'),
        notes: getVal('inv-notes')
      };
    }

    if (type === 'sip') {
      var fundName = getVal('inv-fund-name');
      var amount = getVal('inv-amount');
      if (!fundName || !amount) {
        App.showToast('Please fill required fields (Fund Name, SIP Amount)', 'warning');
        return null;
      }
      return {
        fundName: fundName,
        amount: Number(amount),
        frequency: getVal('inv-frequency'),
        sipDate: Number(getVal('inv-sip-date')) || 1,
        startDate: getVal('inv-start-date'),
        totalInvested: Number(getVal('inv-total-invested')) || 0,
        currentValue: Number(getVal('inv-current-value')) || 0,
        notes: getVal('inv-notes')
      };
    }

    return null;
  }

  /* ════════════════════════════════════════════════════════════
   *  UTILITIES
   * ════════════════════════════════════════════════════════════ */

  function getVal(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function escAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatVolume(vol) {
    if (vol >= 10000000) return (vol / 10000000).toFixed(2) + ' Cr';
    if (vol >= 100000) return (vol / 100000).toFixed(2) + ' L';
    if (vol >= 1000) return (vol / 1000).toFixed(1) + 'K';
    return String(vol);
  }

  function getNowTime() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  }

  /* ════════════════════════════════════════════════════════════
   *  PUBLIC API
   * ════════════════════════════════════════════════════════════ */

  window.InvestmentsView = { render: render };
})();
