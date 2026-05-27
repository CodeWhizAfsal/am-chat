/**
 * budgets.js - Budget Management View Module
 * 
 * Displays per-category budget cards with progress bars,
 * overview totals, month selector, add/edit/delete budget modals,
 * and an unbudgeted-spending section.
 */
(function() {
  'use strict';

  const CATEGORY_ICONS = {
    "Salary": "💼", "Freelance": "💻", "Investments": "📊",
    "Business": "🏢", "Gifts": "🎁", "Other Income": "💵",
    "Food & Dining": "🍔", "Transport": "🚗", "Shopping": "🛍️",
    "Entertainment": "🎬", "Bills & Utilities": "💡", "Health": "🏥",
    "Education": "📚", "Rent": "🏠", "Travel": "✈️",
    "Subscriptions": "🔄", "Other": "📦"
  };

  /** Currently selected month in YYYY-MM format */
  let selectedMonth = FinanceStore.getCurrentMonth();

  /* ─────────────────────────────────────────
   *  Open Add / Edit Budget Modal
   * ───────────────────────────────────────── */
  function openBudgetModal(existing) {
    const isEdit = !!existing;
    const title  = isEdit ? 'Edit Budget' : 'Set Budget';

    /* Build category options:
       For new budgets only show expense categories that don't
       already have a budget in the selected month. */
    const currentBudgets = FinanceStore.getBudgets(selectedMonth);
    const usedCategories = currentBudgets.map(b => b.category);

    let availableCategories;
    if (isEdit) {
      availableCategories = FinanceStore.EXPENSE_CATEGORIES;
    } else {
      availableCategories = FinanceStore.EXPENSE_CATEGORIES.filter(c => !usedCategories.includes(c));
    }

    if (!isEdit && availableCategories.length === 0) {
      App.showToast('All expense categories already have a budget for this month.', 'info');
      return;
    }

    App.showModal(`
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <!-- Category Grid Selector -->
        <div class="form-group">
          <label class="form-label">Category</label>
          <div class="category-selector-wrapper">
            <input type="hidden" id="budget-category" value="${existing ? existing.category : availableCategories[0]}">
            <div class="category-grid" id="budget-category-grid" style="${isEdit ? 'pointer-events: none; opacity: 0.6;' : ''}">
              ${availableCategories.map(c => {
                const active = existing ? existing.category === c : availableCategories[0] === c;
                const icon = CATEGORY_ICONS[c] || '📦';
                return `
                  <div class="category-grid-item ${active ? 'active' : ''}" data-category="${c}">
                    <span class="cat-grid-icon">${icon}</span>
                    <span class="cat-grid-label">${c}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="budget-limit">Monthly Limit</label>
          <div class="premium-amount-wrapper">
            <span class="premium-amount-currency">₹</span>
            <input type="number" id="budget-limit" class="premium-amount-input"
                   placeholder="e.g. 5000" min="1" step="1"
                   value="${existing ? existing.limit : ''}">
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

    document.getElementById('modal-close-btn').addEventListener('click', () => App.hideModal());
    document.getElementById('modal-cancel-btn').addEventListener('click', () => App.hideModal());

    if (!isEdit) {
      const grid = document.getElementById('budget-category-grid');
      grid.addEventListener('click', (e) => {
        const item = e.target.closest('.category-grid-item');
        if (!item) return;
        grid.querySelectorAll('.category-grid-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        document.getElementById('budget-category').value = item.dataset.category;
      });
    }

    document.getElementById('modal-save-btn').addEventListener('click', () => {
      const category = document.getElementById('budget-category').value;
      const limit    = parseFloat(document.getElementById('budget-limit').value);

      if (!category) { App.showToast('Please select a category', 'error'); return; }
      if (!limit || limit <= 0) { App.showToast('Please enter a valid limit', 'error'); return; }

      if (isEdit) {
        FinanceStore.setBudget(category, limit, selectedMonth);
        App.showToast('Budget updated', 'success');
      } else {
        FinanceStore.setBudget(category, limit, selectedMonth);
        App.showToast('Budget created', 'success');
      }

      App.hideModal();
      render();
    });
  }

  /* ─────────────────────────────────────────
   *  Delete budget with confirmation
   * ───────────────────────────────────────── */
  async function deleteBudget(id) {
    const yes = await App.confirm('Delete this budget?');
    if (!yes) return;
    FinanceStore.deleteBudget(id);
    App.showToast('Budget deleted', 'success');
    render();
  }

  /* ─────────────────────────────────────────
   *  Render
   * ───────────────────────────────────────── */
  function render() {
    const container = document.getElementById('view-container');
    const budgets   = FinanceStore.getBudgets(selectedMonth);

    /* Overview totals */
    let totalBudget = 0;
    let totalSpent  = 0;
    const budgetItems = budgets.map(b => {
      const spent = FinanceStore.getBudgetSpending(b.category, selectedMonth) || 0;
      totalBudget += b.limit;
      totalSpent  += spent;
      const pct   = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
      return { ...b, spent, pct };
    });
    const remaining = totalBudget - totalSpent;

    /* Budget cards HTML */
    let budgetListHTML = '';
    if (budgetItems.length === 0) {
      budgetListHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <h3>No Budgets Set</h3>
          <p>Set budgets for your expense categories to track your spending.</p>
        </div>`;
    } else {
      budgetListHTML = budgetItems.map(b => {
        const status = b.pct > 100 ? 'red' : b.pct > 90 ? 'red' : b.pct > 70 ? 'yellow' : 'green';
        const colorDot = (FinanceStore.CATEGORY_COLORS && FinanceStore.CATEGORY_COLORS[b.category]) || '#6c63ff';
        let alertHTML = '';
        if (b.pct > 100) {
          alertHTML = '<span class="budget-alert danger">🚨 Over budget!</span>';
        } else if (b.pct > 80) {
          alertHTML = '<span class="budget-alert warning">⚠ Approaching limit</span>';
        }
        return `
          <div class="budget-item card">
            <div class="budget-item-header">
              <div class="budget-cat-label">
                <span class="color-dot" style="background:${colorDot}"></span>
                <span class="budget-cat-name">${b.category}</span>
              </div>
              <div class="budget-item-actions">
                <button class="btn-icon-sm edit-budget-btn" data-id="${b.id}" data-cat="${b.category}" data-limit="${b.limit}" title="Edit">✏️</button>
                <button class="btn-icon-sm delete-budget-btn" data-id="${b.id}" title="Delete">🗑️</button>
              </div>
            </div>
            <div class="budget-item-body">
              <div class="budget-spent-info">
                <span>${FinanceStore.formatCurrency(b.spent)} / ${FinanceStore.formatCurrency(b.limit)}</span>
                <span class="budget-pct ${status}">${b.pct}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill ${status}" style="width:${Math.min(b.pct, 100)}%"></div>
              </div>
              ${alertHTML}
            </div>
          </div>`;
      }).join('');
    }

    /* Unbudgeted spending */
    const catTotals = FinanceStore.getCategoryTotals(selectedMonth, 'expense');
    const budgetedCats = budgets.map(b => b.category);
    const unbudgetedEntries = Object.entries(catTotals || {})
      .filter(([cat]) => !budgetedCats.includes(cat))
      .filter(([, amt]) => amt > 0);

    let unbudgetedHTML = '';
    if (unbudgetedEntries.length > 0) {
      const rows = unbudgetedEntries.map(([cat, amt]) => `
        <div class="unbudgeted-item">
          <span class="unbudgeted-cat">${cat}</span>
          <span class="unbudgeted-amount amount-expense">${FinanceStore.formatCurrency(amt)}</span>
        </div>`).join('');
      unbudgetedHTML = `
        <div class="card">
          <div class="card-header">
            <h3>Unbudgeted Spending</h3>
            <span class="card-subtitle">Categories with expenses but no budget</span>
          </div>
          <div class="card-body">${rows}</div>
        </div>`;
    }

    /* Month label */
    const monthDate = new Date(selectedMonth + '-01');
    const monthLabel = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Budgets</h1>
          <p class="view-subtitle">Manage your spending limits for ${monthLabel}</p>
        </div>
        <div class="view-actions">
          <input type="month" id="budget-month-picker" class="form-input" value="${selectedMonth}">
          <button class="btn btn-primary" id="budget-add-btn">
            <span class="btn-icon">+</span> Set Budget
          </button>
        </div>
      </div>

      <!-- Overview Cards -->
      <div class="grid grid-3">
        <div class="kpi-card">
          <div class="kpi-icon">📊</div>
          <div class="kpi-body">
            <span class="kpi-label">Total Budget</span>
            <span class="kpi-value">${FinanceStore.formatCurrency(totalBudget)}</span>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-icon">💸</div>
          <div class="kpi-body">
            <span class="kpi-label">Total Spent</span>
            <span class="kpi-value">${FinanceStore.formatCurrency(totalSpent)}</span>
          </div>
        </div>
        <div class="kpi-card ${remaining >= 0 ? '' : 'over-budget'}">
          <div class="kpi-icon">${remaining >= 0 ? '✅' : '🚨'}</div>
          <div class="kpi-body">
            <span class="kpi-label">Remaining</span>
            <span class="kpi-value ${remaining >= 0 ? 'amount-income' : 'amount-expense'}">
              ${FinanceStore.formatCurrency(Math.abs(remaining))}
            </span>
          </div>
        </div>
      </div>

      <!-- Budget List -->
      <div class="budget-list">${budgetListHTML}</div>

      <!-- Unbudgeted Spending -->
      ${unbudgetedHTML}
    `;

    /* ── Bind events ── */

    // Month picker
    document.getElementById('budget-month-picker').addEventListener('change', (e) => {
      selectedMonth = e.target.value;
      render();
    });

    // Add budget
    document.getElementById('budget-add-btn').addEventListener('click', () => openBudgetModal(null));

    // Edit budget buttons
    container.querySelectorAll('.edit-budget-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openBudgetModal({
          id: btn.dataset.id,
          category: btn.dataset.cat,
          limit: parseFloat(btn.dataset.limit)
        });
      });
    });

    // Delete budget buttons
    container.querySelectorAll('.delete-budget-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteBudget(btn.dataset.id));
    });
  }

  window.BudgetsView = { render };
})();
