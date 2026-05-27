/**
 * goals.js - Savings Goals View Module
 * 
 * Displays savings-goal cards with progress rings,
 * overall progress summary, add/edit/delete/add-funds modals,
 * deadline & estimated-completion info, and an empty state.
 */
(function() {
  'use strict';

  const PRESET_COLORS = [
    '#6c63ff', '#10b981', '#ef4444', '#f59e0b',
    '#3b82f6', '#ec4899', '#8b5cf6', '#06b6d4'
  ];

  /* ─────────────────────────────────────────
   *  Helpers
   * ───────────────────────────────────────── */

  /** Days between two date strings. */
  function daysBetween(a, b) {
    const d1 = new Date(a);
    const d2 = new Date(b);
    return Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
  }

  /** Estimated completion text based on saving pace. */
  function estimatedCompletion(goal) {
    if (goal.current >= goal.target) return 'Completed! 🎉';
    if (!goal.createdAt) return '—';

    const daysSinceStart = daysBetween(goal.createdAt, new Date().toISOString().slice(0, 10));
    if (daysSinceStart <= 0 || goal.current <= 0) return 'Not enough data';

    const dailyRate   = goal.current / daysSinceStart;
    const remaining   = goal.target - goal.current;
    const daysNeeded  = Math.ceil(remaining / dailyRate);
    const estDate     = new Date();
    estDate.setDate(estDate.getDate() + daysNeeded);
    return estDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }

  /** Progress color based on percentage. */
  function progressColor(pct) {
    if (pct >= 70) return '#10b981';
    if (pct >= 30) return '#f59e0b';
    return '#ef4444';
  }

  /* ─────────────────────────────────────────
   *  Add Goal Modal
   * ───────────────────────────────────────── */
  function openAddGoalModal() {
    const colorCircles = PRESET_COLORS.map((c, i) =>
      `<button class="color-swatch ${i === 0 ? 'active' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`
    ).join('');

    App.showModal(`
      <div class="modal-header">
        <h3 class="modal-title">Add Goal</h3>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="goal-name">Goal Name</label>
          <input type="text" id="goal-name" class="form-input" placeholder="e.g. Emergency Fund">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="goal-target">Target Amount</label>
            <div class="premium-amount-wrapper">
              <span class="premium-amount-currency">₹</span>
              <input type="number" id="goal-target" class="premium-amount-input" style="font-size: 1.25rem; padding: 4px 6px;" placeholder="100000" min="1" step="1">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="goal-initial">Initial Amount</label>
            <div class="premium-amount-wrapper">
              <span class="premium-amount-currency">₹</span>
              <input type="number" id="goal-initial" class="premium-amount-input" style="font-size: 1.25rem; padding: 4px 6px;" placeholder="0" min="0" step="1" value="0">
            </div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="goal-deadline">Deadline</label>
          <input type="date" id="goal-deadline" class="form-input">
        </div>
        <div class="form-group">
          <label class="form-label">Color</label>
          <div class="color-picker" id="goal-color-picker">${colorCircles}</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="modal-save-btn">Save</button>
      </div>
    `);

    bindColorPicker();

    document.getElementById('modal-close-btn').addEventListener('click', () => App.hideModal());
    document.getElementById('modal-cancel-btn').addEventListener('click', () => App.hideModal());
    document.getElementById('modal-save-btn').addEventListener('click', () => {
      const name     = document.getElementById('goal-name').value.trim();
      const target   = parseFloat(document.getElementById('goal-target').value);
      const initial  = parseFloat(document.getElementById('goal-initial').value) || 0;
      const deadline = document.getElementById('goal-deadline').value;
      const color    = document.querySelector('#goal-color-picker .color-swatch.active').dataset.color;

      if (!name)               { App.showToast('Please enter a goal name', 'error'); return; }
      if (!target || target<1) { App.showToast('Please enter a valid target amount', 'error'); return; }
      if (!deadline)           { App.showToast('Please select a deadline', 'error'); return; }

      FinanceStore.addGoal({
        name, target, current: initial, deadline, color,
        createdAt: new Date().toISOString().slice(0, 10)
      });
      App.showToast('Goal created', 'success');
      App.hideModal();
      render();
    });
  }

  /* ─────────────────────────────────────────
   *  Edit Goal Modal
   * ───────────────────────────────────────── */
  function openEditGoalModal(goal) {
    const colorCircles = PRESET_COLORS.map(c =>
      `<button class="color-swatch ${c === goal.color ? 'active' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`
    ).join('');

    App.showModal(`
      <div class="modal-header">
        <h3 class="modal-title">Edit Goal</h3>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="goal-name">Goal Name</label>
          <input type="text" id="goal-name" class="form-input" value="${goal.name}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="goal-target">Target Amount</label>
            <div class="premium-amount-wrapper">
              <span class="premium-amount-currency">₹</span>
              <input type="number" id="goal-target" class="premium-amount-input" style="font-size:1.25rem; padding: 4px 6px;" min="1" step="1" value="${goal.target}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="goal-deadline">Deadline</label>
            <input type="date" id="goal-deadline" class="form-input" value="${goal.deadline}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Color</label>
          <div class="color-picker" id="goal-color-picker">${colorCircles}</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="modal-save-btn">Update</button>
      </div>
    `);

    bindColorPicker();

    document.getElementById('modal-close-btn').addEventListener('click', () => App.hideModal());
    document.getElementById('modal-cancel-btn').addEventListener('click', () => App.hideModal());
    document.getElementById('modal-save-btn').addEventListener('click', () => {
      const name     = document.getElementById('goal-name').value.trim();
      const target   = parseFloat(document.getElementById('goal-target').value);
      const deadline = document.getElementById('goal-deadline').value;
      const color    = document.querySelector('#goal-color-picker .color-swatch.active').dataset.color;

      if (!name)               { App.showToast('Please enter a goal name', 'error'); return; }
      if (!target || target<1) { App.showToast('Please enter a valid target amount', 'error'); return; }
      if (!deadline)           { App.showToast('Please select a deadline', 'error'); return; }

      FinanceStore.updateGoal(goal.id, { name, target, deadline, color });
      App.showToast('Goal updated', 'success');
      App.hideModal();
      render();
    });
  }

  /* ─────────────────────────────────────────
   *  Add Funds Modal
   * ───────────────────────────────────────── */
  function openAddFundsModal(goal) {
    const pct = goal.target > 0 ? Math.round((goal.current / goal.target) * 100) : 0;

    App.showModal(`
      <div class="modal-header">
        <h3 class="modal-title">Add Funds to "${goal.name}"</h3>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="funds-progress-info" style="margin-bottom: 20px;">
          <p class="form-label" style="margin-bottom: 8px;">Current progress: <strong>${FinanceStore.formatCurrency(goal.current)}</strong> / ${FinanceStore.formatCurrency(goal.target)} (${pct}%)</p>
          <div class="progress-bar-track" style="background: var(--border-color); border-radius: var(--radius-sm); height: 8px; overflow: hidden;">
            <div class="progress-bar-fill success" style="width:${Math.min(pct,100)}%; height: 100%; background: var(--success); transition: width 0.3s ease;"></div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="funds-amount">Amount</label>
          <div class="premium-amount-wrapper">
            <span class="premium-amount-currency">₹</span>
            <input type="number" id="funds-amount" class="premium-amount-input" style="font-size: 1.5rem; padding: 6px 8px;" placeholder="0" min="1" step="1">
          </div>
        </div>
        <div class="form-group" style="margin-top: 15px;">
          <label class="form-label">Quick Amounts</label>
          <div class="quick-amounts" style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-sm btn-secondary quick-amt-btn" data-amt="500">₹500</button>
            <button class="btn btn-sm btn-secondary quick-amt-btn" data-amt="1000">₹1,000</button>
            <button class="btn btn-sm btn-secondary quick-amt-btn" data-amt="5000">₹5,000</button>
            <button class="btn btn-sm btn-secondary quick-amt-btn" data-amt="10000">₹10,000</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
        <button class="btn btn-primary"   id="modal-save-btn">Add Funds</button>
      </div>
    `);

    document.getElementById('modal-close-btn').addEventListener('click', () => App.hideModal());
    document.getElementById('modal-cancel-btn').addEventListener('click', () => App.hideModal());

    // Quick amount buttons
    document.querySelectorAll('.quick-amt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('funds-amount').value = btn.dataset.amt;
      });
    });

    document.getElementById('modal-save-btn').addEventListener('click', () => {
      const amount = parseFloat(document.getElementById('funds-amount').value);
      if (!amount || amount <= 0) {
        App.showToast('Please enter a valid amount', 'error');
        return;
      }
      FinanceStore.addFundsToGoal(goal.id, amount);
      App.showToast(`${FinanceStore.formatCurrency(amount)} added to "${goal.name}"`, 'success');
      App.hideModal();
      render();
    });
  }

  /* ─────────────────────────────────────────
   *  Delete Goal
   * ───────────────────────────────────────── */
  async function deleteGoal(id) {
    const yes = await App.confirm('Are you sure you want to delete this goal?');
    if (!yes) return;
    FinanceStore.deleteGoal(id);
    App.showToast('Goal deleted', 'success');
    render();
  }

  /* ─────────────────────────────────────────
   *  Color picker binding helper
   * ───────────────────────────────────────── */
  function bindColorPicker() {
    const picker = document.getElementById('goal-color-picker');
    if (!picker) return;
    picker.addEventListener('click', (e) => {
      const swatch = e.target.closest('.color-swatch');
      if (!swatch) return;
      picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
    });
  }

  /* ─────────────────────────────────────────
   *  Render
   * ───────────────────────────────────────── */
  function render() {
    const container = document.getElementById('view-container');
    const goals     = FinanceStore.getGoals() || [];

    /* Overall totals */
    let totalTarget = 0;
    let totalSaved  = 0;
    goals.forEach(g => { totalTarget += g.target; totalSaved += g.current; });
    const overallPct = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;

    /* Goal cards */
    let goalsHTML = '';
    if (goals.length === 0) {
      goalsHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎯</div>
          <h3>No Savings Goals</h3>
          <p>Create your first savings goal to start tracking your progress!</p>
          <button class="btn btn-primary" id="empty-add-goal">Create Goal</button>
        </div>`;
    } else {
      goalsHTML = `<div class="grid grid-3">` + goals.map(g => {
        const pct        = g.target > 0 ? Math.round((g.current / g.target) * 100) : 0;
        const remaining  = Math.max(0, g.target - g.current);
        const color      = g.color || progressColor(pct);
        const today      = new Date().toISOString().slice(0, 10);
        const daysLeft   = g.deadline ? daysBetween(today, g.deadline) : null;
        const estComp    = estimatedCompletion(g);

        let deadlineText = '';
        if (daysLeft !== null) {
          if (daysLeft < 0) {
            deadlineText = `<span class="goal-deadline overdue">Overdue by ${Math.abs(daysLeft)} days</span>`;
          } else if (daysLeft === 0) {
            deadlineText = `<span class="goal-deadline today">Deadline is today!</span>`;
          } else {
            deadlineText = `<span class="goal-deadline">${daysLeft} days remaining</span>`;
          }
        }

        return `
          <div class="goal-card card">
            <div class="goal-progress-container">
              <canvas id="goal-ring-${g.id}" width="120" height="120"></canvas>
            </div>
            <h4 class="goal-name">${g.name}</h4>
            <p class="goal-amounts">
              ${FinanceStore.formatCurrency(g.current)} / ${FinanceStore.formatCurrency(g.target)}
            </p>
            <p class="goal-remaining">${FinanceStore.formatCurrency(remaining)} remaining</p>
            ${g.deadline ? `<p class="goal-deadline-row">📅 ${FinanceStore.formatDate(g.deadline)}</p>` : ''}
            ${deadlineText}
            <p class="goal-est">Est. completion: ${estComp}</p>
            <div class="goal-actions">
              <button class="btn btn-sm btn-primary add-funds-btn" data-id="${g.id}">Add Funds</button>
              <button class="btn-icon-sm edit-goal-btn" data-id="${g.id}" title="Edit">✏️</button>
              <button class="btn-icon-sm delete-goal-btn" data-id="${g.id}" title="Delete">🗑️</button>
            </div>
          </div>`;
      }).join('') + `</div>`;
    }

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h1 class="view-title">Savings Goals</h1>
          <p class="view-subtitle">Track your progress toward financial targets</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-primary" id="goals-add-btn">
            <span class="btn-icon">+</span> Add Goal
          </button>
        </div>
      </div>

      <!-- Overall Progress -->
      ${goals.length > 0 ? `
      <div class="card overall-progress-card">
        <div class="card-header"><h3>Overall Progress</h3></div>
        <div class="card-body">
          <div class="overall-progress-row">
            <div class="overall-progress-text">
              <p>${FinanceStore.formatCurrency(totalSaved)} saved of ${FinanceStore.formatCurrency(totalTarget)} across ${goals.length} goal${goals.length>1?'s':''}</p>
            </div>
            <span class="overall-pct">${overallPct}%</span>
          </div>
          <div class="progress-bar-track lg">
            <div class="progress-bar-fill success" style="width:${Math.min(overallPct,100)}%"></div>
          </div>
        </div>
      </div>` : ''}

      <!-- Goals Grid -->
      ${goalsHTML}
    `;

    /* ── Draw progress rings ── */
    goals.forEach(g => {
      const pct   = g.target > 0 ? Math.round((g.current / g.target) * 100) : 0;
      const color = g.color || progressColor(pct);
      const canvasId = `goal-ring-${g.id}`;
      try {
        FinanceCharts.progressRing(canvasId, {
          percentage: Math.min(pct, 100),
          color: color,
          size: 120,
          lineWidth: 10,
          label: pct + '%'
        });
      } catch (e) {
        // canvas may not exist if empty state
      }
    });

    /* ── Bind events ── */
    document.getElementById('goals-add-btn').addEventListener('click', openAddGoalModal);

    // Empty-state button
    const emptyBtn = document.getElementById('empty-add-goal');
    if (emptyBtn) emptyBtn.addEventListener('click', openAddGoalModal);

    // Add Funds
    container.querySelectorAll('.add-funds-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const goal = goals.find(g => g.id === btn.dataset.id);
        if (goal) openAddFundsModal(goal);
      });
    });

    // Edit
    container.querySelectorAll('.edit-goal-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const goal = goals.find(g => g.id === btn.dataset.id);
        if (goal) openEditGoalModal(goal);
      });
    });

    // Delete
    container.querySelectorAll('.delete-goal-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteGoal(btn.dataset.id));
    });
  }

  window.GoalsView = { render };
})();
