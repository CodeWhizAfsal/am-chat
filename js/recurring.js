/**
 * recurring.js - Recurring Transaction Management View Module
 * 
 * Displays overview KPI cards (active count, monthly income,
 * monthly expenses), a list of recurring items as card rows
 * with active/inactive toggles, and add/edit/delete modals.
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

  /* ─────────────────────────────────────────
   *  Frequency helpers
   * ───────────────────────────────────────── */
  const FREQUENCY_OPTIONS = ['Daily', 'Weekly', 'Monthly', 'Yearly'];

  /** Convert any frequency amount to its monthly equivalent. */
  function toMonthly(amount, frequency) {
    switch (frequency) {
      case 'Daily':   return amount * 30;
      case 'Weekly':  return amount * 4.33;
      case 'Monthly': return amount;
      case 'Yearly':  return amount / 12;
      default:        return amount;
    }
  }

  /** Badge colour class for frequency labels. */
  function frequencyBadgeClass(freq) {
    switch (freq) {
      case 'Daily':   return 'badge-daily';
      case 'Weekly':  return 'badge-weekly';
      case 'Monthly': return 'badge-monthly';
      case 'Yearly':  return 'badge-yearly';
      default:        return '';
    }
  }

  /* ─────────────────────────────────────────
   *  Open Add / Edit Recurring Modal
   * ───────────────────────────────────────── */
  function openModal(existing) {
    const isEdit = !!existing;
    const title  = isEdit ? 'Edit Recurring Transaction' : 'Add Recurring Transaction';
    const type   = existing ? existing.type : 'expense';
    const cats   = type === 'income'
      ? FinanceStore.INCOME_CATEGORIES
      : FinanceStore.EXPENSE_CATEGORIES;

    const freqOpts = FREQUENCY_OPTIONS.map(f =>
      `<option value="${f}" ${existing && existing.frequency === f ? 'selected' : ''}>${f}</option>`
    ).join('');

    const today = new Date().toISOString().slice(0, 10);

    App.showModal(`
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <!-- Type toggle -->
        <div class="form-group">
          <label class="form-label">Type</label>
          <div class="segmented-control" id="rec-type-toggle">
            <button class="seg-btn ${type === 'income'  ? 'active' : ''}" data-type="income">Income</button>
            <button class="seg-btn ${type === 'expense' ? 'active' : ''}" data-type="expense">Expense</button>
          </div>
        </div>

        <!-- Amount -->
        <div class="form-group">
          <label class="form-label" for="rec-amount">Amount</label>
          <div class="premium-amount-wrapper">
            <span class="premium-amount-currency">₹</span>
            <input type="number" id="rec-amount" class="premium-amount-input"
                   placeholder="0.00" min="0" step="0.01"
                   value="${existing ? existing.amount : ''}">
          </div>
        </div>

        <!-- Category Grid -->
        <div class="form-group">
          <label class="form-label">Select Category</label>
          <div class="category-selector-wrapper">
            <input type="hidden" id="rec-category" value="${existing ? existing.category : cats[0]}">
            <div class="category-grid" id="rec-category-grid">
              ${cats.map(c => {
                const active = existing ? existing.category === c : cats[0] === c;
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

        <!-- Description -->
        <div class="form-group">
          <label class="form-label" for="rec-desc">Description</label>
          <input type="text" id="rec-desc" class="form-input" placeholder="e.g. Monthly rent"
                 value="${existing ? existing.description : ''}">
        </div>

        <div class="form-row">
          <!-- Frequency -->
          <div class="form-group">
            <label class="form-label" for="rec-frequency">Frequency</label>
            <select id="rec-frequency" class="form-select">${freqOpts}</select>
          </div>
          <!-- Next Date -->
          <div class="form-group">
            <label class="form-label" for="rec-next-date">${isEdit ? 'Next Occurrence' : 'Start Date'}</label>
            <input type="date" id="rec-next-date" class="form-input"
                   value="${existing ? existing.nextDate : today}">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
        <button class="btn btn-primary"   id="modal-save-btn">${isEdit ? 'Update' : 'Save'}</button>
      </div>
    `);

    // Close / Cancel
    document.getElementById('modal-close-btn').addEventListener('click', () => App.hideModal());
    document.getElementById('modal-cancel-btn').addEventListener('click', () => App.hideModal());

    // Category Grid Selection
    const grid = document.getElementById('rec-category-grid');
    grid.addEventListener('click', (e) => {
      const item = e.target.closest('.category-grid-item');
      if (!item) return;
      grid.querySelectorAll('.category-grid-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('rec-category').value = item.dataset.category;
    });

    // Type toggle → swap category options
    document.getElementById('rec-type-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      document.querySelectorAll('#rec-type-toggle .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const newType = btn.dataset.type;
      const newCats = newType === 'income'
        ? FinanceStore.INCOME_CATEGORIES
        : FinanceStore.EXPENSE_CATEGORIES;
      
      const hiddenInput = document.getElementById('rec-category');
      hiddenInput.value = newCats[0];
      
      grid.innerHTML = newCats.map(c => {
        const active = newCats[0] === c;
        const icon = CATEGORY_ICONS[c] || '📦';
        return `
          <div class="category-grid-item ${active ? 'active' : ''}" data-category="${c}">
            <span class="cat-grid-icon">${icon}</span>
            <span class="cat-grid-label">${c}</span>
          </div>
        `;
      }).join('');
    });

    // Save
    document.getElementById('modal-save-btn').addEventListener('click', () => {
      const activeBtn = document.querySelector('#rec-type-toggle .seg-btn.active');
      const txnType   = activeBtn ? activeBtn.dataset.type : 'expense';
      const amount    = parseFloat(document.getElementById('rec-amount').value);
      const category  = document.getElementById('rec-category').value;
      const desc      = document.getElementById('rec-desc').value.trim();
      const frequency = document.getElementById('rec-frequency').value;
      const nextDate  = document.getElementById('rec-next-date').value;

      if (!amount || amount <= 0) { App.showToast('Please enter a valid amount', 'error'); return; }
      if (!desc)                  { App.showToast('Please enter a description', 'error');  return; }
      if (!nextDate)              { App.showToast('Please select a date', 'error');         return; }

      const data = {
        type: txnType, amount, category, description: desc,
        frequency, nextDate, active: existing ? existing.active : true
      };

      if (isEdit) {
        FinanceStore.updateRecurring(existing.id, data);
        App.showToast('Recurring transaction updated', 'success');
      } else {
        FinanceStore.addRecurring(data);
        App.showToast('Recurring transaction created', 'success');
      }

      App.hideModal();
      render();
    });
  }

  /* ─────────────────────────────────────────
   *  Toggle active state
   * ───────────────────────────────────────── */
  function toggleActive(item) {
    FinanceStore.updateRecurring(item.id, { active: !item.active });
    App.showToast(
      item.active ? 'Recurring transaction paused' : 'Recurring transaction activated',
      'success'
    );
    render();
  }

  /* ─────────────────────────────────────────
   *  Delete with confirmation
   * ───────────────────────────────────────── */
  async function deleteRecurring(id) {
    const yes = await App.confirm('Are you sure you want to delete this recurring transaction?');
    if (!yes) return;
    FinanceStore.deleteRecurring(id);
    App.showToast('Recurring transaction deleted', 'success');
    render();
  }

  /* ─────────────────────────────────────────
   *  Render
   * ───────────────────────────────────────── */
  function render() {
    const container = document.getElementById('view-container');
    const items     = FinanceStore.getRecurring() || [];

    /* KPI calculations */
    const activeItems    = items.filter(i => i.active);
    const activeCount    = activeItems.length;
    const monthlyIncome  = activeItems
      .filter(i => i.type === 'income')
      .reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
    const monthlyExpense = activeItems
      .filter(i => i.type === 'expense')
      .reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);

    /* List HTML */
    let listHTML = '';
    if (items.length === 0) {
      listHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔄</div>
          <h3>No Recurring Transactions</h3>
          <p>Set up recurring transactions for bills, subscriptions, and regular income.</p>
          <button class="btn btn-primary" id="empty-add-rec">Add Recurring</button>
        </div>`;
    } else {
      listHTML = items.map(item => {
        const typeBadge = item.type === 'income'
          ? '<span class="badge badge-income">Income</span>'
          : '<span class="badge badge-expense">Expense</span>';
        const freqBadge = `<span class="badge ${frequencyBadgeClass(item.frequency)}">${item.frequency}</span>`;
        const amtClass  = item.type === 'income' ? 'amount-income' : 'amount-expense';
        const prefix    = item.type === 'income' ? '+' : '-';
        const nextLabel = item.nextDate ? FinanceStore.formatDate(item.nextDate) : '—';
        const inactiveClass = item.active ? '' : 'inactive';

        return `
          <div class="recurring-item card ${inactiveClass}">
            <div class="rec-item-left">
              ${typeBadge}
              <span class="rec-item-icon-wrapper" style="font-size: 1.5rem; margin: 0 12px; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--radius-md); background: var(--bg-body); border: 1px solid var(--border-color);">${CATEGORY_ICONS[item.category] || '📦'}</span>
              <div class="rec-item-info">
                <span class="rec-item-desc">${item.description}</span>
                <span class="badge-category">${item.category}</span>
              </div>
            </div>
            <div class="rec-item-center">
              <span class="${amtClass} rec-item-amount">${prefix}${FinanceStore.formatCurrency(item.amount)}</span>
              ${freqBadge}
            </div>
            <div class="rec-item-right">
              <div class="rec-next-date">
                <span class="rec-next-label">Next:</span>
                <span>${nextLabel}</span>
              </div>
              <label class="toggle-switch" title="${item.active ? 'Active' : 'Inactive'}">
                <input type="checkbox" class="toggle-active-cb" data-id="${item.id}"
                       ${item.active ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
              <div class="rec-item-actions">
                <button class="btn-icon-sm edit-rec-btn" data-id="${item.id}" title="Edit">✏️</button>
                <button class="btn-icon-sm delete-rec-btn" data-id="${item.id}" title="Delete">🗑️</button>
              </div>
            </div>
          </div>`;
      }).join('');
    }

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Recurring Transactions</h1>
          <p class="view-subtitle">Manage your scheduled income and expenses</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-primary" id="rec-add-btn">
            <span class="btn-icon">+</span> Add Recurring
          </button>
        </div>
      </div>

      <!-- Overview Cards -->
      <div class="grid grid-3">
        <div class="kpi-card">
          <div class="kpi-icon">🔄</div>
          <div class="kpi-body">
            <span class="kpi-label">Active Recurring</span>
            <span class="kpi-value">${activeCount}</span>
          </div>
        </div>
        <div class="kpi-card income">
          <div class="kpi-icon">📈</div>
          <div class="kpi-body">
            <span class="kpi-label">Monthly Recurring Income</span>
            <span class="kpi-value amount-income">+${FinanceStore.formatCurrency(monthlyIncome)}</span>
          </div>
        </div>
        <div class="kpi-card expense">
          <div class="kpi-icon">📉</div>
          <div class="kpi-body">
            <span class="kpi-label">Monthly Recurring Expenses</span>
            <span class="kpi-value amount-expense">-${FinanceStore.formatCurrency(monthlyExpense)}</span>
          </div>
        </div>
      </div>

      <!-- Recurring List -->
      <div class="recurring-list">${listHTML}</div>
    `;

    /* ── Bind events ── */

    // Add button (header)
    document.getElementById('rec-add-btn').addEventListener('click', () => openModal(null));

    // Empty-state button
    const emptyBtn = document.getElementById('empty-add-rec');
    if (emptyBtn) emptyBtn.addEventListener('click', () => openModal(null));

    // Active/inactive toggles
    container.querySelectorAll('.toggle-active-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const item = items.find(i => i.id === cb.dataset.id);
        if (item) toggleActive(item);
      });
    });

    // Edit buttons
    container.querySelectorAll('.edit-rec-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = items.find(i => i.id === btn.dataset.id);
        if (item) openModal(item);
      });
    });

    // Delete buttons
    container.querySelectorAll('.delete-rec-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteRecurring(btn.dataset.id));
    });
  }

  window.RecurringView = { render };
})();
