/**
 * analytics.js - Advanced Analytics View Module
 * 
 * Displays monthly trend lines, category breakdowns (doughnut),
 * top spending categories (horizontal bar), daily spending bars,
 * and a monthly summary table. All charts respond to date-range
 * quick-select buttons.
 */
(function() {
  'use strict';

  /** Number of months to show — driven by quick-select buttons */
  let monthsRange = 6;

  /* ─────────────────────────────────────────
   *  Render
   * ───────────────────────────────────────── */
  function render() {
    const container = document.getElementById('view-container');
    const now       = new Date();
    const curYear   = now.getFullYear();

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Analytics</h1>
          <p class="view-subtitle">Deep dive into your financial data</p>
        </div>
        <div class="view-actions analytics-range-btns">
          <button class="btn btn-sm ${monthsRange===3  ? 'btn-primary' : 'btn-secondary'}" data-months="3">3 Months</button>
          <button class="btn btn-sm ${monthsRange===6  ? 'btn-primary' : 'btn-secondary'}" data-months="6">6 Months</button>
          <button class="btn btn-sm ${monthsRange===12 ? 'btn-primary' : 'btn-secondary'}" data-months="12">12 Months</button>
          <button class="btn btn-sm ${monthsRange===-1 ? 'btn-primary' : 'btn-secondary'}" data-months="-1">This Year</button>
        </div>
      </div>

      <!-- Monthly Trend -->
      <div class="card">
        <div class="card-header"><h3>Monthly Trend</h3></div>
        <div class="card-body chart-container chart-lg">
          <canvas id="chart-monthly-trend"></canvas>
        </div>
      </div>

      <!-- Category Breakdowns -->
      <div class="grid grid-2">
        <div class="card">
          <div class="card-header"><h3>Expense Breakdown</h3></div>
          <div class="card-body chart-container">
            <canvas id="chart-expense-breakdown"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Income Breakdown</h3></div>
          <div class="card-body chart-container">
            <canvas id="chart-income-breakdown"></canvas>
          </div>
        </div>
      </div>

      <!-- Top Spending Categories -->
      <div class="card">
        <div class="card-header"><h3>Top Spending Categories</h3></div>
        <div class="card-body chart-container chart-lg">
          <canvas id="chart-top-spending"></canvas>
        </div>
      </div>

      <!-- Daily Spending -->
      <div class="card">
        <div class="card-header">
          <h3>Daily Spending</h3>
          <span class="card-subtitle">${now.toLocaleString('default',{month:'long',year:'numeric'})}</span>
        </div>
        <div class="card-body chart-container chart-lg">
          <canvas id="chart-daily-spending"></canvas>
        </div>
      </div>

      <!-- Monthly Summary Table -->
      <div class="card table-card">
        <div class="card-header"><h3>Monthly Summary</h3></div>
        <div class="table-responsive">
          <table class="data-table" id="analytics-summary-table">
            <thead>
              <tr>
                <th>Month</th><th>Income</th><th>Expenses</th>
                <th>Net</th><th>Savings Rate</th>
              </tr>
            </thead>
            <tbody id="analytics-summary-body"></tbody>
          </table>
        </div>
      </div>
    `;

    /* ── Compute effective months count ── */
    let effectiveMonths = monthsRange;
    if (monthsRange === -1) {
      // "This Year" — months from January to current month
      effectiveMonths = now.getMonth() + 1;
    }

    /* ── Gather data ── */
    const monthlyTotals = FinanceStore.getMonthlyTotals(effectiveMonths) || [];

    /* ── Monthly Trend (line chart) ── */
    if (monthlyTotals.length > 0) {
      const labels   = monthlyTotals.map(m => {
        const d = new Date(m.month + '-01');
        return d.toLocaleString('default', { month: 'short', year: '2-digit' });
      });
      FinanceCharts.lineChart('chart-monthly-trend', {
        labels,
        datasets: [
          { label: 'Income',   data: monthlyTotals.map(m => m.income),  color: '#10b981' },
          { label: 'Expenses', data: monthlyTotals.map(m => m.expense), color: '#ef4444' }
        ],
        yPrefix: '₹'
      });
    }

    /* ── Category breakdowns ── */
    // Aggregate categories across the selected date range
    const rangeMonths = monthlyTotals.map(m => m.month);

    // Helper: aggregate getCategoryTotals across multiple months
    function aggregateCategories(type) {
      const agg = {};
      rangeMonths.forEach(month => {
        const totals = FinanceStore.getCategoryTotals(month, type) || [];
        totals.forEach(item => {
          agg[item.category] = (agg[item.category] || 0) + item.total;
        });
      });
      return agg;
    }

    const expenseAgg = aggregateCategories('expense');
    const incomeAgg  = aggregateCategories('income');

    // Expense doughnut
    const expLabels = Object.keys(expenseAgg).filter(c => expenseAgg[c] > 0);
    const expData   = expLabels.map(c => expenseAgg[c]);
    const expColors = expLabels.map(c => (FinanceStore.CATEGORY_COLORS && FinanceStore.CATEGORY_COLORS[c]) || '#6c63ff');
    const expTotal  = expData.reduce((s, v) => s + v, 0);
    if (expLabels.length > 0) {
      FinanceCharts.doughnutChart('chart-expense-breakdown', {
        labels: expLabels, data: expData, colors: expColors,
        centerText: FinanceStore.formatCurrency(expTotal)
      });
    }

    // Income doughnut
    const incLabels = Object.keys(incomeAgg).filter(c => incomeAgg[c] > 0);
    const incData   = incLabels.map(c => incomeAgg[c]);
    const incColors = incLabels.map(c => (FinanceStore.CATEGORY_COLORS && FinanceStore.CATEGORY_COLORS[c]) || '#10b981');
    const incTotal  = incData.reduce((s, v) => s + v, 0);
    if (incLabels.length > 0) {
      FinanceCharts.doughnutChart('chart-income-breakdown', {
        labels: incLabels, data: incData, colors: incColors,
        centerText: FinanceStore.formatCurrency(incTotal)
      });
    }

    /* ── Top Spending Categories (horizontal bar) ── */
    const sortedExp = Object.entries(expenseAgg)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    if (sortedExp.length > 0) {
      const topLabels = sortedExp.map(([c]) => c);
      const topData   = sortedExp.map(([, v]) => v);
      const topColors = topLabels.map(c => (FinanceStore.CATEGORY_COLORS && FinanceStore.CATEGORY_COLORS[c]) || '#6c63ff');
      FinanceCharts.horizontalBarChart('chart-top-spending', {
        labels: topLabels, data: topData, colors: topColors, xPrefix: '₹'
      });
    }

    /* ── Daily Spending (current month bar chart) ── */
    const dailyData = FinanceStore.getDailySpending() || [];
    const currentMonth = FinanceStore.getCurrentMonth();
    const daysInMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const todayDate    = now.getDate();

    const dayLabels = [];
    const dayAmounts = [];
    const dayColors = [];
    for (let d = 1; d <= daysInMonth; d++) {
      dayLabels.push(String(d));
      const dayObj = dailyData.find(item => item.day === d);
      dayAmounts.push(dayObj ? dayObj.total : 0);
      dayColors.push(d === todayDate ? '#6c63ff' : '#94a3b8');
    }
    if (dayLabels.length > 0) {
      FinanceCharts.barChart('chart-daily-spending', {
        labels: dayLabels,
        datasets: [{ label: 'Spending', data: dayAmounts, color: '#ef4444' }],
        yPrefix: '₹'
      });
    }

    /* ── Monthly Summary Table ── */
    const tbody = document.getElementById('analytics-summary-body');
    if (monthlyTotals.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state-cell">No data available.</td></tr>';
    } else {
      tbody.innerHTML = monthlyTotals.map(m => {
        const net  = m.income - m.expense;
        const rate = m.income > 0 ? Math.round(((m.income - m.expense) / m.income) * 100) : 0;
        const netClass  = net >= 0 ? 'amount-income' : 'amount-expense';
        const rateClass = rate >= 30 ? 'badge-success' : rate >= 10 ? 'badge-warning' : 'badge-danger';
        const mDate = new Date(m.month + '-01');
        const mLabel = mDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        return `
          <tr>
            <td>${mLabel}</td>
            <td class="amount-income">+${FinanceStore.formatCurrency(m.income)}</td>
            <td class="amount-expense">-${FinanceStore.formatCurrency(m.expense)}</td>
            <td class="${netClass}">${net >= 0 ? '+' : '-'}${FinanceStore.formatCurrency(Math.abs(net))}</td>
            <td><span class="badge ${rateClass}">${rate}%</span></td>
          </tr>`;
      }).join('');
    }

    /* ── Range button events ── */
    container.querySelectorAll('.analytics-range-btns .btn').forEach(btn => {
      btn.addEventListener('click', () => {
        monthsRange = parseInt(btn.dataset.months);
        render();
      });
    });
  }

  window.AnalyticsView = { render };
})();
