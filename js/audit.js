/**
 * Strategy Validation Lab — Central SPA View Module
 * 
 * Coordinates setup forms, state-machine HUDs, walk-forward timers,
 * performance benchmark graphs, and institutional audit reports.
 */
(function () {
  'use strict';

  // Inject CSS overlays for the Validation Lab
  var style = document.createElement('style');
  style.textContent = `
    .audit-grid {
      display: grid;
      grid-template-columns: 1fr 2.2fr;
      gap: 20px;
    }
    @media (max-width: 1200px) {
      .audit-grid {
        grid-template-columns: 1fr;
      }
    }
    .terminal-console {
      font-family: 'JetBrains Mono', var(--font-mono), monospace;
      font-size: 0.72rem;
      line-height: 1.5;
      color: #10b981;
      background: #07070a;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-color);
      padding: 12px;
      max-height: 220px;
      overflow-y: auto;
    }
    .metric-value-huge {
      font-size: 2.2rem;
      font-weight: 800;
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: -1px;
    }
    .audit-metric-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 16px;
      text-align: center;
      transition: var(--transition);
    }
    .audit-metric-card:hover {
      border-color: var(--primary-glow);
      box-shadow: var(--shadow-glow);
    }
    .insight-bullet {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px;
      background: rgba(255, 255, 255, 0.01);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      font-size: 0.8rem;
      margin-bottom: 8px;
    }
    .state-pill {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 4px 8px;
      border-radius: 4px;
      background: rgba(255,255,255,0.03);
      color: var(--text-muted);
      border: 1px solid var(--border-color);
      transition: all 0.25s ease;
    }
    .state-pill.active-wait { background: rgba(59, 130, 246, 0.12); color: var(--info); border-color: var(--info); }
    .state-pill.active-scan { background: rgba(168, 85, 247, 0.12); color: #a855f7; border-color: #a855f7; }
    .state-pill.active-qualify { background: rgba(245, 158, 11, 0.12); color: var(--warning); border-color: var(--warning); }
    .state-pill.active-enter { background: rgba(16, 185, 129, 0.12); color: var(--success); border-color: var(--success); }
    .state-pill.active-manage { background: rgba(16, 185, 129, 0.2); color: var(--success); border-color: var(--success); box-shadow: 0 0 10px rgba(16, 185, 129, 0.1); }
    .state-pill.active-exit { background: rgba(239, 68, 68, 0.12); color: var(--danger); border-color: var(--danger); }
    .state-pill.active-cooldown { background: rgba(113, 113, 122, 0.2); color: var(--text-muted); border-color: #71717a; }
    .state-pill.active-shutdown { background: rgba(239, 68, 68, 0.3); color: var(--danger); border-color: var(--danger); box-shadow: 0 0 12px var(--danger); }
  `;
  document.head.appendChild(style);

  var activeReplaySpeed = 50; // default 50x for quick validation

  function render() {
    var container = document.getElementById('view-container');
    if (!container) return;

    container.innerHTML = `
      <div class="trading-container">
        
        <div class="audit-grid">
          
          <!-- LEFT: Audit Setup & Parameters -->
          <div class="flex-column gap-2" style="display: flex; flex-direction: column; gap: 20px;">
            
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Setup Audit Lab</h3>
                <span class="badge badge-category" style="background: rgba(16, 185, 129, 0.15); color: var(--success); font-size: 0.72rem;">Model Governance</span>
              </div>
              
              <form id="audit-setup-form" onsubmit="event.preventDefault();">
                <div class="form-group">
                  <label class="form-label" style="font-size: 0.78rem;">Simulation Date</label>
                  <input type="date" id="audit-date" class="form-input py-1" style="font-size: 0.85rem;" value="2026-05-15">
                </div>

                <div class="form-row" style="display: flex; gap: 12px; margin-bottom: 12px;">
                  <div class="form-group" style="flex: 1; margin-bottom: 0;">
                    <label class="form-label" style="font-size: 0.78rem;">Starting Capital</label>
                    <input type="number" id="audit-capital" class="form-input py-1" style="font-size: 0.85rem;" value="500000" step="50000">
                  </div>
                  <div class="form-group" style="flex: 1; margin-bottom: 0;">
                    <label class="form-label" style="font-size: 0.78rem;">Trade Risk Limit</label>
                    <select id="audit-risk-pct" class="form-select py-1" style="font-size: 0.85rem;">
                      <option value="0.005" selected>0.5% (Strict Risk Limit)</option>
                      <option value="0.01">1.0% (Moderate Risk)</option>
                      <option value="0.02">2.0% (High Risk)</option>
                    </select>
                  </div>
                </div>

                <div class="form-row" style="display: flex; gap: 12px; margin-bottom: 12px;">
                  <div class="form-group" style="flex: 1; margin-bottom: 0;">
                    <label class="form-label" style="font-size: 0.78rem;">Universe</label>
                    <select id="audit-universe" class="form-select py-1" style="font-size: 0.85rem;">
                      <option value="NIFTY50" selected>NIFTY 50 Universe</option>
                      <option value="ALL">NSE 150 Core List</option>
                    </select>
                  </div>
                  <div class="form-group" style="flex: 1; margin-bottom: 0;">
                    <label class="form-label" style="font-size: 0.78rem;">Risk Profile</label>
                    <select id="audit-mode" class="form-select py-1" style="font-size: 0.85rem;">
                      <option value="Conservative">Conservative</option>
                      <option value="Balanced" selected>Balanced Mode</option>
                      <option value="Aggressive">Aggressive</option>
                    </select>
                  </div>
                </div>

                <div style="border-top: 1px solid var(--border-light); padding-top: 12px; margin-top: 12px;">
                  <h4 style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;">Governance Rules (Phase 17)</h4>
                  <div style="display: grid; grid-template-columns: 1fr; gap: 6px; font-size: 0.78rem; color: var(--text-secondary);">
                    <div style="display: flex; align-items: center; gap: 6px;">🛡️ Capped Daily Loss Limit: <b>-2.0% Shutdown</b></div>
                    <div style="display: flex; align-items: center; gap: 6px;">🧘 Strict Sequential Limit: <b>1 Active Position</b></div>
                    <div style="display: flex; align-items: center; gap: 6px;">⏱️ Mandatory Post-Trade Cooldown: <b>10 Minutes</b></div>
                    <div style="display: flex; align-items: center; gap: 6px;">💥 Volatility Position-Cut Sizer: <b>Active</b></div>
                  </div>
                </div>

                <button id="btn-start-audit" class="btn btn-primary w-100 mt-3" style="width: 100%; font-size: 0.85rem; padding-top: 8px; padding-bottom: 8px;">
                  🚀 Start Institutional Validation Replay
                </button>
              </form>
            </div>

            <!-- Selection Engine Rankings Card -->
            <div id="selection-ranking-card" class="card" style="display: none;">
              <h3 class="card-title" style="font-size: 0.82rem; color: #a855f7; margin-bottom: 12px;">
                🔍 Autonomous Volatility & Liquidity Scan (9:30 AM)
              </h3>
              <div style="max-height: 220px; overflow-y: auto;">
                <table class="data-table" style="min-width: 100%; font-size: 0.72rem;">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Scanner Score</th>
                      <th>Liquidity</th>
                      <th>Trend Bias</th>
                    </tr>
                  </thead>
                  <tbody id="scanned-rankings-list">
                    <!-- Loaded Dynamically -->
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          <!-- RIGHT: Replay Timeline, Feeds & Reports -->
          <div class="flex-column gap-2" style="display: flex; flex-direction: column; gap: 20px;">
            
            <!-- Replay Window Controls -->
            <div class="card">
              <div class="card-header">
                <div>
                  <h3 class="card-title" id="replay-title" style="font-size: 0.95rem;">Walk-Forward Simulation Terminal</h3>
                  <p class="card-subtitle" style="font-size: 0.78rem;">Sequential trading execution HUD • Quality Over Quantity</p>
                </div>
                <div id="replay-speed-controls" class="flex-between gap-1" style="display: none;">
                  <button class="btn btn-secondary btn-sm" data-speed="1" style="padding: 2px 8px;">1×</button>
                  <button class="btn btn-secondary btn-sm" data-speed="10" style="padding: 2px 8px;">10×</button>
                  <button class="btn btn-secondary btn-sm active" data-speed="50" style="padding: 2px 8px;">50×</button>
                  <button class="btn btn-secondary btn-sm" data-speed="9999" style="padding: 2px 8px;">Instant ⚡</button>
                  <button id="btn-stop-simulation" class="btn btn-danger btn-sm" style="padding: 2px 8px; margin-left: 8px;">⏹ Stop</button>
                </div>
              </div>

              <!-- Replay State Machine HUD -->
              <div style="display: flex; gap: 6px; justify-content: center; margin-top: 10px; flex-wrap: wrap;">
                <span id="state-pill-wait" class="state-pill active-wait">WAIT</span>
                <span id="state-pill-scan" class="state-pill">SCAN</span>
                <span id="state-pill-qualify" class="state-pill">QUALIFY</span>
                <span id="state-pill-enter" class="state-pill">ENTER</span>
                <span id="state-pill-manage" class="state-pill">MANAGE</span>
                <span id="state-pill-exit" class="state-pill">EXIT</span>
                <span id="state-pill-cooldown" class="state-pill">COOLDOWN</span>
                <span id="state-pill-shutdown" class="state-pill">SHUTDOWN</span>
              </div>

              <!-- Timeline progress slider -->
              <div class="mt-2" style="background: var(--bg-card-hover); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-light);">
                <div class="flex-between" style="font-size: 0.75rem; font-family: monospace; color: var(--text-secondary); margin-bottom: 6px;">
                  <span id="replay-time-indicator">09:15 AM</span>
                  <span id="replay-progress-pct">0% Progress</span>
                </div>
                <div class="progress-bar" style="height: 6px; background: rgba(255,255,255,0.05);">
                  <div id="replay-progress-fill" class="progress-fill green" style="width: 0%;"></div>
                </div>
              </div>

              <!-- P&L Dashboard Ticking Metrics -->
              <div class="grid-4 mt-2 gap-1" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
                <div class="audit-metric-card" style="padding: 10px;">
                  <div class="card-subtitle" style="font-size: 0.72rem;">Available Cash</div>
                  <div id="tick-cash" style="font-size: 1.05rem; font-weight: 700; font-family: monospace; color: var(--text-primary);">₹0.00</div>
                </div>
                <div class="audit-metric-card" style="padding: 10px;">
                  <div class="card-subtitle" style="font-size: 0.72rem;">Unrealized P&L</div>
                  <div id="tick-unrealized" style="font-size: 1.05rem; font-weight: 700; font-family: monospace; color: var(--text-secondary);">₹0.00</div>
                </div>
                <div class="audit-metric-card" style="padding: 10px;">
                  <div class="card-subtitle" style="font-size: 0.72rem;">Frictional Costs</div>
                  <div id="tick-fees" style="font-size: 1.05rem; font-weight: 700; font-family: monospace; color: var(--danger);">₹0.00</div>
                </div>
                <div class="audit-metric-card" style="border-left: 3px solid var(--primary); padding: 10px;">
                  <div class="card-subtitle" style="font-size: 0.72rem;">Total Portfolio Value</div>
                  <div id="tick-portfolio" style="font-size: 1.05rem; font-weight: 700; font-family: monospace; color: var(--primary-light);">₹0.00</div>
                </div>
              </div>
            </div>

            <!-- Execution Logs and Mini position card -->
            <div class="grid-2-1 gap-2" style="display: grid; grid-template-columns: 2.2fr 1fr; gap: 20px;">
              <!-- Execution Feed Terminal -->
              <div class="card" style="padding: 16px;">
                <h3 class="card-title" style="font-size: 0.82rem; margin-bottom: 8px;">Lookahead-Protected Simulation Feed</h3>
                <div id="audit-terminal" class="terminal-console">
                  [09:15:00] Validation core loaded. Awaiting setup initiation parameters...
                </div>
              </div>

              <!-- Open trades mini HUD -->
              <div class="card" style="padding: 16px;">
                <h3 class="card-title" style="font-size: 0.82rem; margin-bottom: 8px;">Active Sequential Position</h3>
                <div id="audit-active-list" style="display: flex; flex-direction: column; gap: 8px;">
                  <div class="text-center text-muted" style="font-size: 0.75rem; padding: 20px 0;">No active position (WAIT).</div>
                </div>
              </div>
            </div>

            <!-- Performance Metrics Dashboard (Shown when complete) -->
            <div id="performance-dashboard" class="flex-column gap-2" style="display: none; flex-direction: column; gap: 20px;">
              
              <!-- Core Metrics Grid -->
              <div class="card" style="padding: 24px;">
                <h3 class="card-title mb-2" style="font-size: 1rem; border-bottom: 1px solid var(--border-light); padding-bottom: 8px;">Executive Summary (Phase 18)</h3>
                
                <div class="grid-4 gap-2" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px;">
                  <div class="audit-metric-card" style="border-top: 3px solid var(--success);">
                    <div class="card-subtitle" style="font-size: 0.78rem;">Net Profit / Loss</div>
                    <div class="metric-value-huge text-success" id="perf-net-profit" style="font-size: 1.8rem;">₹0</div>
                    <div class="badge badge-income" id="perf-roi" style="margin-top: 4px; display: inline-block;">+0.00% ROI</div>
                  </div>
                  <div class="audit-metric-card" style="border-top: 3px solid #a855f7;">
                    <div class="card-subtitle" style="font-size: 0.78rem;">Win Rate %</div>
                    <div class="metric-value-huge" style="color: #a855f7; font-size: 1.8rem;" id="perf-winrate">0%</div>
                    <div id="perf-trades-count" style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px;">0 trades executed</div>
                  </div>
                  <div class="audit-metric-card" style="border-top: 3px solid var(--danger);">
                    <div class="card-subtitle" style="font-size: 0.78rem;">Maximum Drawdown</div>
                    <div class="metric-value-huge text-danger" id="perf-drawdown" style="font-size: 1.8rem;">0.0%</div>
                    <span style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 4px;">Capital risk exposure</span>
                  </div>
                  <div class="audit-metric-card" style="border-top: 3px solid var(--info);">
                    <div class="card-subtitle" style="font-size: 0.78rem;">Sharpe Ratio</div>
                    <div class="metric-value-huge text-info" id="perf-sharpe" style="font-size: 1.8rem;">0.00</div>
                    <div class="badge badge-active" id="perf-expectancy" style="background: var(--info-light); color: var(--info); margin-top: 4px; display: inline-block;">₹0 Expectancy</div>
                  </div>
                </div>

                <!-- Strategic Risk & Behavioral Attributions -->
                <div class="grid-3 gap-2" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
                  <div style="background: var(--bg-card-hover); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-light);">
                    <h4 style="font-size: 0.8rem; font-weight: 700; color: var(--primary-light); margin-bottom: 8px;">🛡️ Model Risk Ratios</h4>
                    <div style="font-size: 0.78rem; display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary);">
                      <div class="flex-between"><span>Annualized Sortino:</span><strong id="att-sortino" class="text-success">0.00</strong></div>
                      <div class="flex-between"><span>Win Payoff Ratio:</span><strong id="att-payoff">0.00x</strong></div>
                      <div class="flex-between"><span>Hold Hold Duration:</span><strong id="att-holdtime">0.00 bars</strong></div>
                    </div>
                  </div>
                  <div style="background: var(--bg-card-hover); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-light);">
                    <h4 style="font-size: 0.8rem; font-weight: 700; color: #a855f7; margin-bottom: 8px;">🧘 Behavioral Review</h4>
                    <div style="font-size: 0.78rem; display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary);">
                      <div class="flex-between"><span>Patience Score:</span><strong id="att-patience" class="text-success">0%</strong></div>
                      <div class="flex-between"><span>Confidence Accuracy:</span><strong id="att-accuracy">0%</strong></div>
                      <div class="flex-between"><span>Trading Overactivity:</span><strong id="att-overtrading" class="text-success">Disciplined</strong></div>
                    </div>
                  </div>
                  <div style="background: var(--bg-card-hover); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-light);">
                    <h4 style="font-size: 0.8rem; font-weight: 700; color: var(--warning); margin-bottom: 8px;">📑 Model Calibration</h4>
                    <div style="font-size: 0.78rem; display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary);">
                      <div class="flex-between"><span>False Positives Filtered:</span><strong id="att-falsepos">0</strong></div>
                      <div class="flex-between"><span>Missed Setups skipped:</span><strong id="att-missed">0</strong></div>
                      <div class="flex-between"><span>Total Frictional Fees:</span><strong id="att-friction" class="text-danger">₹0</strong></div>
                    </div>
                  </div>
                </div>

              </div>

              <!-- Out-of-Sample Robustness Audit Section (Phase 18 Upgrade) -->
              <div class="card" style="border: 1px solid var(--border-color); padding: 16px;">
                <div class="flex-between" style="border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 12px;">
                  <h3 class="card-title" style="font-size: 0.9rem; color: #10b981; display: flex; align-items: center; gap: 6px;">🛡️ Out-of-Sample Robustness Audit (Multi-Day Replay Sweep)</h3>
                  <span id="robustness-badge" class="badge" style="background: rgba(16, 185, 129, 0.15); color: var(--success);">ROBUSTNESS PASSED</span>
                </div>
                <div class="grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 0.78rem;">
                  <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-light); border-radius: var(--radius-md); padding: 12px;">
                    <div style="font-weight: 700; margin-bottom: 6px; color: var(--text-secondary);">Test Day 1 (Bearish Drift): <span id="stress-date1" style="font-family: monospace;">-</span></div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Trades Executed:</span><strong id="stress-trades1">-</strong></div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Simulated ROI:</span><strong id="stress-roi1">-</strong></div>
                    <div style="display: flex; justify-content: space-between;"><span>Max Drawdown:</span><strong id="stress-dd1" class="text-danger">-</strong></div>
                  </div>
                  <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-light); border-radius: var(--radius-md); padding: 12px;">
                    <div style="font-weight: 700; margin-bottom: 6px; color: var(--text-secondary);">Test Day 2 (High Volatility Choppiness): <span id="stress-date2" style="font-family: monospace;">-</span></div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Trades Executed:</span><strong id="stress-trades2">-</strong></div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span>Simulated ROI:</span><strong id="stress-roi2">-</strong></div>
                    <div style="display: flex; justify-content: space-between;"><span>Max Drawdown:</span><strong id="stress-dd2" class="text-danger">-</strong></div>
                  </div>
                </div>
                <p id="robustness-text" class="text-muted mt-2" style="font-size: 0.72rem; line-height: 1.4; margin-top: 10px;">
                  Out-of-sample robustness sweeps validate the strategy across different dates/regimes to detect and reject curve-fitted backtests automatically.
                </p>
              </div>

              <!-- AI Audit Critique & Recommendations -->
              <div class="card" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.04) 0%, rgba(168, 85, 247, 0.04) 100%); border-color: rgba(99, 102, 241, 0.15);">
                <h3 class="card-title text-center" style="color: #a855f7; display: flex; justify-content: center; gap: 8px; align-items: center; font-size: 1rem;">
                  🧠 AI Continuous Calibration Diagnostics (Phase 19)
                </h3>
                <div class="grid-2 mt-2 gap-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                  <div>
                    <h4 style="font-size: 0.8rem; font-weight: 700; color: var(--success); margin-bottom: 8px;">💎 Audited Strengths</h4>
                    <div id="ai-strengths-bullets"></div>
                  </div>
                  <div>
                    <h4 style="font-size: 0.8rem; font-weight: 700; color: var(--danger); margin-bottom: 8px;">🛑 Audited Vulnerabilities</h4>
                    <div id="ai-vulnerabilities-bullets"></div>
                  </div>
                </div>
                <div class="mt-2 pt-2" style="border-top: 1px solid rgba(255,255,255,0.05);">
                  <h4 style="font-size: 0.8rem; font-weight: 700; color: #a855f7; margin-bottom: 8px;">💡 Suggested Parameter Calibrations</h4>
                  <div id="ai-suggestions-bullets"></div>
                </div>
              </div>

              <!-- Institutional Report Downloads -->
              <div class="card flex-between" style="padding: 16px 24px;">
                <div>
                  <h4 class="card-title" style="font-size: 0.88rem;">Strategy Validation Audit Ledger</h4>
                  <p class="card-subtitle" style="font-size: 0.78rem;">Download institutional audit sheets for regulatory or firm review</p>
                </div>
                <div class="flex-between gap-1">
                  <button id="btn-export-csv" class="btn btn-secondary py-1" style="font-size: 0.8rem; padding: 6px 12px;">📥 Export CSV Ledger</button>
                  <button id="btn-export-json" class="btn btn-secondary py-1" style="font-size: 0.8rem; padding: 6px 12px;">📥 Export JSON Report</button>
                  <button id="btn-print-report" class="btn btn-primary py-1" style="font-size: 0.8rem; padding: 6px 12px;">🖨 Print Audit Summary</button>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    var btnStart = document.getElementById('btn-start-audit');
    var speedGroup = document.getElementById('replay-speed-controls');

    if (btnStart) {
      btnStart.onclick = startAuditing;
    }

    if (speedGroup) {
      speedGroup.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-speed]');
        if (!btn) return;

        speedGroup.querySelectorAll('button[data-speed]').forEach(function (el) {
          el.classList.remove('active');
        });
        btn.classList.add('active');

        activeReplaySpeed = parseInt(btn.getAttribute('data-speed'));
        if (window.ReplayEngine.getPlaying()) {
          window.ReplayEngine.startReplay(activeReplaySpeed);
        }
      });
    }

    var btnStop = document.getElementById('btn-stop-simulation');
    if (btnStop) {
      btnStop.onclick = function () {
        window.ReplayEngine.stopReplay();
        window.App.showToast("Replay simulation halted manually.", "info");
      };
    }
  }

  function isTradingDay(dateString) {
    var date = new Date(dateString);
    if (isNaN(date.getTime())) return false;

    // Weekends (Saturday = 6, Sunday = 0)
    var day = date.getDay();
    if (day === 0 || day === 6) return false;

    // Standard NSE National Holidays (MM-DD)
    var month = date.getMonth() + 1;
    var dayOfMonth = date.getDate();
    var mdStr = (month < 10 ? '0' + month : month) + '-' + (dayOfMonth < 10 ? '0' + dayOfMonth : dayOfMonth);

    var holidays = [
      '01-26', // Republic Day
      '04-14', // Ambedkar Jayanti
      '05-01', // Maharashtra Day
      '08-15', // Independence Day
      '10-02', // Gandhi Jayanti
      '12-25', // Christmas
      '03-14', // Holi
      '04-18', // Good Friday
      '11-05'  // Diwali
    ];

    return holidays.indexOf(mdStr) === -1;
  }

  function startAuditing() {
    var dateVal = document.getElementById('audit-date').value;
    var capitalVal = parseFloat(document.getElementById('audit-capital').value);
    var riskVal = parseFloat(document.getElementById('audit-risk-pct').value);
    var universeVal = document.getElementById('audit-universe').value;
    var modeVal = document.getElementById('audit-mode').value;
    var shortEl = document.getElementById('audit-short');
    var marginEl = document.getElementById('audit-margin');
    var brokerageEl = document.getElementById('audit-brokerage');

    var shortVal = shortEl ? shortEl.checked : true;
    var marginVal = marginEl ? marginEl.checked : true;
    var brokerageVal = brokerageEl ? brokerageEl.checked : true;

    if (!dateVal) {
      window.App.showToast("Please choose a valid date for historical day replay.", "warning");
      return;
    }

    // National Market Calendar Validator (Weekends & NSE Holidays)
    if (!isTradingDay(dateVal)) {
      window.App.showToast("Selected date is a stock market holiday or weekend! Simulations are only allowed on active NSE trading days.", "warning");
      return;
    }

    // 1. Run Stock Selection Scans
    var rankedCandidates = window.SelectionEngine.runScan(universeVal, dateVal);
    if (rankedCandidates.length === 0) {
      window.App.showToast("Scanner failed to locate any trading volume candidates on this date.", "error");
      return;
    }

    // Renders the ranked table in setup
    document.getElementById('selection-ranking-card').style.display = 'block';
    var rankTbody = document.getElementById('scanned-rankings-list');
    rankTbody.innerHTML = rankedCandidates.slice(0, 10).map(function (item, rankIdx) {
      return `
        <tr>
          <td><strong>#${rankIdx + 1} ${item.ticker}</strong></td>
          <td><span class="badge" style="background: rgba(168, 85, 247, 0.1); color: #a855f7;">${item.score} Score</span></td>
          <td>${item.volumeMultiplier}x Vol Surge</td>
          <td>${item.momentum >= 0 ? '+' : ''}${item.momentum}% Gap</td>
        </tr>
      `;
    }).join('');

    // Take top 3 stocks to simulate trades on (Nifty constituents)
    var selectedTickers = rankedCandidates.slice(0, 3).map(function (x) { return x.ticker; });

    // Initialize systems
    window.PortfolioSimulator.init(capitalVal, riskVal, modeVal, brokerageVal, shortVal, marginVal);
    window.AuditEngine.clearLogs();

    // Reset UI
    document.getElementById('replay-speed-controls').style.display = 'flex';
    document.getElementById('performance-dashboard').style.display = 'none';
    document.getElementById('audit-terminal').innerHTML = `[09:15:00] Initialized walk-forward audit on date: ${dateVal} with starting capital ₹${capitalVal.toLocaleString('en-IN')}.\n[09:20:00] Autonomous Selection Engine scored ${rankedCandidates.length} universe stocks.\n[09:30:00] Top 3 liquidity candidates selected to execute signals on: ${selectedTickers.join(', ')}.`;

    // Start Day Replay walk-forward
    window.ReplayEngine.initReplay(selectedTickers, dateVal, handleReplayTick, handleReplayComplete);
    window.ReplayEngine.startReplay(activeReplaySpeed);
    window.App.showToast("Walk-forward Strategy Replay started!", "success");
  }

  function handleReplayTick(slices, barIndex, maxIndex) {
    var niftySlice = slices['NIFTY'];
    var currentNiftyCandle = niftySlice[niftySlice.length - 1];

    // Format simulated timestamp
    var dateObj = new Date(currentNiftyCandle.time);
    var nowTimeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

    // 1. Evaluate trades entries and exits autonomously for each ticker candle slice (lookahead-protected!)
    for (var ticker in slices) {
      if (ticker === 'NIFTY') continue;

      var stockSlice = slices[ticker];
      var lastCandle = stockSlice[stockSlice.length - 1];

      // Run indicators on sliced history
      var rsi = calculateWilderRsi(stockSlice);
      var macd = calculateAuditMacd(stockSlice);

      var isBuySignal = rsi < 32 && macd.bullish;
      var isSellSignal = rsi > 68 && !macd.bullish;

      if (isBuySignal) {
        window.PortfolioSimulator.processSignal(ticker, 'BUY', lastCandle.close, stockSlice, "RSI Oversold + MACD Crossover");
      } else if (isSellSignal) {
        window.PortfolioSimulator.processSignal(ticker, 'SELL', lastCandle.close, stockSlice, "RSI Overbought + MACD Crossover");
      }
    }

    // 2. Evaluate active protective stop loss/take profit triggers
    window.PortfolioSimulator.evaluatePositions(slices);

    // 3. Update State machine HUD pills
    var pf = window.PortfolioSimulator.getPortfolio();
    updateStateMachineHUD(pf.currentState);

    // 4. Update dashboard labels
    document.getElementById('replay-time-indicator').textContent = nowTimeStr + " (Audit Session)";
    document.getElementById('replay-progress-pct').textContent = window.ReplayEngine.getProgression(maxIndex) + "% Progress";
    document.getElementById('replay-progress-fill').style.width = window.ReplayEngine.getProgression(maxIndex) + "%";

    document.getElementById('tick-cash').textContent = '₹' + pf.cash.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    
    var unrealizedSum = 0;
    for (var posKey in pf.positions) {
      unrealizedSum += pf.positions[posKey].pnl;
    }
    
    document.getElementById('tick-unrealized').textContent = (unrealizedSum >= 0 ? '+' : '') + '₹' + unrealizedSum.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    document.getElementById('tick-unrealized').className = 'sizer-output-val ' + (unrealizedSum >= 0 ? 'text-success' : 'text-danger');

    var totalFees = pf.brokerageFees + pf.taxFees + pf.slippageFees;
    document.getElementById('tick-fees').textContent = '₹' + totalFees.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    document.getElementById('tick-portfolio').textContent = '₹' + pf.portfolioValue.toLocaleString('en-IN', { maximumFractionDigits: 0 });

    // Render active positions list HUD
    var activeListEl = document.getElementById('audit-active-list');
    var activePosCount = Object.keys(pf.positions).length;
    if (activePosCount === 0) {
      activeListEl.innerHTML = `<div class="text-center text-muted" style="font-size: 0.75rem; padding: 20px 0;">No active position (WAIT).</div>`;
    } else {
      activeListEl.innerHTML = Object.keys(pf.positions).map(function (tickerKey) {
        var p = pf.positions[tickerKey];
        return `
          <div style="background: var(--bg-card-hover); border: 1px solid var(--border-light); padding: 10px; border-radius: var(--radius-md); font-size: 0.75rem;">
            <div class="flex-between">
              <strong>${p.ticker}</strong>
              <span class="badge ${p.type === 'BUY' ? 'badge-income' : 'badge-expense'}">${p.type}</span>
            </div>
            <div class="flex-between mt-1">
              <span class="text-muted">Shares: ${p.shares}</span>
              <span class="font-mono ${p.pnl >= 0 ? 'text-success' : 'text-danger'}">${p.pnl >= 0 ? '+' : ''}₹${p.pnl.toFixed(0)}</span>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 4px;">
              SL: ₹${p.stopLoss} | TP: ₹${p.takeProfit}
            </div>
          </div>
        `;
      }).join('');
    }

    // Append to scrollable terminal
    var terminal = document.getElementById('audit-terminal');
    var timeline = window.AuditEngine.getTimeline();
    if (timeline.length > 0) {
      terminal.innerHTML = timeline.map(function (log) {
        var isExit = log.action.indexOf('EXIT') !== -1;
        var color = isExit ? '#a855f7' : log.action === 'BUY' ? '#10b981' : '#f43f5e';
        return `<div>[${log.time}] <strong style="color: ${color};">${log.action}</strong> ${log.ticker} ${log.qty} shares @ ₹${log.price} - SL: ₹${log.sl} (${log.reason})</div>`;
      }).join('');
      terminal.scrollTop = terminal.scrollHeight;
    }
  }

  function handleReplayComplete() {
    // 1. Force close any remaining open positions (EOD square-off)
    window.PortfolioSimulator.forceCloseAll({});

    var pf = window.PortfolioSimulator.getPortfolio();
    var perf = window.AuditEngine.calculatePerformance(pf.closedTrades, pf.startingCapital, pf.portfolioValue, pf);

    // Update State HUD
    updateStateMachineHUD(pf.isShutdown ? 'SHUTDOWN' : 'WAIT');

    // Update UI Ticking metrics to finalized EOD cash/portfolio values
    document.getElementById('tick-cash').textContent = '₹' + pf.cash.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    document.getElementById('tick-unrealized').textContent = '₹0';
    document.getElementById('tick-portfolio').textContent = '₹' + pf.portfolioValue.toLocaleString('en-IN', { maximumFractionDigits: 0 });

    // 2. Load Final Performance Summary dashboard metrics
    document.getElementById('performance-dashboard').style.display = 'block';

    var profitEl = document.getElementById('perf-net-profit');
    var roiEl = document.getElementById('perf-roi');

    profitEl.textContent = (perf.netProfit >= 0 ? '+' : '') + '₹' + perf.netProfit.toLocaleString('en-IN');
    profitEl.className = 'metric-value-huge ' + (perf.netProfit >= 0 ? 'text-success' : 'text-danger');

    roiEl.textContent = (perf.netProfit >= 0 ? '+' : '') + perf.roi + '% ROI';
    roiEl.className = 'badge ' + (perf.netProfit >= 0 ? 'badge-income' : 'badge-expense');

    document.getElementById('perf-winrate').textContent = perf.winRate + '%';
    document.getElementById('perf-trades-count').textContent = `${perf.trades} total simulated trades (Avg hold: ${perf.holdTime} bars)`;
    document.getElementById('perf-drawdown').textContent = perf.maxDrawdown + '%';
    document.getElementById('perf-sharpe').textContent = perf.sharpe.toFixed(2);
    document.getElementById('perf-expectancy').textContent = `₹${perf.expectancy} Expectancy`;

    // Attributions row
    document.getElementById('att-sortino').textContent = perf.sortino.toFixed(2);
    
    var winLossPayoff = perf.avgLoser > 0 ? (perf.avgWinner / perf.avgLoser).toFixed(1) + 'x' : 'N/A';
    document.getElementById('att-payoff').textContent = winLossPayoff;
    document.getElementById('att-holdtime').textContent = perf.holdTime + ' bars';
    document.getElementById('att-patience').textContent = perf.patienceScore + '%';
    document.getElementById('att-accuracy').textContent = perf.confidenceAccuracy + '%';
    
    var totalFees = pf.brokerageFees + pf.taxFees + pf.slippageFees;
    document.getElementById('att-friction').textContent = '₹' + totalFees.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    
    var overtradingStatus = perf.trades > 8 ? "High Frequency" : perf.trades > 5 ? "Moderate" : "Disciplined 🧘";
    document.getElementById('att-overtrading').textContent = overtradingStatus;
    document.getElementById('att-overtrading').className = perf.trades > 8 ? "text-danger" : "text-success";

    document.getElementById('att-falsepos').textContent = perf.falsePositives;
    document.getElementById('att-missed').textContent = perf.missedOpportunities;

    // --- Execute Out-of-Sample Robustness Audit Stress Sweep (Phases 18 & 19 Upgrade) ---
    var dateVal = document.getElementById('audit-date').value || "2026-05-15";
    var capitalVal = parseFloat(document.getElementById('audit-capital').value) || 500000;
    var riskVal = parseFloat(document.getElementById('audit-risk-pct').value) || 0.005;
    var modeVal = document.getElementById('audit-mode').value || 'Balanced';
    var shortVal = true;
    var marginVal = true;
    var brokerageVal = true;
    
    // Pick selection universe active tickers
    var rankedCandidates = window.SelectionEngine ? window.SelectionEngine.runScan('ALL', dateVal) : [];
    var activeTickers = rankedCandidates.slice(0, 3).map(function(x) { return x.ticker; });

    // Run the stress sweep
    var stress = window.PortfolioSimulator.runStressTest(activeTickers, dateVal, capitalVal, riskVal, modeVal, brokerageVal, shortVal, marginVal);

    // Update UI elements for stress test
    document.getElementById('stress-date1').textContent = stress.date1;
    document.getElementById('stress-trades1').textContent = stress.trades1 + " trades";
    document.getElementById('stress-roi1').textContent = (stress.roi1 >= 0 ? '+' : '') + stress.roi1.toFixed(2) + "% ROI";
    document.getElementById('stress-roi1').className = stress.roi1 >= 0 ? "text-success" : "text-danger";
    document.getElementById('stress-dd1').textContent = stress.drawdown1.toFixed(2) + "%";

    document.getElementById('stress-date2').textContent = stress.date2;
    document.getElementById('stress-trades2').textContent = stress.trades2 + " trades";
    document.getElementById('stress-roi2').textContent = (stress.roi2 >= 0 ? '+' : '') + stress.roi2.toFixed(2) + "% ROI";
    document.getElementById('stress-roi2').className = stress.roi2 >= 0 ? "text-success" : "text-danger";
    document.getElementById('stress-dd2').textContent = stress.drawdown2.toFixed(2) + "%";

    var badge = document.getElementById('robustness-badge');
    var textEl = document.getElementById('robustness-text');

    if (stress.isRobust && perf.roi >= -1.0) {
      badge.textContent = "ROBUSTNESS PASSED ✅";
      badge.style.background = "rgba(16, 185, 129, 0.15)";
      badge.style.color = "var(--success)";
      textEl.innerHTML = `🌟 <b>Governance Certification: Approved for Production.</b> Out-of-sample sweeps validated the setup under multiple historical regimes with average return of <b>${(stress.avgRoi >= 0 ? '+' : '') + stress.avgRoi.toFixed(2)}% ROI</b>. Curve-fitting risks are extremely low.`;
    } else {
      badge.textContent = "ROBUSTNESS REJECTED ❌";
      badge.style.background = "rgba(239, 68, 68, 0.15)";
      badge.style.color = "var(--danger)";
      textEl.innerHTML = `⚠️ <b>Governance Certification: Rejected (Curve-Fitted).</b> Strategy collapsed on out-of-sample sweeps (average stress ROI: <b>${(stress.avgRoi >= 0 ? '+' : '') + stress.avgRoi.toFixed(2)}%</b>, Drawdowns exceeded risk tolerances). Optimization was over-fitted to the selected session parameters.`;
    }

    // 3. Generate and Render AI Diagnostics Review insights
    var insights = window.AuditInsights.generateInsights(perf, pf.closedTrades, pf);
    
    // Add robustness notes to diagnostic bullets
    if (!stress.isRobust) {
      insights.weaknesses.push(`🚨 <b>Out-of-Sample Vulnerability:</b> The strategy collapsed on independent dates, revealing high regime sensitivity and poor out-of-sample generalization.`);
      insights.suggestions.push(`💡 <b>Calibrate Robustness:</b> Reduce indicator optimization parameters and raise final setup confidence score gating from 85 to 90 to prevent low-sample curve-fitting.`);
    } else {
      insights.strengths.push(`🛡️ <b>Proven Out-of-Sample generalizability:</b> Strategy passed multi-day stress checks across diverse regimes without capital blowouts.`);
    }

    document.getElementById('ai-strengths-bullets').innerHTML = insights.strengths.map(function (s) {
      return `<div class="insight-bullet" style="border-left: 3px solid var(--success);"><span style="color: var(--success); font-weight: 800;">✓</span><div>${s}</div></div>`;
    }).join('');

    document.getElementById('ai-vulnerabilities-bullets').innerHTML = insights.weaknesses.map(function (w) {
      return `<div class="insight-bullet" style="border-left: 3px solid var(--danger);"><span style="color: var(--danger); font-weight: 800;">✗</span><div>${w}</div></div>`;
    }).join('');

    document.getElementById('ai-suggestions-bullets').innerHTML = insights.suggestions.map(function (s) {
      return `<div class="insight-bullet" style="border-left: 3px solid #a855f7;"><span style="color: #a855f7;">💡</span><div>${s}</div></div>`;
    }).join('');

    // 4. Bind download button actions
    document.getElementById('btn-export-csv').onclick = function () {
      window.AuditReport.downloadCSV(pf.closedTrades, window.AuditEngine.getTimeline());
    };
    document.getElementById('btn-export-json').onclick = function () {
      window.AuditReport.downloadJSON(perf, pf.closedTrades, pf);
    };
    document.getElementById('btn-print-report').onclick = function () {
      window.AuditReport.printReport();
    };

    window.App.showToast("Strategy day validation completed successfully!", "success");
  }

  function updateStateMachineHUD(activeState) {
    var states = ['wait', 'scan', 'qualify', 'enter', 'manage', 'exit', 'cooldown', 'shutdown'];
    states.forEach(function (st) {
      var el = document.getElementById('state-pill-' + st);
      if (el) {
        el.className = 'state-pill'; // Reset
        if (st === activeState.toLowerCase()) {
          el.className = 'state-pill active-' + st;
        }
      }
    });
  }

  /* ──────────────── Indicators Helpers ───────────────────────── */

  function calculateWilderRsi(candles, period) {
    period = period || 14;
    if (candles.length <= period) return 50;

    var gains = 0, losses = 0;
    for (var i = 1; i <= period; i++) {
      var diff = candles[i].close - candles[i - 1].close;
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    var avgGain = gains / period;
    var avgLoss = losses / period;

    for (var j = period + 1; j < candles.length; j++) {
      var d = candles[j].close - candles[j - 1].close;
      var g = d > 0 ? d : 0;
      var l = d < 0 ? -d : 0;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
    }
    if (avgLoss === 0) return 100;
    var rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  function calculateAuditMacd(candles) {
    function ema(data, period) {
      var k = 2 / (period + 1);
      var emaVal = data[0];
      for (var i = 1; i < data.length; i++) {
        emaVal = data[i] * k + emaVal * (1 - k);
      }
      return emaVal;
    }
    if (candles.length < 26) return { macd: 0, signal: 0, bullish: false };
    var closes = candles.map(function (c) { return c.close; });
    var ema12 = ema(closes.slice(-12), 12);
    var ema26 = ema(closes.slice(-26), 26);
    var macd = ema12 - ema26;

    var prevEma12 = ema(closes.slice(-13, -1), 12);
    var prevEma26 = ema(closes.slice(-27, -1), 26);
    var prevMacd = prevEma12 - prevEma26;
    var signal = macd * 0.2 + prevMacd * 0.8;

    return { macd: macd, signal: signal, bullish: macd > signal };
  }

  window.AuditView = {
    render: render
  };
})();
