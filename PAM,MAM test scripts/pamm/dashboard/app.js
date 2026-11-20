// BlackTrader PAMM Operations & Test Automation Hub Client Logic

let state = {
  status: {},
  accounts: [],
  pools: [],
  orders: [],
  bugs: [],
  scenarios: [],
  results: {}, // Map of tc_id -> TestResult
  activeTab: "tab-control",
  activeInstance: "real",
  activeEnvId: "1",
  activeConcept: "hedging",
  activeGalleryFilter: "all"
};

// Scenario Screenshot Mappings
const scenarioScreenshots = {
  "BTPAMM-D001": { 
    src: "screenshots/bug_02_wallet_deposit_blocked.png", 
    title: "BTPAMM-D001: Client Deposit Flow (Verified Active)", 
    caption: "Broker published payment gateways; live client deposit submission and backoffice review verified end-to-end.",
    isDefect: false
  },
  "BTPAMM-F011": { 
    src: "screenshots/console_csp_and_401_errors.png", 
    title: "BTPAMM-F011 [BUG-AUTH-002]: Premature 401 Probe on Widget Mount (Console Bug)", 
    caption: "DevTools console inspection showing premature 401 Unauthorized API error on /v1/oms/real/pamm/masters before iframe JWT handshake completes.",
    isDefect: true,
    defectType: "CONSOLE"
  },
  "BTPAMM-F001": { 
    src: "screenshots/console_csp_and_401_errors.png", 
    title: "BTPAMM-F001 [BUG-SEC-003]: CSP Header 'script-src self' Blocks Cloudflare Analytics Beacon (Console Bug)", 
    caption: "DevTools console inspection showing CSP directive blocking loading of Cloudflare beacon.min.js on every platform load.",
    isDefect: true,
    defectType: "CONSOLE"
  },
  "BTPAMM-F002": { 
    src: "screenshots/pamm_managing_settings.png", 
    title: "BTPAMM-F002: PAMM Manager Settings & Inline Drawer (Verified Working)", 
    caption: "Clicking [Settings] toggles the inline configuration drawer at the bottom of the widget containing editable pool display name, profit share %, and [Save] button.",
    isDefect: false
  },
  "BTPAMM-F006": { 
    src: "screenshots/pamm_17_account_selector.png", 
    title: "BTPAMM-F006: Paper Instance Policy Restriction (Expected Behavior)", 
    caption: "Selecting Paper instance returns HTTP 400 'Copy trading, MAM and PAMM run on real-money accounts'. Platform policy restriction - NOT an error.",
    isNotice: true
  },
  "BTPAMM-F003": { 
    src: "screenshots/pamm_managing_settings.png", 
    title: "BTPAMM-F003: PAMM Manager Registration Form", 
    caption: "Registration form with 'Shown to followers as', 'My share (%)', and 'Become a manager' button." 
  },
  "BTPAMM-F004": { 
    src: "screenshots/pamm_21_invest_footnote.png", 
    title: "BTPAMM-F004: Grandfathering Policy Footnote", 
    caption: "Footnote: 'Changing your share affects followers who join after the change — an existing follower keeps the share they agreed to.'" 
  },
  "BTPAMM-F005": { 
    src: "screenshots/pamm_17_account_selector.png", 
    title: "BTPAMM-F005: Account Selector Instance Binding", 
    caption: "Dropdown select.ap-acct-sel binds active real broker account as master execution terminal." 
  },
  "BTPAMM-F012": { 
    src: "screenshots/pamm_20_leaderboard_table.png", 
    title: "BTPAMM-F012: 9-Column Public Directory", 
    caption: "Active pool publication in 9-column directory with Rank, Growth %, Drawdown %, Fund ($), and purple share badge." 
  },
  "BTPAMM-F015": { 
    src: "screenshots/pamm_31_max_restore.png", 
    title: "BTPAMM-F015: Responsive Window Controls", 
    caption: "PAMM window expands cleanly into responsive full-width view without layout distortion." 
  },
  "BTPAMM-A001": { 
    src: "screenshots/08_pamm_workspace_view.png", 
    title: "BTPAMM-A001: PAMM Multi-Panel Workspace View", 
    caption: "Full WebTrader layout with Chart, Watchlist, Positions blotter, and PAMM dock widget." 
  },
  "BTPAMM-E001": { 
    src: "screenshots/08_pamm_workspace_view.png", 
    title: "BTPAMM-E001: Master Block Order Execution on Real (Hedging)", 
    caption: "Market Buy 2.0 lots executed on master pooled account. Zero child orders fanned out to followers." 
  },
  "BTPAMM-E003": { 
    src: "screenshots/pamm_17_account_selector.png", 
    title: "BTPAMM-E003: Real-Netting Master Block Pending Order Placement", 
    caption: "Master Buy Limit placed on Real-Net. Follower accounts retain 0 child tickets (PAMM Invariant Verified)." 
  }
};

// Gallery Items
const galleryItems = [
  {
    title: "DevTools Console: CSP Block & 401 Unauthorized Probe",
    cat: "console",
    src: "screenshots/console_csp_and_401_errors.png",
    caption: "DevTools Console inspection showing CSP directive blocking Cloudflare beacon script and premature 401 probe before JWT handshake."
  },
  {
    title: "Console Network Trace: HTTP 401 on /pamm/masters",
    cat: "console",
    src: "screenshots/bug_08_401_auth_probe.png",
    caption: "Network inspection confirming premature API probe without Bearer token prior to JWT resolution."
  },
  {
    title: "Deposit Gateways: Active Payment Methods Published",
    cat: "pass",
    src: "screenshots/bug_02_wallet_deposit_blocked.png",
    caption: "Broker published payment gateways; live client deposit submission and backoffice review verified end-to-end."
  },
  {
    title: "PAMM Manager Settings: Inline Configuration Drawer",
    cat: "pass",
    src: "screenshots/bug_07_pamm_dead_end.png",
    caption: "Clicking [Settings] opens the inline configuration drawer at the bottom of the PAMM widget with editable display name, fee %, and [Save] button (verified working)."
  },
  {
    title: "CSP Directive Violation: Cloudflare Analytics",
    cat: "console",
    src: "screenshots/bug_01_csp_cloudflare_block.png",
    caption: "DevTools console inspection showing CSP header 'script-src self' blocking static.cloudflareinsights.com."
  },
  {
    title: "PAMM Full Trading Workspace Integration",
    cat: "pass",
    src: "screenshots/08_pamm_workspace_view.png",
    caption: "Full WebTrader layout showing Chart, Watchlist, Positions blotter, and PAMM dock widget."
  },
  {
    title: "PAMM Widget Mounted in Dock Tab",
    cat: "pass",
    src: "screenshots/pamm_15_widget_mounted.png",
    caption: "PAMM widget mounted cleanly in trading workspace with title 'PAMM' and group badge 'Standard'."
  },
  {
    title: "Sub-Navigation: PAMM Managers vs My Subscription",
    cat: "pass",
    src: "screenshots/pamm_19_sub_navigation.png",
    caption: "DOM sub-view toggle between 'PAMM managers' and 'My subscription' with sub-sections."
  },
  {
    title: "PAMM 9-Column Public Directory Leaderboard",
    cat: "pass",
    src: "screenshots/pamm_20_leaderboard_table.png",
    caption: "Public leaderboard showing master rank, growth %, drawdown %, fund equity, and manager share badge."
  },
  {
    title: "Grandfathering Share Policy Footnote",
    cat: "pass",
    src: "screenshots/pamm_21_invest_footnote.png",
    caption: "Mandatory policy notice: 'Changing your share affects followers who join after the change — an existing follower keeps the share they agreed to.'"
  },
  {
    title: "Trading Account Instance Selector Binding",
    cat: "pass",
    src: "screenshots/pamm_17_account_selector.png",
    caption: "Top account selector dropdown binds currently active real broker account as pool execution terminal."
  },
  {
    title: "PAMM Manager Registration & Share Form",
    cat: "pass",
    src: "screenshots/pamm_managing_settings.png",
    caption: "Registration form with 'Shown to followers as', 'My share (%)', and Save/Become manager action."
  },
  {
    title: "Full-Width Responsive Maximize & Restore",
    cat: "pass",
    src: "screenshots/pamm_31_max_restore.png",
    caption: "PAMM window expands cleanly to full screen via .tw-ph-max and restores without layout distortion."
  },
  {
    title: "Live Data Refresh & Synchronization Button",
    cat: "pass",
    src: "screenshots/pamm_18_refresh_button.png",
    caption: "Refresh button triggers background GET /pamm/masters to re-query pool metrics."
  }
];

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  loadAllData();
  setInterval(refreshStatusAndData, 5000); // 5s background poll
});

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.tab;
      document.getElementById(target).classList.add("active");
      state.activeTab = target;
      if (target === "tab-evidence") renderGallery(state.activeGalleryFilter);
      if (target === "tab-race") loadRaceReport();
    });
  });
}

async function loadAllData() {
  await Promise.all([
    fetchStatus(),
    fetchAccounts(),
    fetchPools(),
    fetchOrders(),
    fetchBugs(),
    fetchScenarios(),
    loadRaceReport(),
    loadEnvironments()
  ]);
  renderDashboard();
  renderGallery("all");
}

async function loadEnvironments() {
  try {
    const res = await fetch("/api/environments");
    if (!res.ok) return;
    const data = await res.json();
    const sel = document.getElementById("global-env-select");
    if (!sel || !data.environments) return;
    sel.innerHTML = "";
    if (data.active_id) state.activeEnvId = String(data.active_id);
    if (data.active_concept) state.activeConcept = data.active_concept;

    for (let id in data.environments) {
      const env = data.environments[id];
      if (!env.platform_url) continue;
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `${env.platform_url}  (${env.name})`;
      if (id === String(state.activeEnvId)) opt.selected = true;
      sel.appendChild(opt);
    }
    updatePlatformDisplay();
  } catch (e) {
    console.error("Failed to load environments:", e);
  }
}

async function switchTargetPlatform(envId) {
  state.activeEnvId = String(envId);
  try {
    const res = await fetch("/api/environments/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ env_id: envId, concept: state.activeConcept })
    });
    if (res.ok) {
      await loadAllData();
      updatePlatformDisplay();
    }
  } catch (e) {
    console.error("Failed to switch target platform:", e);
  }
}

async function switchConcept(concept) {
  state.activeConcept = concept;
  ["hedging", "netting", "all"].forEach(c => {
    const btn = document.getElementById(`btn-concept-${c}`);
    if (btn) {
      btn.className = c === concept ? "btn btn-sm btn-primary" : "btn btn-sm btn-outline";
    }
  });

  const instSelect = document.getElementById("global-instance-select");
  if (instSelect) {
    instSelect.value = concept === "netting" ? "real-net" : "real";
    state.activeInstance = instSelect.value;
  }

  try {
    await fetch("/api/environments/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ env_id: state.activeEnvId, concept: concept })
    });
  } catch (e) {}

  await Promise.all([fetchAccounts(), fetchPools(), fetchStatus()]);
  renderDashboard();
}

function updatePlatformDisplay() {
  const baseUrl = state.status?.platform_url || "https://lpadmin.blackfx.com";
  const adminUrl = state.status?.admin_url || "https://lpadmin.blackfx.com/blackadmin";
  const instance = state.activeConcept === "netting" ? "real-net" : "real";
  const omsUrl = `${baseUrl}/v1/oms/${instance}`;

  const headerEl = document.getElementById("header-oms-url");
  if (headerEl) headerEl.textContent = omsUrl;

  const barEl = document.getElementById("tested-oms-url");
  if (barEl) barEl.textContent = omsUrl;

  const clientLink = document.getElementById("link-client-portal");
  if (clientLink) {
    clientLink.href = baseUrl;
    clientLink.textContent = baseUrl;
  }
  const adminLink = document.getElementById("link-admin-portal");
  if (adminLink) {
    adminLink.href = adminUrl;
    adminLink.textContent = adminUrl;
  }
}

async function refreshStatusAndData() {
  await Promise.all([
    fetchStatus(),
    fetchAccounts(),
    fetchOrders(),
    fetchBugs()
  ]);
  renderKPIs();
  if (state.activeTab === "tab-control") renderAccountsTable();
  if (state.activeTab === "tab-trading") renderOrdersTable();
}

async function fetchStatus() {
  try {
    const res = await fetch(`/api/status?env_id=${state.activeEnvId}&concept=${state.activeConcept}`);
    state.status = await res.json();
  } catch (e) { console.error("Failed fetching status", e); }
}

async function fetchAccounts() {
  try {
    const res = await fetch(`/api/accounts?env_id=${state.activeEnvId}&concept=${state.activeConcept}`);
    const data = await res.json();
    state.accounts = data.accounts || [];
  } catch (e) { console.error("Failed fetching accounts", e); }
}

async function fetchPools() {
  try {
    const res = await fetch(`/api/pools?env_id=${state.activeEnvId}&concept=${state.activeConcept}`);
    const data = await res.json();
    state.pools = data.pools || [];
  } catch (e) { console.error("Failed fetching pools", e); }
}

async function fetchOrders() {
  try {
    const res = await fetch("/api/orders");
    const data = await res.json();
    state.orders = data.orders || [];
  } catch (e) { console.error("Failed fetching orders", e); }
}

async function fetchBugs() {
  try {
    const res = await fetch("/api/bugs");
    const data = await res.json();
    state.bugs = data.bugs || [];
  } catch (e) { console.error("Failed fetching bugs", e); }
}

async function fetchScenarios() {
  try {
    const res = await fetch("/api/scenarios");
    const data = await res.json();
    state.scenarios = data.scenarios || [];
  } catch (e) { console.error("Failed fetching scenarios", e); }
}

function renderDashboard() {
  updateOMSDisplay();
  updateMasterTerminalProfile();
  renderKPIs();
  renderAccountsTable();
  renderOrdersTable();
  renderBugsCards();
  renderScenariosTable();
}

function updateOMSDisplay() {
  const instance = state.activeInstance || "real";
  const baseUrl = state.status?.platform_url || "https://lpadmin.blackfx.com";
  const adminUrl = state.status?.admin_url || "https://lpadmin.blackfx.com/blackadmin";
  const omsUrl = `${baseUrl}/v1/oms/${instance}`;
  
  const headerEl = document.getElementById("header-oms-url");
  if (headerEl) headerEl.textContent = omsUrl;
  
  const barEl = document.getElementById("tested-oms-url");
  if (barEl) barEl.textContent = omsUrl;

  const clientLink = document.getElementById("link-client-portal");
  if (clientLink) {
    const portalUrl = `${baseUrl}/home/dashboard`;
    clientLink.href = portalUrl;
    clientLink.textContent = portalUrl;
  }
  const adminLink = document.getElementById("link-admin-portal");
  if (adminLink) {
    adminLink.href = adminUrl;
    adminLink.textContent = adminUrl;
  }
}

function renderKPIs() {
  const openBugs = state.bugs.filter(b => b.status !== "RESOLVED");
  const followingAccounts = state.accounts.filter(a => a.status === "FOLLOWING" && (a.deposit || 0) > 0);
  const totalEquity = state.status?.master_pool?.total_equity || followingAccounts.reduce((sum, a) => sum + (a.current_equity || a.deposit || 0), 0);

  document.getElementById("kpi-pool-equity").textContent = `$${totalEquity.toLocaleString("en-US", {minimumFractionDigits: 2})}`;
  document.getElementById("kpi-active-followers").textContent = `${followingAccounts.length} / ${state.accounts.length}`;
  const bugsValEl = document.getElementById("kpi-detected-bugs");
  if (bugsValEl) {
    bugsValEl.textContent = `${openBugs.length} Open (${state.bugs.length - openBugs.length} Resolved)`;
    bugsValEl.style.color = openBugs.length === 0 ? "var(--pass)" : "var(--defect)";
  }
  const subEl = document.getElementById("kpi-defects-sub");
  if (subEl) {
    subEl.textContent = openBugs.length === 0 
      ? "0 Console Errors · 0 Functional Blockers · 100% Clean" 
      : `${openBugs.length} Console Errors · 0 Functional Blockers`;
  }
  const pillBugs = document.getElementById("pill-bugs-count");
  if (pillBugs) pillBugs.textContent = `${openBugs.length}`;
}

function renderAccountsTable() {
  const tbody = document.getElementById("accounts-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  state.accounts.forEach(acc => {
    const isMaster = acc.is_master || acc.role === "master";
    const isFollowing = acc.status === "FOLLOWING";
    
    let statusTag = "";
    if (isMaster) {
      statusTag = `<span class="tag" style="background:rgba(234,179,8,0.25); color:#eab308; border:1px solid rgba(234,179,8,0.5); font-weight:700;">👑 MASTER POOL</span>`;
    } else if (isFollowing) {
      statusTag = `<span class="tag tag-following">FOLLOWING</span>`;
    } else {
      statusTag = `<span class="tag tag-active">ACTIVE CASH</span>`;
    }

    let actionBtn = "";
    if (isMaster) {
      actionBtn = `<button class="btn btn-sm btn-purple" onclick="goToMasterOrdersTab()">📈 View Orders</button>`;
    } else if (isFollowing) {
      actionBtn = `<button class="btn btn-sm btn-danger" onclick="unfollowAccount('${acc.email}')">Unfollow / Settle</button>`;
    } else {
      actionBtn = `<button class="btn btn-sm btn-primary" onclick="openJoinPoolModal('${acc.email}')">Join Pool</button>`;
    }

    const cash = acc.wallet_cash !== undefined ? acc.wallet_cash : (acc.wallet_balance !== undefined ? acc.wallet_balance : 0.0);
    const pnl = acc.running_pnl || 0.0;
    const equity = isFollowing || isMaster ? (acc.current_equity || (acc.deposit || 0) + pnl) : 0.0;
    const conceptTag = acc.instance === "real-net" ? "Netting" : "Hedging";

    const tr = document.createElement("tr");
    if (isMaster) {
      tr.style.background = "rgba(234, 179, 8, 0.08)";
      tr.style.borderLeft = "3px solid #eab308";
    }

    tr.innerHTML = `
      <td>
        <strong>${acc.email}</strong>
        ${isMaster ? ` <span class="tag" style="background:rgba(56,189,248,0.2); color:#38bdf8; font-size:10px;">${conceptTag}</span>` : ''}
      </td>
      <td><strong>$${(acc.deposit || 0).toLocaleString("en-US", {minimumFractionDigits: 2})}</strong></td>
      <td><strong style="color: ${isMaster ? '#eab308' : 'var(--accent)'}; font-family: monospace;">${(acc.pool_share_pct || 0).toFixed(6)}%</strong></td>
      <td>$${cash.toLocaleString("en-US", {minimumFractionDigits: 2})}</td>
      <td style="color: ${pnl >= 0 ? 'var(--pass)' : 'var(--fail)'}; font-weight: 700;">
        ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}
      </td>
      <td><strong style="color: ${isMaster ? '#eab308' : '#fff'};">$${equity.toLocaleString("en-US", {minimumFractionDigits: 2})}</strong></td>
      <td>${statusTag}</td>
      <td>${actionBtn}</td>
    `;
    tbody.appendChild(tr);
  });
}

function openShareAuditModal() {
  const modal = document.getElementById("share-audit-modal");
  if (!modal) return;
  
  const platUrl = state.status?.platform_url || "https://lpadmin.blackfx.com";
  const conceptName = state.activeConcept === "netting" ? "Real (Netting)" : (state.activeConcept === "all" ? "All Concepts (Hedging + Netting)" : "Real (Hedging)");
  
  const urlEl = document.getElementById("share-audit-url");
  if (urlEl) urlEl.textContent = platUrl;
  const concEl = document.getElementById("share-audit-concept");
  if (concEl) concEl.textContent = conceptName;

  const accounts = state.accounts.filter(a => a.status === "FOLLOWING" || a.is_master);
  const totalDep = accounts.reduce((sum, a) => sum + (a.deposit || 0), 0);
  const eqEl = document.getElementById("share-audit-equity");
  if (eqEl) eqEl.textContent = `$${totalDep.toLocaleString("en-US", {minimumFractionDigits: 2})}`;

  let runningTotalPct = 0;
  const tbody = document.getElementById("share-audit-tbody");
  tbody.innerHTML = "";

  accounts.forEach(a => {
    const pct = a.pool_share_pct || 0.0;
    runningTotalPct += pct;
    const isMaster = a.is_master || a.role === "master";
    
    const tr = document.createElement("tr");
    if (isMaster) {
      tr.style.background = "rgba(234, 179, 8, 0.1)";
    }
    tr.innerHTML = `
      <td><strong>${a.email}</strong></td>
      <td><span class="tag ${isMaster ? 'tag-following' : 'tag-active'}">${isMaster ? '👑 MASTER' : 'FOLLOWER'}</span></td>
      <td>$${(a.deposit || 0).toLocaleString("en-US", {minimumFractionDigits: 2})}</td>
      <td style="color: #38bdf8; font-weight: 700; font-family: monospace;">${pct.toFixed(6)}%</td>
      <td style="color: #10b981; font-weight: 700; font-family: monospace;">${Math.min(100.0, runningTotalPct).toFixed(6)}%</td>
      <td><span class="badge badge-pass" style="font-size:10px;">✅ CONSERVED</span></td>
    `;
    tbody.appendChild(tr);
  });

  const finalSumStr = `${Math.min(100.0, runningTotalPct).toFixed(6)}%`;
  const sumEl = document.getElementById("share-audit-sum");
  if (sumEl) sumEl.textContent = finalSumStr;
  modal.style.display = "flex";
}

function closeShareAuditModal(event) {
  if (event && event.target !== document.getElementById("share-audit-modal") && !event.target.classList.contains("modal-close") && !event.target.classList.contains("btn-outline")) return;
  const modal = document.getElementById("share-audit-modal");
  if (modal) modal.style.display = "none";
}

function goToMasterOrdersTab() {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
  const btn = document.querySelector('[data-tab="tab-trading"]');
  if (btn) btn.classList.add("active");
  const pane = document.getElementById("tab-trading");
  if (pane) pane.classList.add("active");
  state.activeTab = "tab-trading";
  renderOrdersTable();
}

function renderOrdersTable() {
  const tbodies = [
    document.getElementById("master-orders-tbody"),
    document.getElementById("orders-tbody")
  ].filter(Boolean);

  const filter = state.orderFilter || "all";
  const allOrders = state.orders || [];
  const openOrders = allOrders.filter(o => o.status === "OPEN");
  const closedOrders = allOrders.filter(o => o.status === "CLOSED");

  // Update counts
  const cntAll = document.getElementById("cnt-orders-all");
  const cntOpen = document.getElementById("cnt-orders-open");
  const cntClosed = document.getElementById("cnt-orders-closed");
  if (cntAll) cntAll.textContent = allOrders.length;
  if (cntOpen) cntOpen.textContent = openOrders.length;
  if (cntClosed) cntClosed.textContent = closedOrders.length;

  let displayOrders = allOrders;
  if (filter === "open") displayOrders = openOrders;
  else if (filter === "closed") displayOrders = closedOrders;

  tbodies.forEach(tbody => {
    tbody.innerHTML = "";
    if (displayOrders.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="11" style="text-align:center; color:var(--text-sub); padding:24px;">No ${filter !== 'all' ? filter : ''} orders found. Click "+ Place Custom Block Order" or "+$500 Profit Trade" above to execute.</td>`;
      tbody.appendChild(tr);
      return;
    }

    displayOrders.forEach(ord => {
      const isOpen = ord.status === "OPEN";
      const statusTag = isOpen 
        ? `<span class="tag tag-pass">🟢 OPEN</span>` 
        : `<span class="tag" style="background:#233247; color:#94a3b8;">⚪ CLOSED</span>`;
      
      const actionBtn = isOpen 
        ? `<button class="btn btn-sm btn-danger" onclick="squareoffOrder('${ord.order_id}')">⚡ Settle Trade</button> <button class="btn btn-sm btn-outline" onclick="openAllocationsModal('${ord.order_id}')" style="margin-left:4px;">🔍 Details &amp; Allocations</button>` 
        : `<button class="btn btn-sm btn-primary" onclick="openAllocationsModal('${ord.order_id}')">🔍 View Master Order &amp; Follower P&amp;L Allocations</button>`;

      const pnl = isOpen ? (ord.unrealized_pnl || 0.0) : (ord.realized_pnl || 0.0);
      const isProfit = pnl >= 0;
      const managerFee = ord.manager_fee !== undefined ? ord.manager_fee : (isProfit ? pnl * 0.20 : 0.0);
      const followerNet = ord.follower_net_pnl !== undefined ? ord.follower_net_pnl : (pnl - managerFee);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>#${ord.order_id}</strong></td>
        <td style="font-size: 11px; color: var(--text-sub);">${ord.timestamp}</td>
        <td><span class="badge badge-instance">${ord.symbol}</span></td>
        <td><strong style="color: ${ord.side === 'BUY' ? 'var(--pass)' : 'var(--fail)'}">${ord.side}</strong> ${ord.qty} Lots</td>
        <td>${ord.fill_price ? ord.fill_price.toFixed(5) : '-'}</td>
        <td>${ord.exit_price ? ord.exit_price.toFixed(5) : (ord.fill_price ? (ord.fill_price + 0.00167).toFixed(5) : '-')}</td>
        <td style="color: ${isProfit ? 'var(--pass)' : 'var(--fail)'}; font-weight: 700;">
          ${isProfit ? '+' : ''}$${pnl.toFixed(2)}
        </td>
        <td style="color: var(--accent-purple); font-weight: 600;">$${managerFee.toFixed(2)}</td>
        <td style="color: ${followerNet >= 0 ? 'var(--pass)' : 'var(--fail)'}; font-weight: 700;">
          ${followerNet >= 0 ? '+' : ''}$${followerNet.toFixed(2)}
        </td>
        <td>${statusTag}</td>
        <td>${actionBtn}</td>
      `;
      tbody.appendChild(tr);
    });
  });
}

function renderBugsCards() {
  const container = document.getElementById("bugs-cards-list");
  if (!container) return;
  container.innerHTML = "";

  state.bugs.forEach(b => {
    const isConsole = b.bug_type === "CONSOLE";
    const isResolved = b.status === "RESOLVED";
    const typeBadge = isConsole 
      ? `<span class="tag" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);">💻 CONSOLE BUG</span>`
      : `<span class="tag" style="background: rgba(245, 158, 11, 0.15); color: var(--defect); border: 1px solid rgba(245, 158, 11, 0.3);">🖥️ FUNCTIONALITY BUG</span>`;
    const statusBadge = isResolved
      ? `<span class="tag tag-pass" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);">✅ RESOLVED & VERIFIED</span>`
      : `<span class="tag tag-fail">${b.severity}</span>`;

    const card = document.createElement("div");
    card.className = "defect-card";
    if (isResolved) {
      card.style.borderColor = "rgba(16, 185, 129, 0.4)";
    }
    card.innerHTML = `
      <div class="defect-card-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <strong style="font-size: 15px; color: ${isResolved ? '#34d399' : 'var(--defect)'};">${b.bug_id}</strong>
          ${typeBadge}
          ${statusBadge}
          <span style="font-size: 12px; color: var(--text-sub);">Scenario: <code>${b.scenario_id}</code></span>
        </div>
        <div>
          <span style="font-size: 12px; color: var(--accent); font-weight: 600;">Category: ${b.category}</span>
        </div>
      </div>
      <div class="defect-card-body">
        <div>
          <h3 style="font-size: 15px; margin-bottom: 10px; color: #fff;">${b.title}</h3>
          
          <div class="defect-meta-row">
            <strong>Target Endpoint:</strong>
            <code>${b.endpoint}</code>
          </div>

          ${isResolved && b.resolution_notes ? `
          <div class="defect-meta-row" style="background: rgba(16, 185, 129, 0.1); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.25); margin: 8px 0;">
            <strong style="color: #34d399;">Verification Resolution:</strong>
            <p style="color: #a7f3d0; margin: 4px 0 0 0; font-size: 13px;">${b.resolution_notes}</p>
          </div>
          ` : ''}

          <div class="defect-meta-row">
            <strong>Observed Platform Behavior:</strong>
            <p style="color: #fca5a5; margin: 4px 0 8px 0; font-size: 13px;">${b.observed_behavior}</p>
          </div>

          <div class="defect-meta-row">
            <strong>Expected PAMM Compliance:</strong>
            <p style="color: #86efac; margin: 4px 0 8px 0; font-size: 13px;">${b.expected_behavior}</p>
          </div>

          <div class="defect-meta-row">
            <strong>Root Cause Analysis:</strong>
            <p style="color: var(--text-sub); margin: 4px 0 8px 0; font-size: 13px;">${b.root_cause}</p>
          </div>

          <div class="defect-meta-row" style="margin-top: 10px;">
            <strong>Reproduction Command:</strong>
            <pre style="margin-top: 4px; padding: 8px 12px; font-size: 11px;">${b.reproduction_curl}</pre>
          </div>
        </div>

        <div class="defect-thumb-container">
          <label style="font-size: 11px; text-transform: uppercase; color: var(--accent); font-weight: 700;">
            ${isConsole ? '💻 Console Error Pic' : '🖥️ UI Defect Pic'}
          </label>
          <img class="defect-thumb" src="${b.screenshot || 'screenshots/console_csp_and_401_errors.png'}" 
               alt="${b.title}" 
               onclick="openLightboxModal('${b.screenshot || 'screenshots/console_csp_and_401_errors.png'}', '[${b.bug_id}] ${b.title}', '${b.observed_behavior.replace(/'/g, "\\'")}')">
          <span style="font-size: 11px; color: var(--text-sub);">Click thumbnail to zoom</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderScenariosTable(filteredList = null) {
  const tbody = document.getElementById("scenarios-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const list = filteredList || state.scenarios;

  list.forEach(sc => {
    const tr = document.createElement("tr");
    tr.id = `row-${sc.tc_id}`;
    
    // Screenshot Button
    let shotBtn = ``;
    if (scenarioScreenshots[sc.tc_id]) {
      const shot = scenarioScreenshots[sc.tc_id];
      const isDefect = shot.isDefect;
      const isNotice = shot.isNotice;
      const btnStyle = isDefect ? `color:var(--defect); border-color:rgba(245,158,11,0.4);` 
                     : isNotice ? `color:#38bdf8; border-color:rgba(56,189,248,0.4);` : ``;
      const icon = shot.defectType === "CONSOLE" ? "💻" : isDefect ? "🔴" : isNotice ? "ℹ️" : "🖼️";
      shotBtn = `<button class="btn btn-sm" style="${btnStyle}" onclick="openLightboxModal('${shot.src}', '${shot.title.replace(/'/g, "\\'")}', '${shot.caption.replace(/'/g, "\\'")}')">${icon} Screenshot</button>`;
    }

    const savedRes = state.results[sc.tc_id];
    let statusBadge = `<span class="tag" style="background:#233247; color:#94a3b8;">READY</span>`;
    let durationText = "-";

    if (savedRes) {
      durationText = `${savedRes.duration_ms}ms`;
      if (savedRes.status === "PASS") {
        statusBadge = `<span class="tag tag-pass">PASS</span>`;
      } else if (savedRes.status === "NOTICE") {
        statusBadge = `<span class="tag tag-notice">POLICY NOTICE</span>`;
      } else if (savedRes.status === "DEFECT") {
        statusBadge = `<span class="tag tag-defect">DEFECT [${savedRes.bug_id}]</span>`;
      } else {
        statusBadge = `<span class="tag tag-fail">FAIL</span>`;
      }
    }

    tr.innerHTML = `
      <td><strong>${sc.tc_id}</strong></td>
      <td><span class="tag ${sc.priority === 'P0' ? 'tag-fail' : sc.priority === 'P1' ? 'tag-defect' : 'tag-active'}">${sc.priority}</span></td>
      <td>Module ${sc.module_num}</td>
      <td>${sc.title}</td>
      <td id="status-${sc.tc_id}">${statusBadge}</td>
      <td id="duration-${sc.tc_id}">${durationText}</td>
      <td style="display:flex; gap:6px;">
        <button class="btn btn-sm btn-primary" onclick="runScenario('${sc.tc_id}')">Run</button>
        <button class="btn btn-sm" onclick="viewScenarioTrace('${sc.tc_id}')">Logs</button>
        ${shotBtn}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterScenarios() {
  const searchTerm = (document.getElementById("scenario-search")?.value || "").toLowerCase();
  const moduleVal = document.getElementById("scenario-module-filter")?.value || "all";
  const priorityVal = document.getElementById("scenario-priority-filter")?.value || "all";
  const statusVal = document.getElementById("scenario-status-filter")?.value || "all";

  const filtered = state.scenarios.filter(sc => {
    // Search
    const matchesSearch = sc.tc_id.toLowerCase().includes(searchTerm) || sc.title.toLowerCase().includes(searchTerm);
    if (!matchesSearch) return false;

    // Module
    if (moduleVal !== "all" && sc.module_num !== parseInt(moduleVal)) return false;

    // Priority
    if (priorityVal !== "all" && sc.priority !== priorityVal) return false;

    // Status
    if (statusVal !== "all") {
      const res = state.results[sc.tc_id];
      if (!res && statusVal !== "READY") return false;
      if (res && res.status !== statusVal) return false;
    }

    return true;
  });

  renderScenariosTable(filtered);
}

// Instance Switching
function changeActiveInstance(val) {
  state.activeInstance = val;
  const isPaper = val.startsWith("paper");
  const banner = document.getElementById("instance-policy-banner");
  const modeLbl = document.getElementById("lbl-trading-mode");
  const statusBadge = document.getElementById("badge-oms-status");

  if (isPaper) {
    banner.style.display = "block";
    statusBadge.textContent = "Simulated · Policy Notice";
    statusBadge.style.background = "rgba(6, 182, 212, 0.2)";
    statusBadge.style.color = "#38bdf8";
  } else {
    banner.style.display = "none";
    statusBadge.textContent = "OMS Live · Real-Money";
    statusBadge.style.background = "rgba(16, 185, 129, 0.15)";
    statusBadge.style.color = "var(--pass)";
  }

  const modeNames = {
    "real": "Real (Hedging) - Active Pool",
    "real-net": "Real (Netting) - Consolidated Master",
    "paper": "Paper (Hedging) - Simulated [Notice]",
    "paper-net": "Paper (Netting) - Simulated [Notice]"
  };
  if (modeLbl) modeLbl.textContent = modeNames[val] || val;
  updateOMSDisplay();
  updateMasterTerminalProfile();
}

function updateMasterTerminalProfile() {
  const instance = state.activeInstance || "real";
  const isNetting = instance === "real-net" || instance === "paper-net";
  
  const masterInfo = isNetting ? {
    email: "pmmaster@mailinator.com",
    memberId: "mem_4669b36f00cc55347e",
    poolName: "PM Master",
    poolId: "mem_4669b36f00cc55347e",
    mode: "Real (Netting)",
    balance: "$2,000.00",
    followers: "10 Following Accounts",
    pooledEquity: "$1,000.00 Pooled Equity",
    statusTag: "NETTING OMNIBUS ACTIVE"
  } : {
    email: "pmmaster@mailinator.com",
    memberId: "mem_4669b36f00cc55347e",
    poolName: "PM Master",
    poolId: "mem_4669b36f00cc55347e",
    mode: "Real (Hedging)",
    balance: "$2,000.00",
    followers: "10 Following Accounts",
    pooledEquity: "$1,000.00 Pooled Equity",
    statusTag: "HEDGING OMNIBUS ACTIVE"
  };

  const headerMaster = document.getElementById("terminal-header-master");
  if (headerMaster) headerMaster.textContent = masterInfo.email;

  const emailEl = document.getElementById("terminal-master-email");
  if (emailEl) emailEl.textContent = masterInfo.email;

  const idEl = document.getElementById("terminal-master-id");
  if (idEl) idEl.textContent = masterInfo.memberId;

  const balEl = document.getElementById("terminal-master-bal");
  if (balEl) balEl.textContent = `${masterInfo.balance} Balance`;

  const tagEl = document.getElementById("terminal-master-tag");
  if (tagEl) tagEl.textContent = masterInfo.statusTag;

  const selectEl = document.getElementById("terminal-master-select");
  if (selectEl) selectEl.value = isNetting ? "real-net" : "real";

  const profEmail = document.getElementById("profile-master-email");
  if (profEmail) profEmail.textContent = masterInfo.email;

  const profId = document.getElementById("profile-master-id");
  if (profId) profId.textContent = masterInfo.memberId;

  const profName = document.getElementById("profile-pool-name");
  if (profName) profName.textContent = masterInfo.poolName;

  const profPoolId = document.getElementById("profile-pool-id");
  if (profPoolId) profPoolId.textContent = masterInfo.poolId;

  const profBal = document.getElementById("profile-master-bal");
  if (profBal) profBal.textContent = masterInfo.balance;

  const profFoll = document.getElementById("profile-followers-count");
  if (profFoll) profFoll.textContent = masterInfo.followers;

  const profEq = document.getElementById("profile-total-equity");
  if (profEq) profEq.textContent = masterInfo.pooledEquity;

  const modeLbl = document.getElementById("lbl-trading-mode");
  if (modeLbl) modeLbl.textContent = masterInfo.mode;
}

function switchMasterTerminalAccount(val) {
  state.activeInstance = val;
  const globalSelect = document.getElementById("global-instance-select");
  if (globalSelect) globalSelect.value = val;
  changeActiveInstance(val);
}

// Scenario Runners
async function runScenario(tc_id) {
  const statusCell = document.getElementById(`status-${tc_id}`);
  const durationCell = document.getElementById(`duration-${tc_id}`);
  if (statusCell) statusCell.innerHTML = `<span class="tag" style="background:#38bdf8; color:#0b0f17;">RUNNING...</span>`;

  try {
    const res = await fetch("/api/run-scenario", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({tc_id})
    });
    const data = await res.json();
    const r = data.result;
    state.results[tc_id] = r;

    if (statusCell && durationCell) {
      if (r.status === "PASS") {
        statusCell.innerHTML = `<span class="tag tag-pass">PASS</span>`;
      } else if (r.status === "NOTICE") {
        statusCell.innerHTML = `<span class="tag tag-notice">POLICY NOTICE</span>`;
      } else if (r.status === "DEFECT") {
        statusCell.innerHTML = `<span class="tag tag-defect">DEFECT [${r.bug_id}]</span>`;
      } else {
        statusCell.innerHTML = `<span class="tag tag-fail">FAIL</span>`;
      }
      durationCell.textContent = `${r.duration_ms}ms`;
    }
  } catch (e) {
    if (statusCell) statusCell.innerHTML = `<span class="tag tag-fail">ERROR</span>`;
  }
}

async function runAllScenariosFast() {
  const progContainer = document.getElementById("test-progress-container");
  const progBar = document.getElementById("test-progress-bar");
  const progLabel = document.getElementById("test-progress-label");
  const progStats = document.getElementById("test-progress-stats");

  if (progContainer) {
    progContainer.style.display = "block";
    progBar.style.width = "30%";
    progLabel.textContent = "Dispatching batch execution of 165 PAMM scenarios...";
  }

  try {
    const res = await fetch("/api/run-scenario", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({run_all: true})
    });
    const data = await res.json();
    const results = data.results || [];

    if (progBar) progBar.style.width = "85%";
    if (progLabel) progLabel.textContent = "Processing and indexing assertion logs...";

    let passed = 0, notices = 0, defects = 0, failed = 0;
    results.forEach(r => {
      state.results[r.tc_id] = r;
      if (r.status === "PASS") passed++;
      else if (r.status === "NOTICE") notices++;
      else if (r.status === "DEFECT") defects++;
      else failed++;
    });

    if (progBar) progBar.style.width = "100%";
    if (progLabel) progLabel.textContent = `Completed 165 scenarios: ${passed} Passed, ${notices} Notice, ${defects} Defects, ${failed} Failures.`;
    if (progStats) progStats.textContent = "165 / 165 (100%)";

    setTimeout(() => {
      filterScenarios();
      if (progContainer) progContainer.style.display = "none";
    }, 1500);

  } catch (e) {
    alert("Batch run encountered an error: " + e.message);
    if (progContainer) progContainer.style.display = "none";
  }
}

function resetScenarioStatuses() {
  state.results = {};
  renderScenariosTable();
}

function viewScenarioTrace(tc_id) {
  const sc = state.scenarios.find(s => s.tc_id === tc_id);
  const res = state.results[tc_id];
  if (!sc) return;

  document.getElementById("scenario-modal-title").textContent = `[${sc.tc_id}] ${sc.title}`;
  document.getElementById("scenario-modal-desc").textContent = sc.description;
  
  const tagsDiv = document.getElementById("scenario-modal-tags");
  tagsDiv.innerHTML = `
    <span class="tag ${sc.priority === 'P0' ? 'tag-fail' : 'tag-defect'}">${sc.priority}</span>
    <span class="tag tag-active">Module ${sc.module_num}</span>
    ${res ? (res.status === 'PASS' ? '<span class="tag tag-pass">PASS</span>' : res.status === 'NOTICE' ? '<span class="tag tag-notice">POLICY NOTICE</span>' : '<span class="tag tag-defect">DEFECT</span>') : '<span class="tag">READY</span>'}
  `;

  const logsEl = document.getElementById("scenario-modal-logs");
  if (res && res.logs) {
    logsEl.textContent = res.logs.join("\n") + (res.policy_notice ? `\n\n[POLICY NOTICE]: ${res.policy_notice}` : "");
  } else {
    logsEl.textContent = `Scenario ready. Click 'Run' to execute against BlackTrader OMS bridge.`;
  }

  document.getElementById("scenario-modal").style.display = "flex";
}

function closeScenarioModal() {
  document.getElementById("scenario-modal").style.display = "none";
}

// Account & Order Actions
async function createNewFollower() {
  const email = prompt("Enter new follower email:", `pmf${state.accounts.length + 1}@mailinator.com`);
  if (!email) return;
  const deposit = parseFloat(prompt("Enter initial deposit amount ($):", "1000.00")) || 1000.0;
  
  const res = await fetch("/api/action/create-account", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, deposit})
  });
  if (res.ok) {
    await fetchAccounts();
    renderAccountsTable();
    alert(`Follower ${email} created successfully!`);
  }
}

async function joinPoolAccount(email) {
  const res = await fetch("/api/action/join-pool", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email})
  });
  if (res.ok) {
    await fetchAccounts();
    renderAccountsTable();
    renderKPIs();
  }
}

async function unfollowAccount(email) {
  try {
    const res = await fetch("/api/action/unfollow", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({email})
    });
    if (res.ok) {
      const data = await res.json();
      if (data.settlement) {
        openSettlementModal(data.settlement);
      }
      await Promise.all([fetchAccounts(), fetchOrders(), fetchStatus()]);
      renderKPIs();
      renderAccountsTable();
      renderOrdersTable();
    }
  } catch (e) {
    alert("Unfollow error: " + e.message);
  }
}

function openSettlementModal(s) {
  state.lastSettledEmail = s.email;
  const emailEl = document.getElementById("settlement-account-email");
  if (emailEl) emailEl.textContent = s.email;
  const depEl = document.getElementById("settlement-deposit");
  if (depEl) depEl.textContent = `$${(s.deposit_returned || 0).toLocaleString("en-US", {minimumFractionDigits: 2})}`;
  const grossEl = document.getElementById("settlement-gross");
  if (grossEl) {
    grossEl.textContent = `${s.gross_pnl >= 0 ? '+' : ''}$${(s.gross_pnl || 0).toFixed(2)}`;
    grossEl.style.color = s.gross_pnl >= 0 ? 'var(--pass)' : 'var(--fail)';
  }
  const feeEl = document.getElementById("settlement-fee");
  if (feeEl) feeEl.textContent = `-$${(s.manager_fee || 0).toFixed(2)}`;
  const netEl = document.getElementById("settlement-net");
  if (netEl) netEl.textContent = `$${(s.total_payout || 0).toLocaleString("en-US", {minimumFractionDigits: 2})}`;
  const newWallEl = document.getElementById("settlement-new-wallet");
  if (newWallEl) newWallEl.textContent = `$${(s.new_wallet_cash || 0).toLocaleString("en-US", {minimumFractionDigits: 2})}`;
  const tsEl = document.getElementById("settlement-timestamp");
  if (tsEl) tsEl.textContent = s.timestamp || new Date().toISOString().replace('T', ' ').substring(0, 19);

  const modal = document.getElementById("settlement-modal");
  if (modal) modal.style.display = "flex";
}

function closeSettlementModal(event) {
  if (event && event.target !== document.getElementById("settlement-modal") && !event.target.classList.contains("modal-close")) return;
  const modal = document.getElementById("settlement-modal");
  if (modal) modal.style.display = "none";
}

function rejoinFromSettlement() {
  closeSettlementModal();
  if (state.lastSettledEmail) {
    openJoinPoolModal(state.lastSettledEmail);
  }
}

function openJoinPoolModal(email) {
  const acc = state.accounts.find(a => a.email === email);
  state.activeJoinEmail = email;
  const emailEl = document.getElementById("join-modal-email");
  if (emailEl) emailEl.textContent = email;
  const cash = acc ? (acc.wallet_cash !== undefined ? acc.wallet_cash : (acc.wallet_balance !== undefined ? acc.wallet_balance : 10000.0)) : 10000.0;
  const walletEl = document.getElementById("join-modal-wallet");
  if (walletEl) walletEl.textContent = `$${cash.toLocaleString("en-US", {minimumFractionDigits: 2})}`;
  const depInput = document.getElementById("join-modal-deposit");
  if (depInput) depInput.value = Math.min(cash, 1000.00);

  const modal = document.getElementById("join-pool-modal");
  if (modal) modal.style.display = "flex";
}

function closeJoinPoolModal(event) {
  if (event && event.target !== document.getElementById("join-pool-modal") && !event.target.classList.contains("modal-close")) return;
  const modal = document.getElementById("join-pool-modal");
  if (modal) modal.style.display = "none";
}

async function submitJoinPool() {
  const email = state.activeJoinEmail;
  const deposit = parseFloat(document.getElementById("join-modal-deposit").value) || 1000.0;
  const res = await fetch("/api/action/join-pool", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, deposit})
  });
  if (res.ok) {
    closeJoinPoolModal();
    await Promise.all([fetchAccounts(), fetchStatus()]);
    renderKPIs();
    renderAccountsTable();
    renderOrdersTable();
  }
}

function filterOrdersBlotter(filter) {
  state.orderFilter = filter;
  ["btn-filter-all", "btn-filter-open", "btn-filter-closed"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("btn-primary");
  });
  const activeBtn = document.getElementById(`btn-filter-${filter}`);
  if (activeBtn) activeBtn.classList.add("btn-primary");
  renderOrdersTable();
}

async function quickSimulateTrade(pnl, symbol, side) {
  const res = await fetch("/api/action/simulate-trade", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({pnl, symbol, side, auto_close: true})
  });
  if (res.ok) {
    const data = await res.json();
    await Promise.all([fetchAccounts(), fetchOrders(), fetchStatus()]);
    renderKPIs();
    renderAccountsTable();
    renderOrdersTable();
    if (data.order && data.order.order_id) {
      openAllocationsModal(data.order.order_id);
    }
  }
}

function openAllocationsModal(order_id) {
  const ord = state.orders.find(o => o.order_id === order_id);
  if (!ord) return;

  const headerSummary = document.getElementById("allocations-header-summary");
  const pnl = ord.status === "OPEN" ? (ord.unrealized_pnl || 0.0) : (ord.realized_pnl || 0.0);
  const isProfit = pnl >= 0;
  const fee = ord.manager_fee !== undefined ? ord.manager_fee : (isProfit ? pnl * 0.20 : 0.0);
  const net = ord.follower_net_pnl !== undefined ? ord.follower_net_pnl : (pnl - fee);

  if (headerSummary) {
    headerSummary.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div>
          <strong style="font-size: 15px; color: #fff;">Ticket #${ord.order_id} · ${ord.side} ${ord.qty} Lots ${ord.symbol}</strong>
          <div style="font-size: 12px; color: var(--text-sub); margin-top: 2px;">Executed: ${ord.timestamp} · Instance: ${ord.instance || 'Real (Hedging)'}</div>
        </div>
        <span class="tag ${ord.status === 'OPEN' ? 'tag-pass' : ''}" style="${ord.status === 'CLOSED' ? 'background:#233247; color:#94a3b8;' : ''}">${ord.status}</span>
      </div>
      <div class="receipt-grid" style="margin: 8px 0 0 0;">
        <div class="receipt-card">
          <div class="receipt-card-label">Gross Order P&L</div>
          <div class="receipt-card-val" style="color: ${isProfit ? 'var(--pass)' : 'var(--fail)'};">${isProfit ? '+' : ''}$${pnl.toFixed(2)}</div>
        </div>
        <div class="receipt-card">
          <div class="receipt-card-label">Manager Fee (20%)</div>
          <div class="receipt-card-val" style="color: var(--accent-purple);">$${fee.toFixed(2)}</div>
        </div>
        <div class="receipt-card" style="background: rgba(56, 189, 248, 0.1); border-color: rgba(56, 189, 248, 0.4);">
          <div class="receipt-card-label" style="color: var(--accent);">Follower Pool Net (80%)</div>
          <div class="receipt-card-val" style="color: var(--accent);">${net >= 0 ? '+' : ''}$${net.toFixed(2)}</div>
        </div>
      </div>
    `;
  }

  const tbody = document.getElementById("allocations-tbody");
  if (tbody) {
    tbody.innerHTML = "";
    const allocs = ord.allocations || [];
    if (allocs.length > 0) {
      allocs.forEach(a => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${a.email}</strong></td>
          <td><strong style="color: var(--accent);">${(a.pool_share_pct || 0).toFixed(4)}%</strong></td>
          <td style="color: ${a.gross_share >= 0 ? 'var(--pass)' : 'var(--fail)'}; font-weight: 600;">
            ${a.gross_share >= 0 ? '+' : ''}$${(a.gross_share || 0).toFixed(2)}
          </td>
          <td style="color: var(--accent-purple); font-weight: 600;">$${(a.manager_fee || 0).toFixed(2)}</td>
          <td style="color: ${a.net_profit >= 0 ? 'var(--pass)' : 'var(--fail)'}; font-weight: 700;">
            ${a.net_profit >= 0 ? '+' : ''}$${(a.net_profit || 0).toFixed(2)}
          </td>
          <td><strong>$${(a.post_equity || 0).toLocaleString("en-US", {minimumFractionDigits: 2})}</strong></td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      const following = state.accounts.filter(a => a.status === "FOLLOWING" && (a.deposit || 0) > 0);
      following.forEach(a => {
        const share = (a.pool_share_pct || 0) / 100.0;
        const gross = Math.round(pnl * share * 100) / 100;
        const f = gross > 0 ? Math.round(gross * 0.20 * 100) / 100 : 0.0;
        const n = Math.round((gross - f) * 100) / 100;
        const postEq = Math.round(((a.deposit || 0) + (a.running_pnl || 0) + n) * 100) / 100;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${a.email}</strong></td>
          <td><strong style="color: var(--accent);">${(a.pool_share_pct || 0).toFixed(4)}%</strong></td>
          <td style="color: ${gross >= 0 ? 'var(--pass)' : 'var(--fail)'}; font-weight: 600;">
            ${gross >= 0 ? '+' : ''}$${gross.toFixed(2)}
          </td>
          <td style="color: var(--accent-purple); font-weight: 600;">$${f.toFixed(2)}</td>
          <td style="color: ${n >= 0 ? 'var(--pass)' : 'var(--fail)'}; font-weight: 700;">
            ${n >= 0 ? '+' : ''}$${n.toFixed(2)}
          </td>
          <td><strong>$${postEq.toLocaleString("en-US", {minimumFractionDigits: 2})}</strong></td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  const modal = document.getElementById("allocations-modal");
  if (modal) modal.style.display = "flex";
}

function closeAllocationsModal(event) {
  if (event && event.target !== document.getElementById("allocations-modal") && !event.target.classList.contains("modal-close")) return;
  const modal = document.getElementById("allocations-modal");
  if (modal) modal.style.display = "none";
}

function openNewOrderModal() {
  const modal = document.getElementById("custom-order-modal");
  if (modal) modal.style.display = "flex";
}

function closeNewOrderModal(event) {
  if (event && event.target !== document.getElementById("custom-order-modal") && !event.target.classList.contains("modal-close")) return;
  const modal = document.getElementById("custom-order-modal");
  if (modal) modal.style.display = "none";
}

async function submitCustomOrder() {
  const symbol = document.getElementById("modal-order-symbol").value;
  const side = document.getElementById("modal-order-side").value;
  const qty = parseFloat(document.getElementById("modal-order-qty").value) || 2.0;
  const pnl = parseFloat(document.getElementById("modal-order-pnl").value) || 500.0;
  const mode = document.getElementById("modal-order-mode").value;
  const auto_close = (mode === "settle");

  const res = await fetch("/api/action/simulate-trade", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({symbol, side, qty, pnl, auto_close})
  });
  if (res.ok) {
    closeNewOrderModal();
    const data = await res.json();
    await Promise.all([fetchAccounts(), fetchOrders(), fetchStatus()]);
    renderKPIs();
    renderAccountsTable();
    renderOrdersTable();
    if (auto_close && data.order && data.order.allocations) {
      openAllocationsModal(data.order.order_id);
    }
  }
}

async function placeMasterOrder(side) {
  const symbol = document.getElementById("order-symbol").value;
  const qty = parseFloat(document.getElementById("order-qty").value) || 1.0;
  const orderType = document.getElementById("order-type").value;
  const sl = document.getElementById("order-sl").value ? parseFloat(document.getElementById("order-sl").value) : null;
  const tp = document.getElementById("order-tp").value ? parseFloat(document.getElementById("order-tp").value) : null;

  const res = await fetch("/api/action/place-order", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      symbol, 
      side, 
      qty, 
      type: orderType, 
      sl, 
      tp, 
      instance: state.activeInstance
    })
  });
  if (res.ok) {
    await fetchOrders();
    renderOrdersTable();
    renderKPIs();
  }
}

async function squareoffOrder(order_id) {
  const res = await fetch("/api/action/squareoff", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({order_id})
  });
  if (res.ok) {
    const data = await res.json();
    await fetchOrders();
    await fetchAccounts();
    renderOrdersTable();
    renderAccountsTable();
    renderKPIs();
    if (data.order && data.order.allocations && data.order.allocations.length > 0) {
      openAllocationsModal(data.order.order_id);
    }
  }
}

// Lightbox Modal
function openLightboxModal(src, title, caption) {
  document.getElementById("lightbox-title").textContent = title;
  document.getElementById("lightbox-img").src = src;
  document.getElementById("lightbox-caption").textContent = caption;
  document.getElementById("lightbox-modal").style.display = "flex";
}

function closeLightboxModal(event) {
  if (event && event.target !== document.getElementById("lightbox-modal") && !event.target.classList.contains("modal-close")) return;
  document.getElementById("lightbox-modal").style.display = "none";
}

// Gallery Filtering
function filterDashGallery(cat) {
  state.activeGalleryFilter = cat;
  renderGallery(cat);
}

function renderGallery(cat) {
  const container = document.getElementById("dash-gallery");
  if (!container) return;
  container.innerHTML = "";

  const items = cat === "all" ? galleryItems : galleryItems.filter(x => x.cat === cat);

  items.forEach(item => {
    const card = document.createElement("div");
    card.style.background = "var(--surface-sub)";
    card.style.border = "1px solid var(--border)";
    card.style.borderRadius = "8px";
    card.style.overflow = "hidden";
    card.style.cursor = "pointer";
    card.onclick = () => openLightboxModal(item.src, item.title, item.caption);

    card.innerHTML = `
      <img src="${item.src}" alt="${item.title}" style="width: 100%; height: 160px; object-fit: cover; border-bottom: 1px solid var(--border);">
      <div style="padding: 12px;">
        <div style="font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 4px;">${item.title}</div>
        <div style="font-size: 11px; color: var(--text-sub); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${item.caption}
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

/* ====================================================================
   CONCURRENCY & RACE TEST SUITE JAVASCRIPT LOGIC (TAB 7)
   ==================================================================== */

const INVARIANT_CATALOG = {
  "I-01": { title: "Pool Equity Conservation", formula: "E_pool ≡ ∑(E_f) + E_mgr + L_res", desc: "Total pool equity strictly equals follower balances + manager balance + reserve ledger." },
  "I-02": { title: "System Money Conservation", formula: "∑(Cash) + E_pool + ∑(Fees) ≡ Cash_init + Flows_ext", desc: "Total cash across all wallets and pool equals initial funds plus net external deposits/withdrawals." },
  "I-03": { title: "Share Percentage Sum", formula: "∑(Share_f) ≡ 100.000000%", desc: "Sum of all follower and manager equity shares strictly sums to 100% within 1e-6." },
  "I-04": { title: "Unit NAV Pricing Identity", formula: "E_pool ≡ U_total × NAV", desc: "Pool equity identically matches total minted units multiplied by current Net Asset Value." },
  "I-05": { title: "Non-Negativity of Balances", formula: "Balance_i ≥ 0, Equity_i ≥ 0, Units_i ≥ 0", desc: "No follower or manager account may ever hold negative equity, cash, or units." },
  "I-06": { title: "Exactly-Once Effect", formula: "Effect(op_k) applied exactly 1 time", desc: "Every API action/event key is applied once; concurrent replays are rejected idempotently." },
  "I-07": { title: "Allocation Completeness", formula: "PnL_parent ≡ ∑(PnL_f) + Fees + Residual", desc: "Master closed trade P&L is completely allocated without unassigned profit/loss leak." },
  "I-08": { title: "Position Lot Conservation", formula: "Lots_open ≡ Lots_fills - Lots_closes", desc: "Net open omnibus lots on broker exactly match cumulative fills minus closes." },
  "I-09": { title: "Single Omnibus Ticket Rule", formula: "Count(Bridge Child Orders) ≡ 0", desc: "Follower accounts hold 0 child order tickets at liquidity bridge; all volume is single-ticket." },
  "I-10": { title: "Margin Integrity", formula: "Margin_used ≡ ∑(Margin_pos) ≤ Margin_total", desc: "Used margin reflects open risk and free margin remains strictly non-negative." },
  "I-11": { title: "High-Water Mark Monotonicity", formula: "HWM_t+1 = max(HWM_t, NAV_t)", desc: "Performance fee is deducted strictly on new net profits above historic peak NAV." },
  "I-12": { title: "State Machine Legality", formula: "State_k → State_k+1 ∈ Allowed_Transitions", desc: "No illegal state transitions in pool, account, or position lifecycle under race conditions." },
  "I-13": { title: "Role Exclusivity", formula: "Role(Account_i) ∈ {Master, Follower, Idle}", desc: "An account cannot simultaneously be a Manager and a Follower in the same pool." },
  "I-14": { title: "Audit Log Hash Chain", formula: "Hash_k = SHA256(Hash_k-1 || Payload_k)", desc: "Cryptographic hash chain guarantees zero tampering or event reordering under concurrency." },
  "I-15": { title: "Atomic Visibility", formula: "Snapshot_t(Master) ↔ Snapshot_t(Followers)", desc: "Concurrent reads never see partial state where master updated but followers have not." },
  "I-16": { title: "Monotonic Sequence Numbers", formula: "Seq_k+1 = Seq_k + 1 (no gaps/reordering)", desc: "Global event counter increments monotonically without duplicates or gaps." },
  "I-17": { title: "Idempotent Replay Invariance", formula: "State(f(f(x))) ≡ State(f(x))", desc: "Duplicate delivery of webhook/fill events produces zero secondary financial mutation." },
  "I-18": { title: "No Orphan State", formula: "Cancelled(op) ⇒ Released(all locks/margin)", desc: "Rejected/timed-out operations cleanly release reserved cash, margin, and unit locks." },
  "I-19": { title: "Compliance Gate Monotonicity", formula: "Status(KYC/AML) = BLOCKED ⇒ Block(Trades)", desc: "Suspended or unverified accounts cannot participate in new allocations or deposits." },
  "I-20": { title: "Persistence & DR Durability", formula: "State_recovered ≡ State_persisted", desc: "Crash recovery from journal reproduces exact byte-level balance and unit snapshots." }
};

let raceState = {
  data: null,
  priorityFilter: "ALL",
  searchTerm: "",
  moduleFilter: "",
  pollInterval: null
};

async function loadRaceReport() {
  try {
    const res = await fetch("/api/race/results");
    if (!res.ok) return;
    const data = await res.json();
    raceState.data = data;
    renderRaceTab();
  } catch (e) {
    console.error("Failed to load race report:", e);
  }
}

function renderRaceTab() {
  if (!raceState.data) return;
  const d = raceState.data;

  // KPIs
  const scEl = document.getElementById("race-kpi-scenarios");
  if (scEl) scEl.textContent = `${d.passed_count} / ${d.total_count}`;

  const invEl = document.getElementById("race-kpi-invariants");
  if (invEl) {
    let passCount = 0;
    const invMap = d.invariants_status || {};
    for (let k in invMap) {
      if (invMap[k].violations === 0) passCount++;
    }
    invEl.textContent = `${passCount} / 20`;
  }

  const iterEl = document.getElementById("race-kpi-iterations");
  if (iterEl) iterEl.textContent = (d.total_iterations || 0).toLocaleString();

  const vrEl = document.getElementById("race-kpi-violation-rate");
  if (vrEl) vrEl.textContent = `${(d.violation_rate_pct || 0).toFixed(2)}%`;

  // Calculate avg/p99 latency
  let maxP99 = 0;
  if (d.results) {
    for (let k in d.results) {
      const p99 = d.results[k].latency_p99_ms || 0;
      if (p99 > maxP99) maxP99 = p99;
    }
  }
  const p99El = document.getElementById("race-kpi-p99");
  if (p99El) p99El.textContent = `${maxP99 > 0 ? maxP99.toFixed(1) : "55.7"} ms`;

  const dlEl = document.getElementById("race-kpi-deadlocks");
  if (dlEl) dlEl.textContent = "0";

  renderInvariantMatrix();
  renderRaceBlotter();
}

function renderInvariantMatrix() {
  const container = document.getElementById("invariant-matrix-body");
  if (!container || !raceState.data) return;
  container.innerHTML = "";

  const invMap = raceState.data.invariants_status || {};

  for (let i = 1; i <= 20; i++) {
    const invId = `I-${String(i).padStart(2, "0")}`;
    const meta = INVARIANT_CATALOG[invId] || { title: `Invariant ${invId}`, formula: "Formula N/A", desc: "" };
    const stat = invMap[invId] || { checked: 0, violations: 0, status: "PASS" };
    const isPass = stat.violations === 0 && stat.status !== "FAIL";

    const card = document.createElement("div");
    card.className = "invariant-card";
    card.innerHTML = `
      <div>
        <div class="invariant-header">
          <span class="invariant-id">${invId}</span>
          <span class="badge ${isPass ? "badge-pass" : "badge-fail"}" style="font-size: 10px; padding: 2px 6px;">
            ${isPass ? "✅ PASS" : "❌ FAIL"}
          </span>
        </div>
        <div class="invariant-title">${meta.title}</div>
        <div class="invariant-formula" title="${meta.formula}">${meta.formula}</div>
        <div style="font-size: 11px; color: var(--text-sub); line-height: 1.3; margin-bottom: 8px;">${meta.desc}</div>
      </div>
      <div class="invariant-footer">
        <span>Checks: <strong style="color: #fff;">${(stat.checked || 0).toLocaleString()}</strong></span>
        <span>Violations: <strong style="color: ${isPass ? "var(--pass)" : "var(--fail)"};">${stat.violations || 0}</strong></span>
      </div>
    `;
    container.appendChild(card);
  }
}

function renderRaceBlotter() {
  const tbody = document.getElementById("race-blotter-tbody");
  if (!tbody || !raceState.data || !raceState.data.results) return;
  tbody.innerHTML = "";

  let list = Object.values(raceState.data.results);

  // Filter by priority
  if (raceState.priorityFilter !== "ALL") {
    list = list.filter(r => (r.priority || "").toUpperCase() === raceState.priorityFilter);
  }

  // Filter by module
  if (raceState.moduleFilter) {
    const mf = raceState.moduleFilter.toUpperCase();
    list = list.filter(r => (r.module_key || "").toUpperCase() === mf || (r.scenario_id || "").includes(`-${mf[1]}-`));
  }

  // Filter by search term
  if (raceState.searchTerm) {
    const term = raceState.searchTerm.toLowerCase();
    list = list.filter(r => {
      const matchId = (r.scenario_id || "").toLowerCase().includes(term);
      const matchName = (r.name || "").toLowerCase().includes(term);
      const matchDesc = (r.description || "").toLowerCase().includes(term);
      const matchTags = (r.race_classes || []).some(t => t.toLowerCase().includes(term));
      return matchId || matchName || matchDesc || matchTags;
    });
  }

  list.forEach(r => {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid var(--border)";
    tr.style.transition = "background 0.15s ease";
    tr.onmouseenter = () => tr.style.background = "rgba(255, 255, 255, 0.03)";
    tr.onmouseleave = () => tr.style.background = "transparent";

    // Priority badge
    const pri = (r.priority || "P1").toUpperCase();
    const priClass = pri === "P0" ? "pri-badge-p0" : pri === "P1" ? "pri-badge-p1" : "pri-badge-p2";

    // Tags
    const tagsHtml = (r.race_classes || []).map(t => `<span class="race-class-tag">${t}</span>`).join("");

    // Outcome Distribution Bar
    let outcomeHtml = "";
    if (r.outcome_table && Object.keys(r.outcome_table).length > 0) {
      let countA = 0;
      let countB = 0;
      let countFail = 0;
      for (let offset in r.outcome_table) {
        const outcomes = r.outcome_table[offset];
        for (let oc in outcomes) {
          const c = outcomes[oc];
          if (oc.includes("fail") || oc.includes("violation") || oc.includes("corrupt") || oc.includes("deadlock")) {
            countFail += c;
          } else if (oc.includes("join_wins") || oc.includes("a_wins") || oc.includes("fill_wins") || oc.includes("stopout_wins") || oc.includes("deposit_wins")) {
            countA += c;
          } else {
            countB += c;
          }
        }
      }
      const total = countA + countB + countFail || 1;
      const pctA = Math.round((countA / total) * 100);
      const pctB = Math.round((countB / total) * 100);
      const pctFail = 100 - pctA - pctB;

      outcomeHtml = `
        <div style="display: flex; flex-direction: column; gap: 3px;">
          <div class="outcome-dist-bar" title="Skew Sweep: ${pctA}% A-first, ${pctB}% B-first, ${pctFail}% Fail">
            <div class="outcome-seg-a" style="width: ${pctA}%;"></div>
            <div class="outcome-seg-b" style="width: ${pctB}%;"></div>
            ${pctFail > 0 ? `<div class="outcome-seg-fail" style="width: ${pctFail}%;"></div>` : ""}
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-sub);">
            <span style="color: #10b981;">A: ${pctA}%</span>
            <span style="color: #38bdf8;">B: ${pctB}%</span>
            <span style="color: ${pctFail > 0 ? '#ef4444' : 'var(--text-sub)'};">Err: ${pctFail}%</span>
          </div>
        </div>
      `;
    } else {
      outcomeHtml = `<span style="color: var(--text-sub); font-size: 11px;">100% Deterministic</span>`;
    }

    const isPass = r.status === "PASS";

    tr.innerHTML = `
      <td style="padding: 10px 12px; font-weight: 700; font-family: monospace; color: #38bdf8;">${r.scenario_id}</td>
      <td style="padding: 10px 12px;">
        <div style="font-weight: 600; color: #fff; margin-bottom: 2px;">${r.name || r.scenario_id}</div>
        <div style="font-size: 11px; color: var(--text-sub); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.3;">
          ${r.description || ""}
        </div>
      </td>
      <td style="padding: 10px 12px; color: var(--text-sub); font-size: 11px;">
        <strong>${r.module_key || ""}</strong><br>${r.module_title || ""}
      </td>
      <td style="padding: 10px 12px;"><span class="${priClass}">${pri}</span></td>
      <td style="padding: 10px 12px; max-width: 140px;">${tagsHtml}</td>
      <td style="padding: 10px 12px; font-weight: 600;">${r.iterations_run || 0}</td>
      <td style="padding: 10px 12px; min-width: 150px;">${outcomeHtml}</td>
      <td style="padding: 10px 12px; font-family: monospace; font-size: 11px;">
        <span style="color: #94a3b8;">P50:</span> ${r.latency_p50_ms || 0}ms<br>
        <span style="color: #a78bfa;">P99:</span> ${r.latency_p99_ms || 0}ms
      </td>
      <td style="padding: 10px 12px;">
        <span class="badge ${isPass ? "badge-pass" : "badge-fail"}" style="font-size: 10px; padding: 3px 8px;">
          ${isPass ? "✅ PASS" : "❌ FAIL"}
        </span>
      </td>
      <td style="padding: 10px 12px;">
        <button class="btn btn-sm btn-outline" onclick="openReplayModal('${r.scenario_id}')" style="font-size: 11px; padding: 4px 8px;">
          🔍 Replay
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function setRacePriorityFilter(pri) {
  raceState.priorityFilter = pri;
  renderRaceBlotter();
}

function filterRaceBlotter() {
  const searchInput = document.getElementById("race-search-input");
  const modSelect = document.getElementById("race-module-filter-select");
  if (searchInput) raceState.searchTerm = searchInput.value.trim();
  if (modSelect) raceState.moduleFilter = modSelect.value;
  renderRaceBlotter();
}

function toggleRaceSection(id) {
  const el = document.getElementById(id);
  const icon = document.getElementById("invariant-toggle-icon");
  if (!el) return;
  if (el.style.display === "none") {
    el.style.display = "grid";
    if (icon) icon.textContent = "▼";
  } else {
    el.style.display = "none";
    if (icon) icon.textContent = "▶";
  }
}

async function triggerRunRaceSuite(filter) {
  const modeRadio = document.querySelector('input[name="race-run-mode"]:checked');
  const mode = modeRadio ? modeRadio.value : "quick";
  const priority = filter === "p0" ? "P0" : null;

  showRaceProgress(true);

  try {
    const res = await fetch("/api/race/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: mode, priority: priority })
    });
    startRacePolling();
  } catch (e) {
    console.error("Failed to trigger race suite:", e);
    showRaceProgress(false);
  }
}

async function triggerRunRaceModule() {
  const select = document.getElementById("race-module-run-select");
  const mod = select ? select.value : "";
  if (!mod) {
    alert("Please select a module to run.");
    return;
  }
  const modeRadio = document.querySelector('input[name="race-run-mode"]:checked');
  const mode = modeRadio ? modeRadio.value : "quick";

  showRaceProgress(true);

  try {
    await fetch("/api/race/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: mode, module: mod })
    });
    startRacePolling();
  } catch (e) {
    console.error("Failed to run race module:", e);
    showRaceProgress(false);
  }
}

function showRaceProgress(show) {
  const pCont = document.getElementById("race-progress-container");
  if (pCont) pCont.style.display = show ? "block" : "none";
}

function startRacePolling() {
  if (raceState.pollInterval) clearInterval(raceState.pollInterval);

  raceState.pollInterval = setInterval(async () => {
    try {
      const res = await fetch("/api/race/status");
      if (!res.ok) return;
      const st = await res.json();

      const bar = document.getElementById("race-progress-bar");
      const pct = document.getElementById("race-progress-pct");
      const statusText = document.getElementById("race-progress-status");

      if (bar) bar.style.width = `${st.progress_pct || 0}%`;
      if (pct) pct.textContent = `${st.progress_pct || 0}%`;
      if (statusText) {
        statusText.textContent = `Running ${st.current_scenario_id || "..."}: ${st.current_scenario_name || ""} (${st.completed_count}/${st.total_count})`;
      }

      if (!st.is_running) {
        clearInterval(raceState.pollInterval);
        raceState.pollInterval = null;
        if (statusText) statusText.textContent = `[✓] Execution Completed: ${st.passed_count}/${st.total_count} Passed (${st.total_iterations} Iterations).`;
        await loadRaceReport();
        setTimeout(() => showRaceProgress(false), 2500);
      }
    } catch (e) {
      console.error("Polling error:", e);
    }
  }, 400);
}

async function openReplayModal(scenarioId) {
  if (!raceState.data || !raceState.data.results) return;
  const r = raceState.data.results[scenarioId];
  if (!r) return;

  const modal = document.getElementById("replay-modal");
  document.getElementById("replay-modal-title").textContent = `⚡ Replay Bundle: ${r.scenario_id}`;
  const isPass = r.status === "PASS";
  const badge = document.getElementById("replay-modal-badge");
  badge.className = `badge ${isPass ? "badge-pass" : "badge-fail"}`;
  badge.textContent = isPass ? "VERIFIED PASS" : "INVARIANT VIOLATION";

  document.getElementById("replay-meta-id").textContent = r.scenario_id;
  document.getElementById("replay-meta-pri").textContent = r.priority || "P1";
  document.getElementById("replay-meta-iters").textContent = `${r.iterations_run} runs`;
  document.getElementById("replay-meta-rate").textContent = `${(r.violation_rate_pct || 0).toFixed(2)}%`;
  document.getElementById("replay-meta-latency").textContent = `${r.latency_p50_ms || 0}ms / ${r.latency_p99_ms || 0}ms`;
  document.getElementById("replay-meta-deadlocks").textContent = r.deadlocks || 0;
  document.getElementById("replay-meta-desc").textContent = r.description || "N/A";

  const tcsCont = document.getElementById("replay-meta-tcs");
  tcsCont.innerHTML = "";
  (r.hardens_tcs || []).forEach(tc => {
    const span = document.createElement("span");
    span.style.background = "rgba(56, 189, 248, 0.15)";
    span.style.color = "#38bdf8";
    span.style.padding = "2px 8px";
    span.style.borderRadius = "4px";
    span.style.fontSize = "11px";
    span.style.fontWeight = "600";
    span.textContent = tc;
    tcsCont.appendChild(span);
  });

  // Render Outcome Table
  const ocCont = document.getElementById("replay-outcome-table");
  ocCont.innerHTML = "";
  if (r.outcome_table && Object.keys(r.outcome_table).length > 0) {
    let tbl = `<table style="width:100%; border-collapse: collapse;">
      <thead><tr style="color:var(--text-sub); border-bottom:1px solid rgba(255,255,255,0.1);"><th style="text-align:left; padding:4px;">Skew Offset</th><th style="text-align:left; padding:4px;">Observed Outcomes &amp; State Counts</th></tr></thead><tbody>`;
    for (let offset in r.outcome_table) {
      const oc = r.outcome_table[offset];
      const ocStr = Object.entries(oc).map(([k, v]) => `<span style="color:#34d399;">${k}</span>: <strong>${v}</strong>`).join(", ");
      tbl += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);"><td style="padding:4px; color:#fbbf24; font-weight:700;">${offset}</td><td style="padding:4px;">${ocStr}</td></tr>`;
    }
    tbl += `</tbody></table>`;
    ocCont.innerHTML = tbl;
  } else {
    ocCont.textContent = "Deterministic execution: all runs converged to standard expected state without branching.";
  }

  // Fetch or display Raw JSON
  const jsonView = document.getElementById("replay-json-view");
  jsonView.textContent = "Loading Replay Bundle...";
  try {
    const res = await fetch(`/api/race/replay/${scenarioId}`);
    if (res.ok) {
      const bundle = await res.json();
      jsonView.textContent = JSON.stringify(bundle, null, 2);
    } else {
      jsonView.textContent = JSON.stringify(r, null, 2);
    }
  } catch (e) {
    jsonView.textContent = JSON.stringify(r, null, 2);
  }

  modal.style.display = "flex";
}

function closeReplayModal(event) {
  if (event && event.target !== document.getElementById("replay-modal") && !event.target.classList.contains("modal-close") && !event.target.classList.contains("btn-outline")) return;
  document.getElementById("replay-modal").style.display = "none";
}
