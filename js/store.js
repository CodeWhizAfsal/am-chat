/**
 * FinanceStore — Data persistence layer for the Personal Finance Manager.
 * 
 * All application data is stored in localStorage under a single key.
 * Provides CRUD operations for transactions, budgets, goals, and recurring
 * items, plus analytics helpers and import/export utilities.
 */
(function () {
  'use strict';

  /* ───────────────────────── Constants ───────────────────────── */

  const STORAGE_KEY = 'finance_manager_data';

  const CATEGORY_COLORS = {
    "Salary": "#10b981", "Freelance": "#3b82f6", "Investments": "#f59e0b",
    "Business": "#4f46e5", "Gifts": "#ec4899", "Other Income": "#06b6d4",
    "Food & Dining": "#f43f5e", "Transport": "#f97316", "Shopping": "#d946ef",
    "Entertainment": "#8b5cf6", "Bills & Utilities": "#6366f1", "Health": "#14b8a6",
    "Education": "#3b82f6", "Rent": "#f59e0b", "Travel": "#06b6d4",
    "Subscriptions": "#a855f7", "Other": "#6b7280"
  };

  const INCOME_CATEGORIES = [
    "Salary", "Freelance", "Investments", "Business", "Gifts", "Other Income"
  ];

  const EXPENSE_CATEGORIES = [
    "Food & Dining", "Transport", "Shopping", "Entertainment",
    "Bills & Utilities", "Health", "Education", "Rent", "Travel",
    "Subscriptions", "Other"
  ];

  /* ───────────────────── Default empty state ────────────────── */

  function defaultData() {
    return {
      transactions: [],
      budgets: [],
      goals: [],
      recurring: [],
      cards: [],
      loans: [],
      investments: [],
      settings: { currency: '₹', name: 'Afsal' }
    };
  }

  /** In-memory copy of the persisted data. */
  let data = defaultData();

  /* ─────────────────────── Core helpers ──────────────────────── */

  /**
   * Initialise the store — load existing data from localStorage
   * or seed with defaults.
   */
  function init() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Merge with defaults so newly-added keys are always present
        data = Object.assign(defaultData(), parsed);
        cleanupDuplicateRecurringTransactions();
      } else {
        data = defaultData();
        save();
      }
    } catch (err) {
      console.error('[FinanceStore] Failed to load data, resetting.', err);
      data = defaultData();
      save();
    }
  }

  /**
   * Cleans up duplicate auto-generated transactions that might have been
   * created due to the recurring date advancement bug (casing mismatch).
   */
  function cleanupDuplicateRecurringTransactions() {
    if (!data.transactions || data.transactions.length === 0) return;
    
    var seen = new Set();
    var uniqueTx = [];
    var removedCount = 0;
    
    data.transactions.forEach(function (tx) {
      if (tx.recurringId && tx.description && tx.description.indexOf(' (auto)') !== -1) {
        // Create a unique key using recurringId, date, amount, and description
        var key = tx.recurringId + '_' + tx.date + '_' + tx.amount + '_' + tx.description;
        if (seen.has(key)) {
          removedCount++;
          return; // skip duplicate
        }
        seen.add(key);
      }
      uniqueTx.push(tx);
    });
    
    if (removedCount > 0) {
      data.transactions = uniqueTx;
      save();
      console.log('[FinanceStore] Cleaned up ' + removedCount + ' duplicate recurring transactions.');
    }
  }

  /** Persist the current in-memory data to localStorage. */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('[FinanceStore] Failed to save data.', err);
    }
  }

  /**
   * Generate a UUID. Uses crypto.randomUUID() where available,
   * otherwise falls back to a simple RFC-4122 v4 polyfill.
   */
  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Return the current month as "YYYY-MM".
   */
  function getCurrentMonth() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    return d.getFullYear() + '-' + mm;
  }

  /**
   * Format a number as currency using the stored currency symbol.
   * Example: 1234.5 → "₹1,234"
   */
  function formatCurrency(n) {
    var symbol = data.settings.currency || '₹';
    var abs = Math.abs(n);
    var formatted = abs.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    return (n < 0 ? '-' : '') + symbol + formatted;
  }

  /**
   * Format a "YYYY-MM-DD" date string into a human-readable form.
   * Example: "2026-05-21" → "21 May 2026"
   */
  function formatDate(dateStr) {
    if (!dateStr) return '';
    var parts = dateStr.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  /**
   * Return today's date as "YYYY-MM-DD".
   */
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* ──────────────────────── Transactions ─────────────────────── */

  /**
   * Retrieve transactions, optionally filtered and always sorted date-desc.
   *
   * @param {Object} [filters] - Optional filter criteria.
   * @param {string} [filters.type]      - "income" or "expense"
   * @param {string} [filters.category]  - Exact category name
   * @param {string} [filters.month]     - "YYYY-MM"
   * @param {string} [filters.dateFrom]  - "YYYY-MM-DD"
   * @param {string} [filters.dateTo]    - "YYYY-MM-DD"
   * @param {string} [filters.search]    - Case-insensitive substring search on description
   * @returns {Array} Matching transaction objects (copies).
   */
  function getTransactions(filters) {
    var list = data.transactions.slice(); // shallow copy

    if (filters) {
      if (filters.type) {
        list = list.filter(function (t) { return t.type === filters.type; });
      }
      if (filters.category) {
        list = list.filter(function (t) { return t.category === filters.category; });
      }
      if (filters.month) {
        list = list.filter(function (t) { return t.date && t.date.substring(0, 7) === filters.month; });
      }
      if (filters.dateFrom) {
        list = list.filter(function (t) { return t.date >= filters.dateFrom; });
      }
      if (filters.dateTo) {
        list = list.filter(function (t) { return t.date <= filters.dateTo; });
      }
      if (filters.search) {
        var q = filters.search.toLowerCase();
        list = list.filter(function (t) {
          return (t.description || '').toLowerCase().indexOf(q) !== -1;
        });
      }
    }

    // Sort newest first
    list.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    return list;
  }

  /**
   * Add a new transaction.
   * @param {Object} txData - Must include at least amount, type, category.
   * @returns {Object} The newly created transaction.
   */
  function addTransaction(txData) {
    var tx = {
      id: generateId(),
      date: txData.date || todayStr(),
      amount: Number(txData.amount) || 0,
      type: txData.type,       // "income" | "expense"
      category: txData.category || 'Other',
      description: txData.description || '',
      tags: txData.tags || [],
      recurringId: txData.recurringId || null
    };
    data.transactions.push(tx);
    save();
    return tx;
  }

  /**
   * Update an existing transaction by merging new fields.
   * @returns {Object|null} Updated transaction, or null if not found.
   */
  function updateTransaction(id, updates) {
    var tx = data.transactions.find(function (t) { return t.id === id; });
    if (!tx) return null;
    Object.assign(tx, updates);
    if (updates.amount !== undefined) tx.amount = Number(tx.amount);
    save();
    return tx;
  }

  /**
   * Delete a transaction by id.
   * @returns {boolean} True if found and deleted.
   */
  function deleteTransaction(id) {
    var idx = data.transactions.findIndex(function (t) { return t.id === id; });
    if (idx === -1) return false;
    data.transactions.splice(idx, 1);
    save();
    return true;
  }

  /* ───────────────────────── Budgets ─────────────────────────── */

  /**
   * Get budgets for a given month (defaults to current month).
   */
  function getBudgets(month) {
    var m = month || getCurrentMonth();
    return data.budgets.filter(function (b) { return b.month === m; });
  }

  /**
   * Set (upsert) a budget for a category in a given month.
   */
  function setBudget(category, limit, month) {
    var m = month || getCurrentMonth();
    var existing = data.budgets.find(function (b) {
      return b.category === category && b.month === m;
    });
    if (existing) {
      existing.limit = Number(limit);
    } else {
      data.budgets.push({
        id: generateId(),
        category: category,
        limit: Number(limit),
        month: m
      });
    }
    save();
  }

  /**
   * Delete a budget by id.
   */
  function deleteBudget(id) {
    var idx = data.budgets.findIndex(function (b) { return b.id === id; });
    if (idx === -1) return false;
    data.budgets.splice(idx, 1);
    save();
    return true;
  }

  /**
   * Get the total spending in a category for a given month.
   */
  function getBudgetSpending(category, month) {
    var m = month || getCurrentMonth();
    return data.transactions
      .filter(function (t) {
        return t.type === 'expense' &&
          t.category === category &&
          t.date && t.date.substring(0, 7) === m;
      })
      .reduce(function (sum, t) { return sum + t.amount; }, 0);
  }

  /* ───────────────────────── Goals ───────────────────────────── */

  /** Return all savings goals. */
  function getGoals() {
    return data.goals.slice();
  }

  /**
   * Add a new savings goal.
   */
  function addGoal(goalData) {
    var goal = {
      id: generateId(),
      name: goalData.name || 'Untitled Goal',
      target: Number(goalData.target) || 0,
      current: Number(goalData.current) || 0,
      deadline: goalData.deadline || '',
      createdAt: todayStr(),
      color: goalData.color || '#6c63ff'
    };
    data.goals.push(goal);
    save();
    return goal;
  }

  /** Update a goal by id. */
  function updateGoal(id, updates) {
    var goal = data.goals.find(function (g) { return g.id === id; });
    if (!goal) return null;
    Object.assign(goal, updates);
    if (updates.target !== undefined) goal.target = Number(goal.target);
    if (updates.current !== undefined) goal.current = Number(goal.current);
    save();
    return goal;
  }

  /** Delete a goal by id. */
  function deleteGoal(id) {
    var idx = data.goals.findIndex(function (g) { return g.id === id; });
    if (idx === -1) return false;
    data.goals.splice(idx, 1);
    save();
    return true;
  }

  /**
   * Add funds to a goal, capping at the target amount.
   * @returns {Object|null} Updated goal.
   */
  function addFundsToGoal(id, amount) {
    var goal = data.goals.find(function (g) { return g.id === id; });
    if (!goal) return null;
    goal.current = Math.min(goal.current + Number(amount), goal.target);
    save();
    return goal;
  }

  /* ───────────────────────── Credit Cards ──────────────────────── */

  /** Return all credit cards. */
  function getCards() {
    return (data.cards || []).slice();
  }

  /**
   * Add a new credit card.
   */
  function addCard(cardData) {
    if (!data.cards) data.cards = [];
    var card = {
      id: generateId(),
      cardName: cardData.cardName || 'Untitled Card',
      bankName: cardData.bankName || 'Unknown Bank',
      bankDomain: cardData.bankDomain || '',
      cardNumber: cardData.cardNumber || '•••• •••• •••• ••••',
      cardHolder: cardData.cardHolder || 'Cardholder',
      expiryDate: cardData.expiryDate || '12/29',
      creditLimit: Number(cardData.creditLimit) || 0,
      cardUsed: Number(cardData.cardUsed) || 0,
      dueAmount: Number(cardData.dueAmount) || 0,
      dueDate: cardData.dueDate || '',
      bgUrl: cardData.bgUrl || ''
    };
    data.cards.push(card);
    save();
    return card;
  }

  /** Update a credit card by id. */
  function updateCard(id, updates) {
    if (!data.cards) data.cards = [];
    var card = data.cards.find(function (c) { return c.id === id; });
    if (!card) return null;
    Object.assign(card, updates);
    if (updates.creditLimit !== undefined) card.creditLimit = Number(card.creditLimit);
    if (updates.cardUsed !== undefined) card.cardUsed = Number(card.cardUsed);
    if (updates.dueAmount !== undefined) card.dueAmount = Number(card.dueAmount);
    save();
    return card;
  }

  /** Delete a credit card by id. */
  function deleteCard(id) {
    if (!data.cards) return false;
    var idx = data.cards.findIndex(function (c) { return c.id === id; });
    if (idx === -1) return false;
    data.cards.splice(idx, 1);
    save();
    return true;
  }

  /* ───────────────────────── Loans & EMIs ──────────────────────── */

  /** Return all active loans. */
  function getLoans() {
    return (data.loans || []).slice();
  }

  /**
   * Add a new loan. Computes EMI automatically if not provided.
   */
  function addLoan(loanData) {
    if (!data.loans) data.loans = [];
    
    var principal = Number(loanData.principal) || 0;
    var interestRate = Number(loanData.interestRate) || 0;
    var tenureMonths = Number(loanData.tenureMonths) || 12;
    
    // Standard EMI formula: P * r * (1+r)^n / ((1+r)^n - 1)
    var emiAmount = 0;
    if (interestRate > 0) {
      var r = (interestRate / 12) / 100;
      emiAmount = principal * r * Math.pow(1 + r, tenureMonths) / (Math.pow(1 + r, tenureMonths) - 1);
    } else {
      emiAmount = principal / tenureMonths;
    }
    emiAmount = Math.round(emiAmount * 100) / 100;

    var loan = {
      id: generateId(),
      name: loanData.name || 'Untitled Loan',
      principal: principal,
      interestRate: interestRate,
      tenureMonths: tenureMonths,
      startDate: loanData.startDate || todayStr(),
      emiAmount: Number(loanData.emiAmount) || emiAmount,
      paidMonths: Number(loanData.paidMonths) || 0,
      category: loanData.category || 'Other Loan',
      dueDate: Number(loanData.dueDate) || 5, // day of month
      autoDeduct: loanData.autoDeduct !== undefined ? !!loanData.autoDeduct : false
    };
    data.loans.push(loan);
    save();
    return loan;
  }

  /** Update a loan by id. */
  function updateLoan(id, updates) {
    if (!data.loans) data.loans = [];
    var loan = data.loans.find(function (l) { return l.id === id; });
    if (!loan) return null;
    
    Object.assign(loan, updates);
    if (updates.principal !== undefined) loan.principal = Number(loan.principal);
    if (updates.interestRate !== undefined) loan.interestRate = Number(loan.interestRate);
    if (updates.tenureMonths !== undefined) loan.tenureMonths = Number(loan.tenureMonths);
    if (updates.emiAmount !== undefined) loan.emiAmount = Number(loan.emiAmount);
    if (updates.paidMonths !== undefined) loan.paidMonths = Number(loan.paidMonths);
    if (updates.dueDate !== undefined) loan.dueDate = Number(loan.dueDate);
    
    save();
    return loan;
  }

  /** Delete a loan by id. */
  function deleteLoan(id) {
    if (!data.loans) return false;
    var idx = data.loans.findIndex(function (l) { return l.id === id; });
    if (idx === -1) return false;
    data.loans.splice(idx, 1);
    save();
    return true;
  }

  /** Record EMI installment payment. */
  function payLoanEMI(id) {
    if (!data.loans) return false;
    var loan = data.loans.find(function (l) { return l.id === id; });
    if (!loan) return false;

    if (loan.paidMonths >= loan.tenureMonths) return false; // loan fully paid

    // Add transaction as an expense
    addTransaction({
      type: 'expense',
      amount: loan.emiAmount,
      category: 'Bills & Utilities',
      description: 'EMI Installment: ' + loan.name + ' (Paid ' + (loan.paidMonths + 1) + '/' + loan.tenureMonths + ')',
      date: todayStr()
    });

    loan.paidMonths += 1;
    save();
    return true;
  }

  /* ──────────────────────── Recurring ────────────────────────── */

  /** Return all recurring items. */
  function getRecurring() {
    return data.recurring.slice();
  }

  /** Add a new recurring item. */
  function addRecurring(recData) {
    var rec = {
      id: generateId(),
      amount: Number(recData.amount) || 0,
      type: recData.type,
      category: recData.category || 'Other',
      description: recData.description || '',
      frequency: recData.frequency || 'monthly',  // daily|weekly|monthly|yearly
      nextDate: recData.nextDate || todayStr(),
      active: recData.active !== undefined ? recData.active : true
    };
    data.recurring.push(rec);
    save();
    return rec;
  }

  /** Update a recurring item by id. */
  function updateRecurring(id, updates) {
    var rec = data.recurring.find(function (r) { return r.id === id; });
    if (!rec) return null;
    Object.assign(rec, updates);
    if (updates.amount !== undefined) rec.amount = Number(rec.amount);
    save();
    return rec;
  }

  /** Delete a recurring item by id. */
  function deleteRecurring(id) {
    var idx = data.recurring.findIndex(function (r) { return r.id === id; });
    if (idx === -1) return false;
    data.recurring.splice(idx, 1);
    save();
    return true;
  }

  /**
   * Advance a date string by a given frequency.
   * @param {string} dateStr  "YYYY-MM-DD"
   * @param {string} freq     "daily"|"weekly"|"monthly"|"yearly"
   * @returns {string} New date string.
   */
  function advanceDate(dateStr, freq) {
    var parts = dateStr.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var normalizedFreq = freq ? freq.toLowerCase() : '';
    switch (normalizedFreq) {
      case 'daily':   d.setDate(d.getDate() + 1); break;
      case 'weekly':  d.setDate(d.getDate() + 7); break;
      case 'monthly': d.setMonth(d.getMonth() + 1); break;
      case 'yearly':  d.setFullYear(d.getFullYear() + 1); break;
    }
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /**
   * Process all active recurring items whose nextDate is <= today.
   * Creates transactions automatically and advances nextDate.
   * Safety limit: 100 iterations per recurring item.
   * @returns {Array} Array of generated transaction objects.
   */
  function processRecurring() {
    var today = todayStr();
    var generated = [];

    data.recurring.forEach(function (rec) {
      if (!rec.active) return;

      var iterations = 0;
      while (rec.nextDate <= today && iterations < 100) {
        var tx = {
          id: generateId(),
          date: rec.nextDate,
          amount: rec.amount,
          type: rec.type,
          category: rec.category,
          description: (rec.description || '') + ' (auto)',
          tags: [],
          recurringId: rec.id
        };
        data.transactions.push(tx);
        generated.push(tx);
        rec.nextDate = advanceDate(rec.nextDate, rec.frequency);
        iterations++;
      }
    });

    if (generated.length > 0) save();
    return generated;
  }

  /* ──────────────────────── Analytics ────────────────────────── */

  /**
   * Get monthly income/expense totals for the last N months.
   * @param {number} [numMonths=6]
   * @returns {Array<{month:string, monthLabel:string, income:number, expense:number}>}
   */
  function getMonthlyTotals(numMonths) {
    numMonths = numMonths || 6;
    var months = [];
    var shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var now = new Date();

    for (var i = numMonths - 1; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      var label = shortMonths[d.getMonth()] + " '" + String(d.getFullYear()).slice(2);
      months.push({ month: key, monthLabel: label, income: 0, expense: 0 });
    }

    // Aggregate transactions into their respective months
    var monthMap = {};
    months.forEach(function (m) { monthMap[m.month] = m; });

    data.transactions.forEach(function (t) {
      var mKey = t.date ? t.date.substring(0, 7) : null;
      if (mKey && monthMap[mKey]) {
        if (t.type === 'income') monthMap[mKey].income += t.amount;
        else if (t.type === 'expense') monthMap[mKey].expense += t.amount;
      }
    });

    return months;
  }

  /**
   * Get spending (or income) totals grouped by category for a month.
   * @param {string} [month] "YYYY-MM", defaults to current.
   * @param {string} [type]  "expense" (default) or "income".
   * @returns {Array<{category:string, total:number, color:string}>} sorted desc.
   */
  function getCategoryTotals(month, type) {
    var m = month || getCurrentMonth();
    type = type || 'expense';

    var map = {};
    data.transactions.forEach(function (t) {
      if (t.type !== type) return;
      if (t.date && t.date.substring(0, 7) !== m) return;
      if (!map[t.category]) map[t.category] = 0;
      map[t.category] += t.amount;
    });

    var result = [];
    for (var cat in map) {
      result.push({
        category: cat,
        total: map[cat],
        color: CATEGORY_COLORS[cat] || '#64748b'
      });
    }
    result.sort(function (a, b) { return b.total - a.total; });
    return result;
  }

  /**
   * Get daily spending totals for every day in a given month.
   * @param {string} [month] "YYYY-MM"
   * @returns {Array<{date:string, day:number, total:number}>}
   */
  function getDailySpending(month) {
    var m = month || getCurrentMonth();
    var parts = m.split('-');
    var year = Number(parts[0]);
    var mon = Number(parts[1]);
    var daysInMonth = new Date(year, mon, 0).getDate();

    var dayMap = {};
    for (var i = 1; i <= daysInMonth; i++) {
      var key = m + '-' + String(i).padStart(2, '0');
      dayMap[key] = { date: key, day: i, total: 0 };
    }

    data.transactions.forEach(function (t) {
      if (t.type === 'expense' && t.date && dayMap[t.date]) {
        dayMap[t.date].total += t.amount;
      }
    });

    var result = [];
    for (var d = 1; d <= daysInMonth; d++) {
      var dk = m + '-' + String(d).padStart(2, '0');
      result.push(dayMap[dk]);
    }
    return result;
  }

  /* ──────────────────────── Summaries ────────────────────────── */

  /**
   * Total balance across all time (income minus expenses).
   */
  function getTotalBalance() {
    return data.transactions.reduce(function (bal, t) {
      return bal + (t.type === 'income' ? t.amount : -t.amount);
    }, 0);
  }

  /**
   * Summary for a specific month.
   * @param {string} [month] "YYYY-MM"
   * @returns {{income:number, expense:number, net:number, savingsRate:number}}
   */
  function getMonthSummary(month) {
    var m = month || getCurrentMonth();
    var income = 0;
    var expense = 0;

    data.transactions.forEach(function (t) {
      if (!t.date || t.date.substring(0, 7) !== m) return;
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') expense += t.amount;
    });

    var net = income - expense;
    var savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;

    return { income: income, expense: expense, net: net, savingsRate: savingsRate };
  }

  /* ───────────────────── Data management ─────────────────────── */

  /** Export all data as a formatted JSON string. */
  function exportData() {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import data from a JSON string.
   * @returns {boolean} True on success.
   */
  function importData(jsonStr) {
    try {
      var parsed = JSON.parse(jsonStr);
      // Basic validation: must have at least a transactions array
      if (!parsed || !Array.isArray(parsed.transactions)) {
        console.error('[FinanceStore] Invalid import data — missing transactions array.');
        return false;
      }
      data = Object.assign(defaultData(), parsed);
      save();
      return true;
    } catch (err) {
      console.error('[FinanceStore] Import failed.', err);
      return false;
    }
  }

  /** Reset everything to empty defaults. */
  function clearAllData() {
    data = defaultData();
    save();
  }

  /** Get copy of current settings. */
  function getSettings() {
    return Object.assign({}, data.settings);
  }

  /** Update settings. */
  function updateSettings(newSettings) {
    data.settings = Object.assign({}, data.settings, newSettings);
    save();
  }

  /* ─────────────────── Public API (expose) ───────────────────── */

  window.FinanceStore = {
    // Core
    init: init,
    save: save,
    getSettings: getSettings,
    updateSettings: updateSettings,
    generateId: generateId,
    getCurrentMonth: getCurrentMonth,
    formatCurrency: formatCurrency,
    formatDate: formatDate,

    // Transactions
    getTransactions: getTransactions,
    addTransaction: addTransaction,
    updateTransaction: updateTransaction,
    deleteTransaction: deleteTransaction,

    // Budgets
    getBudgets: getBudgets,
    setBudget: setBudget,
    deleteBudget: deleteBudget,
    getBudgetSpending: getBudgetSpending,

    // Goals
    getGoals: getGoals,
    addGoal: addGoal,
    updateGoal: updateGoal,
    deleteGoal: deleteGoal,
    addFundsToGoal: addFundsToGoal,

    // Credit Cards
    getCards: getCards,
    addCard: addCard,
    updateCard: updateCard,
    deleteCard: deleteCard,

    // Loans & EMIs
    getLoans: getLoans,
    addLoan: addLoan,
    updateLoan: updateLoan,
    deleteLoan: deleteLoan,
    payLoanEMI: payLoanEMI,

    // Investments
    getInvestments: getInvestments,
    addInvestment: addInvestment,
    updateInvestment: updateInvestment,
    deleteInvestment: deleteInvestment,
    getPortfolioSummary: getPortfolioSummary,

    // Recurring
    getRecurring: getRecurring,
    addRecurring: addRecurring,
    updateRecurring: updateRecurring,
    deleteRecurring: deleteRecurring,
    processRecurring: processRecurring,

    // Analytics
    getMonthlyTotals: getMonthlyTotals,
    getCategoryTotals: getCategoryTotals,
    getDailySpending: getDailySpending,

    // Summaries
    getTotalBalance: getTotalBalance,
    getMonthSummary: getMonthSummary,

    // Data management
    exportData: exportData,
    importData: importData,
    clearAllData: clearAllData,

    // Constants
    INCOME_CATEGORIES: INCOME_CATEGORIES,
    EXPENSE_CATEGORIES: EXPENSE_CATEGORIES,
    CATEGORY_COLORS: CATEGORY_COLORS
  };

  /* ═══════════════════════════════════════════════════════════════
   *  INVESTMENTS (Stocks, Mutual Funds, SIPs)
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Investment types: 'stock', 'mutual_fund', 'sip'
   * Stock: { id, type:'stock', name, ticker, sector, quantity, buyPrice, currentPrice, buyDate, notes }
   * Mutual Fund: { id, type:'mutual_fund', name, category, units, navAtBuy, currentNav, buyDate, notes }
   * SIP: { id, type:'sip', fundName, amount, frequency:'monthly'|'quarterly', startDate, active, totalInvested, currentValue, sipDate, notes }
   */

  function getInvestments(filterType) {
    if (!data.investments) data.investments = [];
    if (filterType) {
      return data.investments.filter(function (inv) { return inv.type === filterType; });
    }
    return data.investments.slice();
  }

  function addInvestment(invData) {
    if (!data.investments) data.investments = [];
    var inv = Object.assign({
      id: generateId(),
      createdAt: new Date().toISOString().slice(0, 10)
    }, invData);

    // Defaults per type
    if (inv.type === 'stock') {
      inv.quantity = Number(inv.quantity) || 0;
      inv.buyPrice = Number(inv.buyPrice) || 0;
      inv.currentPrice = Number(inv.currentPrice) || inv.buyPrice;
    } else if (inv.type === 'mutual_fund') {
      inv.units = Number(inv.units) || 0;
      inv.navAtBuy = Number(inv.navAtBuy) || 0;
      inv.currentNav = Number(inv.currentNav) || inv.navAtBuy;
    } else if (inv.type === 'sip') {
      inv.amount = Number(inv.amount) || 0;
      inv.frequency = inv.frequency || 'monthly';
      inv.active = inv.active !== false;
      inv.totalInvested = Number(inv.totalInvested) || 0;
      inv.currentValue = Number(inv.currentValue) || 0;
      inv.sipDate = Number(inv.sipDate) || 1;
    }

    data.investments.push(inv);
    save();
    return inv;
  }

  function updateInvestment(id, updates) {
    if (!data.investments) return null;
    var inv = data.investments.find(function (i) { return i.id === id; });
    if (!inv) return null;
    Object.assign(inv, updates);
    // Ensure numeric
    if (inv.quantity !== undefined) inv.quantity = Number(inv.quantity);
    if (inv.buyPrice !== undefined) inv.buyPrice = Number(inv.buyPrice);
    if (inv.currentPrice !== undefined) inv.currentPrice = Number(inv.currentPrice);
    if (inv.units !== undefined) inv.units = Number(inv.units);
    if (inv.navAtBuy !== undefined) inv.navAtBuy = Number(inv.navAtBuy);
    if (inv.currentNav !== undefined) inv.currentNav = Number(inv.currentNav);
    if (inv.amount !== undefined) inv.amount = Number(inv.amount);
    if (inv.totalInvested !== undefined) inv.totalInvested = Number(inv.totalInvested);
    if (inv.currentValue !== undefined) inv.currentValue = Number(inv.currentValue);
    save();
    return inv;
  }

  function deleteInvestment(id) {
    if (!data.investments) return;
    data.investments = data.investments.filter(function (i) { return i.id !== id; });
    save();
  }

  function getPortfolioSummary() {
    if (!data.investments) data.investments = [];
    var stocks = getInvestments('stock');
    var mfs = getInvestments('mutual_fund');
    var sips = getInvestments('sip');

    var stockInvested = 0, stockCurrent = 0;
    stocks.forEach(function (s) {
      stockInvested += s.quantity * s.buyPrice;
      stockCurrent += s.quantity * (s.currentPrice || s.buyPrice);
    });

    var mfInvested = 0, mfCurrent = 0;
    mfs.forEach(function (m) {
      mfInvested += m.units * m.navAtBuy;
      mfCurrent += m.units * (m.currentNav || m.navAtBuy);
    });

    var sipInvested = 0, sipCurrent = 0;
    sips.forEach(function (s) {
      sipInvested += s.totalInvested || 0;
      sipCurrent += s.currentValue || 0;
    });

    var totalInvested = stockInvested + mfInvested + sipInvested;
    var totalCurrent = stockCurrent + mfCurrent + sipCurrent;
    var totalReturns = totalCurrent - totalInvested;
    var returnPct = totalInvested > 0 ? ((totalReturns / totalInvested) * 100) : 0;

    return {
      totalInvested: totalInvested,
      totalCurrent: totalCurrent,
      totalReturns: totalReturns,
      returnPct: returnPct,
      stocks: { invested: stockInvested, current: stockCurrent, count: stocks.length },
      mutualFunds: { invested: mfInvested, current: mfCurrent, count: mfs.length },
      sips: { invested: sipInvested, current: sipCurrent, count: sips.length, activeSips: sips.filter(function(s) { return s.active; }).length },
      allocation: [
        { label: 'Stocks', value: stockCurrent, color: '#6366f1' },
        { label: 'Mutual Funds', value: mfCurrent, color: '#10b981' },
        { label: 'SIPs', value: sipCurrent, color: '#f59e0b' }
      ].filter(function (a) { return a.value > 0; })
    };
  }

})();
