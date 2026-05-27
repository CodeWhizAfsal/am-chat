/**
 * App — Bootstrap, navigation, modals, toasts, and global helpers
 * for the Personal Finance Manager.
 *
 * Expects the following elements in index.html:
 *   #sidebar, [data-view] nav items, #hamburger-btn, #page-title,
 *   #header-actions, #view-container, #modal-backdrop, #modal-container,
 *   #toast-container, #export-btn, #import-btn
 *
 * View modules are expected on window.*View with a render() method:
 *   DashboardView, TransactionsView, BudgetsView,
 *   AnalyticsView, GoalsView, RecurringView
 */
(function () {
  'use strict';

  /* ──────────────── View title mapping ───────────────────────── */

  var VIEW_TITLES = {
    dashboard:    'Dashboard',
    transactions: 'Transactions',
    budgets:      'Budgets',
    analytics:    'Analytics',
    goals:        'Savings Goals',
    recurring:    'Recurring',
    emis:         'Loans & EMIs',
    investments:  'Investments',
    trading:      'Trading Desk',
    audit:        'Strategy Validation Lab'
  };

  /* ──────────────── State ────────────────────────────────────── */

  var currentView = 'dashboard';

  /* ═══════════════════════════════════════════════════════════════
   *  NAVIGATION
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Navigate to a named view.
   *
   * Updates sidebar active state, page title, renders the view,
   * and triggers a fade-in animation.
   *
   * @param {string} viewName  One of the keys in VIEW_TITLES.
   */
  function navigate(viewName) {
    if (!VIEW_TITLES[viewName]) {
      console.warn('[App] Unknown view:', viewName);
      return;
    }

    currentView = viewName;

    /* ── Update sidebar active states ── */
    var navItems = document.querySelectorAll('.sidebar-nav [data-view]');
    navItems.forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-view') === viewName);
    });

    /* ── Update bottom nav active states ── */
    var bottomNavItems = document.querySelectorAll('.bottom-nav-item');
    bottomNavItems.forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-view') === viewName);
    });

    /* ── Update page title ── */
    var titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = VIEW_TITLES[viewName];

    /* ── Hide mobile sidebar ── */
    var sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
    var overlay = document.getElementById('sidebar-overlay');
    if (overlay) overlay.classList.remove('active');

    /* ── Clear header actions (views can re-populate) ── */
    var headerActions = document.getElementById('header-actions');
    if (headerActions) headerActions.innerHTML = '';

    /* ── Get view container ── */
    var container = document.getElementById('view-container');
    if (!container) return;

    /* ── Render the appropriate view ── */
    switch (viewName) {
      case 'dashboard':
        if (window.DashboardView) window.DashboardView.render();
        break;
      case 'transactions':
        if (window.TransactionsView) window.TransactionsView.render();
        break;
      case 'budgets':
        if (window.BudgetsView) window.BudgetsView.render();
        break;
      case 'analytics':
        if (window.AnalyticsView) window.AnalyticsView.render();
        break;
      case 'goals':
        if (window.GoalsView) window.GoalsView.render();
        break;
      case 'recurring':
        if (window.RecurringView) window.RecurringView.render();
        break;
      case 'emis':
        if (window.EmisView) window.EmisView.render();
        break;
      case 'investments':
        if (window.InvestmentsView) window.InvestmentsView.render();
        break;
      case 'trading':
        if (window.TradingView) window.TradingView.render();
        break;
      case 'audit':
        if (window.AuditView) window.AuditView.render();
        break;
    }

    /* ── Fade-in animation ── */
    container.classList.remove('fade-in');
    // Force reflow so re-adding the class restarts the animation
    void container.offsetWidth;
    container.classList.add('fade-in');
  }

  /* ═══════════════════════════════════════════════════════════════
   *  MODAL
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Show a modal with arbitrary HTML content.
   *
   * @param {string} htmlContent  Inner HTML for the modal container.
   */
  function showModal(htmlContent) {
    var backdrop = document.getElementById('modal-backdrop');
    var container = document.getElementById('modal-container');
    if (!backdrop || !container) return;

    container.innerHTML = htmlContent;

    // Show with animation
    backdrop.classList.add('active');
    container.classList.add('active');

    // Prevent body scroll while modal is open
    document.body.style.overflow = 'hidden';

    // Click outside → close
    backdrop.onclick = function (e) {
      if (e.target === backdrop) hideModal();
    };

    // ESC key → close
    document.addEventListener('keydown', modalEscHandler);
  }

  /**
   * Hide the modal, clean up handlers and restore scroll.
   */
  function hideModal() {
    var backdrop = document.getElementById('modal-backdrop');
    var container = document.getElementById('modal-container');
    if (!backdrop || !container) return;

    backdrop.classList.remove('active');
    container.classList.remove('active');
    document.body.style.overflow = '';

    document.removeEventListener('keydown', modalEscHandler);

    // Clear content after the transition finishes (300 ms)
    setTimeout(function () {
      container.innerHTML = '';
    }, 300);
  }

  /** @private ESC-key handler for the modal. */
  function modalEscHandler(e) {
    if (e.key === 'Escape') hideModal();
  }

  /* ═══════════════════════════════════════════════════════════════
   *  TOAST NOTIFICATIONS
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Show a brief toast notification.
   *
   * @param {string} message  Text to display.
   * @param {string} [type='success']  One of 'success','error','warning','info'.
   */
  function showToast(message, type) {
    type = type || 'success';

    var toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    // Icon per type
    var icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML =
      '<span class="toast-icon">' + (icons[type] || 'ℹ') + '</span>' +
      '<span class="toast-message">' + message + '</span>' +
      '<button class="toast-close" aria-label="Close">&times;</button>';

    toastContainer.appendChild(toast);

    // Trigger slide-in (next frame so the initial state is applied first)
    requestAnimationFrame(function () {
      toast.classList.add('show');
    });

    // Manual close
    toast.querySelector('.toast-close').addEventListener('click', function () {
      dismissToast(toast);
    });

    // Auto-dismiss after 3 seconds
    setTimeout(function () {
      dismissToast(toast);
    }, 3000);
  }

  /**
   * Animate-out and remove a toast element.
   * @param {HTMLElement} toast
   */
  function dismissToast(toast) {
    if (!toast || toast._dismissed) return;
    toast._dismissed = true;
    toast.classList.remove('show');
    toast.classList.add('removing');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 400);
  }

  /* ═══════════════════════════════════════════════════════════════
   *  CONFIRM DIALOG (Promise-based)
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Display a confirmation modal and return a Promise that resolves
   * to true (Confirm) or false (Cancel).
   *
   * @param {string} message  Question / warning text.
   * @returns {Promise<boolean>}
   */
  function confirm(message) {
    return new Promise(function (resolve) {
      var html =
        '<div class="modal-header">' +
          '<h3 class="modal-title">Confirm</h3>' +
          '<button class="modal-close" id="confirm-close-btn" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<p>' + message + '</p>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button class="btn btn-ghost" id="confirm-cancel-btn">Cancel</button>' +
          '<button class="btn btn-primary" id="confirm-ok-btn">Confirm</button>' +
        '</div>';

      showModal(html);

      // Wire up buttons inside the freshly-injected modal
      document.getElementById('confirm-ok-btn').addEventListener('click', function () {
        hideModal();
        resolve(true);
      });
      document.getElementById('confirm-cancel-btn').addEventListener('click', function () {
        hideModal();
        resolve(false);
      });
      var closeBtn = document.getElementById('confirm-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          hideModal();
          resolve(false);
        });
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════
   *  DATA EXPORT / IMPORT
   * ═══════════════════════════════════════════════════════════════ */

  /**
   * Download all app data as a JSON file.
   */
  function handleExport() {
    var jsonStr = window.FinanceStore.exportData();
    var blob = new Blob([jsonStr], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'finance_manager_backup_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Data exported successfully!', 'success');
  }

  /**
   * Prompt user for a JSON file and import its data.
   */
  function handleImport() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;

      var reader = new FileReader();
      reader.onload = function (e) {
        var ok = window.FinanceStore.importData(e.target.result);
        if (ok) {
          showToast('Data imported successfully!', 'success');
          navigate(currentView); // refresh
        } else {
          showToast('Invalid data file. Import failed.', 'error');
        }
      };
      reader.readAsText(file);
    });

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }

  /* ═══════════════════════════════════════════════════════════════
   *  SIDEBAR (mobile hamburger toggle)
   * ═══════════════════════════════════════════════════════════════ */

  function setupMobileMenu() {
    var hamburger = document.getElementById('sidebar-toggle');
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebar-overlay');

    if (hamburger && sidebar) {
      hamburger.addEventListener('click', function () {
        sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('active');
      });
    }

    // Close sidebar when tapping the overlay
    if (overlay) {
      overlay.addEventListener('click', function () {
        if (sidebar) sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════════
   *  GLOBAL TICKING CLOCK
   * ═══════════════════════════════════════════════════════════════ */

  function startGlobalClock() {
    var clockEl = document.getElementById('global-live-clock');
    if (!clockEl) return;

    function updateClock() {
      var d = new Date();
      var weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      var dayName = weekdays[d.getDay()];
      var day = d.getDate();
      var monthName = months[d.getMonth()];
      var year = d.getFullYear();
      
      var timeStr = d.toLocaleTimeString('en-IN', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      clockEl.textContent = dayName + ', ' + day + ' ' + monthName + ' ' + year + ' • ' + timeStr;
    }

    updateClock();
    setInterval(updateClock, 1000);
  }

  /* ═══════════════════════════════════════════════════════════════
   *  BOOTSTRAP
   * ═══════════════════════════════════════════════════════════════ */

  document.addEventListener('DOMContentLoaded', function () {
    /* 1. Initialise data store */
    window.FinanceStore.init();

    /* 2. Process any pending recurring transactions */
    var generated = window.FinanceStore.processRecurring();
    if (generated.length > 0) {
      showToast(generated.length + ' recurring transaction(s) added', 'info');
    }

    /* 3. Setup sidebar nav click handlers */
    var navItems = document.querySelectorAll('[data-view]');
    navItems.forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        navigate(el.getAttribute('data-view'));
      });
    });

    /* 4. Mobile hamburger toggle */
    setupMobileMenu();

    /* 4.1 Sidebar persistent mode (desktop) */
    var sidebarEl = document.getElementById('sidebar');
    if (sidebarEl) {
      sidebarEl.addEventListener('mouseenter', function () {
        if (window.innerWidth > 1200) {
          sidebarEl.classList.add('expanded');
        }
      });
      sidebarEl.addEventListener('mouseleave', function () {
        if (window.innerWidth > 1200) {
          sidebarEl.classList.remove('expanded');
        }
      });
    }

    /* 4.2 Bottom mobile nav */
    var bottomNav = document.getElementById('mobile-bottom-nav');
    if (bottomNav) {
      bottomNav.addEventListener('click', function (e) {
        var btn = e.target.closest('.bottom-nav-item');
        if (!btn) return;
        var view = btn.getAttribute('data-view');
        if (view) {
          navigate(view);
        }
      });
    }

    /* 4.5 Start global live ticking clock */
    startGlobalClock();

    /* 5. Export / Import / Clear buttons */
    var exportBtn = document.getElementById('btn-export');
    if (exportBtn) exportBtn.addEventListener('click', handleExport);

    var importBtn = document.getElementById('btn-import');
    if (importBtn) importBtn.addEventListener('click', handleImport);

    var clearBtn = document.getElementById('btn-clear-data');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        confirm('Are you sure you want to clear all data? This will permanently delete all your transactions, budgets, and savings goals.')
          .then(function (confirmed) {
            if (confirmed) {
              window.FinanceStore.clearAllData();
              showToast('All data has been cleared.', 'info');
              // Trigger a reload of current view
              navigate(currentView);
            }
          });
      });
    }

    /* 6. Navigate to dashboard */
    navigate('dashboard');
  });

  /* ─────────────────── Public API ────────────────────────────── */

  window.App = {
    navigate:    navigate,
    showModal:   showModal,
    hideModal:   hideModal,
    showToast:   showToast,
    confirm:     confirm,
    currentView: currentView,
    // Expose a getter so external code always gets the live value
    get view() { return currentView; }
  };
})();
