/**
 * emis.js - Loans & EMIs Tracking & Calculator View Module
 * 
 * Provides:
 *  - Dynamic EMI Calculator with principal, interest, and tenure controls
 *  - Active Loan tracking dashboard with progress bars and quick payment triggers
 *  - Beautiful, dynamic Amortization Schedule breakdowns
 *  - Seamless database integration to log monthly payments as expenses
 */
(function() {
  'use strict';

  /* ──────────────────────────────────────────────
   *  Category Icons & Colors mapping
   * ────────────────────────────────────────────── */
  const LOAN_ICONS = {
    "Home Loan": "🏠",
    "Car Loan": "🚗",
    "Education Loan": "📚",
    "Personal Loan": "👤",
    "Consumer Durable (Gadgets)": "💻",
    "Other Loan": "📦"
  };

  const LOAN_CATEGORIES = [
    "Home Loan",
    "Car Loan",
    "Education Loan",
    "Personal Loan",
    "Consumer Durable (Gadgets)",
    "Other Loan"
  ];

  // Store selected loan ID for displaying its amortization schedule
  let selectedLoanId = null;

  /**
   * Calculate standard Equated Monthly Installment (EMI)
   * Formula: P * r * (1+r)^n / ((1+r)^n - 1)
   */
  function calculateEMI(principal, annualRate, tenureMonths) {
    if (principal <= 0 || tenureMonths <= 0) return 0;
    if (annualRate <= 0) return principal / tenureMonths;

    var r = (annualRate / 12) / 100;
    var emi = principal * r * Math.pow(1 + r, tenureMonths) / (Math.pow(1 + r, tenureMonths) - 1);
    return Math.round(emi * 100) / 100;
  }

  /**
   * Generates step-by-step amortization schedule list
   */
  function generateAmortizationSchedule(principal, annualRate, tenureMonths, emiAmount) {
    var schedule = [];
    var balance = principal;
    var monthlyRate = (annualRate / 12) / 100;

    for (var m = 1; m <= tenureMonths; m++) {
      var interest = monthlyRate > 0 ? balance * monthlyRate : 0;
      var principalPortion = emiAmount - interest;
      
      if (principalPortion > balance || m === tenureMonths) {
        principalPortion = balance;
        emiAmount = principalPortion + interest;
      }

      balance = balance - principalPortion;
      if (balance < 0) balance = 0;

      schedule.push({
        month: m,
        emi: Math.round(emiAmount * 100) / 100,
        principalPortion: Math.round(principalPortion * 100) / 100,
        interestPortion: Math.round(interest * 100) / 100,
        balance: Math.round(balance * 100) / 100
      });

      if (balance <= 0) break;
    }

    return schedule;
  }

  /* ──────────────────────────────────────────────
   *  Add/Edit Loan Modal Dialog
   * ────────────────────────────────────────────── */
  function openLoanModal(existing) {
    const isEdit = !!existing;
    const title = isEdit ? 'Edit Loan & EMI' : 'Track New Loan / Debt';
    const today = new Date().toISOString().slice(0, 10);

    App.showModal(`
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        
        <!-- Loan Name -->
        <div class="form-group">
          <label class="form-label" for="loan-name-input">Loan / Debt Name</label>
          <input type="text" id="loan-name-input" class="form-input" 
                 placeholder="e.g. HDFC Car Loan, MacBook Pro EMI" 
                 value="${existing ? existing.name : ''}">
        </div>

        <!-- Category & Date -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="loan-cat-select">Loan Category</label>
            <select id="loan-cat-select" class="form-select">
              ${LOAN_CATEGORIES.map(c => `
                <option value="${c}" ${existing && existing.category === c ? 'selected' : ''}>${c}</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="loan-date-input">Start Date</label>
            <input type="date" id="loan-date-input" class="form-input" 
                   value="${existing ? existing.startDate : today}">
          </div>
        </div>

        <!-- Principal Amount & Interest Rate -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="loan-principal-input">Principal Amount</label>
            <div class="premium-amount-wrapper">
              <span class="premium-amount-currency">₹</span>
              <input type="number" id="loan-principal-input" class="premium-amount-input" 
                     placeholder="0.00" min="0" step="1"
                     value="${existing ? existing.principal : ''}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="loan-rate-input">Annual Interest Rate (%)</label>
            <input type="number" id="loan-rate-input" class="form-input" 
                   placeholder="e.g. 7.5" min="0" step="0.01"
                   value="${existing ? existing.interestRate : ''}">
          </div>
        </div>

        <!-- Tenure & Due Day -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="loan-tenure-input">Tenure (Months)</label>
            <input type="number" id="loan-tenure-input" class="form-input" 
                   placeholder="e.g. 36" min="1" step="1"
                   value="${existing ? existing.tenureMonths : ''}">
          </div>
          <div class="form-group">
            <label class="form-label" for="loan-due-day-input">Monthly Due Day (1-28)</label>
            <input type="number" id="loan-due-day-input" class="form-input" 
                   placeholder="e.g. 5" min="1" max="28" step="1"
                   value="${existing ? existing.dueDate : '5'}">
          </div>
        </div>

        <!-- Pre-existing progress paid months -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="loan-paid-months-input">Installments Already Paid (Months)</label>
            <input type="number" id="loan-paid-months-input" class="form-input" 
                   placeholder="e.g. 0" min="0" step="1"
                   value="${existing ? existing.paidMonths : '0'}">
          </div>
          <div class="form-group">
            <label class="form-label" for="loan-emi-override-input">Monthly EMI Override (optional)</label>
            <input type="number" id="loan-emi-override-input" class="form-input" 
                   placeholder="Leave empty to auto-calculate" min="0" step="0.01"
                   value="${existing && existing.emiAmount ? existing.emiAmount : ''}">
          </div>
        </div>

      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
        <button class="btn btn-primary"   id="modal-save-btn">
          ${isEdit ? 'Update' : 'Save'}
        </button>
      </div>
    `);

    // Bind event listeners
    document.getElementById('modal-close-btn').addEventListener('click', () => App.hideModal());
    document.getElementById('modal-cancel-btn').addEventListener('click', () => App.hideModal());

    document.getElementById('modal-save-btn').addEventListener('click', () => {
      const name = document.getElementById('loan-name-input').value.trim();
      const category = document.getElementById('loan-cat-select').value;
      const startDate = document.getElementById('loan-date-input').value;
      const principal = parseFloat(document.getElementById('loan-principal-input').value);
      const interestRate = parseFloat(document.getElementById('loan-rate-input').value) || 0;
      const tenureMonths = parseInt(document.getElementById('loan-tenure-input').value, 10);
      const dueDate = parseInt(document.getElementById('loan-due-day-input').value, 10) || 5;
      const paidMonths = parseInt(document.getElementById('loan-paid-months-input').value, 10) || 0;
      const emiOverride = parseFloat(document.getElementById('loan-emi-override-input').value);

      if (!name) {
        App.showToast('Please enter a loan name', 'error');
        return;
      }
      if (isNaN(principal) || principal <= 0) {
        App.showToast('Please enter a valid principal amount', 'error');
        return;
      }
      if (isNaN(tenureMonths) || tenureMonths <= 0) {
        App.showToast('Please enter a valid tenure in months', 'error');
        return;
      }
      if (dueDate < 1 || dueDate > 28) {
        App.showToast('Please enter a due day between 1 and 28', 'error');
        return;
      }
      if (paidMonths < 0 || paidMonths > tenureMonths) {
        App.showToast('Paid installments cannot exceed total tenure months', 'error');
        return;
      }

      // Automatically calculate EMI if override is not provided
      let emiAmount = emiOverride;
      if (isNaN(emiAmount) || emiAmount <= 0) {
        emiAmount = calculateEMI(principal, interestRate, tenureMonths);
      }

      const loanData = {
        name,
        category,
        startDate,
        principal,
        interestRate,
        tenureMonths,
        dueDate,
        paidMonths,
        emiAmount,
        autoDeduct: false
      };

      if (isEdit) {
        FinanceStore.updateLoan(existing.id, loanData);
        App.showToast('Loan record updated', 'success');
      } else {
        FinanceStore.addLoan(loanData);
        App.showToast('Loan record saved to tracker!', 'success');
      }

      App.hideModal();
      render();
    });
  }

  /* ──────────────────────────────────────────────
   *  Main render
   * ────────────────────────────────────────────── */
  function render() {
    const container = document.getElementById('view-container');
    if (!container) return;

    const loans = FinanceStore.getLoans();

    // 1. Gather summaries
    let totalPrincipalLiability = 0;
    let totalMonthlyEMIBurden = 0;
    let totalEMIsPaidCount = 0;
    let totalEMIsRemainingCount = 0;

    loans.forEach(l => {
      totalPrincipalLiability += l.principal;
      totalMonthlyEMIBurden += l.emiAmount;
      totalEMIsPaidCount += l.paidMonths;
      totalEMIsRemainingCount += (l.tenureMonths - l.paidMonths);
    });

    // 2. Build Calculator HTML block
    const calcHTML = `
      <div class="card premium-emi-calculator">
        <div class="card-header">
          <div class="card-header-icon-title">
            <span class="card-header-emoji">🧮</span>
            <h3>Interactive EMI Calculator</h3>
          </div>
          <span class="card-subtitle">Estimate loan figures and interest break-downs in real-time</span>
        </div>
        <div class="card-body">
          <div class="emi-calc-grid">
            <div class="emi-calc-inputs">
              <!-- Slider 1: Loan Amount -->
              <div class="calculator-slider-group">
                <div class="slider-header">
                  <span class="slider-label">Loan Principal</span>
                  <div class="slider-value-box">
                    <span class="currency-label">₹</span>
                    <input type="number" id="calc-principal-num" class="slider-number-input" value="500000" min="5000" max="10000000" step="5000">
                  </div>
                </div>
                <input type="range" id="calc-principal-range" class="slider-range-input" min="5000" max="10000000" step="5000" value="500000">
              </div>

              <!-- Slider 2: Interest Rate -->
              <div class="calculator-slider-group">
                <div class="slider-header">
                  <span class="slider-label">Interest Rate (p.a.)</span>
                  <div class="slider-value-box">
                    <input type="number" id="calc-rate-num" class="slider-number-input" value="8.5" min="1" max="30" step="0.1">
                    <span class="percent-label">%</span>
                  </div>
                </div>
                <input type="range" id="calc-rate-range" class="slider-range-input" min="1" max="30" step="0.1" value="8.5">
              </div>

              <!-- Slider 3: Tenure Months -->
              <div class="calculator-slider-group">
                <div class="slider-header">
                  <span class="slider-label">Tenure Duration</span>
                  <div class="slider-value-box">
                    <input type="number" id="calc-tenure-num" class="slider-number-input" value="36" min="3" max="360" step="1">
                    <span class="tenure-label">Mo</span>
                  </div>
                </div>
                <input type="range" id="calc-tenure-range" class="slider-range-input" min="3" max="360" step="1" value="36">
              </div>

              <div class="calculator-actions mt-4">
                <button class="btn btn-secondary btn-sm" id="calc-reset-btn">Reset Calculator</button>
                <button class="btn btn-primary btn-sm" id="calc-save-loan-btn">+ Save as Active Loan</button>
              </div>
            </div>

            <!-- Output Visualizer Block -->
            <div class="emi-calc-outputs">
              <div class="emi-output-main">
                <span class="emi-output-label">Estimated Monthly EMI</span>
                <span class="emi-output-value text-indigo" id="calc-result-emi">₹15,780</span>
              </div>
              <div class="emi-output-stats">
                <div class="emi-output-stat-row">
                  <span class="output-stat-label">Principal Amount</span>
                  <span class="output-stat-value" id="calc-result-principal">₹5,00,000</span>
                </div>
                <div class="emi-output-stat-row">
                  <span class="output-stat-label">Total Interest Payable</span>
                  <span class="output-stat-value text-warning" id="calc-result-interest">₹68,084</span>
                </div>
                <div class="emi-output-stat-row">
                  <span class="output-stat-label">Total Outstanding Repayment</span>
                  <span class="output-stat-value text-success" id="calc-result-total">₹5,68,084</span>
                </div>
              </div>
              
              <!-- Quick Doughnut visual representation -->
              <div class="calc-ratio-bar">
                <div class="ratio-segment principal" id="calc-ratio-principal-bar" style="width: 88%"></div>
                <div class="ratio-segment interest" id="calc-ratio-interest-bar" style="width: 12%"></div>
              </div>
              <div class="ratio-legends">
                <span class="ratio-legend"><span class="color-dot principal"></span> Principal (<span id="calc-ratio-principal-text">88%</span>)</span>
                <span class="ratio-legend"><span class="color-dot interest"></span> Interest (<span id="calc-ratio-interest-text">12%</span>)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // 3. Build Loan Portfolio cards grid HTML
    let loansGridHTML = '';
    if (loans.length === 0) {
      loansGridHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 48px 24px;">
          <span class="empty-state-icon">💸</span>
          <p class="empty-state-text">No active loans or debt items saved.</p>
          <p class="empty-state-subtext">Use the calculator above or click "+ Track Loan" to log and track your debt amortization portfolios.</p>
        </div>
      `;
    } else {
      loansGridHTML = loans.map(l => {
        const pctPaid = Math.min(100, Math.round((l.paidMonths / l.tenureMonths) * 100));
        const formattedPrincipal = FinanceStore.formatCurrency(l.principal);
        const formattedEmi = FinanceStore.formatCurrency(l.emiAmount);
        
        // Calculate remaining liability based on amortization
        var sched = generateAmortizationSchedule(l.principal, l.interestRate, l.tenureMonths, l.emiAmount);
        var remainingPrincipal = l.principal;
        if (l.paidMonths > 0 && l.paidMonths <= sched.length) {
          remainingPrincipal = sched[l.paidMonths - 1].balance;
        } else if (l.paidMonths >= l.tenureMonths) {
          remainingPrincipal = 0;
        }
        
        const formattedRemaining = FinanceStore.formatCurrency(remainingPrincipal);
        const icon = LOAN_ICONS[l.category] || '📦';
        const isCompleted = l.paidMonths >= l.tenureMonths;
        const isSelected = selectedLoanId === l.id;

        return `
          <div class="loan-item-card fade-in ${isSelected ? 'selected' : ''}" data-id="${l.id}">
            <div class="loan-card-header">
              <div class="loan-card-title-block">
                <span class="loan-card-icon">${icon}</span>
                <div>
                  <h4 class="loan-card-title">${l.name}</h4>
                  <span class="badge-category">${l.category}</span>
                </div>
              </div>
              <div class="loan-card-rate-badge">${l.interestRate}% APR</div>
            </div>
            
            <div class="loan-card-kpi-grid">
              <div class="loan-kpi">
                <span class="loan-kpi-label">Original Loan</span>
                <span class="loan-kpi-value">${formattedPrincipal}</span>
              </div>
              <div class="loan-kpi">
                <span class="loan-kpi-label">Outstanding Principal</span>
                <span class="loan-kpi-value text-indigo">${formattedRemaining}</span>
              </div>
              <div class="loan-kpi">
                <span class="loan-kpi-label">Monthly EMI</span>
                <span class="loan-kpi-value text-rose">${formattedEmi}</span>
              </div>
            </div>

            <!-- Progress paid vs duration -->
            <div class="loan-progress-block">
              <div class="loan-progress-header">
                <span class="loan-progress-label">Installment Progress</span>
                <span class="loan-progress-value">${l.paidMonths}/${l.tenureMonths} Months Paid</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill blue" style="width: ${pctPaid}%"></div>
              </div>
              <span class="loan-progress-pct">${pctPaid}% Completed</span>
            </div>

            <div class="loan-card-footer mt-4">
              <div class="loan-card-due-day">Due: <strong>Day ${l.dueDate}</strong> each month</div>
              <div class="loan-card-actions">
                ${!isCompleted ? `
                  <button class="btn btn-primary btn-sm pay-emi-btn" data-id="${l.id}">Pay EMI</button>
                ` : `
                  <span class="badge badge-income" style="font-weight:600;">🎉 Fully Repaid</span>
                `}
                <button class="btn btn-secondary btn-icon edit-loan-btn" data-id="${l.id}" title="Edit Loan">✏️</button>
                <button class="btn btn-danger btn-icon delete-loan-btn" data-id="${l.id}" title="Delete Loan">&times;</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // 4. Build Amortization schedule HTML if loan selected
    let amortizationHTML = '';
    if (selectedLoanId) {
      const activeLoan = loans.find(l => l.id === selectedLoanId);
      if (activeLoan) {
        var scheduleList = generateAmortizationSchedule(activeLoan.principal, activeLoan.interestRate, activeLoan.tenureMonths, activeLoan.emiAmount);
        
        amortizationHTML = `
          <div class="card mt-4 fade-in amortization-schedule-card">
            <div class="card-header justify-between align-center">
              <div>
                <h3>Amortization Payment Schedule: ${activeLoan.name}</h3>
                <span class="card-subtitle">Granular month-by-month principal and interest allocation breakdown</span>
              </div>
              <button class="btn btn-secondary btn-sm" id="close-amortization-btn">Close Amortization</button>
            </div>
            <div class="card-body" style="padding: 0; max-height: 400px; overflow-y: auto;">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Installment (EMI)</th>
                    <th>Principal Paid</th>
                    <th>Interest Paid</th>
                    <th>Remaining Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${scheduleList.map(s => {
                    const isPaid = s.month <= activeLoan.paidMonths;
                    const statusClass = isPaid ? 'badge-income' : 'badge-inactive';
                    const statusText = isPaid ? 'Paid' : 'Pending';
                    return `
                      <tr class="${isPaid ? 'row-paid' : ''}" style="${isPaid ? 'opacity: 0.7;' : ''}">
                        <td><strong>Month ${s.month}</strong></td>
                        <td class="font-semibold">${FinanceStore.formatCurrency(s.emi)}</td>
                        <td class="amount-income">${FinanceStore.formatCurrency(s.principalPortion)}</td>
                        <td class="amount-expense">${FinanceStore.formatCurrency(s.interestPortion)}</td>
                        <td class="font-semibold">${FinanceStore.formatCurrency(s.balance)}</td>
                        <td><span class="badge ${statusClass}">${statusText}</span></td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }
    }

    // 5. Inject Layout template into container
    container.innerHTML = `
      <!-- Header row -->
      <div class="view-header">
        <div>
          <h1 class="view-title">Loans & EMIs Tracker</h1>
          <div class="view-subtitle-row">
            <span class="view-subtitle">Consolidate liabilities, simulate future loans, and track principal amortization</span>
          </div>
        </div>
        <div class="view-actions">
          <button class="btn btn-primary" id="add-loan-btn">
            <span class="btn-icon">+</span> Track New Loan
          </button>
        </div>
      </div>

      <!-- KPI Summary Row -->
      <div class="grid grid-4 mb-4">
        <div class="kpi-card balance">
          <div class="kpi-icon">🏛️</div>
          <div class="kpi-body">
            <span class="kpi-label">Active Principal Debt</span>
            <span class="kpi-value">${FinanceStore.formatCurrency(totalPrincipalLiability)}</span>
            <span class="kpi-change neutral">outstanding amount</span>
          </div>
        </div>
        <div class="kpi-card expense">
          <div class="kpi-icon">💸</div>
          <div class="kpi-body">
            <span class="kpi-label">Monthly EMI Burden</span>
            <span class="kpi-value text-rose">${FinanceStore.formatCurrency(totalMonthlyEMIBurden)}</span>
            <span class="kpi-change neutral">total monthly installments</span>
          </div>
        </div>
        <div class="kpi-card income">
          <div class="kpi-icon">✓</div>
          <div class="kpi-body">
            <span class="kpi-label">Installments Settled</span>
            <span class="kpi-value text-success">${totalEMIsPaidCount}</span>
            <span class="kpi-change neutral">total months logged</span>
          </div>
        </div>
        <div class="kpi-card savings">
          <div class="kpi-icon">⏳</div>
          <div class="kpi-body">
            <span class="kpi-label">Installments Pending</span>
            <span class="kpi-value text-warning">${totalEMIsRemainingCount}</span>
            <span class="kpi-change neutral">total months remaining</span>
          </div>
        </div>
      </div>

      <!-- Main Columns: Calculator Left, Loan Cards Right -->
      <div class="grid grid-1-2">
        ${calcHTML}
        
        <div class="card">
          <div class="card-header justify-between align-center">
            <div>
              <h3>Active Loans & Debts</h3>
              <span class="card-subtitle">Click card to view complete Amortization Payment Schedule</span>
            </div>
          </div>
          <div class="card-body" style="padding-top: 12px;">
            <div class="loans-vertical-list">
              ${loansGridHTML}
            </div>
          </div>
        </div>
      </div>

      <!-- Amortization Schedule Card -->
      ${amortizationHTML}
    `;

    /* ═══════════════════════════════════════════════════════════════
     *  EVENT LISTENERS & BINDINGS
     * ═══════════════════════════════════════════════════════════════ */

    // Track Loan trigger
    document.getElementById('add-loan-btn').addEventListener('click', () => openLoanModal(null));

    // Calculator state sync
    const principalNum = document.getElementById('calc-principal-num');
    const principalRange = document.getElementById('calc-principal-range');
    const rateNum = document.getElementById('calc-rate-num');
    const rateRange = document.getElementById('calc-rate-range');
    const tenureNum = document.getElementById('calc-tenure-num');
    const tenureRange = document.getElementById('calc-tenure-range');

    function syncCalculatorOutputs() {
      const P = parseFloat(principalNum.value) || 0;
      const R = parseFloat(rateNum.value) || 0;
      const N = parseInt(tenureNum.value, 10) || 0;

      const emi = calculateEMI(P, R, N);
      const totalRepay = emi * N;
      const totalInterest = Math.max(0, totalRepay - P);

      // Render outputs
      document.getElementById('calc-result-emi').textContent = FinanceStore.formatCurrency(emi);
      document.getElementById('calc-result-principal').textContent = FinanceStore.formatCurrency(P);
      document.getElementById('calc-result-interest').textContent = FinanceStore.formatCurrency(totalInterest);
      document.getElementById('calc-result-total').textContent = FinanceStore.formatCurrency(totalRepay);

      // Render Ratio segment percentages
      const interestPct = totalRepay > 0 ? Math.round((totalInterest / totalRepay) * 100) : 0;
      const principalPct = 100 - interestPct;

      const principalBar = document.getElementById('calc-ratio-principal-bar');
      const interestBar = document.getElementById('calc-ratio-interest-bar');
      if (principalBar && interestBar) {
        principalBar.style.width = principalPct + '%';
        interestBar.style.width = interestPct + '%';
        document.getElementById('calc-ratio-principal-text').textContent = principalPct + '%';
        document.getElementById('calc-ratio-interest-text').textContent = interestPct + '%';
      }
    }

    function wireSliderSync(numInput, rangeInput) {
      numInput.addEventListener('input', () => {
        rangeInput.value = numInput.value;
        syncCalculatorOutputs();
      });
      rangeInput.addEventListener('input', () => {
        numInput.value = rangeInput.value;
        syncCalculatorOutputs();
      });
    }

    wireSliderSync(principalNum, principalRange);
    wireSliderSync(rateNum, rateRange);
    wireSliderSync(tenureNum, tenureRange);

    // Initial sync
    syncCalculatorOutputs();

    // Reset Calculator
    document.getElementById('calc-reset-btn').addEventListener('click', () => {
      principalNum.value = 500000;
      principalRange.value = 500000;
      rateNum.value = 8.5;
      rateRange.value = 8.5;
      tenureNum.value = 36;
      tenureRange.value = 36;
      syncCalculatorOutputs();
    });

    // Save loan directly from calculator
    document.getElementById('calc-save-loan-btn').addEventListener('click', () => {
      const P = parseFloat(principalNum.value) || 0;
      const R = parseFloat(rateNum.value) || 0;
      const N = parseInt(tenureNum.value, 10) || 0;
      const emi = calculateEMI(P, R, N);

      openLoanModal({
        name: 'Simulated Loan',
        principal: P,
        interestRate: R,
        tenureMonths: N,
        emiAmount: emi,
        dueDate: 5,
        paidMonths: 0,
        category: 'Other Loan'
      });
    });

    // Card Selection & Actions delegation inside active lists
    const cardContainers = container.querySelectorAll('.loan-item-card');
    cardContainers.forEach(card => {
      card.addEventListener('click', (e) => {
        // Exclude button clicks from card toggle selection
        if (e.target.closest('button') || e.target.closest('span.badge')) return;

        const id = card.dataset.id;
        selectedLoanId = (selectedLoanId === id) ? null : id; // toggle
        render(); // update view showing schedule
      });
    });

    // Action buttons inside cards
    const payBtns = container.querySelectorAll('.pay-emi-btn');
    payBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const found = loans.find(l => l.id === id);
        if (!found) return;

        App.confirm(`Pay EMI installment of <strong>${FinanceStore.formatCurrency(found.emiAmount)}</strong> for <strong>${found.name}</strong>?`)
          .then(confirmed => {
            if (confirmed) {
              const ok = FinanceStore.payLoanEMI(id);
              if (ok) {
                App.showToast(`EMI payment of ${FinanceStore.formatCurrency(found.emiAmount)} recorded!`, 'success');
                render();
              } else {
                App.showToast('Payment failed or loan fully repaid!', 'error');
              }
            }
          });
      });
    });

    const editBtns = container.querySelectorAll('.edit-loan-btn');
    editBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const found = loans.find(l => l.id === id);
        if (found) openLoanModal(found);
      });
    });

    const deleteBtns = container.querySelectorAll('.delete-loan-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        App.confirm('Are you sure you want to delete this loan from tracker? this does not remove its payment records.').then(confirmed => {
          if (confirmed) {
            FinanceStore.deleteLoan(id);
            App.showToast('Loan record removed.', 'info');
            if (selectedLoanId === id) selectedLoanId = null;
            render();
          }
        });
      });
    });

    // Close Amortization schedule
    const closeAmortBtn = document.getElementById('close-amortization-btn');
    if (closeAmortBtn) {
      closeAmortBtn.addEventListener('click', () => {
        selectedLoanId = null;
        render();
      });
    }
  }

  // Expose View public API
  window.EmisView = {
    render: render
  };
})();
