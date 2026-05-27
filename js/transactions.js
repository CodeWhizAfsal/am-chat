/**
 * transactions.js - Transactions View Module
 * 
 * Full transaction management with filtering, pagination,
 * add/edit modals, summary bar, and delete confirmation.
 */
(function() {
  'use strict';

  const PAGE_SIZE = 15;

  /* ── State ── */
  let currentPage   = 1;
  let filters        = { search: '', type: '', category: '', dateFrom: '', dateTo: '' };

  /* ── Category icon helper ── */
  const CATEGORY_ICONS = {
    "Salary": "💼", "Freelance": "💻", "Investments": "📊",
    "Business": "🏢", "Gifts": "🎁", "Other Income": "💵",
    "Food & Dining": "🍔", "Transport": "🚗", "Shopping": "🛍️",
    "Entertainment": "🎬", "Bills & Utilities": "💡", "Health": "🏥",
    "Education": "📚", "Rent": "🏠", "Travel": "✈️",
    "Subscriptions": "🔄", "Other": "📦"
  };

  /* ─────────────────────────────────────────
   *  Get filtered & sorted transactions
   * ───────────────────────────────────────── */
  function getFiltered() {
    let txns = FinanceStore.getTransactions();

    if (filters.type) {
      txns = txns.filter(t => t.type === filters.type);
    }
    if (filters.category) {
      txns = txns.filter(t => t.category === filters.category);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      txns = txns.filter(t =>
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    }
    if (filters.dateFrom) {
      txns = txns.filter(t => t.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      txns = txns.filter(t => t.date <= filters.dateTo);
    }

    txns.sort((a, b) => new Date(b.date) - new Date(a.date));
    return txns;
  }

  /* ─────────────────────────────────────────
   *  Build all category <option> list
   * ───────────────────────────────────────── */
  function allCategoryOptions() {
    const all = [...FinanceStore.INCOME_CATEGORIES, ...FinanceStore.EXPENSE_CATEGORIES];
    return all.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  /* ─────────────────────────────────────────
   *  Open Add / Edit Modal
   * ───────────────────────────────────────── */
  function openModal(existing) {
    const isEdit   = !!existing;
    const title    = isEdit ? 'Edit Transaction' : 'Add Transaction';
    const type     = existing ? existing.type : 'expense';
    const cats     = type === 'income'
      ? FinanceStore.INCOME_CATEGORIES
      : FinanceStore.EXPENSE_CATEGORIES;

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
          <div class="segmented-control" id="txn-type-toggle">
            <button class="seg-btn ${type === 'income'  ? 'active' : ''}" data-type="income">Income</button>
            <button class="seg-btn ${type === 'expense' ? 'active' : ''}" data-type="expense">Expense</button>
          </div>
        </div>

        <!-- Amount -->
        <div class="form-group">
          <label class="form-label" for="txn-amount">Amount</label>
          <div class="premium-amount-wrapper">
            <span class="premium-amount-currency">₹</span>
            <input type="number" id="txn-amount" class="premium-amount-input"
                   placeholder="0.00" min="0" step="0.01"
                   value="${existing ? existing.amount : ''}">
          </div>
        </div>

        <!-- Category Grid -->
        <div class="form-group">
          <label class="form-label">Select Category</label>
          <div class="category-selector-wrapper">
            <input type="hidden" id="txn-category" value="${existing ? existing.category : cats[0]}">
            <div class="category-grid" id="txn-category-grid">
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

        <div class="form-row">
          <!-- Date -->
          <div class="form-group">
            <label class="form-label" for="txn-date">Date</label>
            <input type="date" id="txn-date" class="form-input"
                   value="${existing ? existing.date : today}">
          </div>
          <!-- Description -->
          <div class="form-group">
            <label class="form-label" for="txn-desc">Description</label>
            <input type="text" id="txn-desc" class="form-input"
                   placeholder="e.g. Grocery shopping"
                   value="${existing ? existing.description : ''}">
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

    /* --- Bind modal events --- */

    // Close / Cancel
    document.getElementById('modal-close-btn').addEventListener('click', () => App.hideModal());
    document.getElementById('modal-cancel-btn').addEventListener('click', () => App.hideModal());

    // Category Grid Selection
    const grid = document.getElementById('txn-category-grid');
    grid.addEventListener('click', (e) => {
      const item = e.target.closest('.category-grid-item');
      if (!item) return;
      grid.querySelectorAll('.category-grid-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('txn-category').value = item.dataset.category;
    });

    // Type toggle → swap category options
    document.getElementById('txn-type-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      document.querySelectorAll('#txn-type-toggle .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const newType = btn.dataset.type;
      const newCats = newType === 'income'
        ? FinanceStore.INCOME_CATEGORIES
        : FinanceStore.EXPENSE_CATEGORIES;
      
      const hiddenInput = document.getElementById('txn-category');
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
      const activeBtn = document.querySelector('#txn-type-toggle .seg-btn.active');
      const txnType   = activeBtn ? activeBtn.dataset.type : 'expense';
      const amount    = parseFloat(document.getElementById('txn-amount').value);
      const category  = document.getElementById('txn-category').value;
      const date      = document.getElementById('txn-date').value;
      const desc      = document.getElementById('txn-desc').value.trim();

      if (!amount || amount <= 0) {
        App.showToast('Please enter a valid amount', 'error');
        return;
      }
      if (!date) {
        App.showToast('Please select a date', 'error');
        return;
      }
      if (!desc) {
        App.showToast('Please enter a description', 'error');
        return;
      }

      const data = { type: txnType, amount, category, date, description: desc };

      if (isEdit) {
        FinanceStore.updateTransaction(existing.id, data);
        App.showToast('Transaction updated', 'success');
      } else {
        FinanceStore.addTransaction(data);
        App.showToast('Transaction added', 'success');
      }
      App.hideModal();
      render();
    });
  }

  /* ─────────────────────────────────────────
   *  Delete with confirmation
   * ───────────────────────────────────────── */
  async function deleteTxn(id) {
    const yes = await App.confirm('Are you sure you want to delete this transaction?');
    if (!yes) return;
    FinanceStore.deleteTransaction(id);
    App.showToast('Transaction deleted', 'success');
    render();
  }

  /* ─────────────────────────────────────────
   *  Render
   * ───────────────────────────────────────── */
  function render() {
    const container = document.getElementById('view-container');
    const allTxns   = getFiltered();
    const totalPages = Math.max(1, Math.ceil(allTxns.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageTxns = allTxns.slice(start, start + PAGE_SIZE);

    /* Summary stats */
    const totalIncome  = allTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = allTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const net          = totalIncome - totalExpense;

    /* Table rows */
    let rowsHTML = '';
    if (pageTxns.length === 0) {
      rowsHTML = `<tr><td colspan="6" class="empty-state-cell">No transactions match your filters.</td></tr>`;
    } else {
      rowsHTML = pageTxns.map(t => {
        const icon     = CATEGORY_ICONS[t.category] || '📄';
        const amtClass = t.type === 'income' ? 'amount-income' : 'amount-expense';
        const prefix   = t.type === 'income' ? '+' : '-';
        const typeBadge = t.type === 'income'
          ? '<span class="badge badge-income">Income</span>'
          : '<span class="badge badge-expense">Expense</span>';
        return `
          <tr>
            <td>${FinanceStore.formatDate(t.date)}</td>
            <td><span class="txn-table-icon">${icon}</span> ${t.description}</td>
            <td><span class="badge-category">${t.category}</span></td>
            <td>${typeBadge}</td>
            <td class="${amtClass}">${prefix}${FinanceStore.formatCurrency(t.amount)}</td>
            <td class="actions-cell">
              <button class="btn-icon-sm edit-btn" data-id="${t.id}" title="Edit">✏️</button>
              <button class="btn-icon-sm delete-btn" data-id="${t.id}" title="Delete">🗑️</button>
            </td>
          </tr>`;
      }).join('');
    }

    /* Pagination buttons */
    let paginationHTML = '';
    if (totalPages > 1) {
      const pages = [];
      pages.push(`<button class="page-btn ${currentPage===1?'disabled':''}" data-page="prev">‹</button>`);
      for (let i = 1; i <= totalPages; i++) {
        if (totalPages <= 7 || i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
          pages.push(`<button class="page-btn ${i===currentPage?'active':''}" data-page="${i}">${i}</button>`);
        } else if (pages[pages.length - 1] !== '…') {
          pages.push('…');
        }
      }
      pages.push(`<button class="page-btn ${currentPage===totalPages?'disabled':''}" data-page="next">›</button>`);
      paginationHTML = `<div class="pagination">${pages.join('')}</div>`;
    }

    /* All categories for filter */
    const allCats = [...FinanceStore.INCOME_CATEGORIES, ...FinanceStore.EXPENSE_CATEGORIES];
    const catFilterOpts = allCats.map(c =>
      `<option value="${c}" ${filters.category === c ? 'selected' : ''}>${c}</option>`
    ).join('');

    // Check if the base layout is already present
    const isAlreadyRendered = !!document.getElementById('filter-search');

    if (isAlreadyRendered) {
      // ── Partial Render ──
      // Update Summary Bar
      const summaryBar = container.querySelector('.summary-bar');
      if (summaryBar) {
        summaryBar.innerHTML = `
          <div class="summary-item">
            <span class="summary-label">Records</span>
            <span class="summary-value">${allTxns.length}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Total Income</span>
            <span class="summary-value amount-income">+${FinanceStore.formatCurrency(totalIncome)}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Total Expenses</span>
            <span class="summary-value amount-expense">-${FinanceStore.formatCurrency(totalExpense)}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Net</span>
            <span class="summary-value ${net >= 0 ? 'amount-income' : 'amount-expense'}">
              ${net >= 0 ? '+' : '-'}${FinanceStore.formatCurrency(Math.abs(net))}
            </span>
          </div>
        `;
      }

      // Update Table Rows
      const tbody = container.querySelector('.data-table tbody');
      if (tbody) {
        tbody.innerHTML = rowsHTML;
      }

      // Update Pagination
      const paginationContainer = container.querySelector('.pagination-container');
      if (paginationContainer) {
        paginationContainer.innerHTML = paginationHTML;
      }

      return;
    }

    // ── Full Render (First time) ──
    container.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Transactions</h1>
          <p class="view-subtitle">Manage all your income and expenses</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-primary" id="txn-add-btn">
            <span class="btn-icon">+</span> Add Transaction
          </button>
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="filter-bar card">
        <div class="search-input-wrapper">
          <input type="text" id="filter-search" class="form-input search-input" placeholder="Search transactions..."
                 value="${filters.search}">
        </div>
        <select id="filter-type" class="form-select">
          <option value="">All Types</option>
          <option value="income"  ${filters.type==='income'?'selected':''}>Income</option>
          <option value="expense" ${filters.type==='expense'?'selected':''}>Expense</option>
        </select>
        <select id="filter-category" class="form-select">
          <option value="">All Categories</option>
          ${catFilterOpts}
        </select>
        <input type="date" id="filter-from" class="form-input" value="${filters.dateFrom}" title="From date">
        <input type="date" id="filter-to"   class="form-input" value="${filters.dateTo}"   title="To date">
        <button class="btn btn-secondary btn-sm" id="filter-clear">Clear</button>
      </div>

      <!-- Summary Bar -->
      <div class="summary-bar">
        <div class="summary-item">
          <span class="summary-label">Records</span>
          <span class="summary-value">${allTxns.length}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Total Income</span>
          <span class="summary-value amount-income">+${FinanceStore.formatCurrency(totalIncome)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Total Expenses</span>
          <span class="summary-value amount-expense">-${FinanceStore.formatCurrency(totalExpense)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Net</span>
          <span class="summary-value ${net >= 0 ? 'amount-income' : 'amount-expense'}">
            ${net >= 0 ? '+' : '-'}${FinanceStore.formatCurrency(Math.abs(net))}
          </span>
        </div>
      </div>

      <!-- Table -->
      <div class="card table-card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th><th>Description</th><th>Category</th>
                <th>Type</th><th>Amount</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>${rowsHTML}</tbody>
          </table>
        </div>
        <div class="pagination-container">${paginationHTML}</div>
      </div>
    `;

    /* ── Bind events ── */

    // Add button
    document.getElementById('txn-add-btn').addEventListener('click', () => openModal(null));

    // Filter change handlers
    const refilter = () => {
      filters.search   = document.getElementById('filter-search').value;
      filters.type     = document.getElementById('filter-type').value;
      filters.category = document.getElementById('filter-category').value;
      filters.dateFrom = document.getElementById('filter-from').value;
      filters.dateTo   = document.getElementById('filter-to').value;
      currentPage = 1;
      render();
    };

    document.getElementById('filter-search').addEventListener('input', refilter);
    document.getElementById('filter-type').addEventListener('change', refilter);
    document.getElementById('filter-category').addEventListener('change', refilter);
    document.getElementById('filter-from').addEventListener('change', refilter);
    document.getElementById('filter-to').addEventListener('change', refilter);

    document.getElementById('filter-clear').addEventListener('click', () => {
      filters = { search: '', type: '', category: '', dateFrom: '', dateTo: '' };
      document.getElementById('filter-search').value = '';
      document.getElementById('filter-type').value = '';
      document.getElementById('filter-category').value = '';
      document.getElementById('filter-from').value = '';
      document.getElementById('filter-to').value = '';
      currentPage = 1;
      render();
    });

    // Event delegation for edit, delete, and pagination buttons
    const tableCard = container.querySelector('.table-card');
    if (tableCard) {
      tableCard.addEventListener('click', (e) => {
        // Edit
        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
          const txn = FinanceStore.getTransactions().find(t => t.id === editBtn.dataset.id);
          if (txn) openModal(txn);
          return;
        }

        // Delete
        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
          deleteTxn(deleteBtn.dataset.id);
          return;
        }

        // Pagination
        const pageBtn = e.target.closest('.page-btn');
        if (pageBtn && !pageBtn.classList.contains('disabled') && !pageBtn.classList.contains('active')) {
          const p = pageBtn.dataset.page;
          if (p === 'prev' && currentPage > 1) {
            currentPage--;
            render();
          } else if (p === 'next' && currentPage < totalPages) {
            currentPage++;
            render();
          } else if (!isNaN(p)) {
            currentPage = parseInt(p);
            render();
          }
        }
      });
    }
  }

  window.TransactionsView = { render };
})();
