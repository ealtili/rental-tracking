import { translations } from './translations.js';

// ----------------------------------------------------
// FRONTEND STATE CONFIGURATION
// ----------------------------------------------------
let state = {
  lang: localStorage.getItem('lang') || (navigator.language.startsWith('tr') ? 'tr' : 'en'),
  theme: localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'),
  user: JSON.parse(sessionStorage.getItem('user')) || null,
  activeView: 'dashboard',
  reconciliations: [], // Store parsed statement rows
  activeLedger: null // Active lease ID for ledger modal
};

// Initialize Application UI
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initLang();
  setupGlobalEvents();
  
  if (state.user) {
    showAppShell();
  } else {
    showAuthShell();
  }
});

// ----------------------------------------------------
// THEME & LOCALIZATION ENGINE
// ----------------------------------------------------
function initTheme() {
  if (state.theme === 'light') {
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.remove('light');
  }
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', state.theme);
  initTheme();
}

function initLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = translations[state.lang][key];
    if (translation) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.setAttribute('placeholder', translation);
      } else {
        el.innerHTML = translation;
      }
    }
  });

  // Update visual slider toggles
  document.querySelectorAll('.lang-switch-toggle').forEach(el => {
    if (state.lang === 'tr') {
      el.classList.remove('lang-en');
      el.classList.add('lang-tr');
    } else {
      el.classList.remove('lang-tr');
      el.classList.add('lang-en');
    }
  });
}

function toggleLang() {
  state.lang = state.lang === 'tr' ? 'en' : 'tr';
  localStorage.setItem('lang', state.lang);
  initLang();
  if (state.user) {
    loadView(state.activeView);
  }
}

// ----------------------------------------------------
// API REQUEST WRAPPERS (Least Privilege & Isolation)
// ----------------------------------------------------
async function apiFetch(endpoint, options = {}) {
  if (!state.user) return null;

  // Don't set Content-Type for FormData — the browser handles the
  // multipart boundary automatically. Forcing application/json breaks
  // multer file uploads and causes the server to return an HTML error page.
  const isFormData = options.body instanceof FormData;
  const headers = {
    'x-landlord-id': state.user.id,
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {})
  };

  const config = { ...options, headers };

  try {
    const res = await fetch(`/api${endpoint}`, config);
    if (!res.ok) {
      // The server may return HTML (e.g. a 404/500 Express error page).
      // Try JSON first; fall back to a plain text message so the user
      // always sees something meaningful instead of a raw parse error.
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const err = await res.json();
        throw new Error(err.error || `Server error (${res.status})`);
      } else {
        throw new Error(`Server error (${res.status}): ${res.statusText || 'Unexpected response from server.'}`);
      }
    }
    return await res.json();
  } catch (err) {
    console.error(`API Error fetching ${endpoint}:`, err.message);
    alert(err.message);
    throw err;
  }
}

async function adminFetch(endpoint, options = {}) {
  if (!state.user || state.user.role !== 'admin') return null;
  const headers = {
    'Content-Type': 'application/json',
    'x-admin-id': state.user.id,
    ...(options.headers || {})
  };
  try {
    const res = await fetch(`/api${endpoint}`, { ...options, headers });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Admin request failed');
    }
    return await res.json();
  } catch (err) {
    console.error(`Admin API Error:`, err.message);
    throw err;
  }
}

// ----------------------------------------------------
// SHELL SWITCHERS
// ----------------------------------------------------
function showAuthShell() {
  document.getElementById('auth-view').style.display = 'flex';
  document.getElementById('app-view').style.display = 'none';
  document.getElementById('mobile-top-bar').style.display = 'none';
  sessionStorage.removeItem('user');
  state.user = null;
}

function showAppShell() {
  // Guard: admins must never see the landlord shell
  if (state.user && state.user.role === 'admin') {
    showAdminShell();
    return;
  }
  document.getElementById('auth-view').style.display = 'none';
  document.getElementById('app-view').style.display = 'flex';
  // Check if mobile view is active via window width
  if (window.innerWidth <= 768) {
    document.getElementById('mobile-top-bar').style.display = 'flex';
  }
  
  // Set default view
  loadView('dashboard');
}

// ----------------------------------------------------
// ADMIN SHELL (separate isolated view for admin users)
// ----------------------------------------------------
function showAdminShell() {
  document.getElementById('auth-view').style.display = 'none';
  document.getElementById('app-view').style.display = 'none';
  document.getElementById('mobile-top-bar').style.display = 'none';

  let adminView = document.getElementById('admin-view');
  if (!adminView) {
    adminView = document.createElement('div');
    adminView.id = 'admin-view';
    adminView.style.cssText = 'min-height:100vh; background:var(--bg-primary); display:flex; flex-direction:column;';
    document.body.appendChild(adminView);
  }
  adminView.style.display = 'flex';
  adminView.style.flexDirection = 'column';
  renderAdminPanel(adminView);
}

async function renderAdminPanel(container) {
  container.innerHTML = `
    <!-- Admin Top Bar -->
    <div style="
      background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%);
      padding: 0 32px;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      position: sticky; top: 0; z-index: 100;
    ">
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="width:36px; height:36px; border-radius:10px; background:rgba(255,255,255,0.15); display:flex; align-items:center; justify-content:center; font-size:18px;">🛡️</div>
        <div>
          <div style="font-size:15px; font-weight:700; color:#fff;">Admin Console</div>
          <div style="font-size:11px; color:rgba(255,255,255,0.6);">Rental Tracker — System Administration</div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:16px;">
        <div style="font-size:13px; color:rgba(255,255,255,0.7);">
          Signed in as <strong style="color:#c4b5fd;">${state.user.name}</strong>
        </div>
        <button id="admin-logout-btn" style="
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.2);
          color: #fff;
          padding: 7px 16px;
          border-radius: 8px;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.2s;
        ">Sign Out</button>
      </div>
    </div>

    <!-- Admin Body -->
    <div style="flex:1; padding:40px 32px; max-width:1100px; width:100%; margin:0 auto;">

      <!-- Page Header -->
      <div style="margin-bottom:32px;">
        <h1 style="font-size:26px; font-weight:800; color:var(--text-primary); margin:0 0 6px;">User Management</h1>
        <p style="font-size:14px; color:var(--text-secondary); margin:0;">View all registered landlord accounts. You can reset passwords or remove accounts entirely.</p>
      </div>

      <!-- Stats bar -->
      <div id="admin-stats" style="display:flex; gap:16px; margin-bottom:28px;">
        <div style="background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.25); border-radius:12px; padding:16px 24px; flex:1; text-align:center;">
          <div style="font-size:28px; font-weight:800; color:#818cf8;" id="admin-stat-total">—</div>
          <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">Total Users</div>
        </div>
      </div>

      <!-- User table -->
      <div class="glass-card" style="padding:0; overflow:hidden;">
        <div style="padding:20px 24px; border-bottom:1px solid var(--border-color); display:flex; align-items:center; justify-content:space-between;">
          <div style="font-size:15px; font-weight:700; color:var(--text-primary);">Registered Users</div>
          <div style="font-size:12px; color:var(--text-secondary);" id="admin-last-refresh"></div>
        </div>
        <div class="table-container" style="border-radius:0;">
          <table>
            <thead>
              <tr>
                <th style="padding:14px 20px;">#</th>
                <th style="padding:14px 20px;">Name</th>
                <th style="padding:14px 20px;">Email</th>
                <th style="padding:14px 20px;">Phone</th>
                <th style="padding:14px 20px;">User ID</th>
                <th style="padding:14px 20px; text-align:center;">Actions</th>
              </tr>
            </thead>
            <tbody id="admin-users-tbody">
              <tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding:32px;">Loading users...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Logout
  document.getElementById('admin-logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('user');
    state.user = null;
    const adminView = document.getElementById('admin-view');
    if (adminView) adminView.style.display = 'none';
    showAuthShell();
  });

  await loadAdminUsers();
}

async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-tbody');
  const statTotal = document.getElementById('admin-stat-total');
  const lastRefresh = document.getElementById('admin-last-refresh');
  if (!tbody) return;

  try {
    const users = await adminFetch('/admin/users');
    if (statTotal) statTotal.textContent = users.length;
    if (lastRefresh) lastRefresh.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-secondary); padding:32px;">No registered users found.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map((u, i) => `
      <tr style="transition: background 0.15s;" onmouseover="this.style.background='rgba(99,102,241,0.05)'" onmouseout="this.style.background='transparent'">
        <td style="padding:14px 20px; color:var(--text-secondary); font-size:13px;">${i + 1}</td>
        <td style="padding:14px 20px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#8b5cf6); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; color:#fff; flex-shrink:0;">
              ${u.name.charAt(0).toUpperCase()}
            </div>
            <span style="font-weight:600; color:var(--text-primary);">${u.name}</span>
          </div>
        </td>
        <td style="padding:14px 20px; color:var(--text-secondary); font-size:13px;">${u.email}</td>
        <td style="padding:14px 20px; color:var(--text-secondary); font-size:13px;">${u.phone || '—'}</td>
        <td style="padding:14px 20px;">
          <code style="font-size:11px; background:rgba(99,102,241,0.1); padding:3px 8px; border-radius:5px; color:#818cf8;">${u.id}</code>
        </td>
        <td style="padding:14px 20px; text-align:center;">
          <div style="display:flex; gap:8px; justify-content:center;">
            <button
              class="btn btn-secondary btn-sm admin-reset-btn"
              data-id="${u.id}"
              data-name="${u.name}"
              style="font-size:12px; padding:6px 12px;"
              title="Reset password for ${u.name}"
            >🔑 Reset Password</button>
            <button
              class="btn btn-sm admin-delete-btn"
              data-id="${u.id}"
              data-name="${u.name}"
              style="font-size:12px; padding:6px 12px; background:rgba(239,68,68,0.15); color:#f87171; border:1px solid rgba(239,68,68,0.3); border-radius:8px;"
              title="Delete ${u.name} and all their data"
            >🗑️ Delete</button>
          </div>
        </td>
      </tr>
    `).join('');

    // Bind reset password buttons
    document.querySelectorAll('.admin-reset-btn').forEach(btn => {
      btn.addEventListener('click', () => openAdminResetModal(btn.dataset.id, btn.dataset.name));
    });

    // Bind delete buttons
    document.querySelectorAll('.admin-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => confirmAdminDelete(btn.dataset.id, btn.dataset.name));
    });

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#f87171; padding:32px;">Failed to load users: ${err.message}</td></tr>`;
  }
}

function openAdminResetModal(userId, userName) {
  const overlay = document.getElementById('modal-overlay');
  const body = document.getElementById('modal-body');
  body.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border-color); padding-bottom:12px;">
      <h2 style="font-size:18px; font-weight:700;">🔑 Reset Password</h2>
      <button class="btn btn-secondary btn-sm" id="admin-modal-close">Close</button>
    </div>
    <div style="display:flex; align-items:center; gap:10px; background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.25); border-radius:10px; padding:10px 14px; margin-bottom:20px;">
      <div style="width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#8b5cf6); display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:700; color:#fff; flex-shrink:0;">
        ${userName.charAt(0).toUpperCase()}
      </div>
      <div>
        <div style="font-size:13px; font-weight:700; color:var(--text-primary);">${userName}</div>
        <div style="font-size:12px; color:var(--text-secondary);">${userId}</div>
      </div>
    </div>
    <div class="form-group">
      <label style="font-size:13px; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:6px;">New Password</label>
      <input type="password" id="admin-new-password" placeholder="Minimum 6 characters" style="width:100%; padding:10px 14px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:14px;">
    </div>
    <div class="form-group">
      <label style="font-size:13px; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:6px;">Confirm Password</label>
      <input type="password" id="admin-confirm-password" placeholder="Re-enter password" style="width:100%; padding:10px 14px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); font-size:14px;">
    </div>
    <div id="admin-reset-error" style="display:none; color:#f87171; font-size:13px; margin-bottom:12px;"></div>
    <button id="admin-reset-submit" class="btn btn-primary" style="width:100%;">Reset Password</button>
  `;
  overlay.style.display = 'flex';

  document.getElementById('admin-modal-close').addEventListener('click', () => { overlay.style.display = 'none'; });

  document.getElementById('admin-reset-submit').addEventListener('click', async () => {
    const newPass = document.getElementById('admin-new-password').value;
    const confirmPass = document.getElementById('admin-confirm-password').value;
    const errEl = document.getElementById('admin-reset-error');
    errEl.style.display = 'none';

    if (newPass.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }
    if (newPass !== confirmPass) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }

    try {
      const res = await adminFetch(`/admin/users/${userId}/reset-password`, {
        method: 'PUT',
        body: JSON.stringify({ newPassword: newPass })
      });
      overlay.style.display = 'none';
      alert(`✅ ${res.message}`);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  });
}

async function confirmAdminDelete(userId, userName) {
  const confirmed = confirm(`⚠️ Delete "${userName}"?\n\nThis will permanently remove the user account and ALL their properties, units, leases, tenants, and financial records.\n\nThis action cannot be undone.`);
  if (!confirmed) return;

  try {
    const res = await adminFetch(`/admin/users/${userId}`, { method: 'DELETE' });
    alert(`✅ ${res.message}`);
    await loadAdminUsers(); // Refresh the table
  } catch (err) {
    alert(`❌ Failed to delete user: ${err.message}`);
  }
}

// ----------------------------------------------------
// CLIENT-SIDE ROUTER & VIEW RENDERING
// ----------------------------------------------------
function loadView(viewName) {
  state.activeView = viewName;
  
  // Update sidebar active states
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
    if (el.getAttribute('data-view') === viewName) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Render view templates
  const contentDiv = document.getElementById('view-content');
  
  if (viewName === 'dashboard') {
    renderDashboard(contentDiv);
  } else if (viewName === 'properties') {
    renderProperties(contentDiv);
  } else if (viewName === 'leases') {
    renderLeases(contentDiv);
  } else if (viewName === 'reconcile') {
    renderReconcile(contentDiv);
  } else if (viewName === 'notifications') {
    renderNotifications(contentDiv);
  } else if (viewName === 'settings') {
    renderSettings(contentDiv);
  }
  
  // Apply translation changes
  initLang();
}

// --- VIEW: DASHBOARD ---
async function renderDashboard(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1><span data-i18n="dash_welcome">Welcome back,</span> ${state.user.name}</h1>
    </div>
    
    <div class="kpi-grid">
      <div class="glass-card kpi-card">
        <span class="kpi-title" data-i18n="dash_total_received">Total Rent Received</span>
        <span class="kpi-value" style="color: var(--success-color);" id="kpi-received">0.00 TL</span>
      </div>
      <div class="glass-card kpi-card">
        <span class="kpi-title" data-i18n="dash_total_expected">Expected Rent</span>
        <span class="kpi-value" id="kpi-expected">0.00 TL</span>
      </div>
      <div class="glass-card kpi-card">
        <span class="kpi-title" data-i18n="dash_outstanding">Arrears / Outstanding</span>
        <span class="kpi-value" style="color: var(--danger-color);" id="kpi-outstanding">0.00 TL</span>
      </div>
      <div class="glass-card kpi-card">
        <span class="kpi-title" data-i18n="dash_active_props">Active Properties</span>
        <span class="kpi-value" id="kpi-properties">0</span>
      </div>
    </div>

    <!-- Charts Visualization Grid -->
    <div class="charts-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; margin-bottom: 24px;">
      <div class="glass-card" style="padding: 20px; display: flex; flex-direction: column;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;">
          <h3 style="font-size: 16px; color: var(--text-primary); margin: 0;" data-i18n="dash_rent_trend">Rent Collection Trend (Expected vs Received)</h3>
          <div style="display: flex; gap: 12px; font-size: 11px; color: var(--text-secondary); align-items: center;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: linear-gradient(135deg, #818cf8, #4f46e5);"></span>
              <span data-i18n="legend_expected">Expected</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: linear-gradient(135deg, #34d399, #059669);"></span>
              <span data-i18n="legend_received">Received</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="display: inline-block; width: 14px; height: 0; border-top: 2px dashed #f59e0b;"></span>
              <span data-i18n="legend_rate">Rate</span>
            </div>
          </div>
        </div>
        <div style="flex-grow: 1; min-height: 200px; position: relative;">
          <canvas id="rentTrendChart" style="width: 100%; height: 200px; display: block;"></canvas>
        </div>
      </div>
      <div class="glass-card" style="padding: 20px; display: flex; flex-direction: column; align-items: center;">
        <h3 style="font-size: 16px; margin-bottom: 16px; width: 100%; color: var(--text-primary);" data-i18n="dash_portfolio_split">Portfolio Occupancy Status</h3>
        <div style="flex-grow: 1; min-height: 200px; position: relative; width: 100%; display: flex; justify-content: center; align-items: center;">
          <canvas id="portfolioChart" style="width: 100%; height: 200px; max-width: 200px; display: block;"></canvas>
        </div>
      </div>
    </div>

    <div class="glass-card" style="margin-bottom: 24px;">
      <h2 style="font-size: 18px; margin-bottom: 16px;" data-i18n="dash_recent_trans">Recent Rent Collections</h2>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th data-i18n="dash_date">Date</th>
              <th data-i18n="dash_tenant">Tenant</th>
              <th data-i18n="dash_amount">Amount</th>
              <th data-i18n="dash_period">Period</th>
            </tr>
          </thead>
          <tbody id="dash-payments-table">
            <tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">Loading...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Dynamically apply translations to the injected elements
  initLang();

  try {
    const properties = await apiFetch('/properties');
    const leases = await apiFetch('/leases');
    
    let expectedSum = 0;
    let receivedSum = 0;
    let paymentsList = [];
    const monthlyData = {};

    let totalUnits = 0;
    properties.forEach(p => {
      totalUnits += (p.units || []).length;
    });
    const occupiedUnits = leases.filter(l => l.status === 'Active').length;
    const vacantUnits = Math.max(0, totalUnits - occupiedUnits);

    // Loop through each lease and load ledger details to compile calculations
    for (const lease of leases) {
      if (lease.status !== 'Active') continue;
      const ledger = await apiFetch(`/ledger/${lease.id}`);
      
      // Expected = sum of charges
      expectedSum += ledger.entries.filter(e => e.type === 'charge').reduce((sum, e) => sum + e.amount, 0);
      
      // Received = sum of payments
      receivedSum += ledger.entries.filter(e => e.type === 'payment').reduce((sum, e) => sum + e.amount, 0);
      
      // Collect payments
      const pays = ledger.entries.filter(e => e.type === 'payment');
      pays.forEach(p => {
        paymentsList.push({
          date: p.date,
          tenantName: ledger.tenantName,
          amount: p.amount,
          currency: ledger.currency,
          period: p.description.slice(-7)
        });
      });

      // Populate monthly stats
      for (const entry of ledger.entries) {
        const monthKey = entry.date.slice(0, 7); // e.g. "2026-04"
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { expected: 0, received: 0 };
        }
        if (entry.type === 'charge') {
          monthlyData[monthKey].expected += entry.amount;
        } else if (entry.type === 'payment') {
          monthlyData[monthKey].received += entry.amount;
        }
      }
    }

    // Format currency symbol dynamically
    const cur = leases.length > 0 ? (leases[0].rentSchedule?.[0]?.currency || 'TL') : 'TL';
    document.getElementById('kpi-received').innerText = `${receivedSum.toLocaleString()} ${cur}`;
    document.getElementById('kpi-expected').innerText = `${expectedSum.toLocaleString()} ${cur}`;
    document.getElementById('kpi-outstanding').innerText = `${(expectedSum - receivedSum).toLocaleString()} ${cur}`;
    document.getElementById('kpi-properties').innerText = properties.length;

    // Draw Visualizations
    const trendCanvas = document.getElementById('rentTrendChart');
    if (trendCanvas) {
      drawRentTrendChart(trendCanvas, monthlyData, cur);
    }
    const portfolioCanvas = document.getElementById('portfolioChart');
    if (portfolioCanvas) {
      drawPortfolioDoughnutChart(portfolioCanvas, occupiedUnits, vacantUnits);
    }

    // Load recent payments table
    paymentsList.sort((a, b) => new Date(b.date) - new Date(a.date));
    const recentTable = document.getElementById('dash-payments-table');
    
    if (paymentsList.length === 0) {
      recentTable.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No rent payments recorded yet.</td></tr>`;
    } else {
      recentTable.innerHTML = paymentsList.slice(0, 5).map(p => `
        <tr>
          <td>${p.date}</td>
          <td><strong>${p.tenantName}</strong></td>
          <td style="color: var(--success-color); font-weight: 600;">+${p.amount.toLocaleString()} ${p.currency}</td>
          <td><span class="badge badge-info">${p.period}</span></td>
        </tr>
      `).join('');
    }

    // Re-apply language translation to any late dynamic strings
    initLang();
  } catch (err) {
    console.error('Dashboard load failed:', err);
  }
}

// Chart Helper: Rent Collection Trend Chart (Custom HTML5 Canvas rendering)
function drawRentTrendChart(canvas, data, currency) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  
  const width = rect.width;
  const height = rect.height;
  
  ctx.clearRect(0, 0, width, height);
  
  // Show only the most recent 6 months to prevent label overlapping and clutter
  const sortedMonths = Object.keys(data).sort();
  const months = sortedMonths.slice(-6);
  
  if (months.length === 0) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '13px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No historical trend data available', width / 2, height / 2);
    return;
  }
  
  // Dynamic theme colors resolving (canvas context does not support CSS variables directly)
  const isLight = document.documentElement.classList.contains('light');
  const labelColor = isLight ? '#4b5563' : '#e5e7eb'; // Clean light/dark mode readable labels
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.07)';
  
  const paddingLeft = 70; // Expanded to fit large currency labels (e.g. 374,317 TL)
  const paddingRight = 45; // Expanded to fit percentage values on the right
  const paddingTop = 30;
  const paddingBottom = 30;
  
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  
  let maxVal = 0;
  months.forEach(m => {
    maxVal = Math.max(maxVal, data[m].expected, data[m].received);
  });
  if (maxVal === 0) maxVal = 1000;
  maxVal = maxVal * 1.1; // 10% ceiling padding
  
  // Y-axis gridlines and labels (left side - currency)
  ctx.strokeStyle = gridColor;
  ctx.fillStyle = labelColor;
  ctx.font = '10px Outfit, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const val = (maxVal / gridSteps) * i;
    const y = paddingTop + chartHeight - (chartHeight / gridSteps) * i;
    
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(width - paddingRight, y);
    ctx.stroke();
    
    ctx.fillText(`${Math.round(val).toLocaleString()} ${currency}`, paddingLeft - 8, y);
  }
  
  // Right Y-axis percentage labels (for collection rate line)
  ctx.fillStyle = '#f59e0b';
  ctx.textAlign = 'left';
  for (let i = 0; i <= gridSteps; i++) {
    const pct = (100 / gridSteps) * i;
    const y = paddingTop + chartHeight - (chartHeight / gridSteps) * i;
    ctx.fillText(`${pct}%`, width - paddingRight + 8, y);
  }
  
  // X-axis & bars
  const colWidth = chartWidth / months.length;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  const linePoints = [];
  
  months.forEach((m, idx) => {
    const xCenter = paddingLeft + colWidth * idx + colWidth / 2;
    
    // Month label
    ctx.fillStyle = labelColor;
    ctx.fillText(m, xCenter, paddingTop + chartHeight + 8);
    
    // Draw shadows for bars
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;

    // 1. Expected bar
    const expHeight = (data[m].expected / maxVal) * chartHeight;
    const expX = xCenter - 14;
    const expY = paddingTop + chartHeight - expHeight;
    if (expHeight > 0) {
      const expGrad = ctx.createLinearGradient(expX, expY, expX, paddingTop + chartHeight);
      expGrad.addColorStop(0, '#818cf8');
      expGrad.addColorStop(1, '#4f46e5');
      ctx.fillStyle = expGrad;
      drawRoundedRect(ctx, expX, expY, 10, expHeight, 3);
    }
    
    // 2. Received bar
    const recHeight = (data[m].received / maxVal) * chartHeight;
    const recX = xCenter + 4;
    const recY = paddingTop + chartHeight - recHeight;
    if (recHeight > 0) {
      const recGrad = ctx.createLinearGradient(recX, recY, recX, paddingTop + chartHeight);
      recGrad.addColorStop(0, '#34d399');
      recGrad.addColorStop(1, '#059669');
      ctx.fillStyle = recGrad;
      drawRoundedRect(ctx, recX, recY, 10, recHeight, 3);
    }

    // Reset shadows
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Save points for collection rate line overlay (only show node/rate if rate > 0 to keep UI clean)
    const rate = data[m].expected > 0 ? Math.min(100, (data[m].received / data[m].expected) * 100) : 0;
    if (rate > 0) {
      const yLine = paddingTop + chartHeight - (rate / 100) * chartHeight;
      linePoints.push({ x: xCenter, y: yLine, rate: Math.round(rate) });
    }
  });

  // 3. Draw Collection Rate Trend Line overlay (connect nodes dynamically)
  if (linePoints.length > 0) {
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    linePoints.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // Draw rate node bubbles
    linePoints.forEach(p => {
      // Glow circle
      ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, 2 * Math.PI);
      ctx.fill();

      // Inner dot
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
      ctx.fill();

      // Label bubble box for easy reading
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 11px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${p.rate}%`, p.x, p.y - 8);
    });
  }
}

// Chart Helper: Portfolio occupancy doughnut
function drawPortfolioDoughnutChart(canvas, occupied, vacant) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  
  const width = rect.width;
  const height = rect.height;
  
  ctx.clearRect(0, 0, width, height);
  
  const total = occupied + vacant;
  if (total === 0) {
    ctx.fillStyle = 'var(--text-secondary, #8e9093)';
    ctx.font = '13px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No property portfolio details', width / 2, height / 2);
    return;
  }
  
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 12;
  const innerRadius = radius * 0.65;
  
  const occupiedAngle = (occupied / total) * 2 * Math.PI;
  const vacantAngle = (vacant / total) * 2 * Math.PI;
  
  // Draw Occupied slice
  if (occupied > 0) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + occupiedAngle, false);
    ctx.arc(centerX, centerY, innerRadius, -Math.PI / 2 + occupiedAngle, -Math.PI / 2, true);
    ctx.closePath();
    const occGrad = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, radius);
    occGrad.addColorStop(0, '#6366f1');
    occGrad.addColorStop(1, '#4f46e5');
    ctx.fillStyle = occGrad;
    ctx.fill();
  }
  
  // Draw Vacant slice
  if (vacant > 0) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI / 2 + occupiedAngle, -Math.PI / 2 + occupiedAngle + vacantAngle, false);
    ctx.arc(centerX, centerY, innerRadius, -Math.PI / 2 + occupiedAngle + vacantAngle, -Math.PI / 2 + occupiedAngle, true);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fill();
  }
  
  // Text inside the doughnut
  ctx.fillStyle = 'var(--text-primary, #ffffff)';
  ctx.font = 'bold 22px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const pct = Math.round((occupied / total) * 100);
  ctx.fillText(`${pct}%`, centerX, centerY - 6);
  
  ctx.fillStyle = 'var(--text-secondary, #8e9093)';
  ctx.font = '9px Outfit, sans-serif';
  const labelText = translations[state.lang]['dash_occupied'] || 'OCCUPIED';
  ctx.fillText(labelText, centerX, centerY + 12);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  if (height <= 0) return;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

// --- VIEW: PROPERTIES ---
async function renderProperties(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 data-i18n="prop_title">My Properties & Units</h1>
      <div style="display: flex; gap: 12px;">
        <button class="btn btn-secondary btn-sm" id="btn-bulk-properties" data-i18n="btn_bulk_upload">Bulk Upload</button>
        <button class="btn btn-primary btn-sm" id="btn-add-property" data-i18n="btn_add_prop">Add Property</button>
      </div>
    </div>
    
    <div class="properties-grid" id="properties-grid-container">
      <div style="color: var(--text-secondary);">Loading properties...</div>
    </div>
  `;

  document.getElementById('btn-add-property').addEventListener('click', openAddPropertyModal);
  document.getElementById('btn-bulk-properties').addEventListener('click', openBulkPropertiesModal);
  loadPropertiesList();
}

async function loadPropertiesList() {
  const container = document.getElementById('properties-grid-container');
  try {
    const properties = await apiFetch('/properties');
    const leases = await apiFetch('/leases');
    
    if (properties.length === 0) {
      container.innerHTML = `<div class="glass-card" style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">No properties found. Click 'Add Property' to get started.</div>`;
      return;
    }

    container.innerHTML = properties.map(p => {
      const propUnits = p.units || [];
      const unitsHtml = propUnits.length === 0 
        ? `<p style="font-size: 13px; color: var(--text-secondary); margin-top: 10px; font-style: italic;" data-i18n="prop_no_units">No units configured.</p>`
        : propUnits.map(u => {
            const activeLease = leases.find(l => l.unitId === u.id && l.status === 'Active');
            const tenantInfo = activeLease ? `: <strong>${activeLease.tenantName}</strong>` : '';
            const statusClass = activeLease ? 'badge-success' : 'badge-secondary';
            const statusLabel = activeLease ? (state.lang === 'tr' ? 'Dolu' : 'Occupied') : (state.lang === 'tr' ? 'Boş' : 'Vacant');
            
            return `
              <div class="unit-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(255,255,255,0.02); border-radius: 6px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="flex: 1; text-align: left;">
                  <span style="font-weight: 600;">${u.unitNumber}</span>
                  <span style="font-size: 12px; color: var(--text-secondary); margin-left: 8px;">${u.squareMeters || 0} m²</span>
                  <span style="font-size: 13px; color: var(--text-secondary); margin-left: 12px;">${tenantInfo}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span class="badge ${statusClass}" style="font-size: 10px; padding: 2px 6px;">${statusLabel}</span>
                  <button class="btn-edit-unit" data-id="${u.id}" title="Edit Unit" style="background: none; border: none; cursor: pointer; padding: 2px; color: var(--text-secondary); font-size: 14px;">✏️</button>
                  <button class="btn-delete-unit" data-id="${u.id}" title="Delete Unit" style="background: none; border: none; cursor: pointer; padding: 2px; color: var(--danger-color); font-size: 14px;">🗑️</button>
                </div>
              </div>
            `;
          }).join('');

      return `
        <div class="glass-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
            <div>
              <h3 style="font-size: 18px; font-weight: 700; text-align: left;">${p.name || p.address}</h3>
              <p style="font-size: 13px; color: var(--text-secondary); text-align: left; margin: 4px 0 0 0;">
                ${p.address}, ${p.city} | <span>${p.type === 'Commercial' ? (state.lang === 'tr' ? 'Ticari' : 'Commercial') : (state.lang === 'tr' ? 'Konut' : 'Residential')}</span>
              </p>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
              <span class="badge ${p.active ? 'badge-success' : 'badge-danger'}">
                ${p.active ? 'Active' : 'Inactive'}
              </span>
              <div style="display: flex; gap: 8px; margin-top: 4px;">
                <button class="btn btn-secondary btn-sm btn-edit-prop" data-id="${p.id}" data-i18n="btn_edit_prop" style="padding: 2px 6px; font-size: 11px;">Edit</button>
                <button class="btn btn-danger btn-sm btn-delete-prop" data-id="${p.id}" data-i18n="btn_delete_prop" style="padding: 2px 6px; font-size: 11px;">Delete</button>
              </div>
            </div>
          </div>
          
          <div style="margin-top: 16px;">
            <h4 style="font-size: 14px; font-weight: 600; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); padding-bottom: 6px; text-align: left;" data-i18n="prop_units_header">Units</h4>
            <div style="margin-top: 10px;">
              ${unitsHtml}
            </div>
            <button class="btn btn-secondary btn-sm btn-add-unit" data-prop-id="${p.id}" style="width: 100%; margin-top: 10px; font-size: 12px;" data-i18n="btn_add_unit">+ Add Unit</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach Edit Listeners
    document.querySelectorAll('.btn-edit-prop').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const propId = e.target.getAttribute('data-id');
        openEditPropertyModal(propId);
      });
    });

    // Attach Delete Listeners
    document.querySelectorAll('.btn-delete-prop').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const propId = e.target.getAttribute('data-id');
        const confirmMsg = state.lang === 'tr' 
          ? 'Bu mülkü silmek istediğinize emin misiniz? Mülke bağlı tüm bölümler, sözleşmeler ve cari defter kayıtları kalıcı olarak silinecektir.'
          : 'Are you sure you want to delete this property? This will permanently delete all associated units, leases, and ledger history.';
        if (confirm(confirmMsg)) {
          try {
            await apiFetch(`/properties/${propId}`, { method: 'DELETE' });
            loadPropertiesList();
          } catch (err) {
            console.error(err);
            alert('Failed to delete property.');
          }
        }
      });
    });

    // Attach Add Unit Listeners
    document.querySelectorAll('.btn-add-unit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const propId = e.currentTarget.getAttribute('data-prop-id');
        openAddUnitModal(propId);
      });
    });

    // Attach Edit Unit Listeners
    document.querySelectorAll('.btn-edit-unit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const unitId = e.currentTarget.getAttribute('data-id');
        openEditUnitModal(unitId);
      });
    });

    // Attach Delete Unit Listeners
    document.querySelectorAll('.btn-delete-unit').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const unitId = e.currentTarget.getAttribute('data-id');
        const confirmMsg = state.lang === 'tr' 
          ? 'Bu bölümü silmek istediğinizden emin misiniz? Bölümle ilişkili tüm sözleşmeler ve cari kayıtlar kalıcı olarak silinecektir.'
          : 'Are you sure you want to delete this unit? All associated leases and ledger history will be permanently deleted.';
        
        if (confirm(confirmMsg)) {
          try {
            await apiFetch(`/units/${unitId}`, { method: 'DELETE' });
            loadPropertiesList();
          } catch (err) {
            alert('Failed to delete unit: ' + err.message);
          }
        }
      });
    });

    initLang();
  } catch (err) {
    container.innerHTML = `<div class="badge badge-danger">Failed to load property list.</div>`;
  }
}

async function openAddUnitModal(propId) {
  openModal(`<div style="color: var(--text-secondary); padding: 20px; text-align: center;">Loading...</div>`);

  try {
    const properties = await apiFetch('/properties');
    const parentProp = properties.find(p => p.id === propId);
    const propDisplayName = parentProp ? (parentProp.name || parentProp.address) : '';
    const propDisplayAddr = parentProp ? parentProp.address : '';

  openModal(`
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
      <h2 data-i18n="add_unit_title">Add Unit</h2>
      <button class="btn btn-secondary btn-sm" id="btn-close-unit-modal" data-i18n="close">Close</button>
    </div>

    <!-- Property context banner -->
    <div style="display: flex; align-items: center; gap: 10px; background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.25); border-radius: 10px; padding: 10px 14px; margin-bottom: 18px;">
      <span style="font-size: 20px;">🏢</span>
      <div>
        <div style="font-size: 13px; font-weight: 700; color: var(--text-primary);">${propDisplayName}</div>
        <div style="font-size: 12px; color: var(--text-secondary);">${propDisplayAddr}</div>
      </div>
    </div>
    
    <form id="unit-form" onsubmit="return false;">
      <div class="form-group">
        <label for="unit-number" data-i18n="label_unit_number">Unit Number / Name</label>
        <input type="text" id="unit-number" required placeholder="e.g. Daire 3 or Shop 1">
      </div>
      
      <div class="form-group">
        <label for="unit-size" data-i18n="label_unit_size">Square Meters (m²)</label>
        <input type="number" id="unit-size" placeholder="e.g. 85">
      </div>

      <div class="form-group">
        <label for="unit-status" data-i18n="label_status">Status</label>
        <select id="unit-status">
          <option value="Vacant" data-i18n="status_vacant">Vacant</option>
          <option value="Occupied" data-i18n="status_occupied">Occupied</option>
          <option value="Maintenance" data-i18n="status_maintenance">Under Maintenance</option>
        </select>
      </div>

      <!-- Hidden Lease Sub-form -->
      <div id="unit-lease-subform" style="display: none; padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px; text-align: left;">
        <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 12px;" data-i18n="new_lease_title">Lease Details</h4>
        <div class="form-group">
          <label data-i18n="label_tenant_name">Tenant Name</label>
          <input type="text" id="unit-lease-tenant" placeholder="e.g. Ahmet Yılmaz">
        </div>
        <div class="form-group">
          <label data-i18n="label_rent">Monthly Rent</label>
          <input type="number" id="unit-lease-rent" placeholder="e.g. 77000">
        </div>
        <div class="form-group">
          <label data-i18n="label_currency">Currency</label>
          <select id="unit-lease-currency">
            <option value="TL">TL</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <div class="form-group">
          <label data-i18n="label_due_day">Payment Due Day</label>
          <input type="number" id="unit-lease-due-day" min="1" max="31" value="1">
        </div>
        <div class="form-group">
          <label data-i18n="label_start_date">Start Date</label>
          <input type="date" id="unit-lease-start-date">
        </div>
        <div class="form-group">
          <label data-i18n="label_increase_type">Escalation Rule</label>
          <select id="unit-lease-inc-type">
            <option value="cpi" data-i18n="escalation_cpi">TÜFE 12-Month Average Inflation</option>
            <option value="fixed" data-i18n="escalation_fixed">Fixed Rate Increase (%)</option>
          </select>
        </div>
        <div class="form-group" id="unit-lease-fixed-percent-group" style="display: none;">
          <label data-i18n="label_fixed_percent">Fixed Increase Percentage (%)</label>
          <input type="number" id="unit-lease-fixed-percent" placeholder="e.g. 10">
        </div>
      </div>

      <div class="form-group">
        <label for="unit-notes" data-i18n="label_notes">Notes</label>
        <textarea id="unit-notes" placeholder="Optional unit notes..."></textarea>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
        <button type="button" class="btn btn-secondary" id="btn-unit-cancel" data-i18n="btn_cancel">Cancel</button>
        <button type="submit" class="btn btn-primary" id="btn-unit-submit" data-i18n="btn_save">Save Unit</button>
      </div>
    </form>
  `);

  initLang();

  document.getElementById('btn-close-unit-modal').addEventListener('click', closeModal);
  document.getElementById('btn-unit-cancel').addEventListener('click', closeModal);

  const statusSelect = document.getElementById('unit-status');
  const leaseSubform = document.getElementById('unit-lease-subform');
  statusSelect.addEventListener('change', () => {
    leaseSubform.style.display = statusSelect.value === 'Occupied' ? 'block' : 'none';
  });

  const incTypeSelect = document.getElementById('unit-lease-inc-type');
  const fixedPercentGroup = document.getElementById('unit-lease-fixed-percent-group');
  incTypeSelect.addEventListener('change', () => {
    fixedPercentGroup.style.display = incTypeSelect.value === 'fixed' ? 'block' : 'none';
  });

  document.getElementById('unit-form').addEventListener('submit', async () => {
    const unitNumber = document.getElementById('unit-number').value;
    const squareMeters = document.getElementById('unit-size').value;
    const status = statusSelect.value;
    const notes = document.getElementById('unit-notes').value;

    const payload = { unitNumber, squareMeters, status, notes };

    if (status === 'Occupied') {
      payload.tenantName = document.getElementById('unit-lease-tenant').value;
      payload.monthlyRent = document.getElementById('unit-lease-rent').value;
      payload.currency = document.getElementById('unit-lease-currency').value;
      payload.dueDay = document.getElementById('unit-lease-due-day').value;
      payload.startDate = document.getElementById('unit-lease-start-date').value;
      payload.increaseType = incTypeSelect.value;
      payload.manualIncreasePercentage = document.getElementById('unit-lease-fixed-percent').value;
    }

    const submitBtn = document.getElementById('btn-unit-submit');
    submitBtn.setAttribute('disabled', 'true');

    try {
      await apiFetch(`/properties/${propId}/units`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      closeModal();
      loadPropertiesList();
    } catch (err) {
      alert('Failed to save unit: ' + err.message);
      submitBtn.removeAttribute('disabled');
    }
  });
  } catch (err) {
    alert('Failed to load property: ' + err.message);
  }
}

async function openEditUnitModal(unitId) {
  openModal(`<div style="color: var(--text-secondary); padding: 20px; text-align: center;">Loading unit details...</div>`);
  
  try {
    const properties = await apiFetch('/properties');
    const leases = await apiFetch('/leases');
    let matchedUnit = null;
    let parentProp = null;
    properties.forEach(p => {
      const found = p.units.find(u => u.id === unitId);
      if (found) { matchedUnit = found; parentProp = p; }
    });

    if (!matchedUnit) {
      throw new Error('Unit not found');
    }

    const propDisplayName = parentProp ? (parentProp.name || parentProp.address) : '';
    const propDisplayAddr = parentProp ? parentProp.address : '';
    const activeLease = leases.find(l => l.unitId === unitId && l.status === 'Active');

    openModal(`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
        <h2 data-i18n="edit_unit_title">Edit Unit</h2>
        <button class="btn btn-secondary btn-sm" id="btn-close-unit-modal" data-i18n="close">Close</button>
      </div>

      <!-- Property context banner -->
      <div style="display: flex; align-items: center; gap: 10px; background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.25); border-radius: 10px; padding: 10px 14px; margin-bottom: 18px;">
        <span style="font-size: 20px;">🏢</span>
        <div>
          <div style="font-size: 13px; font-weight: 700; color: var(--text-primary);">${propDisplayName}</div>
          <div style="font-size: 12px; color: var(--text-secondary);">${propDisplayAddr}</div>
        </div>
      </div>
      
      <form id="unit-form" onsubmit="return false;">
        <div class="form-group">
          <label for="unit-number" data-i18n="label_unit_number">Unit Number / Name</label>
          <input type="text" id="unit-number" required value="${matchedUnit.unitNumber}">
        </div>
        
        <div class="form-group">
          <label for="unit-size" data-i18n="label_unit_size">Square Meters (m²)</label>
          <input type="number" id="unit-size" value="${matchedUnit.squareMeters || ''}">
        </div>

        <div class="form-group">
          <label for="unit-status" data-i18n="label_status">Status</label>
          <select id="unit-status">
            <option value="Vacant" ${matchedUnit.status === 'Vacant' ? 'selected' : ''} data-i18n="status_vacant">Vacant</option>
            <option value="Occupied" ${matchedUnit.status === 'Occupied' ? 'selected' : ''} data-i18n="status_occupied">Occupied</option>
            <option value="Maintenance" ${matchedUnit.status === 'Maintenance' ? 'selected' : ''} data-i18n="status_maintenance">Under Maintenance</option>
          </select>
        </div>

        <!-- Hidden Lease Sub-form -->
        <div id="unit-lease-subform" style="display: ${matchedUnit.status === 'Occupied' ? 'block' : 'none'}; padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px; text-align: left;">
          <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 12px;" data-i18n="new_lease_title">Lease Details</h4>
          <div class="form-group">
            <label data-i18n="label_tenant_name">Tenant Name</label>
            <input type="text" id="unit-lease-tenant" value="${activeLease ? activeLease.tenantName : ''}" placeholder="e.g. Ahmet Yılmaz">
          </div>
          <div class="form-group">
            <label data-i18n="label_rent">Monthly Rent</label>
            <input type="number" id="unit-lease-rent" value="${activeLease ? activeLease.monthlyRent : ''}" placeholder="e.g. 77000">
          </div>
          <div class="form-group">
            <label data-i18n="label_currency">Currency</label>
            <select id="unit-lease-currency">
              <option value="TL" ${activeLease && activeLease.currency === 'TL' ? 'selected' : ''}>TL</option>
              <option value="USD" ${activeLease && activeLease.currency === 'USD' ? 'selected' : ''}>USD</option>
              <option value="EUR" ${activeLease && activeLease.currency === 'EUR' ? 'selected' : ''}>EUR</option>
            </select>
          </div>
          <div class="form-group">
            <label data-i18n="label_due_day">Payment Due Day</label>
            <input type="number" id="unit-lease-due-day" min="1" max="31" value="${activeLease ? activeLease.dueDay : 1}">
          </div>
          <div class="form-group">
            <label data-i18n="label_start_date">Start Date</label>
            <input type="date" id="unit-lease-start-date" value="${activeLease ? activeLease.startDate : ''}">
          </div>
          <div class="form-group">
            <label data-i18n="label_increase_type">Escalation Rule</label>
            <select id="unit-lease-inc-type">
              <option value="cpi" ${activeLease && activeLease.increaseType === 'cpi' ? 'selected' : ''} data-i18n="escalation_cpi">TÜFE 12-Month Average Inflation</option>
              <option value="fixed" ${activeLease && activeLease.increaseType === 'fixed' ? 'selected' : ''} data-i18n="escalation_fixed">Fixed Rate Increase (%)</option>
            </select>
          </div>
          <div class="form-group" id="unit-lease-fixed-percent-group" style="display: ${activeLease && activeLease.increaseType === 'fixed' ? 'block' : 'none'};">
            <label data-i18n="label_fixed_percent">Fixed Increase Percentage (%)</label>
            <input type="number" id="unit-lease-fixed-percent" value="${activeLease ? activeLease.manualIncreasePercentage : ''}" placeholder="e.g. 10">
          </div>
        </div>

        <div class="form-group">
          <label for="unit-notes" data-i18n="label_notes">Notes</label>
          <textarea id="unit-notes">${matchedUnit.notes || ''}</textarea>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" id="btn-unit-cancel" data-i18n="btn_cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="btn-unit-submit" data-i18n="btn_save">Save Changes</button>
        </div>
      </form>
    `);

    initLang();

    document.getElementById('btn-close-unit-modal').addEventListener('click', closeModal);
    document.getElementById('btn-unit-cancel').addEventListener('click', closeModal);

    const statusSelect = document.getElementById('unit-status');
    const leaseSubform = document.getElementById('unit-lease-subform');
    statusSelect.addEventListener('change', () => {
      leaseSubform.style.display = statusSelect.value === 'Occupied' ? 'block' : 'none';
    });

    const incTypeSelect = document.getElementById('unit-lease-inc-type');
    const fixedPercentGroup = document.getElementById('unit-lease-fixed-percent-group');
    incTypeSelect.addEventListener('change', () => {
      fixedPercentGroup.style.display = incTypeSelect.value === 'fixed' ? 'block' : 'none';
    });

    document.getElementById('unit-form').addEventListener('submit', async () => {
      const unitNumber = document.getElementById('unit-number').value;
      const squareMeters = document.getElementById('unit-size').value;
      const status = statusSelect.value;
      const notes = document.getElementById('unit-notes').value;

      const payload = { unitNumber, squareMeters, status, notes };

      if (status === 'Occupied') {
        payload.tenantName = document.getElementById('unit-lease-tenant').value;
        payload.monthlyRent = document.getElementById('unit-lease-rent').value;
        payload.currency = document.getElementById('unit-lease-currency').value;
        payload.dueDay = document.getElementById('unit-lease-due-day').value;
        payload.startDate = document.getElementById('unit-lease-start-date').value;
        payload.increaseType = incTypeSelect.value;
        payload.manualIncreasePercentage = document.getElementById('unit-lease-fixed-percent').value;
      }

      const submitBtn = document.getElementById('btn-unit-submit');
      submitBtn.setAttribute('disabled', 'true');

      try {
        await apiFetch(`/units/${unitId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        closeModal();
        loadPropertiesList();
      } catch (err) {
        alert('Failed to save unit: ' + err.message);
        submitBtn.removeAttribute('disabled');
      }
    });
  } catch (err) {
    console.error(err);
    alert('Failed to load unit: ' + err.message);
  }
}

function openAddPropertyModal() {
  openModal(`
    <h2 style="margin-bottom: 20px;" data-i18n="add_prop_title">New Property Profile</h2>
    <form id="new-prop-form" onsubmit="return false;">
      <div class="form-group">
        <label for="prop-name" data-i18n="label_property_name">Property Name</label>
        <input type="text" id="prop-name" placeholder="e.g. Atatürk Apartmanı or Başkent Plaza">
      </div>
      <div class="form-group">
        <label for="prop-address" data-i18n="label_address">Street Address</label>
        <input type="text" id="prop-address" required placeholder="Sanayi Caddesi No:124">
      </div>
      <div class="form-group">
        <label for="prop-city" data-i18n="label_city">City</label>
        <input type="text" id="prop-city" placeholder="Muğla / Milas">
      </div>
      <div class="form-group">
        <label for="prop-type" data-i18n="label_type">Property Type</label>
        <select id="prop-type">
          <option value="Commercial" data-i18n="prop_type_com">Commercial</option>
          <option value="Residential" data-i18n="prop_type_res">Residential</option>
        </select>
      </div>
      <div class="form-group">
        <label for="prop-notes" data-i18n="label_notes">Internal Notes</label>
        <textarea id="prop-notes" placeholder="Notes..."></textarea>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
        <button type="button" class="btn btn-secondary" id="btn-modal-cancel" data-i18n="btn_cancel">Cancel</button>
        <button type="submit" class="btn btn-primary" data-i18n="btn_save">Save</button>
      </div>
    </form>
  `);

  initLang();

  document.getElementById('new-prop-form').addEventListener('submit', async () => {
    const name = document.getElementById('prop-name').value;
    const address = document.getElementById('prop-address').value;
    const city = document.getElementById('prop-city').value;
    const type = document.getElementById('prop-type').value;
    const notes = document.getElementById('prop-notes').value;

    try {
      await apiFetch('/properties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, address, city, type, notes })
      });
      closeModal();
      loadPropertiesList();
    } catch (err) {
      console.error(err);
    }
  });

  document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
}

async function openEditPropertyModal(propId) {
  openModal(`<div style="color: var(--text-secondary); padding: 20px; text-align: center;">Loading property details...</div>`);
  
  try {
    const properties = await apiFetch('/properties');
    const prop = properties.find(p => p.id === propId);
    
    openModal(`
      <h2 style="margin-bottom: 20px;" data-i18n="edit_prop_title">Edit Property Profile</h2>
      <form id="edit-prop-form" onsubmit="return false;">
        <div class="form-group">
          <label for="prop-name" data-i18n="label_property_name">Property Name</label>
          <input type="text" id="prop-name" value="${prop.name || ''}" placeholder="e.g. Atatürk Apartmanı or Başkent Plaza">
        </div>
        <div class="form-group">
          <label for="prop-address" data-i18n="label_address">Street Address</label>
          <input type="text" id="prop-address" value="${prop.address}" required placeholder="Sanayi Caddesi No:124">
        </div>
        <div class="form-group">
          <label for="prop-city" data-i18n="label_city">City</label>
          <input type="text" id="prop-city" value="${prop.city || ''}" placeholder="Muğla / Milas">
        </div>
        <div class="form-group">
          <label for="prop-type" data-i18n="label_type">Property Type</label>
          <select id="prop-type">
            <option value="Commercial" ${prop.type === 'Commercial' ? 'selected' : ''} data-i18n="prop_type_com">Commercial</option>
            <option value="Residential" ${prop.type === 'Residential' ? 'selected' : ''} data-i18n="prop_type_res">Residential</option>
          </select>
        </div>
        <div class="form-group">
          <label for="prop-notes" data-i18n="label_notes">Internal Notes</label>
          <textarea id="prop-notes" placeholder="Notes...">${prop.notes || ''}</textarea>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" id="btn-modal-cancel" data-i18n="btn_cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" data-i18n="btn_save">Save</button>
        </div>
      </form>
    `);

    initLang();

    document.getElementById('edit-prop-form').addEventListener('submit', async () => {
      const name = document.getElementById('prop-name').value;
      const address = document.getElementById('prop-address').value;
      const city = document.getElementById('prop-city').value;
      const type = document.getElementById('prop-type').value;
      const notes = document.getElementById('prop-notes').value;

      try {
        await apiFetch(`/properties/${propId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name, address, city, type, notes })
        });
        closeModal();
        loadPropertiesList();
      } catch (err) {
        console.error(err);
      }
    });

    document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
  } catch (err) {
    console.error(err);
  }
}

function openBulkPropertiesModal() {
  openModal(`
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
      <h2 data-i18n="bulk_upload_title">Bulk Property Import</h2>
      <button class="btn btn-secondary btn-sm" id="btn-close-bulk" data-i18n="close">Close</button>
    </div>
    
    <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 20px;" data-i18n="bulk_upload_help">
      Download the Excel template, fill in your properties and units, and upload it to import them in one go.
    </p>

    <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; padding: 16px; background: rgba(255,255,255,0.05); border-radius: 8px;">
      <a href="/templates/properties_template.xlsx" download="properties_template.xlsx" class="btn btn-secondary btn-sm" style="text-align: center; justify-content: center;" data-i18n="link_download_template">Download Blank Template (Excel)</a>
      <a href="/templates/properties_dummy_test.xlsx" download="properties_dummy_test.xlsx" class="btn btn-secondary btn-sm" style="text-align: center; justify-content: center;" data-i18n="link_download_dummy">Download Sample Test Template (Excel)</a>
    </div>

    <form id="bulk-properties-form" onsubmit="return false;">
      <div class="form-group">
        <label for="properties-file-input">Select Excel File</label>
        <input type="file" id="properties-file-input" accept=".xlsx, .xls" required style="width: 100%; padding: 8px; border: 1px dashed var(--border-color); border-radius: 6px; background: transparent;">
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
        <button type="button" class="btn btn-secondary" id="btn-bulk-cancel" data-i18n="btn_cancel">Cancel</button>
        <button type="submit" class="btn btn-primary" id="btn-bulk-submit" data-i18n="btn_upload">Upload File</button>
      </div>
    </form>
  `);

  initLang();

  document.getElementById('btn-close-bulk').addEventListener('click', closeModal);
  document.getElementById('btn-bulk-cancel').addEventListener('click', closeModal);

  document.getElementById('bulk-properties-form').addEventListener('submit', async () => {
    const fileInput = document.getElementById('properties-file-input');
    if (!fileInput.files || fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('properties_file', file);

    const submitBtn = document.getElementById('btn-bulk-submit');
    submitBtn.innerText = 'Uploading...';
    submitBtn.setAttribute('disabled', 'true');

    try {
      const response = await fetch('/api/properties/bulk-upload', {
        method: 'POST',
        headers: {
          'x-landlord-id': state.user.id
        },
        body: formData
      });

      if (!response.ok) {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Server error (${response.status})`);
        } else {
          throw new Error(`Server error (${response.status}): ${response.statusText || 'Unexpected response from server.'}`);
        }
      }

      const res = await response.json();
      closeModal();
      
      let successMsg = state.lang === 'tr'
        ? `Aktarım tamamlandı! Başarıyla ${res.propertiesCreated} mülk ve ${res.unitsCreated} bölüm içeri aktarıldı.`
        : `Import complete! Successfully imported ${res.propertiesCreated} properties and ${res.unitsCreated} units.`;
      
      alert(successMsg);
      loadPropertiesList();
    } catch (err) {
      console.error(err);
      alert('Upload failed: ' + err.message);
      submitBtn.innerText = 'Upload File';
      submitBtn.removeAttribute('disabled');
    }
  });
}

// --- VIEW: LEASES ---
async function renderLeases(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 data-i18n="leases_title">Active Leases & Escalations</h1>
      <div style="display: flex; gap: 12px;">
        <button class="btn btn-secondary btn-sm" id="btn-bulk-leases" data-i18n="btn_bulk_upload_leases">Bulk Upload</button>
        <button class="btn btn-primary btn-sm" id="btn-add-lease" data-i18n="btn_add_lease">Create Lease</button>
      </div>
    </div>
    
    <div class="glass-card" style="margin-bottom: 24px;">
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th data-i18n="dash_tenant">Tenant</th>
              <th data-i18n="label_address">Property</th>
              <th data-i18n="label_rent">Monthly Rent</th>
              <th data-i18n="label_increase_type">Increase Rule</th>
              <th data-i18n="label_start_date">Start Date</th>
              <th data-i18n="label_end_date">End Date</th>
              <th data-i18n="table_actions">Actions</th>
            </tr>
          </thead>
          <tbody id="leases-table-body">
            <tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">Loading active leases...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btn-add-lease').addEventListener('click', openAddLeaseModal);
  document.getElementById('btn-bulk-leases').addEventListener('click', openBulkLeasesModal);

  loadLeasesTable();
}

async function loadLeasesTable() {
  const tbody = document.getElementById('leases-table-body');
  try {
    const leases = await apiFetch('/leases');
    if (leases.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No leases configured yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = leases.map(l => `
      <tr>
        <td><strong>${l.tenantName}</strong></td>
        <td>${l.propertyAddress}</td>
        <td style="font-weight: 600;">${l.monthlyRent.toLocaleString()} ${l.currency}</td>
        <td>
          <span class="badge ${l.increaseType === 'cpi' ? 'badge-info' : 'badge-warning'}">
            ${l.increaseType === 'cpi' ? 'TÜFE Inflation' : `Fixed (+${l.manualIncreasePercentage}%)`}
          </span>
        </td>
        <td>${l.startDate}</td>
        <td>${l.endDate || 'N/A'}</td>
        <td style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-sm btn-ledger" data-id="${l.id}" data-i18n="btn_view_ledger" style="padding: 2px 6px; font-size: 11px;">Ledger</button>
          <button class="btn btn-secondary btn-sm btn-message" data-id="${l.id}" data-i18n="btn_send_message" style="padding: 2px 6px; font-size: 11px;">Message</button>
          <button class="btn btn-secondary btn-sm btn-edit-lease" data-id="${l.id}" style="padding: 2px 6px; font-size: 11px;">✏️</button>
          <button class="btn btn-danger btn-sm btn-delete-lease" data-id="${l.id}" style="padding: 2px 6px; font-size: 11px;">🗑️</button>
        </td>
      </tr>
    `).join('');

    // Attach event listeners to ledger buttons
    document.querySelectorAll('.btn-ledger').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const leaseId = e.target.getAttribute('data-id');
        openLedgerModal(leaseId);
      });
    });

    // Attach event listeners to direct message buttons
    document.querySelectorAll('.btn-message').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const leaseId = e.target.getAttribute('data-id');
        openMessageModal(leaseId);
      });
    });

    // Attach event listeners to edit buttons
    document.querySelectorAll('.btn-edit-lease').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const leaseId = e.currentTarget.getAttribute('data-id');
        openEditLeaseModal(leaseId);
      });
    });

    // Attach event listeners to delete buttons
    document.querySelectorAll('.btn-delete-lease').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const leaseId = e.currentTarget.getAttribute('data-id');
        const confirmMsg = state.lang === 'tr'
          ? 'Bu kira sözleşmesini silmek istediğinizden emin misiniz? Sözleşmeye bağlı tüm tahakkuklar ve ödemeler kalıcı olarak silinecektir.'
          : 'Are you sure you want to delete this lease contract? This will remove all associated charges and payments.';
        if (confirm(confirmMsg)) {
          try {
            await apiFetch(`/leases/${leaseId}`, { method: 'DELETE' });
            loadLeasesTable();
          } catch (err) {
            alert('Failed to delete lease: ' + err.message);
          }
        }
      });
    });

    initLang();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="badge badge-danger">Failed to load leases.</td></tr>`;
  }
}

function openBulkLeasesModal() {
  openModal(`
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
      <h2 data-i18n="leases_bulk_upload_title">Bulk Lease Import</h2>
      <button class="btn btn-secondary btn-sm" id="btn-close-bulk-leases" data-i18n="close">Close</button>
    </div>
    
    <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 20px;" data-i18n="leases_bulk_upload_help">
      Download the Leases Excel template, fill in your contract details, and upload it. If a referenced tenant or unit doesn't exist, it will be automatically created.
    </p>
    
    <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; text-align: left;">
      <a href="/templates/leases_template.xlsx" class="btn btn-secondary" style="text-align: center; text-decoration: none;" download>
        📥 <span data-i18n="link_download_template">Download Blank Template (Excel)</span>
      </a>
      <a href="/templates/leases_dummy_test.xlsx" class="btn btn-secondary" style="text-align: center; text-decoration: none;" download>
        📥 <span data-i18n="link_download_dummy">Download Sample Test Template (Excel)</span>
      </a>
    </div>
    
    <form id="bulk-leases-form" onsubmit="return false;">
      <div class="form-group" style="text-align: left;">
        <label for="leases-file" style="font-weight: 600; margin-bottom: 8px; display: block;">Select Excel File</label>
        <input type="file" id="leases-file" accept=".xlsx" required style="border: 1px dashed var(--border-color); padding: 20px; width: 100%; border-radius: 8px; cursor: pointer;">
      </div>
      
      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
        <button type="button" class="btn btn-secondary" id="btn-cancel-bulk-leases" data-i18n="btn_cancel">Cancel</button>
        <button type="submit" class="btn btn-primary" id="btn-submit-bulk-leases">Upload File</button>
      </div>
    </form>
  `);

  initLang();

  document.getElementById('btn-close-bulk-leases').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-bulk-leases').addEventListener('click', closeModal);

  document.getElementById('bulk-leases-form').addEventListener('submit', async () => {
    const fileInput = document.getElementById('leases-file');
    if (fileInput.files.length === 0) return;

    const submitBtn = document.getElementById('btn-submit-bulk-leases');
    submitBtn.setAttribute('disabled', 'true');
    submitBtn.innerText = state.lang === 'tr' ? 'Yükleniyor...' : 'Uploading...';

    const formData = new FormData();
    formData.append('leases_file', fileInput.files[0]);

    try {
      const res = await apiFetch('/leases/bulk-upload', {
        method: 'POST',
        body: formData
      });
      closeModal();
      loadLeasesTable();
      
      const successMsg = state.lang === 'tr'
        ? `Sözleşmeler başarıyla yüklendi!\nOluşturulan Sözleşme: ${res.leasesCount}\nOluşturulan Bölüm: ${res.unitsCount}\nOluşturulan Kiracı: ${res.tenantsCount}`
        : `Leases imported successfully!\nLeases created: ${res.leasesCount}\nUnits created: ${res.unitsCount}\nTenants created: ${res.tenantsCount}`;
      alert(successMsg);
    } catch (err) {
      console.error('Lease upload error:', err);
      submitBtn.innerText = state.lang === 'tr' ? 'Dosya Yükle' : 'Upload File';
      submitBtn.removeAttribute('disabled');
    }
  });
}

async function openAddLeaseModal() {
  openModal(`<div style="color: var(--text-secondary); padding: 20px; text-align: center;">Loading form options...</div>`);
  
  try {
    const properties = await apiFetch('/properties');
    const tenants = await apiFetch('/tenants');

    openModal(`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
        <h2 data-i18n="new_lease_title">Set Up Lease Contract</h2>
        <button class="btn btn-secondary btn-sm" id="btn-close-lease-modal" data-i18n="close">Close</button>
      </div>
      
      <form id="lease-form" onsubmit="return false;">
        <div class="form-group" style="text-align: left;">
          <label for="lease-prop-select" data-i18n="label_select_property">Select Property</label>
          <select id="lease-prop-select" required>
            <option value="" disabled selected>-- Select --</option>
            ${properties.map(p => `<option value="${p.id}">${p.name || p.address}</option>`).join('')}
          </select>
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-unit-select" data-i18n="label_select_unit">Select Unit</label>
          <select id="lease-unit-select" required disabled>
            <option value="" disabled selected>-- Select property first --</option>
          </select>
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-tenant-select" data-i18n="label_select_tenant">Select Tenant</label>
          <select id="lease-tenant-select" required>
            <option value="" disabled selected>-- Select --</option>
            <option value="new" data-i18n="option_create_new_tenant">-- Create New Tenant... --</option>
            ${tenants.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
        </div>

        <!-- Hidden New Tenant Fields (displayed dynamically) -->
        <div id="new-tenant-fields" style="display: none; padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 16px;">
          <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 12px;" data-i18n="new_tenant_details">New Tenant Details</h4>
          <div class="form-group">
            <label data-i18n="name_label">Full Name</label>
            <input type="text" id="new-tenant-name" placeholder="e.g. Ahmet Yılmaz">
          </div>
          <div class="form-group">
            <label data-i18n="email_label">Email Address</label>
            <input type="email" id="new-tenant-email" placeholder="e.g. ahmet@yilmaz.com">
          </div>
          <div class="form-group">
            <label data-i18n="phone_label">Phone Number</label>
            <input type="text" id="new-tenant-phone" placeholder="e.g. +90 532...">
          </div>
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-rent" data-i18n="label_rent">Initial Monthly Rent</label>
          <input type="number" id="lease-rent" required placeholder="e.g. 77000">
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-currency" data-i18n="label_currency">Currency</label>
          <select id="lease-currency" required>
            <option value="TL">TL</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-due-day" data-i18n="label_due_day">Payment Due Day (1-31)</label>
          <input type="number" id="lease-due-day" required min="1" max="31" value="1">
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-start-date" data-i18n="label_start_date">Contract Start Date</label>
          <input type="date" id="lease-start-date" required>
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-end-date" data-i18n="label_end_date">Contract End Date</label>
          <input type="date" id="lease-end-date">
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-inc-type" data-i18n="label_increase_type">Rent Escalation Rules</label>
          <select id="lease-inc-type" required>
            <option value="cpi" data-i18n="escalation_cpi">TÜFE 12-Month Average Inflation</option>
            <option value="fixed" data-i18n="escalation_fixed">Fixed Rate Increase (%)</option>
          </select>
        </div>

        <div class="form-group" id="lease-fixed-rate-group" style="display: none; text-align: left;">
          <label data-i18n="label_fixed_percent">Fixed Increase Percentage (%)</label>
          <input type="number" id="lease-fixed-rate" placeholder="e.g. 10">
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" id="btn-lease-cancel" data-i18n="btn_cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="btn-lease-submit" data-i18n="btn_save">Save Contract</button>
        </div>
      </form>
    `);

    initLang();

    document.getElementById('btn-close-lease-modal').addEventListener('click', closeModal);
    document.getElementById('btn-lease-cancel').addEventListener('click', closeModal);

    // Prop select -> Unit select hook
    const propSelect = document.getElementById('lease-prop-select');
    const unitSelect = document.getElementById('lease-unit-select');
    propSelect.addEventListener('change', () => {
      const selectedProp = properties.find(p => p.id === propSelect.value);
      if (selectedProp && selectedProp.units && selectedProp.units.length > 0) {
        unitSelect.removeAttribute('disabled');
        unitSelect.innerHTML = selectedProp.units.map(u => `<option value="${u.id}">${u.unitNumber} (${u.status})</option>`).join('');
      } else {
        unitSelect.setAttribute('disabled', 'true');
        unitSelect.innerHTML = `<option value="" disabled selected>No units configured under this property</option>`;
      }
    });

    // Tenant select -> Show hidden details hook
    const tenantSelect = document.getElementById('lease-tenant-select');
    const newTenantFields = document.getElementById('new-tenant-fields');
    tenantSelect.addEventListener('change', () => {
      newTenantFields.style.display = tenantSelect.value === 'new' ? 'block' : 'none';
    });

    // Inc type select -> Show fixed rate hook
    const incTypeSelect = document.getElementById('lease-inc-type');
    const fixedRateGroup = document.getElementById('lease-fixed-rate-group');
    incTypeSelect.addEventListener('change', () => {
      fixedRateGroup.style.display = incTypeSelect.value === 'fixed' ? 'block' : 'none';
    });

    // Submit form
    document.getElementById('lease-form').addEventListener('submit', async () => {
      const unitId = unitSelect.value;
      let tenantId = tenantSelect.value;
      const rent = document.getElementById('lease-rent').value;
      const currency = document.getElementById('lease-currency').value;
      const dueDay = document.getElementById('lease-due-day').value;
      const startDate = document.getElementById('lease-start-date').value;
      const endDate = document.getElementById('lease-end-date').value;
      const incType = incTypeSelect.value;
      const fixedRate = document.getElementById('lease-fixed-rate').value;

      const submitBtn = document.getElementById('btn-lease-submit');
      submitBtn.setAttribute('disabled', 'true');

      try {
        if (endDate && startDate === endDate) {
          throw new Error('Contract End Date must be different from Contract Start Date');
        }
        if (endDate && new Date(endDate) <= new Date(startDate)) {
          throw new Error('Contract End Date must be after the Contract Start Date');
        }
        // If new tenant is selected, register tenant profile first!
        if (tenantId === 'new') {
          const tName = document.getElementById('new-tenant-name').value;
          const tEmail = document.getElementById('new-tenant-email').value;
          const tPhone = document.getElementById('new-tenant-phone').value;
          
          if (!tName) throw new Error('New tenant full name is required');
          const tRes = await apiFetch('/tenants', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: tName, email: tEmail, phone: tPhone })
          });
          tenantId = tRes.id;
        }

        await apiFetch('/leases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unitId,
            tenantId,
            startDate,
            endDate,
            monthlyRent: rent,
            currency,
            dueDay,
            increaseType: incType,
            manualIncreasePercentage: fixedRate
          })
        });

        closeModal();
        loadLeasesTable();
      } catch (err) {
        alert('Failed to save contract: ' + err.message);
        submitBtn.removeAttribute('disabled');
      }
    });
  } catch (err) {
    console.error(err);
    alert('Failed to open modal.');
  }
}

async function openEditLeaseModal(leaseId) {
  openModal(`<div style="color: var(--text-secondary); padding: 20px; text-align: center;">Loading lease details...</div>`);
  
  try {
    const leases = await apiFetch('/leases');
    const lease = leases.find(l => l.id === leaseId);
    if (!lease) throw new Error('Lease not found');

    openModal(`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
        <h2 data-i18n="edit_lease_title">Edit Lease Profile</h2>
        <button class="btn btn-secondary btn-sm" id="btn-close-lease-modal" data-i18n="close">Close</button>
      </div>
      
      <form id="lease-edit-form" onsubmit="return false;">
        <div class="form-group" style="text-align: left;">
          <label data-i18n="label_tenant_name">Tenant Name</label>
          <input type="text" value="${lease.tenantName}" disabled style="background: rgba(255,255,255,0.05); color: var(--text-secondary);">
        </div>

        <div class="form-group" style="text-align: left;">
          <label data-i18n="label_property_unit">Property & Unit Address</label>
          <input type="text" value="${lease.propertyAddress}" disabled style="background: rgba(255,255,255,0.05); color: var(--text-secondary);">
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-rent" data-i18n="label_rent">Monthly Rent</label>
          <input type="number" id="lease-rent" required value="${lease.monthlyRent}">
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-currency" data-i18n="label_currency">Currency</label>
          <select id="lease-currency" required>
            <option value="TL" ${lease.currency === 'TL' ? 'selected' : ''}>TL</option>
            <option value="USD" ${lease.currency === 'USD' ? 'selected' : ''}>USD</option>
            <option value="EUR" ${lease.currency === 'EUR' ? 'selected' : ''}>EUR</option>
          </select>
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-due-day" data-i18n="label_due_day">Payment Due Day (1-31)</label>
          <input type="number" id="lease-due-day" required min="1" max="31" value="${lease.dueDay}">
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-start-date" data-i18n="label_start_date">Contract Start Date</label>
          <input type="date" id="lease-start-date" required value="${lease.startDate}">
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-end-date" data-i18n="label_end_date">Contract End Date</label>
          <input type="date" id="lease-end-date" value="${lease.endDate || ''}">
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-status" data-i18n="label_status">Status</label>
          <select id="lease-status" required>
            <option value="Active" ${lease.status === 'Active' ? 'selected' : ''} data-i18n="status_active">Active</option>
            <option value="Terminated" ${lease.status === 'Terminated' ? 'selected' : ''} data-i18n="status_terminated">Terminated</option>
          </select>
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-inc-type" data-i18n="label_increase_type">Rent Escalation Rules</label>
          <select id="lease-inc-type" required>
            <option value="cpi" ${lease.increaseType === 'cpi' ? 'selected' : ''} data-i18n="escalation_cpi">TÜFE 12-Month Average Inflation</option>
            <option value="fixed" ${lease.increaseType === 'fixed' ? 'selected' : ''} data-i18n="escalation_fixed">Fixed Rate Increase (%)</option>
          </select>
        </div>

        <div class="form-group" id="lease-fixed-rate-group" style="display: ${lease.increaseType === 'fixed' ? 'block' : 'none'}; text-align: left;">
          <label data-i18n="label_fixed_percent">Fixed Increase Percentage (%)</label>
          <input type="number" id="lease-fixed-rate" value="${lease.manualIncreasePercentage || ''}" placeholder="e.g. 10">
        </div>

        <div class="form-group" style="text-align: left;">
          <label for="lease-notes" data-i18n="label_notes">Notes</label>
          <textarea id="lease-notes" placeholder="Optional notes...">${lease.notes || ''}</textarea>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" id="btn-lease-cancel" data-i18n="btn_cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="btn-lease-submit" data-i18n="btn_save">Save Changes</button>
        </div>
      </form>
    `);

    initLang();

    document.getElementById('btn-close-lease-modal').addEventListener('click', closeModal);
    document.getElementById('btn-lease-cancel').addEventListener('click', closeModal);

    // Inc type select -> Show fixed rate hook
    const incTypeSelect = document.getElementById('lease-inc-type');
    const fixedRateGroup = document.getElementById('lease-fixed-rate-group');
    incTypeSelect.addEventListener('change', () => {
      fixedRateGroup.style.display = incTypeSelect.value === 'fixed' ? 'block' : 'none';
    });

    // Submit form
    document.getElementById('lease-edit-form').addEventListener('submit', async () => {
      const rent = document.getElementById('lease-rent').value;
      const currency = document.getElementById('lease-currency').value;
      const dueDay = document.getElementById('lease-due-day').value;
      const startDate = document.getElementById('lease-start-date').value;
      const endDate = document.getElementById('lease-end-date').value;
      const status = document.getElementById('lease-status').value;
      const incType = incTypeSelect.value;
      const fixedRate = document.getElementById('lease-fixed-rate').value;
      const notes = document.getElementById('lease-notes').value;

      const submitBtn = document.getElementById('btn-lease-submit');
      submitBtn.setAttribute('disabled', 'true');

      try {
        if (endDate && startDate === endDate) {
          throw new Error('Contract End Date must be different from Contract Start Date');
        }
        if (endDate && new Date(endDate) <= new Date(startDate)) {
          throw new Error('Contract End Date must be after the Contract Start Date');
        }
        await apiFetch(`/leases/${leaseId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate,
            endDate,
            monthlyRent: rent,
            currency,
            dueDay,
            increaseType: incType,
            manualIncreasePercentage: fixedRate,
            status,
            notes
          })
        });

        closeModal();
        loadLeasesTable();
      } catch (err) {
        alert('Failed to save changes: ' + err.message);
        submitBtn.removeAttribute('disabled');
      }
    });
  } catch (err) {
    console.error(err);
    alert('Failed to load lease details.');
  }
}

// --- CARI HESAP / LEDGER MODAL ---
async function openLedgerModal(leaseId) {
  openModal(`<div style="color: var(--text-secondary); padding: 20px; text-align: center;">Loading ledger statements...</div>`);

  try {
    const ledger = await apiFetch(`/ledger/${leaseId}`);
    
    openModal(`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
        <h2 data-i18n="ledger_modal_title">Running Lease Ledger</h2>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="btn btn-secondary btn-sm" id="btn-view-journal" data-i18n="btn_view_journal">View Journal</button>
          <button class="btn btn-secondary btn-sm" id="btn-close-ledger" data-i18n="close">Close</button>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
        <div>
          <span style="font-size: 13px; color: var(--text-secondary);" data-i18n="dash_tenant">Tenant</span>
          <p style="font-size: 16px; font-weight: 700;">${ledger.tenantName}</p>
        </div>
        <div>
          <span style="font-size: 13px; color: var(--text-secondary);" data-i18n="ledger_running_balance">Net Overdue Balance</span>
          <p style="font-size: 18px; font-weight: 700; color: ${ledger.balance > 0 ? 'var(--danger-color)' : 'var(--success-color)'};">
            ${ledger.balance.toLocaleString()} ${ledger.currency}
          </p>
        </div>
      </div>

      <div class="table-container" style="max-height: 400px; overflow-y: auto;">
        <table>
          <thead>
            <tr>
              <th data-i18n="ledger_col_date">Date</th>
              <th data-i18n="ledger_col_type">Type</th>
              <th data-i18n="ledger_col_desc">Description</th>
              <th data-i18n="ledger_col_amount">Amount</th>
              <th data-i18n="ledger_col_balance">Running Balance</th>
            </tr>
          </thead>
          <tbody>
            ${ledger.entries.map(e => `
              <tr>
                <td>${e.date}</td>
                <td>
                  <span class="badge ${e.type === 'charge' ? 'badge-danger' : 'badge-success'}">
                    ${e.type === 'charge' ? 'Rent Due' : 'Payment'}
                  </span>
                </td>
                <td>${e.description}</td>
                <td style="font-weight: 600; color: ${e.type === 'charge' ? 'var(--danger-color)' : 'var(--success-color)'};">
                  ${e.type === 'charge' ? '+' : '-'}${e.amount.toLocaleString()} ${ledger.currency}
                </td>
                <td style="font-weight: 700;">${e.balance.toLocaleString()} ${ledger.currency}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `);

    document.getElementById('btn-close-ledger').addEventListener('click', closeModal);
    document.getElementById('btn-view-journal').addEventListener('click', () => openJournalModal(leaseId, ledger.tenantName));
    initLang();
  } catch (err) {
    openModal(`<div class="badge badge-danger" style="margin: 20px;">Could not load running ledger records.</div>`);
  }
}

async function openJournalModal(leaseId, tenantName) {
  openModal(`<div style="color: var(--text-secondary); padding: 20px; text-align: center;">Loading double-entry journal logs...</div>`);
  try {
    const res = await apiFetch(`/ledger/${leaseId}/journal`);
    
    openModal(`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
        <h2 data-i18n="journal_modal_title">Double-Entry Journal Logs</h2>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-sm" id="btn-back-ledger" data-i18n="btn_back">Back</button>
          <button class="btn btn-secondary btn-sm" id="btn-close-journal" data-i18n="close">Close</button>
        </div>
      </div>

      <div style="margin-bottom: 20px;">
        <span style="font-size: 13px; color: var(--text-secondary);" data-i18n="dash_tenant">Tenant</span>
        <p style="font-size: 16px; font-weight: 700;">${tenantName}</p>
      </div>

      <div class="table-container" style="max-height: 400px; overflow-y: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 2px solid var(--border-color);">
              <th style="width: 100px; text-align: left; padding: 12px 8px;">Date</th>
              <th style="text-align: left; padding: 12px 8px;">Description / Account Ledger</th>
              <th style="text-align: right; width: 120px; padding: 12px 8px;">Debit</th>
              <th style="text-align: right; width: 120px; padding: 12px 8px;">Credit</th>
            </tr>
          </thead>
          <tbody>
            ${res.entries.length === 0 ? `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 20px;">No journal records found.</td></tr>` : ''}
            ${res.entries.map(je => {
              const coa = {
                "1100": "1100 - Cash / Bank Account",
                "1200": "1200 - Accounts Receivable",
                "2200": "2200 - Security Deposit Liability",
                "4100": "4100 - Rental Income",
                "5100": "5100 - Property Taxes / Stopaj",
                "5200": "5200 - Maintenance & Repairs"
              };
              
              const rowsHtml = je.lines.map(line => `
                <tr style="background: transparent; border: none;">
                  <td style="border: none; width: 100px;"></td>
                  <td style="padding: 6px 8px; padding-left: ${line.credit > 0 ? '28px' : '8px'}; font-style: ${line.credit > 0 ? 'italic' : 'normal'}; border: none;">
                    ${coa[line.accountId] || line.accountId}
                  </td>
                  <td style="text-align: right; padding: 6px 8px; font-weight: ${line.debit > 0 ? '600' : '400'}; color: ${line.debit > 0 ? 'var(--text-primary)' : 'var(--text-secondary)'}; border: none;">
                    ${line.debit > 0 ? line.debit.toLocaleString() + ' TL' : '-'}
                  </td>
                  <td style="text-align: right; padding: 6px 8px; font-weight: ${line.credit > 0 ? '600' : '400'}; color: ${line.credit > 0 ? 'var(--text-primary)' : 'var(--text-secondary)'}; border: none;">
                    ${line.credit > 0 ? line.credit.toLocaleString() + ' TL' : '-'}
                  </td>
                </tr>
              `).join('');

              return `
                <tr style="background: rgba(255,255,255,0.01); border-bottom: 1px solid var(--border-color);">
                  <td style="font-weight: 600; vertical-align: top; padding: 12px 8px;">${je.date}</td>
                  <td colspan="3" style="padding: 0;">
                    <div style="font-weight: 700; font-size: 13px; color: var(--accent-color); padding: 12px 8px 4px 8px;">
                      ${je.description}
                    </div>
                    <table style="width: 100%; border: none; margin: 0; background: transparent;">
                      ${rowsHtml}
                    </table>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `);

    document.getElementById('btn-close-journal').addEventListener('click', closeModal);
    document.getElementById('btn-back-ledger').addEventListener('click', () => openLedgerModal(leaseId));
    initLang();
  } catch (err) {
    console.error(err);
    openModal(`<div class="badge badge-danger" style="margin: 20px;">Could not load double-entry journal logs.</div>`);
  }
}

// --- DIRECT TENANT MESSAGING MODAL ---
async function openMessageModal(leaseId) {
  openModal(`<div style="color: var(--text-secondary); padding: 20px; text-align: center;">Loading template values...</div>`);
  
  try {
    const leases = await apiFetch('/leases');
    const lease = leases.find(l => l.id === leaseId);
    
    const tenants = await apiFetch('/tenants');
    const tenant = tenants.find(t => t.id === lease.tenantId);
    
    const ledger = await apiFetch(`/ledger/${leaseId}`);
    
    openModal(`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
        <h2 data-i18n="msg_modal_title">Send Tenant Notification</h2>
        <button class="btn btn-secondary btn-sm" id="btn-close-message" data-i18n="close">Close</button>
      </div>

      <form id="direct-msg-form" onsubmit="return false;">
        <div class="form-group">
          <label data-i18n="label_msg_channel">Select Channel</label>
          <select id="msg-channel">
            <option value="whatsapp" data-i18n="notif_whatsapp">WhatsApp</option>
            <option value="email" data-i18n="notif_email">Email</option>
          </select>
        </div>
        
        <div class="form-group">
          <label data-i18n="label_msg_template">Select Template</label>
          <select id="msg-template">
            <option value="custom" data-i18n="template_custom">Custom Message...</option>
            <option value="overdue" data-i18n="template_overdue">Overdue Rent Reminder</option>
            <option value="general" data-i18n="template_general">General Notice</option>
          </select>
        </div>
        
        <div class="form-group">
          <label data-i18n="label_msg_body">Message Body</label>
          <textarea id="msg-body" rows="6" required></textarea>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" id="btn-msg-cancel" data-i18n="btn_cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="btn-msg-send" data-i18n="btn_send">Send</button>
        </div>
      </form>
    `);

    const channelSelect = document.getElementById('msg-channel');
    const templateSelect = document.getElementById('msg-template');
    const bodyTextarea = document.getElementById('msg-body');

    // Define message templates
    const templates = {
      custom: '',
      overdue: {
        en: `Dear ${tenant.name},\n\nThis is a friendly reminder that your rent for ${lease.propertyAddress} is overdue. The current outstanding balance is ${ledger.balance.toLocaleString()} ${lease.currency}.\n\nPlease arrange for payment as soon as possible.\n\nBest regards,\n${state.user.name}`,
        tr: `Sayın ${tenant.name},\n\n${lease.propertyAddress} adresindeki mülk için kira ödemenizin geciktiğini hatırlatmak isteriz. Güncel gecikmiş borç bakiyeniz: ${ledger.balance.toLocaleString()} ${lease.currency}.\n\nLütfen ödemeyi en kısa sürede gerçekleştirmeye özen gösteriniz.\n\nSaygılarımızla,\n${state.user.name}`
      },
      general: {
        en: `Dear ${tenant.name},\n\n[Write notice details here...]\n\nBest regards,\n${state.user.name}`,
        tr: `Sayın ${tenant.name},\n\n[Buraya detayları yazın...]\n\nSaygılarımızla,\n${state.user.name}`
      }
    };

    // Update body when template changes
    const updateTextarea = () => {
      const selected = templateSelect.value;
      if (selected === 'custom') {
        bodyTextarea.value = '';
      } else {
        bodyTextarea.value = templates[selected][state.lang];
      }
    };

    templateSelect.addEventListener('change', updateTextarea);
    
    // Trigger initial placeholder
    updateTextarea();

    // Close button actions
    document.getElementById('btn-close-message').addEventListener('click', closeModal);
    document.getElementById('btn-msg-cancel').addEventListener('click', closeModal);

    // Form submit action
    document.getElementById('direct-msg-form').addEventListener('submit', async () => {
      const channel = channelSelect.value;
      const body = bodyTextarea.value;
      
      const phone = tenant.phone || '';
      const email = tenant.email || '';

      if (channel === 'whatsapp') {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(body)}`;
        window.open(waUrl, '_blank');
        closeModal();
      } else {
        // Send email
        const sendBtn = document.getElementById('btn-msg-send');
        sendBtn.innerText = 'Sending email...';
        sendBtn.setAttribute('disabled', 'true');

        try {
          // Attempt backend SMTP direct sending
          const res = await apiFetch('/notifications/send-direct', {
            method: 'POST',
            body: JSON.stringify({
              to: email,
              subject: 'Kira Bildirimi / Rental Notification',
              body: body
            })
          });

          if (res && res.success) {
            alert('Email sent successfully via SMTP!');
            closeModal();
          }
        } catch (err) {
          // If SMTP fails or endpoint throws error, fallback to mailto
          console.warn('SMTP failed, falling back to mailto link:', err.message);
          const mailUrl = `mailto:${email}?subject=Kira Bildirimi / Rental Notification&body=${encodeURIComponent(body)}`;
          window.location.href = mailUrl;
          closeModal();
        }
      }
    });

    initLang();
  } catch (err) {
    openModal(`<div class="badge badge-danger" style="margin: 20px;">Could not load tenant details.</div>`);
  }
}

// --- VIEW: RECONCILE BANK ---
function renderReconcile(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 data-i18n="reconcile_title">Bank Statement Reconciliation</h1>
    </div>

    <!-- Dropzone Card -->
    <div class="glass-card" style="margin-bottom: 24px;" id="upload-panel">
      <h2 style="font-size: 18px; margin-bottom: 12px;" data-i18n="upload_card_title">Upload Bank Transaction File</h2>
      <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 24px;" data-i18n="upload_help"></p>
      
      <form id="upload-form" enctype="multipart/form-data" onsubmit="return false;">
        <div class="upload-dropzone" onclick="document.getElementById('statement-file').click()">
          <span style="font-size: 32px; display: block; margin-bottom: 8px;">📂</span>
          <span style="font-weight: 600; color: var(--accent-color);">Click to browse bank statement file</span>
          <input type="file" id="statement-file" name="statement" style="display: none;" accept=".xlsx,.xls">
        </div>
        <div id="selected-file-label" style="text-align: center; margin-bottom: 16px; font-weight: 600; color: var(--success-color);"></div>
        <button type="submit" class="btn btn-primary" style="width: 100%;" id="btn-upload-submit" data-i18n="btn_upload" disabled>Parse Statement</button>
      </form>
    </div>

    <!-- Processing Panel (Initially Hidden) -->
    <div class="glass-card" id="reconcile-panel" style="display: none;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="font-size: 18px;">Proposed Statement Matches</h2>
        <button class="btn btn-primary" id="btn-reconcile-bulk" data-i18n="btn_approve_bulk">Reconcile Selected</button>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th style="width: 40px;"><input type="checkbox" id="check-all-rows"></th>
              <th data-i18n="rec_table_tx_date">Tx Date</th>
              <th data-i18n="rec_table_desc">Description</th>
              <th data-i18n="rec_table_amount">Amount</th>
              <th data-i18n="rec_table_action">Action</th>
              <th data-i18n="rec_table_match">Fuzzy Match Recommendation</th>
              <th data-i18n="rec_table_period">Ledger Period</th>
            </tr>
          </thead>
          <tbody id="reconcile-rows-container"></tbody>
        </table>
      </div>
    </div>
  `;

  const fileInput = document.getElementById('statement-file');
  const uploadBtn = document.getElementById('btn-upload-submit');
  const fileLabel = document.getElementById('selected-file-label');

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      fileLabel.innerText = e.target.files[0].name;
      uploadBtn.removeAttribute('disabled');
    }
  });

  document.getElementById('upload-form').addEventListener('submit', handleStatementUpload);
}

async function handleStatementUpload() {
  const fileInput = document.getElementById('statement-file');
  if (fileInput.files.length === 0) return;

  const formData = new FormData();
  formData.append('statement', fileInput.files[0]);

  const submitBtn = document.getElementById('btn-upload-submit');
  submitBtn.innerText = 'Analyzing file structure...';
  submitBtn.setAttribute('disabled', 'true');

  try {
    const res = await fetch('/api/statements/upload', {
      method: 'POST',
      headers: {
        'x-landlord-id': state.user.id
      },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to parse file');
    }

    const data = await res.json();
    state.reconciliations = data;
    renderReconciliationRows();
  } catch (err) {
    alert(err.message);
    submitBtn.innerText = 'Parse Statement';
    submitBtn.removeAttribute('disabled');
  }
}

function renderReconciliationRows() {
  document.getElementById('upload-panel').style.display = 'none';
  const panel = document.getElementById('reconcile-panel');
  panel.style.display = 'block';

  const tbody = document.getElementById('reconcile-rows-container');
  
  if (state.reconciliations.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No valid transactions found.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.reconciliations.map((tx, idx) => {
    const badgeClass = tx.proposedAction === 'rent' ? 'badge-success' : (tx.proposedAction === 'expense' ? 'badge-warning' : 'badge-danger');
    const badgeText = tx.proposedAction === 'rent' ? 'Rent Match' : (tx.proposedAction === 'expense' ? 'Expense' : 'Ignore');
    
    // Default period option formatting
    const periodValue = tx.period || '';
    
    return `
      <tr data-index="${idx}">
        <td><input type="checkbox" class="row-checkbox" checked></td>
        <td>${tx.date}</td>
        <td style="font-size: 13px;">
          <div><strong>${tx.description}</strong></div>
          <div style="color: var(--text-secondary); font-size: 11px;">Ref: ${tx.refNumber} | Channel: ${tx.channel}</div>
        </td>
        <td style="font-weight: 700; color: ${tx.amount > 0 ? 'var(--success-color)' : 'var(--danger-color)'};">
          ${tx.amount > 0 ? '+' : ''}${tx.amount.toLocaleString()} TL
        </td>
        <td>
          <select class="row-action-select" style="padding: 6px 10px; font-size: 13px;">
            <option value="rent" ${tx.proposedAction === 'rent' ? 'selected' : ''}>Link to Rent</option>
            <option value="expense" ${tx.proposedAction === 'expense' ? 'selected' : ''}>Categorize as Expense</option>
            <option value="ignore" ${tx.proposedAction === 'ignore' ? 'selected' : ''}>Ignore / Skip</option>
          </select>
        </td>
        <td>
          <span class="badge ${badgeClass}">${badgeText}</span>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">${tx.reason} (Conf: ${tx.confidence}%)</div>
        </td>
        <td>
          ${tx.proposedAction === 'rent' ? `
            <select class="row-period-select" style="padding: 6px 10px; font-size: 13px;">
              <option value="${periodValue}">${periodValue.slice(0, 7)}</option>
              <option value="2026-05-01">2026-05 (May)</option>
              <option value="2026-04-01">2026-04 (Apr)</option>
            </select>
          ` : 'N/A'}
        </td>
      </tr>
    `;
  }).join('');

  // Header Checkbox binding
  const checkAll = document.getElementById('check-all-rows');
  checkAll.addEventListener('change', (e) => {
    document.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.checked = e.target.checked;
    });
  });

  // Reconcile Action Button binding
  document.getElementById('btn-reconcile-bulk').addEventListener('click', handleBulkReconcile);
}

async function handleBulkReconcile() {
  const reconciliationsList = [];
  
  document.querySelectorAll('#reconcile-rows-container tr').forEach(tr => {
    const cb = tr.querySelector('.row-checkbox');
    if (cb && cb.checked) {
      const idx = parseInt(tr.getAttribute('data-index'));
      const tx = state.reconciliations[idx];
      const action = tr.querySelector('.row-action-select').value;
      
      const periodSelect = tr.querySelector('.row-period-select');
      const period = periodSelect ? periodSelect.value : '';

      reconciliationsList.push({
        ...tx,
        proposedAction: action,
        period: period
      });
    }
  });

  if (reconciliationsList.length === 0) {
    alert('Please select at least one transaction row to reconcile.');
    return;
  }

  try {
    const res = await apiFetch('/statements/reconcile', {
      method: 'POST',
      body: JSON.stringify({ reconciliations: reconciliationsList })
    });
    
    if (res.success) {
      alert(`Successfully reconciled ${res.payments} rent payments and ${res.expenses} expenses!`);
      loadView('dashboard');
    }
  } catch (err) {
    console.error(err);
  }
}

// --- VIEW: NOTIFICATIONS QUEUE ---
async function renderNotifications(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 data-i18n="notif_title">Automated Tenant Communications</h1>
    </div>
    
    <div class="glass-card" style="margin-bottom: 24px;">
      <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 20px;" data-i18n="notif_help"></p>
      
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th data-i18n="notif_channel">Channel</th>
              <th data-i18n="notif_recipient">Recipient</th>
              <th data-i18n="rec_table_desc">Message Preview</th>
              <th data-i18n="dash_period">Trigger Date</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="notif-table-body">
            <tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">Loading notification queue...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  loadNotificationsTable();
}

async function loadNotificationsTable() {
  const tbody = document.getElementById('notif-table-body');
  try {
    const notifications = await apiFetch('/notifications');
    if (notifications.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);" data-i18n="dash_no_alerts">No outstanding notifications.</td></tr>`;
      return;
    }

    tbody.innerHTML = notifications.map(n => `
      <tr>
        <td>
          <span class="badge ${n.type === 'whatsapp' ? 'badge-success' : 'badge-info'}">
            ${n.type === 'whatsapp' ? 'WhatsApp' : 'Email'}
          </span>
        </td>
        <td>
          <div><strong>Tenant</strong></div>
          <div style="font-size: 12px; color: var(--text-secondary);">${n.recipientContact}</div>
        </td>
        <td style="font-size: 13px; max-width: 320px; white-space: pre-wrap; overflow: hidden; text-overflow: ellipsis;">${n.messageBody}</td>
        <td>${n.triggerDate}</td>
        <td>
          <span class="badge badge-warning" data-i18n="notif_status_pending">Pending</span>
        </td>
        <td>
          <button class="btn btn-primary btn-sm btn-send-notif" data-id="${n.id}" data-type="${n.type}" data-contact="${encodeURIComponent(n.recipientContact)}" data-msg="${encodeURIComponent(n.messageBody)}" data-i18n="btn_send">Send Now</button>
        </td>
      </tr>
    `).join('');

    // Attach click events to "Send Now" buttons
    document.querySelectorAll('.btn-send-notif').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = e.target.getAttribute('data-type');
        const contact = decodeURIComponent(e.target.getAttribute('data-contact'));
        const msg = decodeURIComponent(e.target.getAttribute('data-msg'));
        
        if (type === 'whatsapp') {
          // Open WhatsApp web API in a new browser tab
          const waUrl = `https://wa.me/${contact.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`;
          window.open(waUrl, '_blank');
        } else {
          // Open mailto link
          const mailUrl = `mailto:${contact}?subject=Upcoming Rent Adjustment&body=${encodeURIComponent(msg)}`;
          window.location.href = mailUrl;
        }
      });
    });

    initLang();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="badge badge-danger">Failed to load notification queue.</td></tr>`;
  }
}

// --- VIEW: SETTINGS ---
function renderSettings(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 data-i18n="nav_settings">Settings</h1>
    </div>

    <!-- SMTP config -->
    <div class="glass-card" style="margin-bottom: 24px;">
      <h2 style="font-size: 18px; margin-bottom: 16px;" data-i18n="smtp_card">SMTP Config</h2>
      <form id="settings-smtp-form" onsubmit="return false;">
        <div class="form-group">
          <label for="smtp-host" data-i18n="smtp_host">SMTP Server Host</label>
          <input type="text" id="smtp-host" placeholder="smtp.gmail.com">
        </div>
        <div class="form-group">
          <label for="smtp-port" data-i18n="smtp_port">Port</label>
          <input type="number" id="smtp-port" placeholder="587">
        </div>
        <div class="form-group">
          <label for="smtp-user" data-i18n="smtp_user">Username</label>
          <input type="email" id="smtp-user" placeholder="landlord@example.com">
        </div>
        <div class="form-group">
          <label for="smtp-pass" data-i18n="smtp_pass">App Password</label>
          <input type="password" id="smtp-pass" placeholder="••••••••">
        </div>
        <button type="submit" class="btn btn-primary" data-i18n="btn_save_settings">Save Settings</button>
      </form>
    </div>

    <!-- Scraper trigger tools -->
    <div class="glass-card">
      <h2 style="font-size: 18px; margin-bottom: 12px;" data-i18n="system_tools">System Tools</h2>
      <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 20px;">Use this to pull monthly inflation updates from official indices.</p>
      
      <div id="scraper-status-msg" style="display: none; padding: 12px; margin-bottom: 16px; border-radius: 8px;"></div>
      
      <button class="btn btn-secondary" id="btn-scraper-trigger" data-i18n="btn_run_scraper">Run Scraper Now</button>
    </div>
  `;

  // Bind settings saving
  document.getElementById('settings-smtp-form').addEventListener('submit', async () => {
    const host = document.getElementById('smtp-host').value;
    const port = document.getElementById('smtp-port').value;
    const user = document.getElementById('smtp-user').value;
    const pass = document.getElementById('smtp-pass').value;

    try {
      const res = await apiFetch('/settings/smtp', {
        method: 'POST',
        body: JSON.stringify({ host, port, user, pass })
      });
      if (res.success) {
        alert('SMTP configuration saved successfully!');
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Bind scraper trigger
  const scraperBtn = document.getElementById('btn-scraper-trigger');
  scraperBtn.addEventListener('click', async () => {
    scraperBtn.setAttribute('disabled', 'true');
    scraperBtn.innerText = 'Scraping target indices...';
    
    const statusMsg = document.getElementById('scraper-status-msg');
    statusMsg.style.display = 'none';

    try {
      const res = await apiFetch('/settings/cpi-fetch', { method: 'POST' });
      if (res.success) {
        statusMsg.className = 'badge badge-success';
        statusMsg.innerText = translations[state.lang]['scraper_success'];
        statusMsg.style.display = 'block';
      }
    } catch (err) {
      statusMsg.className = 'badge badge-danger';
      statusMsg.innerText = translations[state.lang]['scraper_fail'];
      statusMsg.style.display = 'block';
    } finally {
      scraperBtn.removeAttribute('disabled');
      scraperBtn.innerText = translations[state.lang]['btn_run_scraper'];
    }
  });
}

// ----------------------------------------------------
// SHARED MODAL ENGINE
// ----------------------------------------------------
function openModal(contentHtml) {
  const overlay = document.getElementById('modal-overlay');
  const body = document.getElementById('modal-body');
  
  body.innerHTML = contentHtml;
  overlay.style.display = 'flex';
  
  // Re-run language translator on modal content
  initLang();
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.style.display = 'none';
}

// ----------------------------------------------------
// EVENT LISTENERS & BOOTSTRAPPING
// ----------------------------------------------------
function setupGlobalEvents() {
  // Theme Switches
  document.getElementById('theme-toggle-desktop').addEventListener('click', toggleTheme);
  document.getElementById('theme-toggle-mobile').addEventListener('click', toggleTheme);

  // Language Switches
  document.getElementById('lang-toggle-desktop').addEventListener('click', toggleLang);
  document.getElementById('lang-toggle-mobile').addEventListener('click', toggleLang);

  // Mobile Menu Drawer Toggle
  const sidebar = document.getElementById('app-sidebar');
  const menuToggle = document.getElementById('menu-toggle');
  
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  // Hide sidebar drawer when clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768) {
      if (!sidebar.contains(e.target) && e.target !== menuToggle && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
      }
    }
  });

  // Navigation Links Click Events
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const view = e.target.getAttribute('data-view');
      loadView(view);
      
      // Close mobile drawer on navigation
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
      }
    });
  });

  // Logout Click
  document.getElementById('logout-btn').addEventListener('click', showAuthShell);

  // Auth switch link (login <-> signup)
  const authToggleLink = document.getElementById('auth-toggle-link');
  const authForm = document.getElementById('auth-form');
  
  authToggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    const isLogin = authForm.getAttribute('data-mode') !== 'signup';
    
    const nameGroup = document.getElementById('group-name');
    const phoneGroup = document.getElementById('group-phone');
    const submitBtn = document.getElementById('auth-submit-btn');
    const title = document.getElementById('auth-title');

    if (isLogin) {
      // Switch to Signup
      authForm.setAttribute('data-mode', 'signup');
      nameGroup.style.display = 'block';
      phoneGroup.style.display = 'block';
      submitBtn.setAttribute('data-i18n', 'btn_signup');
      authToggleLink.setAttribute('data-i18n', 'link_to_login');
      title.setAttribute('data-i18n', 'signup_title');
    } else {
      // Switch to Login
      authForm.setAttribute('data-mode', 'login');
      nameGroup.style.display = 'none';
      phoneGroup.style.display = 'none';
      submitBtn.setAttribute('data-i18n', 'btn_login');
      authToggleLink.setAttribute('data-i18n', 'link_to_signup');
      title.setAttribute('data-i18n', 'login_title');
    }
    
    initLang();
  });

  // Auth form submit
  authForm.addEventListener('submit', handleAuthSubmit);
}

// Handle Authentication Submit (SignUp or Login)
async function handleAuthSubmit() {
  const isSignup = document.getElementById('auth-form').getAttribute('data-mode') === 'signup';
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorMsg = document.getElementById('auth-error-msg');
  
  errorMsg.style.display = 'none';

  let url = '/api/auth/login';
  let body = { email, password };

  if (isSignup) {
    url = '/api/auth/signup';
    body = {
      name: document.getElementById('reg-name').value,
      email,
      password,
      phone: document.getElementById('reg-phone').value
    };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Authentication failed');
    }

    const user = await res.json();
    sessionStorage.setItem('user', JSON.stringify(user));
    state.user = user;

    // Route admin users to the admin shell, regular landlords to the app shell
    if (user.role === 'admin') {
      showAdminShell();
    } else {
      showAppShell();
    }
  } catch (err) {
    errorMsg.innerText = err.message;
    errorMsg.style.display = 'flex';
  }
}
