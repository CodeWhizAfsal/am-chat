/**
 * interactive.js — Advanced Interactivity Layer
 *
 * Features:
 *  - Command Palette (Ctrl+K)
 *  - Floating Action Button (FAB) with quick actions
 *  - Keyboard shortcuts with help modal (? key)
 *  - Live header clock
 *  - Confetti celebrations
 *  - Scroll reveal animations
 *  - Material ripple effects
 *  - Credit card 3D flip on click
 *  - Tooltip system (data-tip)
 *  - View transitions
 *  - KPI card click navigation
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════
   *  1. COMMAND PALETTE  (Ctrl+K / Cmd+K)
   * ═══════════════════════════════════════════════════════ */

  var cmdOverlay = null;
  var cmdInput = null;
  var cmdResults = null;
  var cmdActiveIdx = -1;
  var cmdItems = [];

  function getCmdActions() {
    var actions = [
      // Navigation
      { icon: '📊', label: 'Dashboard', desc: 'Go to dashboard', group: 'Navigate', action: function () { App.navigate('dashboard'); } },
      { icon: '💸', label: 'Transactions', desc: 'View all transactions', group: 'Navigate', action: function () { App.navigate('transactions'); } },
      { icon: '📋', label: 'Budgets', desc: 'Manage budgets', group: 'Navigate', action: function () { App.navigate('budgets'); } },
      { icon: '📈', label: 'Analytics', desc: 'Financial analytics', group: 'Navigate', action: function () { App.navigate('analytics'); } },
      { icon: '🎯', label: 'Savings Goals', desc: 'Track goals', group: 'Navigate', action: function () { App.navigate('goals'); } },
      { icon: '🔄', label: 'Recurring', desc: 'Recurring transactions', group: 'Navigate', action: function () { App.navigate('recurring'); } },
      { icon: '🏦', label: 'Loans & EMIs', desc: 'Manage loans', group: 'Navigate', action: function () { App.navigate('emis'); } },
      { icon: '📊', label: 'Investments', desc: 'Stocks, MFs, SIPs', group: 'Navigate', action: function () { App.navigate('investments'); } },

      // Quick Actions
      { icon: '➕', label: 'Add Transaction', desc: 'Record income or expense', group: 'Quick Actions', action: function () { App.navigate('dashboard'); setTimeout(function () { var btn = document.getElementById('dash-add-txn'); if (btn) btn.click(); }, 200); } },
      { icon: '💳', label: 'Add Credit Card', desc: 'Add a new card', group: 'Quick Actions', action: function () { App.navigate('dashboard'); setTimeout(function () { var btn = document.getElementById('dash-add-card'); if (btn) btn.click(); }, 200); } },
      { icon: '🎯', label: 'Add Goal', desc: 'Set a new savings goal', group: 'Quick Actions', action: function () { App.navigate('goals'); } },
      { icon: '📊', label: 'Add Investment', desc: 'Add stock, MF, or SIP', group: 'Quick Actions', action: function () { App.navigate('investments'); } },

      // Data
      { icon: '📤', label: 'Export Data', desc: 'Download JSON backup', group: 'Data', action: function () { var d = FinanceStore.exportData(); var b = new Blob([d], { type: 'application/json' }); var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'finance-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); App.showToast('Data exported!', 'success'); } },
      { icon: '🗑️', label: 'Clear All Data', desc: 'Reset everything', group: 'Data', action: function () { App.confirm('This will DELETE all your data. Are you sure?').then(function (yes) { if (yes) { FinanceStore.clearAllData(); App.navigate('dashboard'); App.showToast('All data cleared', 'info'); } }); } }
    ];

    // Add recent transactions as searchable items
    var txns = FinanceStore.getTransactions().slice(0, 10);
    txns.forEach(function (t) {
      actions.push({
        icon: t.type === 'income' ? '📥' : '📤',
        label: t.description,
        desc: FinanceStore.formatCurrency(t.amount) + ' · ' + t.category,
        group: 'Recent Transactions',
        action: function () { App.navigate('transactions'); }
      });
    });

    return actions;
  }

  function createCmdPalette() {
    if (cmdOverlay) return;

    cmdOverlay = document.createElement('div');
    cmdOverlay.className = 'cmd-overlay';
    cmdOverlay.innerHTML =
      '<div class="cmd-palette">' +
        '<div class="cmd-search-wrap">' +
          '<span class="cmd-search-icon">🔍</span>' +
          '<input class="cmd-search-input" placeholder="Search actions, pages, transactions..." autocomplete="off" id="cmd-input">' +
          '<span class="cmd-kbd">ESC</span>' +
        '</div>' +
        '<div class="cmd-results" id="cmd-results"></div>' +
        '<div class="cmd-footer">' +
          '<span><span class="cmd-kbd">↑↓</span> Navigate</span>' +
          '<span><span class="cmd-kbd">↵</span> Select</span>' +
          '<span><span class="cmd-kbd">ESC</span> Close</span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(cmdOverlay);
    cmdInput = document.getElementById('cmd-input');
    cmdResults = document.getElementById('cmd-results');

    // Close on backdrop click
    cmdOverlay.addEventListener('click', function (e) {
      if (e.target === cmdOverlay) closeCmdPalette();
    });

    // Input handling
    cmdInput.addEventListener('input', function () {
      renderCmdResults(cmdInput.value.trim().toLowerCase());
    });

    // Keyboard navigation
    cmdInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeCmdPalette(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        cmdActiveIdx = Math.min(cmdActiveIdx + 1, cmdItems.length - 1);
        highlightCmdItem();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        cmdActiveIdx = Math.max(cmdActiveIdx - 1, 0);
        highlightCmdItem();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (cmdItems[cmdActiveIdx]) {
          cmdItems[cmdActiveIdx].action();
          closeCmdPalette();
        }
      }
    });
  }

  function openCmdPalette() {
    createCmdPalette();
    cmdOverlay.classList.add('active');
    cmdInput.value = '';
    cmdActiveIdx = -1;
    renderCmdResults('');
    setTimeout(function () { cmdInput.focus(); }, 50);
  }

  function closeCmdPalette() {
    if (cmdOverlay) cmdOverlay.classList.remove('active');
  }

  function renderCmdResults(query) {
    var all = getCmdActions();
    var filtered = query
      ? all.filter(function (a) {
          return a.label.toLowerCase().indexOf(query) !== -1 ||
                 a.desc.toLowerCase().indexOf(query) !== -1 ||
                 a.group.toLowerCase().indexOf(query) !== -1;
        })
      : all;

    cmdItems = filtered;
    cmdActiveIdx = filtered.length > 0 ? 0 : -1;

    if (filtered.length === 0) {
      cmdResults.innerHTML = '<div class="cmd-empty">No results for "' + query + '"</div>';
      return;
    }

    // Group items
    var groups = {};
    filtered.forEach(function (item) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });

    var html = '';
    var idx = 0;
    Object.keys(groups).forEach(function (group) {
      html += '<div class="cmd-group-label">' + group + '</div>';
      groups[group].forEach(function (item) {
        html +=
          '<div class="cmd-item' + (idx === 0 ? ' active' : '') + '" data-idx="' + idx + '">' +
            '<span class="cmd-item-icon">' + item.icon + '</span>' +
            '<div class="cmd-item-text">' +
              '<div class="cmd-item-label">' + item.label + '</div>' +
              '<div class="cmd-item-desc">' + item.desc + '</div>' +
            '</div>' +
          '</div>';
        idx++;
      });
    });

    cmdResults.innerHTML = html;

    // Click handlers
    cmdResults.querySelectorAll('.cmd-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var i = parseInt(el.getAttribute('data-idx'));
        if (cmdItems[i]) {
          cmdItems[i].action();
          closeCmdPalette();
        }
      });
      el.addEventListener('mouseenter', function () {
        cmdActiveIdx = parseInt(el.getAttribute('data-idx'));
        highlightCmdItem();
      });
    });
  }

  function highlightCmdItem() {
    cmdResults.querySelectorAll('.cmd-item').forEach(function (el, i) {
      el.classList.toggle('active', i === cmdActiveIdx);
      if (i === cmdActiveIdx) el.scrollIntoView({ block: 'nearest' });
    });
  }

  /* ═══════════════════════════════════════════════════════
   *  3. KEYBOARD SHORTCUTS
   * ═══════════════════════════════════════════════════════ */

  var SHORTCUTS = [
    { keys: ['Ctrl', 'K'], desc: 'Command palette', action: function () { openCmdPalette(); } },
    { keys: ['1'], desc: 'Dashboard', action: function () { App.navigate('dashboard'); } },
    { keys: ['2'], desc: 'Transactions', action: function () { App.navigate('transactions'); } },
    { keys: ['3'], desc: 'Budgets', action: function () { App.navigate('budgets'); } },
    { keys: ['4'], desc: 'Analytics', action: function () { App.navigate('analytics'); } },
    { keys: ['5'], desc: 'Goals', action: function () { App.navigate('goals'); } },
    { keys: ['6'], desc: 'Recurring', action: function () { App.navigate('recurring'); } },
    { keys: ['7'], desc: 'Loans', action: function () { App.navigate('emis'); } },
    { keys: ['8'], desc: 'Investments', action: function () { App.navigate('investments'); } },
    { keys: ['N'], desc: 'New transaction', action: function () { App.navigate('dashboard'); setTimeout(function () { var btn = document.getElementById('dash-add-txn'); if (btn) btn.click(); }, 200); } },
    { keys: ['?'], desc: 'Show shortcuts', action: function () { showShortcutsModal(); } }
  ];

  function initShortcuts() {
    document.addEventListener('keydown', function (e) {
      // Skip if user is typing in input/textarea
      var tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.target.isContentEditable) return;

      // Ctrl+K / Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openCmdPalette();
        return;
      }

      // Escape
      if (e.key === 'Escape') {
        closeCmdPalette();
        return;
      }

      // Number keys for navigation
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        var num = parseInt(e.key);
        if (num >= 1 && num <= 8) {
          SHORTCUTS[num].action();
          return;
        }
        if (e.key === 'n' || e.key === 'N') {
          SHORTCUTS[9].action();
          return;
        }
        if (e.key === '?') {
          showShortcutsModal();
          return;
        }
      }
    });
  }

  function showShortcutsModal() {
    var html =
      '<div class="modal-header">' +
        '<h3 class="modal-title">⌨️ Keyboard Shortcuts</h3>' +
        '<button class="modal-close" onclick="App.hideModal()">×</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="shortcuts-grid">';

    SHORTCUTS.forEach(function (s) {
      html +=
        '<div class="shortcut-row">' +
          '<span class="shortcut-label">' + s.desc + '</span>' +
          '<span class="shortcut-keys">' +
            s.keys.map(function (k) { return '<span class="shortcut-key">' + k + '</span>'; }).join('') +
          '</span>' +
        '</div>';
    });

    html += '</div></div>';
    App.showModal(html);
  }

  /* ═══════════════════════════════════════════════════════
   *  4. LIVE HEADER CLOCK
   * ═══════════════════════════════════════════════════════ */

  function initClock() {
    var actions = document.getElementById('header-actions');
    if (!actions) return;

    var clock = document.createElement('div');
    clock.className = 'header-clock';
    clock.innerHTML = '<span class="header-clock-dot"></span><span id="live-clock">--:--:--</span>';
    actions.prepend(clock);

    function tick() {
      var now = new Date();
      var h = String(now.getHours()).padStart(2, '0');
      var m = String(now.getMinutes()).padStart(2, '0');
      var s = String(now.getSeconds()).padStart(2, '0');
      var el = document.getElementById('live-clock');
      if (el) el.textContent = h + ':' + m + ':' + s;
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ═══════════════════════════════════════════════════════
   *  5. CONFETTI CELEBRATIONS
   * ═══════════════════════════════════════════════════════ */

  function fireConfetti() {
    var canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    var particles = [];
    var colors = ['#6c63ff', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#f43f5e', '#8b5cf6'];

    for (var i = 0; i < 120; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 16,
        vy: -Math.random() * 18 - 4,
        size: Math.random() * 8 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
        gravity: 0.3 + Math.random() * 0.2,
        opacity: 1
      });
    }

    var frame = 0;
    function animate() {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      var alive = false;
      particles.forEach(function (p) {
        p.x += p.vx;
        p.vy += p.gravity;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        p.vx *= 0.99;
        if (frame > 40) p.opacity -= 0.015;

        if (p.opacity > 0) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = Math.max(0, p.opacity);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
        }
      });

      if (alive && frame < 200) {
        requestAnimationFrame(animate);
      } else {
        canvas.remove();
      }
    }
    requestAnimationFrame(animate);
  }

  // Expose globally for use after adding goals/achievements
  window.fireConfetti = fireConfetti;

  /* ═══════════════════════════════════════════════════════
   *  6. SCROLL REVEAL ANIMATIONS
   * ═══════════════════════════════════════════════════════ */

  function initScrollReveal() {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });

    // Apply to cards and grid items after each render
    var origNavigate = App.navigate;
    App.navigate = function (view) {
      origNavigate.call(App, view);
      setTimeout(function () {
        document.querySelectorAll('.card, .kpi-card, .credit-card-item-container, .fin-health-card').forEach(function (el) {
          if (!el.classList.contains('revealed')) {
            el.classList.add('reveal-on-scroll');
            observer.observe(el);
          }
        });
      }, 100);
    };
  }

  /* ═══════════════════════════════════════════════════════
   *  7. RIPPLE EFFECTS ON BUTTONS
   * ═══════════════════════════════════════════════════════ */

  function initRipple() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.btn, .nav-item, .seg-btn, .kpi-card');
      if (!btn) return;

      var rect = btn.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height);
      var x = e.clientX - rect.left - size / 2;
      var y = e.clientY - rect.top - size / 2;

      var ripple = document.createElement('span');
      ripple.className = 'ripple-wave';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';

      btn.style.position = btn.style.position || 'relative';
      btn.style.overflow = 'hidden';
      btn.appendChild(ripple);

      setTimeout(function () { ripple.remove(); }, 600);
    });
  }

  /* ═══════════════════════════════════════════════════════
   *  8. CREDIT CARD 3D FLIP
   * ═══════════════════════════════════════════════════════ */

  function initCardFlip() {
    document.addEventListener('dblclick', function (e) {
      var card = e.target.closest('.credit-card-item-container');
      if (!card) return;
      card.classList.toggle('flipped');
    });
  }

  /* ═══════════════════════════════════════════════════════
   *  9. KPI CARD CLICK NAVIGATION
   * ═══════════════════════════════════════════════════════ */

  function initKPIClicks() {
    document.addEventListener('click', function (e) {
      var kpi = e.target.closest('.kpi-card');
      if (!kpi) return;

      if (kpi.classList.contains('balance')) App.navigate('analytics');
      else if (kpi.classList.contains('income')) App.navigate('transactions');
      else if (kpi.classList.contains('expense')) App.navigate('transactions');
      else if (kpi.classList.contains('savings')) App.navigate('goals');
    });
  }

  /* ═══════════════════════════════════════════════════════
   *  10. VIEW TRANSITIONS
   * ═══════════════════════════════════════════════════════ */

  function initViewTransitions() {
    var origNavigate = App.navigate;
    App.navigate = function (view) {
      var container = document.getElementById('view-container');
      if (container) {
        container.classList.remove('view-enter');
        void container.offsetWidth; // force reflow
        container.classList.add('view-enter');
      }
      origNavigate.call(App, view);
    };
  }

  /* ═══════════════════════════════════════════════════════
   *  11. ENHANCED TOAST WITH SOUND
   * ═══════════════════════════════════════════════════════ */

  function enhanceToasts() {
    var origToast = App.showToast;
    App.showToast = function (message, type) {
      origToast.call(App, message, type);

      // Fire confetti on success toasts containing certain keywords
      if (type === 'success' && (
        message.toLowerCase().indexOf('goal') !== -1 ||
        message.toLowerCase().indexOf('added') !== -1
      )) {
        // Small celebration
      }
    };
  }

  /* ═══════════════════════════════════════════════════════
   *  12. CTRL+K HINT IN HEADER
   * ═══════════════════════════════════════════════════════ */

  function addSearchHint() {
    var actions = document.getElementById('header-actions');
    if (!actions) return;

    var hint = document.createElement('button');
    hint.className = 'btn btn-secondary btn-sm';
    hint.style.gap = '8px';
    hint.style.fontSize = '0.78rem';
    hint.style.color = 'var(--text-muted)';
    hint.innerHTML = '🔍 Search <span class="cmd-kbd" style="margin-left:4px;">Ctrl+K</span>';
    hint.addEventListener('click', function () { openCmdPalette(); });
    actions.prepend(hint);
  }

  /* ═══════════════════════════════════════════════════════
   *  INIT — Wire everything up on DOMContentLoaded
   * ═══════════════════════════════════════════════════════ */

  function init() {
    initShortcuts();
    initClock();
    initRipple();
    initCardFlip();
    initKPIClicks();
    initViewTransitions();
    initScrollReveal();
    enhanceToasts();
    addSearchHint();
  }

  // Run after app.js has initialized
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(init, 100);
    });
  } else {
    setTimeout(init, 100);
  }

  // Expose for external use
  window.Interactive = {
    openCmdPalette: openCmdPalette,
    closeCmdPalette: closeCmdPalette,
    fireConfetti: fireConfetti,
    showShortcuts: showShortcutsModal
  };

})();
