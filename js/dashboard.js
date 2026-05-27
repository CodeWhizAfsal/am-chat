/**
 * dashboard.js - Main Dashboard View Module
 * 
 * Displays KPI cards (balance, income, expenses, savings rate),
 * monthly income vs expenses bar chart, spending by category doughnut,
 * recent transactions list, budget overview with progress bars,
 * and a quick-add transaction modal.
 */
(function() {
  'use strict';



  /* ──────────────────────────────────────────────
   *  Category emoji map for transaction items
   * ────────────────────────────────────────────── */
  const CATEGORY_ICONS = {
    "Salary": "💼", "Freelance": "💻", "Investments": "📊",
    "Business": "🏢", "Gifts": "🎁", "Other Income": "💵",
    "Food & Dining": "🍔", "Transport": "🚗", "Shopping": "🛍️",
    "Entertainment": "🎬", "Bills & Utilities": "💡", "Health": "🏥",
    "Education": "📚", "Rent": "🏠", "Travel": "✈️",
    "Subscriptions": "🔄", "Other": "📦"
  };

  /**
   * Animate a number from 0 → target over ~1 second.
   * Calls `onUpdate(currentValue)` each frame.
   */
  function animateValue(target, duration, onUpdate) {
    const start = performance.now();
    const step = (now) => {
      const elapsed = Math.min((now - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - elapsed, 3);
      onUpdate(target * eased);
      if (elapsed < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ──────────────────────────────────────────────
   *  Open the "Add / Edit Transaction" modal
   * ────────────────────────────────────────────── */
  function openTransactionModal(existing) {
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
      render(); // re-render dashboard
    });
  }

  /* ──────────────────────────────────────────────
   *  Credit Card Brand & Preview Helpers
   * ────────────────────────────────────────────── */

  const CARD_BRAND_SVGS = {
    visa: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="44" height="28">
        <path fill="#ffffff" d="M18.5 30.7L22 17.3h3.5L22 30.7z"/>
        <path fill="#ffffff" d="M36.4 17.6c-0.6-0.2-1.5-0.5-2.6-0.5-2.9 0-4.9 1.5-4.9 3.6 0 1.6 1.5 2.5 2.6 3 1.1 0.5 1.5 0.9 1.5 1.4 0 0.8-1 1.1-1.9 1.1-1.3 0-2-0.2-3.1-0.7l-0.4-0.2-0.4 2.7c0.8 0.4 2.2 0.7 3.6 0.7 3 0 5-1.5 5-3.8 0-1.3-0.8-2.2-2.5-3-1-0.5-1.6-0.8-1.6-1.4 0-0.5 0.6-1 1.8-1 1 0 1.8 0.2 2.3 0.4l0.3 0.1 0.3-2.9z"/>
        <path fill="#ffffff" d="M46.7 17.3h-2.7c-0.8 0-1.5 0.5-1.8 1.2L37 30.7h3.6l0.7-2h4.4l0.4 2H49.3L46.7 17.3zm-4.4 8.7l1.8-5 1 2.8 0.2 0.6 0.2 0.6h-3.2z"/>
        <path fill="#ffffff" d="M12.5 17.3H6.8l-0.1 0.3c4.5 1.1 7.4 3.8 8.6 7.1L14 17.3zm1.1 13.4l5.3-13.4h-3.6L10 30.7z"/>
      </svg>
    `,
    mastercard: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="44" height="28">
        <circle cx="16" cy="24" r="14" fill="#ff5f00" fill-opacity="0.95"/>
        <circle cx="32" cy="24" r="14" fill="#f4c430" fill-opacity="0.95"/>
      </svg>
    `,
    amex: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="44" height="28">
        <rect width="48" height="28" rx="4" fill="#0077a6"/>
        <text x="50%" y="60%" fill="#ffffff" font-family="sans-serif" font-weight="bold" font-size="10" text-anchor="middle" letter-spacing="1">AMEX</text>
      </svg>
    `,
    discover: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="44" height="28">
        <rect width="48" height="28" rx="4" fill="#ff6600"/>
        <circle cx="24" cy="24" r="9" fill="#ffffff" opacity="0.25"/>
        <text x="50%" y="62%" fill="#ffffff" font-family="sans-serif" font-weight="bold" font-size="8" text-anchor="middle">DISCOVER</text>
      </svg>
    `,
    rupay: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="44" height="28">
        <rect width="48" height="28" rx="4" fill="#0d2340"/>
        <text x="50%" y="60%" fill="#1dbf73" font-family="sans-serif" font-weight="bold" font-size="10" text-anchor="middle">RuPay</text>
      </svg>
    `,
    generic: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="20" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" ry="2"></rect>
        <line x1="2" y1="10" x2="22" y2="10"></line>
      </svg>
    `
  };

  /** Formats a credit card number into blocks of 4 digits */
  function formatCardNumber(num) {
    if (!num) return '•••• •••• •••• ••••';
    var clean = num.replace(/\D/g, '');
    var formatted = '';
    for (var i = 0; i < clean.length && i < 16; i++) {
      if (i > 0 && i % 4 === 0) formatted += ' ';
      formatted += clean[i];
    }
    return formatted || num;
  }

  /** Masks a credit card number, leaving only the last 4 digits visible */
  function maskCardNumber(num) {
    if (!num) return '•••• •••• •••• ••••';
    var clean = num.replace(/\D/g, '');
    if (clean.length < 4) return '•••• •••• •••• ' + clean;
    return '•••• •••• •••• ' + clean.slice(-4);
  }

  /** Detects the card brand based on card number prefix */
  function detectCardBrand(num) {
    if (!num) return 'generic';
    var clean = num.replace(/\D/g, '');
    if (clean.startsWith('4')) return 'visa';
    if (clean.startsWith('5')) return 'mastercard';
    if (clean.startsWith('3')) return 'amex';
    if (clean.startsWith('6')) return 'discover';
    if (clean.startsWith('8') || clean.startsWith('508') || clean.startsWith('35')) return 'rupay';
    return 'generic';
  }

  /** Returns card network branding SVG HTML */
  function getCardBrandSVG(num) {
    var brand = detectCardBrand(num);
    return CARD_BRAND_SVGS[brand] || CARD_BRAND_SVGS.generic;
  }

  /* ──────────────────────────────────────────────
   *  Open the "Add / Edit Credit Card" modal
   * ────────────────────────────────────────────── */
  function openCreditCardModal(existing) {
    const isEdit = !!existing;
    const title = isEdit ? 'Edit Credit Card' : 'Add Credit Card';
    const today = new Date().toISOString().slice(0, 10);

    const mockupBgStyle = '';

    App.showModal(`
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        
        <!-- Interactive Card Face Preview -->
        <div class="modal-card-preview-wrapper">
          <div class="credit-card-mockup" id="preview-card-face" style="${mockupBgStyle}">
            <img id="preview-bg-img" class="credit-card-background-img" 
                 src="${existing ? existing.bgUrl : ''}" 
                 style="${existing && existing.bgUrl ? 'display: block; opacity: 0.45; filter: contrast(1.1) brightness(0.8);' : 'display: none;'}"
                 alt="Card Background">
            <div class="credit-card-glow"></div>
            <div class="credit-card-inner">
              <div class="credit-card-header-row">
                <span class="credit-card-bank-name" id="preview-bank-name">${existing ? existing.bankName : 'Select Bank'}</span>
                <img class="credit-card-bank-logo" id="preview-bank-logo" 
                     src="${existing && existing.bankDomain ? `https://logo.clearbit.com/${existing.bankDomain}` : ''}" 
                     style="${existing && existing.bankDomain ? 'display: block; height: 22px; max-width: 80px; object-fit: contain; border-radius: 4px;' : 'display: none;'}" 
                     alt="Bank Logo" onerror="this.style.display='none';">
              </div>
              <div class="credit-card-chip-brand-row">
                <div class="credit-card-chip"></div>
                <div id="preview-network-logo" style="display: flex; align-items: center; justify-content: center; height: 30px;">
                  ${getCardBrandSVG(existing ? existing.cardNumber : '')}
                </div>
              </div>
              <div class="credit-card-number" id="preview-card-number">${existing ? formatCardNumber(existing.cardNumber) : '•••• •••• •••• ••••'}</div>
              <div class="credit-card-footer-row">
                <div class="credit-card-holder-col">
                  <span class="credit-card-label">Card Holder</span>
                  <span class="credit-card-value" id="preview-card-holder">${existing ? existing.cardHolder.toUpperCase() : 'CARDHOLDER'}</span>
                </div>
                <div class="credit-card-date-col">
                  <span class="credit-card-label">Expires</span>
                  <span class="credit-card-value" id="preview-expiry-date">${existing ? existing.expiryDate : '12/29'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Form fields -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="card-name-input">Card Nickname</label>
            <input type="text" id="card-name-input" class="form-input" placeholder="e.g. Premium Sapphire" value="${existing ? existing.cardName : ''}">
          </div>
          <div class="form-group">
            <label class="form-label" for="bank-name-input">Bank Name</label>
            <input type="text" id="bank-name-input" class="form-input" placeholder="e.g. Chase" value="${existing ? existing.bankName : ''}">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="card-number-input">Card Number</label>
            <input type="text" id="card-number-input" class="form-input" placeholder="e.g. 4111 2222 3333 4444" maxlength="19" value="${existing ? formatCardNumber(existing.cardNumber) : ''}">
          </div>
          <div class="form-group">
            <label class="form-label" for="card-holder-input">Cardholder Name</label>
            <input type="text" id="card-holder-input" class="form-input" placeholder="e.g. MAJEE" value="${existing ? existing.cardHolder : ''}">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="card-expiry-input">Expiry Date</label>
            <input type="text" id="card-expiry-input" class="form-input" placeholder="MM/YY" maxlength="5" value="${existing ? existing.expiryDate : ''}">
          </div>
          <div class="form-group">
            <label class="form-label" for="bank-domain-input">Bank Domain (for clearbit logo)</label>
            <input type="text" id="bank-domain-input" class="form-input" placeholder="e.g. chase.com" value="${existing ? existing.bankDomain : ''}">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="card-limit-input">Credit Limit</label>
            <div class="premium-amount-wrapper">
              <span class="premium-amount-currency">₹</span>
              <input type="number" id="card-limit-input" class="premium-amount-input" placeholder="0.00" min="0" step="0.01" value="${existing ? existing.creditLimit : ''}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="card-used-input">Total Card Used</label>
            <div class="premium-amount-wrapper">
              <span class="premium-amount-currency">₹</span>
              <input type="number" id="card-used-input" class="premium-amount-input" placeholder="0.00" min="0" step="0.01" value="${existing ? existing.cardUsed : ''}">
            </div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="card-due-amount-input">Amount Due</label>
            <div class="premium-amount-wrapper">
              <span class="premium-amount-currency">₹</span>
              <input type="number" id="card-due-amount-input" class="premium-amount-input" placeholder="0.00" min="0" step="0.01" value="${existing ? existing.dueAmount : ''}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="card-due-date-input">Payment Due Date</label>
            <input type="date" id="card-due-date-input" class="form-input" value="${existing ? existing.dueDate : ''}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="card-bg-url-input">Card Background Network Image URL</label>
          <input type="text" id="card-bg-url-input" class="form-input" placeholder="https://images.unsplash.com/... (optional)" value="${existing ? existing.bgUrl : ''}">
        </div>

      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
        <button class="btn btn-primary"   id="modal-save-btn">
          ${isEdit ? 'Update' : 'Save'}
        </button>
      </div>
    `);

    /* --- Bind Live Preview Input Sync (Focus Preserved) --- */
    const cardNameInput = document.getElementById('card-name-input');
    const bankNameInput = document.getElementById('bank-name-input');
    const cardNumberInput = document.getElementById('card-number-input');
    const cardHolderInput = document.getElementById('card-holder-input');
    const cardExpiryInput = document.getElementById('card-expiry-input');
    const bankDomainInput = document.getElementById('bank-domain-input');
    const cardLimitInput = document.getElementById('card-limit-input');
    const cardUsedInput = document.getElementById('card-used-input');
    const cardDueAmountInput = document.getElementById('card-due-amount-input');
    const cardDueDateInput = document.getElementById('card-due-date-input');
    const cardBgUrlInput = document.getElementById('card-bg-url-input');

    const previewBankName = document.getElementById('preview-bank-name');
    const previewBankLogo = document.getElementById('preview-bank-logo');
    const previewNetworkLogo = document.getElementById('preview-network-logo');
    const previewCardNumber = document.getElementById('preview-card-number');
    const previewCardHolder = document.getElementById('preview-card-holder');
    const previewExpiryDate = document.getElementById('preview-expiry-date');
    const previewBgImg = document.getElementById('preview-bg-img');
    const previewCardFace = document.getElementById('preview-card-face');

    // Simple text event listeners for live preview synchronization
    bankNameInput.addEventListener('input', () => {
      previewBankName.textContent = bankNameInput.value.trim() || 'Select Bank';
    });

    cardHolderInput.addEventListener('input', () => {
      previewCardHolder.textContent = cardHolderInput.value.toUpperCase().trim() || 'CARDHOLDER';
    });

    cardExpiryInput.addEventListener('input', (e) => {
      let val = cardExpiryInput.value.replace(/\D/g, '');
      if (val.length > 2) {
        val = val.substring(0, 2) + '/' + val.substring(2, 4);
      } else if (val.length === 2 && e.inputType !== 'deleteContentBackward') {
        val = val + '/';
      }
      cardExpiryInput.value = val;
      previewExpiryDate.textContent = val || '12/29';
    });

    cardNumberInput.addEventListener('input', () => {
      var raw = cardNumberInput.value.replace(/\D/g, '');
      var formatted = '';
      for (var i = 0; i < raw.length && i < 16; i++) {
        if (i > 0 && i % 4 === 0) formatted += ' ';
        formatted += raw[i];
      }
      cardNumberInput.value = formatted;
      previewCardNumber.textContent = formatted || '•••• •••• •••• ••••';
      previewNetworkLogo.innerHTML = getCardBrandSVG(formatted);
    });

    // Clearbit logo integration with debounce and robust error checks
    let domainDebounce;
    bankDomainInput.addEventListener('input', () => {
      clearTimeout(domainDebounce);
      domainDebounce = setTimeout(() => {
        const domain = bankDomainInput.value.trim().toLowerCase();
        if (domain) {
          previewBankLogo.src = `https://logo.clearbit.com/${domain}`;
          previewBankLogo.style.display = 'block';
          previewBankLogo.onerror = () => {
            previewBankLogo.style.display = 'none'; // hide if resolution fails/offline
          };
        } else {
          previewBankLogo.style.display = 'none';
        }
      }, 500);
    });

    // Custom network background loader with debounce and fallback check
    let bgDebounce;
    cardBgUrlInput.addEventListener('input', () => {
      clearTimeout(bgDebounce);
      bgDebounce = setTimeout(() => {
        const url = cardBgUrlInput.value.trim();
        if (url) {
          previewBgImg.src = url;
          previewBgImg.style.display = 'block';
          previewBgImg.onload = () => {
            previewCardFace.style.backgroundImage = 'none';
          };
          previewBgImg.onerror = () => {
            previewBgImg.style.display = 'none';
          };
        } else {
          previewBgImg.style.display = 'none';
        }
      }, 500);
    });

    // Close and cancel
    document.getElementById('modal-close-btn').addEventListener('click', () => App.hideModal());
    document.getElementById('modal-cancel-btn').addEventListener('click', () => App.hideModal());

    // Save credit card data
    document.getElementById('modal-save-btn').addEventListener('click', () => {
      const cardName = cardNameInput.value.trim();
      const bankName = bankNameInput.value.trim();
      const cardNumber = cardNumberInput.value.replace(/\s+/g, '').trim();
      const cardHolder = cardHolderInput.value.trim() || 'Cardholder';
      const expiryDate = cardExpiryInput.value.trim() || '12/29';
      const bankDomain = bankDomainInput.value.trim();
      const creditLimit = parseFloat(cardLimitInput.value);
      const cardUsed = parseFloat(cardUsedInput.value) || 0;
      const dueAmount = parseFloat(cardDueAmountInput.value) || 0;
      const dueDate = cardDueDateInput.value;
      const bgUrl = cardBgUrlInput.value.trim();

      if (!cardName) {
        App.showToast('Please enter a card name', 'error');
        return;
      }
      if (!bankName) {
        App.showToast('Please enter a bank name', 'error');
        return;
      }
      if (!cardNumber || cardNumber.length < 12) {
        App.showToast('Please enter a valid credit card number', 'error');
        return;
      }
      if (isNaN(creditLimit) || creditLimit < 0) {
        App.showToast('Please enter a valid credit limit', 'error');
        return;
      }

      const cardData = {
        cardName,
        bankName,
        bankDomain,
        cardNumber,
        cardHolder,
        expiryDate,
        creditLimit,
        cardUsed,
        dueAmount,
        dueDate,
        bgUrl
      };

      if (isEdit) {
        FinanceStore.updateCard(existing.id, cardData);
        App.showToast('Credit card updated', 'success');
      } else {
        FinanceStore.addCard(cardData);
        App.showToast('Credit card added', 'success');
      }

      App.hideModal();
      render();
    });
  }

  /**
   * Proactively trigger desktop/push notifications for credit card bill remainders
   */
  function triggerDesktopNotifications(alerts) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      // Avoid spamming too many notifications at once
      alerts.slice(0, 3).forEach(a => {
        const cleanMsg = a.message.replace(/<\/?[^>]+(>|$)/g, "");
        new Notification("FinanceFlow Bill Reminder", {
          body: cleanMsg,
          icon: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='32' height='32' fill='%234f46e5'><rect x='2' y='5' width='20' height='14' rx='2'></rect><line x1='2' y1='10' x2='22' y2='10'></line></svg>"
        });
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          triggerDesktopNotifications(alerts);
        }
      });
    }
  }

  /* ──────────────────────────────────────────────
   *  Main render
   * ────────────────────────────────────────────── */
  function render() {
    const container = document.getElementById('view-container');

    /* ----- Gather data ----- */
    const balance      = FinanceStore.getTotalBalance();
    const summary      = FinanceStore.getMonthSummary();
    const monthlyTotals= FinanceStore.getMonthlyTotals(6);
    const catTotals    = FinanceStore.getCategoryTotals(undefined, 'expense');
    const transactions = FinanceStore.getTransactions()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 8);
    const budgets      = FinanceStore.getBudgets();
    const cards        = FinanceStore.getCards();
    const loans        = FinanceStore.getLoans();

    /* ----- Calculate EMI Burden for Dashboard Widget ----- */
    let totalMonthlyEMI = 0;
    let activeLoansCount = 0;
    let totalOutstandingPrincipal = 0;
    loans.forEach(function(l) {
      if (l.paidMonths < l.tenureMonths) {
        totalMonthlyEMI += l.emiAmount;
        activeLoansCount++;
        totalOutstandingPrincipal += l.principal;
      }
    });

    /* ----- Investment Portfolio Summary ----- */
    const portfolio = FinanceStore.getPortfolioSummary();

    /* ----- Goals Summary ----- */
    const goals = FinanceStore.getGoals();
    let goalsTotalTarget = 0, goalsTotalSaved = 0;
    goals.forEach(g => { goalsTotalTarget += g.target; goalsTotalSaved += g.current; });

    /* ----- Total Debt (Credit Cards + Loans) ----- */
    let totalCardDebt = 0;
    cards.forEach(c => { totalCardDebt += c.dueAmount || 0; });
    const totalDebt = totalCardDebt + totalOutstandingPrincipal;

    /* ----- Net Worth = Balance + Investments - Outstanding Debt ----- */
    const netWorth = balance + portfolio.totalCurrent - totalDebt;

    /* ----- Monthly Obligations = EMIs + Recurring Expenses ----- */
    const recurringItems = FinanceStore.getRecurring ? FinanceStore.getRecurring() : [];
    let monthlyRecurringExpense = 0;
    recurringItems.forEach(r => {
      if (r.active && r.type === 'expense') {
        if (r.frequency === 'monthly') monthlyRecurringExpense += r.amount;
        else if (r.frequency === 'weekly') monthlyRecurringExpense += r.amount * 4.33;
        else if (r.frequency === 'daily') monthlyRecurringExpense += r.amount * 30;
        else if (r.frequency === 'yearly') monthlyRecurringExpense += r.amount / 12;
      }
    });
    const totalMonthlyObligations = totalMonthlyEMI + monthlyRecurringExpense;

    /* ----- Financial Health Score (0-100) ----- */
    let healthScore = 50; // baseline
    // Savings rate boost
    if (summary.savingsRate > 30) healthScore += 15;
    else if (summary.savingsRate > 15) healthScore += 10;
    else if (summary.savingsRate > 0) healthScore += 5;
    // Debt to income penalty
    const debtToIncome = summary.income > 0 ? (totalMonthlyEMI / summary.income) : 0;
    if (debtToIncome > 0.5) healthScore -= 20;
    else if (debtToIncome > 0.3) healthScore -= 10;
    else if (debtToIncome === 0) healthScore += 10;
    // Investments boost
    if (portfolio.totalCurrent > 0) healthScore += 10;
    if (portfolio.returnPct > 5) healthScore += 5;
    // Goals progress
    const goalsProgress = goalsTotalTarget > 0 ? (goalsTotalSaved / goalsTotalTarget) : 0;
    if (goalsProgress > 0.5) healthScore += 10;
    else if (goalsProgress > 0) healthScore += 5;
    healthScore = Math.max(0, Math.min(100, healthScore));
    const healthGrade = healthScore >= 80 ? 'A' : healthScore >= 60 ? 'B' : healthScore >= 40 ? 'C' : healthScore >= 20 ? 'D' : 'F';
    const healthColor = healthScore >= 80 ? 'var(--success)' : healthScore >= 60 ? '#22d3ee' : healthScore >= 40 ? 'var(--warning)' : 'var(--danger)';

    /* ----- Build credit cards HTML ----- */
    let cardsHTML = '';
    if (cards.length === 0) {
      cardsHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 32px 20px;">
          <span class="empty-state-icon">💳</span>
          <p class="empty-state-text">No credit cards added yet.</p>
          <p class="empty-state-subtext">Click "+ Add Credit Card" to track your limits, amounts due, and payment timelines.</p>
        </div>
      `;
    } else {
      cardsHTML = cards.map(c => {
        const balanceLeft = Math.max(0, c.creditLimit - c.cardUsed);
        const formattedUsed = FinanceStore.formatCurrency(c.cardUsed);
        const formattedLeft = FinanceStore.formatCurrency(balanceLeft);
        const formattedDue = FinanceStore.formatCurrency(c.dueAmount);
        const formattedDate = c.dueDate ? FinanceStore.formatDate(c.dueDate) : 'No due date';
        const brandSVG = getCardBrandSVG(c.cardNumber);
        
        const bankLogoHTML = c.bankDomain 
          ? `<img class="credit-card-bank-logo" src="https://logo.clearbit.com/${c.bankDomain}" alt="Bank Logo" style="height: 20px; max-width: 80px; object-fit: contain; border-radius: 4px;" onerror="this.style.display='none';">`
          : '';

        return `
          <div class="credit-card-item-container fade-in">
            <div class="credit-card-mockup">
              ${c.bgUrl ? `<img class="credit-card-background-img" src="${c.bgUrl}" alt="Card Background" style="display: block; opacity: 0.45; filter: contrast(1.1) brightness(0.8);">` : ''}
              <div class="credit-card-glow"></div>
              <div class="credit-card-inner">
                <div class="credit-card-header-row">
                  <span class="credit-card-bank-name">${c.bankName}</span>
                  ${bankLogoHTML}
                </div>
                <div class="credit-card-chip-brand-row">
                  <div class="credit-card-chip"></div>
                  <div style="display: flex; align-items: center; justify-content: center; height: 30px;">
                    ${brandSVG}
                  </div>
                </div>
                <div class="credit-card-number">${maskCardNumber(c.cardNumber)}</div>
                <div class="credit-card-footer-row">
                  <div class="credit-card-holder-col">
                    <span class="credit-card-label">Card Holder</span>
                    <span class="credit-card-value">${c.cardHolder.toUpperCase()}</span>
                  </div>
                  <div class="credit-card-date-col">
                    <span class="credit-card-label">Expires</span>
                    <span class="credit-card-value">${c.expiryDate}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="credit-card-stats">
              <div class="credit-card-stat-item">
                <span class="credit-card-stat-label">Total Used</span>
                <span class="credit-card-stat-value text-danger">${formattedUsed}</span>
              </div>
              <div class="credit-card-stat-item">
                <span class="credit-card-stat-label">Balance Left</span>
                <span class="credit-card-stat-value text-success">${formattedLeft}</span>
              </div>
              <div class="credit-card-stat-item">
                <span class="credit-card-stat-label">Amount Due</span>
                <span class="credit-card-stat-value ${c.dueAmount > 0 ? 'text-warning' : 'text-muted'}">${formattedDue}</span>
              </div>
              <div class="credit-card-stat-item">
                <span class="credit-card-stat-label">Due Date</span>
                <span class="credit-card-stat-value text-sm font-semibold">${formattedDate}</span>
              </div>
            </div>
            <div class="credit-card-actions">
              <button class="btn btn-secondary btn-sm edit-card-btn" data-id="${c.id}">Edit</button>
              <button class="btn btn-danger btn-sm delete-card-btn" data-id="${c.id}">Delete</button>
            </div>
          </div>
        `;
      }).join('');
    }

    /* ----- Build recent transactions HTML ----- */
    let recentTxnHTML = '';
    if (transactions.length === 0) {
      recentTxnHTML = '<p class="empty-state-text">No transactions yet. Add one to get started!</p>';
    } else {
      recentTxnHTML = transactions.map(t => {
        const icon     = CATEGORY_ICONS[t.category] || '📄';
        const amtClass = t.type === 'income' ? 'amount-income' : 'amount-expense';
        const prefix   = t.type === 'income' ? '+' : '-';
        return `
          <div class="txn-item">
            <span class="txn-icon">${icon}</span>
            <div class="txn-info">
              <span class="txn-desc">${t.description}</span>
              <span class="badge-category">${t.category}</span>
            </div>
            <div class="txn-meta">
              <span class="txn-date">${FinanceStore.formatDate(t.date)}</span>
              <span class="${amtClass}">${prefix}${FinanceStore.formatCurrency(t.amount)}</span>
            </div>
          </div>`;
      }).join('');
    }

    /* ----- Build budget overview HTML ----- */
    const topBudgets = budgets.slice(0, 5);
    let budgetHTML = '';
    if (topBudgets.length === 0) {
      budgetHTML = '<p class="empty-state-text">No budgets set yet.</p>';
    } else {
      budgetHTML = topBudgets.map(b => {
        const spent = FinanceStore.getBudgetSpending(b.category, b.month) || 0;
        const pct   = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
        const status = pct > 90 ? 'red' : pct > 70 ? 'yellow' : 'green';
        return `
          <div class="budget-overview-item">
            <div class="budget-overview-header">
              <span class="budget-cat-name">${b.category}</span>
              <span class="budget-amounts">${FinanceStore.formatCurrency(spent)} / ${FinanceStore.formatCurrency(b.limit)}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill ${status}" style="width:${Math.min(pct, 100)}%"></div>
            </div>
            <span class="budget-pct ${status}">${pct}%</span>
          </div>`;
      }).join('');
    }

    /* ----- Previous month data for change indicators ----- */
    const now        = new Date();
    const prevDate   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth  = prevDate.toISOString().slice(0, 7);
    const prevSummary = FinanceStore.getMonthSummary(prevMonth);
    const balanceChange = summary.income - summary.expense;

    /* ----- Calculate personalized time-of-day greeting ----- */
    const hour = now.getHours();
    let greeting = 'Welcome back';
    if (hour >= 5 && hour < 12) {
      greeting = 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      greeting = 'Good afternoon';
    } else if (hour >= 17 && hour < 22) {
      greeting = 'Good evening';
    } else {
      greeting = 'Good night';
    }

    const settings = FinanceStore.getSettings ? FinanceStore.getSettings() : { name: 'Afsal' };
    const userName = (settings.name && settings.name !== 'User') ? settings.name : 'Afsal';

    /* ----- Calculate Credit Card Bill Alerts & Notifications ----- */
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const alerts = [];
    cards.forEach(c => {
      if (c.dueAmount > 0 && c.dueDate) {
        const dueDate = new Date(c.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const timeDiff = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));
        
        if (diffDays < 0) {
          // Overdue!
          alerts.push({
            type: 'danger',
            message: `⚠️ Overdue Alert: Bill of <strong>${FinanceStore.formatCurrency(c.dueAmount)}</strong> for <strong>${c.bankName} ${c.cardName}</strong> was due on ${FinanceStore.formatDate(c.dueDate)} (overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}!).`,
            actionLabel: 'Pay Now',
            card: c
          });
        } else if (diffDays <= 7) {
          // Due soon (within 7 days)
          alerts.push({
            type: 'warning',
            message: `⏰ Bill Reminder: Bill of <strong>${FinanceStore.formatCurrency(c.dueAmount)}</strong> for <strong>${c.bankName} ${c.cardName}</strong> is due in <strong>${diffDays} day${diffDays === 1 ? '' : 's'}</strong> (${FinanceStore.formatDate(c.dueDate)}).`,
            actionLabel: 'Pay Now',
            card: c
          });
        }
      }
    });

    /* ----- Loan EMI Due-Date Alerts ----- */
    loans.forEach(function(l) {
      if (l.paidMonths >= l.tenureMonths) return;

      var dueDay = l.dueDate || 5;
      var todayDate = today.getDate();
      var todayMonth = today.getMonth();
      var todayYear = today.getFullYear();

      var nextDueDate;
      if (todayDate <= dueDay) {
        nextDueDate = new Date(todayYear, todayMonth, dueDay);
      } else {
        nextDueDate = new Date(todayYear, todayMonth + 1, dueDay);
      }
      nextDueDate.setHours(0, 0, 0, 0);

      var diffDays = Math.ceil((nextDueDate.getTime() - today.getTime()) / (1000 * 3600 * 24));

      if (diffDays < 0) {
        alerts.push({
          type: 'danger',
          message: '🏦 EMI Overdue: Installment of <strong>' + FinanceStore.formatCurrency(l.emiAmount) + '</strong> for <strong>' + l.name + '</strong> was due on Day ' + dueDay + ' (overdue by ' + Math.abs(diffDays) + ' day' + (Math.abs(diffDays) === 1 ? '' : 's') + '!).',
          loan: l
        });
      } else if (diffDays <= 5) {
        alerts.push({
          type: 'warning',
          message: '🏦 EMI Reminder: Installment of <strong>' + FinanceStore.formatCurrency(l.emiAmount) + '</strong> for <strong>' + l.name + '</strong> is due in <strong>' + diffDays + ' day' + (diffDays === 1 ? '' : 's') + '</strong> (Day ' + dueDay + ' of each month).',
          loan: l
        });
      }
    });

    let alertsHTML = '';
    if (alerts.length > 0) {
      alertsHTML = `
        <div class="alert-box-container mb-4">
          ${alerts.map((a, idx) => `
            <div class="alert-banner alert-${a.type} fade-in" id="alert-banner-${idx}">
              <div class="alert-banner-content">
                <span class="alert-banner-icon">${a.type === 'danger' ? '🚨' : '⚠️'}</span>
                <span class="alert-banner-text">${a.message}</span>
              </div>
              <div class="alert-banner-actions">
                ${a.card
                  ? `<button class="alert-pay-btn" data-id="${a.card.id}">Pay Bill</button>`
                  : `<button class="alert-pay-emi-btn" data-id="${a.loan.id}">Pay EMI</button>`
                }
                <button class="alert-close-btn" data-target="alert-banner-${idx}">&times;</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      
      // Proactively trigger desktop notifications
      triggerDesktopNotifications(alerts);
    }

    /* ----- Template ----- */
    container.innerHTML = `
      <!-- View header -->
      <div class="view-header">
        <div>
          <h1 class="view-title">${greeting}, ${userName}! 👋</h1>
          <div class="view-subtitle-row">
            <span class="view-subtitle">Financial overview for ${now.toLocaleString('default',{month:'long',year:'numeric'})}</span>
          </div>
        </div>
        <div class="view-actions">
          <button class="btn btn-primary" id="dash-add-txn">
            <span class="btn-icon">+</span> Add Transaction
          </button>
        </div>
      </div>

      <!-- Alert Message Box (on top) -->
      ${alertsHTML}

      <!-- KPI Cards -->
      <div class="grid grid-4">
        <div class="kpi-card balance">
          <div class="kpi-icon">💰</div>
          <div class="kpi-body">
            <span class="kpi-label">Total Balance</span>
            <span class="kpi-value" id="kpi-balance">${FinanceStore.formatCurrency(0)}</span>
            <span class="kpi-change ${balanceChange >= 0 ? 'positive' : 'negative'}">
              ${balanceChange >= 0 ? '▲' : '▼'} ${FinanceStore.formatCurrency(Math.abs(balanceChange))} this month
            </span>
          </div>
        </div>
        <div class="kpi-card income">
          <div class="kpi-icon">📈</div>
          <div class="kpi-body">
            <span class="kpi-label">Monthly Income</span>
            <span class="kpi-value" id="kpi-income">${FinanceStore.formatCurrency(0)}</span>
            <span class="kpi-change ${summary.income >= (prevSummary.income || 0) ? 'positive' : 'negative'}">
              ${summary.income >= (prevSummary.income || 0) ? '▲' : '▼'} vs last month
            </span>
          </div>
        </div>
        <div class="kpi-card expense">
          <div class="kpi-icon">📉</div>
          <div class="kpi-body">
            <span class="kpi-label">Monthly Expenses</span>
            <span class="kpi-value" id="kpi-expense">${FinanceStore.formatCurrency(0)}</span>
            <span class="kpi-change ${summary.expense <= (prevSummary.expense || 0) ? 'positive' : 'negative'}">
              ${summary.expense <= (prevSummary.expense || 0) ? '▲' : '▼'} vs last month
            </span>
          </div>
        </div>
        <div class="kpi-card savings">
          <div class="kpi-icon">🎯</div>
          <div class="kpi-body">
            <span class="kpi-label">Savings Rate</span>
            <span class="kpi-value" id="kpi-savings">0%</span>
            <span class="kpi-change neutral">of income saved</span>
          </div>
        </div>
      </div>

      <!-- ═══════════════ FINANCIAL HEALTH SUMMARY ═══════════════ -->
      <div class="fin-health-section mt-4 mb-4 fade-in">
        <div class="fin-health-header">
          <div>
            <h3 style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:1.3rem;">🏦</span> Financial Health Summary
            </h3>
            <p class="text-secondary text-sm">Complete overview of your financial position</p>
          </div>
          <div class="fin-health-grade" style="background:${healthColor}15;border:1px solid ${healthColor}40;">
            <span class="fin-health-grade-letter" style="color:${healthColor};">${healthGrade}</span>
            <span class="fin-health-grade-label" style="color:${healthColor};">Score: ${healthScore}/100</span>
          </div>
        </div>

        <!-- Net Worth + Assets vs Liabilities -->
        <div class="grid grid-3 mt-3">
          <!-- Net Worth -->
          <div class="card fin-health-card ${netWorth >= 0 ? 'fin-positive' : 'fin-negative'}">
            <div class="fin-health-card-icon">${netWorth >= 0 ? '💎' : '⚠️'}</div>
            <span class="fin-health-card-label">Net Worth</span>
            <span class="fin-health-card-value" style="color:${netWorth >= 0 ? 'var(--success)' : 'var(--danger)'};" id="kpi-networth">
              ${FinanceStore.formatCurrency(netWorth)}
            </span>
            <span class="fin-health-card-sub">Assets - Liabilities</span>
          </div>

          <!-- Total Assets -->
          <div class="card fin-health-card fin-assets">
            <div class="fin-health-card-icon">📊</div>
            <span class="fin-health-card-label">Total Assets</span>
            <span class="fin-health-card-value text-success" id="kpi-assets">
              ${FinanceStore.formatCurrency(balance + portfolio.totalCurrent)}
            </span>
            <div class="fin-health-breakdown">
              <div class="fin-breakdown-row">
                <span>💰 Cash Balance</span>
                <span>${FinanceStore.formatCurrency(balance)}</span>
              </div>
              <div class="fin-breakdown-row">
                <span>📈 Investments</span>
                <span>${FinanceStore.formatCurrency(portfolio.totalCurrent)}</span>
              </div>
            </div>
          </div>

          <!-- Total Liabilities -->
          <div class="card fin-health-card fin-liabilities">
            <div class="fin-health-card-icon">💳</div>
            <span class="fin-health-card-label">Total Liabilities</span>
            <span class="fin-health-card-value text-danger" id="kpi-liabilities">
              ${FinanceStore.formatCurrency(totalDebt)}
            </span>
            <div class="fin-health-breakdown">
              <div class="fin-breakdown-row">
                <span>🏛️ Loan Outstanding</span>
                <span>${FinanceStore.formatCurrency(totalOutstandingPrincipal)}</span>
              </div>
              <div class="fin-breakdown-row">
                <span>💳 Credit Card Due</span>
                <span>${FinanceStore.formatCurrency(totalCardDebt)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Investment Portfolio + Goals + Monthly Obligations -->
        <div class="grid grid-3 mt-3">
          <!-- Investment Portfolio Brief -->
          <div class="card fin-health-card">
            <div class="fin-health-card-header">
              <span style="display:flex;align-items:center;gap:6px;"><span style="font-size:1.1rem;">📈</span> Investments</span>
              <a href="#" class="card-link fin-link" id="dash-go-investments">View →</a>
            </div>
            ${portfolio.totalInvested > 0 ? `
              <div class="fin-inv-summary">
                <div class="fin-inv-row">
                  <span>Invested</span>
                  <span class="fw-600">${FinanceStore.formatCurrency(portfolio.totalInvested)}</span>
                </div>
                <div class="fin-inv-row">
                  <span>Current Value</span>
                  <span class="fw-600 ${portfolio.totalReturns >= 0 ? 'text-success' : 'text-danger'}">${FinanceStore.formatCurrency(portfolio.totalCurrent)}</span>
                </div>
                <div class="fin-inv-row fin-inv-returns">
                  <span>Total Returns</span>
                  <span class="${portfolio.totalReturns >= 0 ? 'text-success' : 'text-danger'}">
                    ${portfolio.totalReturns >= 0 ? '+' : ''}${FinanceStore.formatCurrency(portfolio.totalReturns)}
                    <small>(${portfolio.totalReturns >= 0 ? '+' : ''}${portfolio.returnPct.toFixed(1)}%)</small>
                  </span>
                </div>
              </div>
              <div class="fin-inv-types">
                ${portfolio.stocks.count > 0 ? `<span class="fin-inv-chip" style="--chip-color:#6366f1;">📊 ${portfolio.stocks.count} Stocks</span>` : ''}
                ${portfolio.mutualFunds.count > 0 ? `<span class="fin-inv-chip" style="--chip-color:#10b981;">📈 ${portfolio.mutualFunds.count} MFs</span>` : ''}
                ${portfolio.sips.count > 0 ? `<span class="fin-inv-chip" style="--chip-color:#f59e0b;">🔄 ${portfolio.sips.count} SIPs</span>` : ''}
              </div>
            ` : `
              <div class="fin-empty-mini">
                <span>No investments yet</span>
                <span class="text-muted" style="font-size:0.75rem;">Add stocks, MFs, or SIPs</span>
              </div>
            `}
          </div>

          <!-- Savings Goals Brief -->
          <div class="card fin-health-card">
            <div class="fin-health-card-header">
              <span style="display:flex;align-items:center;gap:6px;"><span style="font-size:1.1rem;">🎯</span> Savings Goals</span>
              <a href="#" class="card-link fin-link" id="dash-go-goals">View →</a>
            </div>
            ${goals.length > 0 ? `
              <div class="fin-goals-mini">
                <div class="fin-goals-progress-row">
                  <span>${FinanceStore.formatCurrency(goalsTotalSaved)}</span>
                  <span class="text-muted">of ${FinanceStore.formatCurrency(goalsTotalTarget)}</span>
                </div>
                <div class="progress-bar" style="height:10px;">
                  <div class="progress-fill ${goalsProgress > 0.7 ? 'green' : goalsProgress > 0.3 ? 'yellow' : 'red'}" style="width:${Math.min(100, Math.round(goalsProgress * 100))}%"></div>
                </div>
                <span class="text-muted" style="font-size:0.75rem;">${Math.round(goalsProgress * 100)}% achieved across ${goals.length} goal${goals.length > 1 ? 's' : ''}</span>
              </div>
            ` : `
              <div class="fin-empty-mini">
                <span>No goals set</span>
                <span class="text-muted" style="font-size:0.75rem;">Set savings targets to track</span>
              </div>
            `}
          </div>

          <!-- Monthly Obligations -->
          <div class="card fin-health-card">
            <div class="fin-health-card-header">
              <span style="display:flex;align-items:center;gap:6px;"><span style="font-size:1.1rem;">📅</span> Monthly Obligations</span>
            </div>
            <div class="fin-obligations">
              <div class="fin-inv-row">
                <span>💸 EMI Payments</span>
                <span class="fw-600 text-danger">${FinanceStore.formatCurrency(totalMonthlyEMI)}</span>
              </div>
              <div class="fin-inv-row">
                <span>🔄 Recurring Expenses</span>
                <span class="fw-600 text-warning">${FinanceStore.formatCurrency(monthlyRecurringExpense)}</span>
              </div>
              <div class="fin-inv-row fin-inv-returns" style="border-top:1px solid var(--border-light);padding-top:8px;margin-top:4px;">
                <span class="fw-600">Total Fixed Outgo</span>
                <span class="fw-600 text-danger">${FinanceStore.formatCurrency(totalMonthlyObligations)}</span>
              </div>
              ${summary.income > 0 ? `
                <div class="fin-obligation-ratio mt-2">
                  <span class="text-muted" style="font-size:0.72rem;">
                    ${Math.round((totalMonthlyObligations / summary.income) * 100)}% of income goes to fixed obligations
                  </span>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="grid grid-2">
        <div class="card">
          <div class="card-header">
            <h3>Income vs Expenses</h3>
            <span class="card-subtitle">Last 6 months</span>
          </div>
          <div class="card-body chart-container">
            <canvas id="chart-income-expense"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h3>Spending by Category</h3>
            <span class="card-subtitle">Current month</span>
          </div>
          <div class="card-body chart-container">
            <canvas id="chart-category-spend"></canvas>
          </div>
        </div>
      </div>

      <!-- Credit Cards Section -->
      <div class="credit-cards-section mt-4 mb-4">
        <div class="credit-cards-header">
          <div>
            <h3>Credit Cards</h3>
            <p class="text-secondary text-sm">Manage credit limits, payments, and due dates</p>
          </div>
          <button class="btn btn-primary btn-sm" id="dash-add-card">
            <span class="btn-icon">+</span> Add Credit Card
          </button>
        </div>
        <div class="credit-cards-grid" id="credit-cards-grid">
          ${cardsHTML}
        </div>
      </div>

      <!-- EMI Burden Section -->
      ${activeLoansCount > 0 ? `
      <div class="emi-burden-section mt-4 mb-4 fade-in">
        <div class="card emi-burden-card">
          <div class="card-header">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="emi-burden-icon-wrapper">💸</div>
              <div>
                <h3>Monthly Loan Liabilities</h3>
                <span class="card-subtitle">${activeLoansCount} active loan${activeLoansCount !== 1 ? 's' : ''} under repayment</span>
              </div>
            </div>
            <a href="#" class="card-link" id="dash-view-emis">Manage Loans →</a>
          </div>
          <div class="card-body">
            <div class="emi-burden-grid">
              <div class="emi-burden-stat">
                <div class="emi-burden-stat-icon" style="background: var(--danger-light); color: var(--danger);">📉</div>
                <div>
                  <span class="emi-burden-stat-label">Monthly EMI Burden</span>
                  <span class="emi-burden-stat-value text-rose" id="kpi-emi-burden">${FinanceStore.formatCurrency(totalMonthlyEMI)}</span>
                </div>
              </div>
              <div class="emi-burden-stat">
                <div class="emi-burden-stat-icon" style="background: var(--primary-glow); color: var(--primary-light);">🏛️</div>
                <div>
                  <span class="emi-burden-stat-label">Total Outstanding</span>
                  <span class="emi-burden-stat-value text-indigo">${FinanceStore.formatCurrency(totalOutstandingPrincipal)}</span>
                </div>
              </div>
              <div class="emi-burden-stat">
                <div class="emi-burden-stat-icon" style="background: var(--warning-light); color: var(--warning);">🔢</div>
                <div>
                  <span class="emi-burden-stat-label">Active Loans</span>
                  <span class="emi-burden-stat-value text-warning">${activeLoansCount}</span>
                </div>
              </div>
              <div class="emi-burden-stat">
                <div class="emi-burden-stat-icon" style="background: ${(summary.income - totalMonthlyEMI) >= 0 ? 'var(--success-light)' : 'var(--danger-light)'}; color: ${(summary.income - totalMonthlyEMI) >= 0 ? 'var(--success)' : 'var(--danger)'};">${(summary.income - totalMonthlyEMI) >= 0 ? '✅' : '⚠️'}</div>
                <div>
                  <span class="emi-burden-stat-label">Net After EMI</span>
                  <span class="emi-burden-stat-value ${(summary.income - summary.expense - totalMonthlyEMI) >= 0 ? 'text-success' : 'text-danger'}">${FinanceStore.formatCurrency(summary.income - summary.expense - totalMonthlyEMI)}</span>
                </div>
              </div>
            </div>
            <div class="emi-burden-ratio mt-3">
              <div class="emi-burden-ratio-header">
                <span class="emi-burden-ratio-label">EMI to Income Ratio</span>
                <span class="emi-burden-ratio-value">${summary.income > 0 ? Math.round((totalMonthlyEMI / summary.income) * 100) : 0}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill ${summary.income > 0 && (totalMonthlyEMI / summary.income) > 0.5 ? 'red' : summary.income > 0 && (totalMonthlyEMI / summary.income) > 0.3 ? 'yellow' : 'green'}" style="width: ${summary.income > 0 ? Math.min(100, Math.round((totalMonthlyEMI / summary.income) * 100)) : 0}%"></div>
              </div>
              <span class="emi-burden-ratio-hint">${summary.income > 0 && (totalMonthlyEMI / summary.income) > 0.5 ? '⚠️ High debt-to-income ratio — consider restructuring' : summary.income > 0 && (totalMonthlyEMI / summary.income) > 0.3 ? '⚡ Moderate debt load — monitor closely' : '✅ Healthy debt-to-income ratio'}</span>
            </div>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- Bottom Row -->
      <div class="grid grid-2-1">
        <div class="card">
          <div class="card-header">
            <h3>Recent Transactions</h3>
            <a href="#" class="card-link" id="dash-view-all-txn">View All →</a>
          </div>
          <div class="card-body txn-list">${recentTxnHTML}</div>
        </div>
        <div class="card">
          <div class="card-header">
            <h3>Budget Overview</h3>
            <a href="#" class="card-link" id="dash-manage-budgets">Manage →</a>
          </div>
          <div class="card-body budget-overview-list">${budgetHTML}</div>
        </div>
      </div>
    `;

    /* ----- Animated KPI counters ----- */
    animateValue(balance, 1000, (v) => {
      document.getElementById('kpi-balance').textContent = FinanceStore.formatCurrency(v);
    });
    animateValue(summary.income, 1000, (v) => {
      document.getElementById('kpi-income').textContent = FinanceStore.formatCurrency(v);
    });
    animateValue(summary.expense, 1000, (v) => {
      document.getElementById('kpi-expense').textContent = FinanceStore.formatCurrency(v);
    });
    animateValue(summary.savingsRate || 0, 1000, (v) => {
      document.getElementById('kpi-savings').textContent = Math.round(v) + '%';
    });

    /* ----- Charts ----- */
    // Income vs Expenses bar chart (last 6 months)
    if (monthlyTotals && monthlyTotals.length > 0) {
      const labels   = monthlyTotals.map(m => {
        const d = new Date(m.month + '-01');
        return d.toLocaleString('default', { month: 'short', year: '2-digit' });
      });
      const incomes  = monthlyTotals.map(m => m.income);
      const expenses = monthlyTotals.map(m => m.expense);
      FinanceCharts.barChart('chart-income-expense', {
        labels,
        datasets: [
          { label: 'Income',   data: incomes,  color: '#10b981' },
          { label: 'Expenses', data: expenses, color: '#f43f5e' }
        ],
        yPrefix: '₹'
      });
    }

    // Spending by category doughnut
    if (catTotals && catTotals.length > 0) {
      const catLabels = catTotals.map(t => t.category);
      const catData   = catTotals.map(t => t.total);
      const catColors = catTotals.map(t => t.color);
      const totalSpend = catData.reduce((s, v) => s + v, 0);
      FinanceCharts.doughnutChart('chart-category-spend', {
        labels: catLabels,
        data:   catData,
        colors: catColors,
        centerText: FinanceStore.formatCurrency(totalSpend)
      });
    }

    /* ----- Event listeners ----- */
    document.getElementById('dash-add-txn')
      .addEventListener('click', () => openTransactionModal(null));

    document.getElementById('dash-view-all-txn')
      .addEventListener('click', (e) => { e.preventDefault(); App.navigate('transactions'); });

    document.getElementById('dash-manage-budgets')
      .addEventListener('click', (e) => { e.preventDefault(); App.navigate('budgets'); });

    // Financial Health links
    const goInvBtn = document.getElementById('dash-go-investments');
    if (goInvBtn) goInvBtn.addEventListener('click', (e) => { e.preventDefault(); App.navigate('investments'); });
    const goGoalsBtn = document.getElementById('dash-go-goals');
    if (goGoalsBtn) goGoalsBtn.addEventListener('click', (e) => { e.preventDefault(); App.navigate('goals'); });
    // Alert banners close handlers
    const alertCloseBtns = container.querySelectorAll('.alert-close-btn');
    alertCloseBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetId = btn.dataset.target;
        const banner = document.getElementById(targetId);
        if (banner) {
          banner.classList.remove('fade-in');
          banner.style.opacity = '0';
          banner.style.transform = 'translateY(-10px)';
          banner.style.transition = 'all 0.3s ease';
          setTimeout(() => {
            banner.remove();
            // If container is empty, remove the container too
            const alertBox = container.querySelector('.alert-box-container');
            if (alertBox && alertBox.children.length === 0) {
              alertBox.remove();
            }
          }, 300);
        }
      });
    });

    // Alert banners Pay Bill handlers
    const alertPayBtns = container.querySelectorAll('.alert-pay-btn');
    alertPayBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cardId = btn.dataset.id;
        const card = FinanceStore.getCards().find(c => c.id === cardId);
        if (!card) return;

        App.confirm(`Pay credit card bill of <strong>${FinanceStore.formatCurrency(card.dueAmount)}</strong> for <strong>${card.bankName} ${card.cardName}</strong> and record as expense?`)
          .then(confirmed => {
            if (confirmed) {
              // 1. Add Transaction
              FinanceStore.addTransaction({
                type: 'expense',
                amount: card.dueAmount,
                category: 'Bills & Utilities',
                description: `Credit Card Bill Pay: ${card.bankName} ${card.cardName}`,
                date: new Date().toISOString().slice(0, 10)
              });

              // 2. Update Card Balances
              const updatedUsed = Math.max(0, card.cardUsed - card.dueAmount);
              FinanceStore.updateCard(cardId, {
                cardUsed: updatedUsed,
                dueAmount: 0
              });

              App.showToast(`Bill payment of ${FinanceStore.formatCurrency(card.dueAmount)} recorded and balance updated!`, 'success');
              
              // 3. Re-render Dashboard
              render();
            }
          });
      });
    });

    // Alert banners Pay EMI handlers
    const alertPayEmiBtns = container.querySelectorAll('.alert-pay-emi-btn');
    alertPayEmiBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        var loanId = btn.dataset.id;
        var loan = FinanceStore.getLoans().find(function(l) { return l.id === loanId; });
        if (!loan) return;

        App.confirm('Pay EMI installment of <strong>' + FinanceStore.formatCurrency(loan.emiAmount) + '</strong> for <strong>' + loan.name + '</strong> and record as expense?')
          .then(function(confirmed) {
            if (confirmed) {
              var ok = FinanceStore.payLoanEMI(loanId);
              if (ok) {
                App.showToast('EMI payment of ' + FinanceStore.formatCurrency(loan.emiAmount) + ' recorded!', 'success');
                render();
              } else {
                App.showToast('Payment failed or loan fully repaid!', 'error');
              }
            }
          });
      });
    });

    // Navigate to EMIs from dashboard
    var viewEmisBtn = document.getElementById('dash-view-emis');
    if (viewEmisBtn) {
      viewEmisBtn.addEventListener('click', function(e) { e.preventDefault(); App.navigate('emis'); });
    }

    // Credit card actions & handlers
    const addCardBtn = document.getElementById('dash-add-card');
    if (addCardBtn) {
      addCardBtn.addEventListener('click', () => openCreditCardModal(null));
    }

    const cardsGrid = document.getElementById('credit-cards-grid');
    if (cardsGrid) {
      cardsGrid.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-card-btn');
        if (editBtn) {
          const id = editBtn.dataset.id;
          const found = FinanceStore.getCards().find(c => c.id === id);
          if (found) {
            openCreditCardModal(found);
          }
          return;
        }

        const deleteBtn = e.target.closest('.delete-card-btn');
        if (deleteBtn) {
          const id = deleteBtn.dataset.id;
          App.confirm('Are you sure you want to delete this credit card?').then(confirmed => {
            if (confirmed) {
              FinanceStore.deleteCard(id);
              App.showToast('Credit card deleted', 'success');
              render();
            }
          });
          return;
        }
      });
    }

    // Global ticking clock is managed by App.js in the main header.
  }

  /* Expose the view */
  window.DashboardView = { render };
})();
