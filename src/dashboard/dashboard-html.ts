/**
 * AI_DESK — Dashboard HTML
 *
 * Returns a self-contained single-page dashboard HTML string.
 * No external CDN dependencies — everything is inline.
 *
 * Tabs:
 *   📊 Status      — live system snapshot (agents, budget, MCP, event log)
 *   💬 Chat        — WebSocket chat with agents (auto-fills token from URL hash)
 *   🔑 Credentials — store/manage Anthropic & Google API keys
 */

export function getDashboardHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI_DESK Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Bebas+Neue&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --sidebar-w: 240px;
  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  --font-main: 'Outfit', sans-serif;
  --font-tactical: 'Bebas Neue', 'Impact', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --shadow: 0 4px 20px rgba(0,0,0,0.1);
}

/* Theme Dark (Default) */
.theme-dark {
  --bg: #0c0c0c;
  --bg-sidebar: #0c0c0c;
  --bg-card: #121212;
  --bg-input: #151515;
  --border: rgba(200, 144, 72, 0.2);
  --text: #f4efe5;
  --muted: #666;
  --accent: #c89048;
  --accent-soft: rgba(200, 144, 72, 0.1);
  --glass: rgba(12, 12, 12, 0.95);
  --green: #4ade80;
  --red: #f87171;
  --yellow: #facc15;
  --purple: #c084fc;
}

/* Theme Light */
.theme-light {
  --bg: #f3f4f6;
  --bg-sidebar: #ffffff;
  --bg-card: #ffffff;
  --bg-input: #f9fafb;
  --border: rgba(0, 0, 0, 0.08);
  --text: #1f2937;
  --muted: #6b7280;
  --accent: #2563eb;
  --accent-soft: rgba(37, 99, 235, 0.1);
  --glass: rgba(255, 255, 255, 0.85);
  --green: #059669;
  --red: #dc2626;
  --yellow: #d97706;
  --purple: #9333ea;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; width: 100%; overflow: hidden; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-main);
  font-size: 14px;
  line-height: 1.5;
  display: flex;
  transition: background 0.3s ease;
}


/* ── Sidebar ───────────────────────────────────────────── */
aside {
  width: var(--sidebar-w); background: var(--bg-sidebar); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; height: 100%; transition: var(--transition);
  box-shadow: 5px 0 20px rgba(0,0,0,0.5);
}
.sidebar-hdr { padding: 40px 24px; text-align: center; }
.sidebar-logo { 
  display: inline-flex; flex-direction: column; align-items: center; gap: 16px;
  font-family: var(--font-tactical);
}
.logo-box {
  width: 64px; height: 64px; background: var(--accent); color: #0c0c0c;
  display: flex; align-items: center; justify-content: center;
  font-size: 48px; font-weight: 700; border-radius: 2px;
}
.logo-text { font-size: 24px; letter-spacing: 6px; color: var(--text); }
.logo-ver { font-family: var(--font-mono); font-size: 9px; color: var(--accent); opacity: 0.6; letter-spacing: 2px; margin-top: -8px; }
.nav-group { flex: 1; padding: 0 12px; }
.nav-tab {
  width: 100%; background: none; border: none; color: var(--muted); padding: 12px 16px;
  border-radius: 4px; cursor: pointer; text-align: left; display: flex; align-items: center;
  gap: 12px; font-weight: 500; transition: var(--transition); margin-bottom: 4px;
  text-transform: uppercase; font-size: 11px; letter-spacing: 0.1em;
}
.nav-tab:hover { background: var(--bg-input); color: var(--text); }
.nav-tab.active { background: var(--accent-soft); color: var(--accent); border-left: 3px solid var(--accent); padding-left: 13px; }
.nav-tab .icon { font-size: 16px; opacity: 0.8; }
.sidebar-ftr { padding: 24px; border-top: 1px solid var(--border); }
.theme-toggle {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; border-radius: 4px; background: var(--bg-input);
  font-size: 10px; font-weight: 700; cursor: pointer; margin-bottom: 12px;
  color: var(--muted); transition: var(--transition); border: 1px solid transparent;
}
.theme-toggle:hover { border-color: var(--border); color: var(--text); }
.logout-btn {
  font-size: 11px; font-weight: 700; color: var(--red); cursor: pointer;
  text-align: center; opacity: 0.7; transition: var(--transition);
  text-transform: uppercase; letter-spacing: 0.1em;
}
.logout-btn:hover { opacity: 1; }

/* ── Main Layout ────────────────────────────────────────── */
main { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }
.main-hdr {
  padding: 24px 32px; background: var(--glass); backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;
  z-index: 10;
}
#view-title { font-family: var(--font-tactical); font-size: 24px; letter-spacing: 4px; text-transform: uppercase; margin: 0; }
.sys-stats { display: flex; align-items: center; gap: 20px; }
.stat-item { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; }
.stat-item span { color: var(--text); font-weight: 600; font-family: var(--font-mono); margin-left: 4px; }

.content-area {
  flex: 1; padding: 40px; overflow-y: auto; display: none;
  animation: fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.content-area.active { display: block; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

/* ── Cards & UI Components ──────────────────────────────── */
.card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px;
  padding: 24px; margin-bottom: 24px; position: relative; overflow: hidden;
  box-shadow: 0 4px 30px rgba(0,0,0,0.2);
}
.card::before {
  content: ''; position: absolute; top: 0; left: 0; width: 3px; height: 100%;
  background: var(--accent); opacity: 0.3;
}
.card h3 {
  font-family: var(--font-tactical); font-size: 18px; letter-spacing: 2px;
  margin-bottom: 20px; color: var(--accent);
  text-transform: uppercase; display: flex; align-items: center; gap: 10px;
}
.card h3::after {
  content: ''; flex: 1; height: 1px; background: var(--border); margin-left: 10px;
}
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }

td { padding: 12px; border-bottom: 1px solid var(--border); font-size: 13px; }
tr:hover td { background: var(--accent-soft); }

/* Badges */
.badge { padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.badge.green { background: rgba(16, 185, 129, 0.1); color: var(--green); }
.badge.red { background: rgba(239, 68, 68, 0.1); color: var(--red); }
.badge.yellow { background: rgba(245, 158, 11, 0.1); color: var(--yellow); }
.badge.blue { background: rgba(59, 130, 246, 0.1); color: var(--accent); }
.badge.muted { background: var(--bg-input); color: var(--muted); }

/* Custom Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--muted); }

/* ── Chat Specific ──────────────────────────────────────── */
#tab-chat { padding: 0; height: 100%; display: none; flex-direction: column; }
#tab-chat.active { display: flex; }
#chat-messages { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.msg-bubble { border-radius: 16px !important; padding: 12px 18px !important; font-size: 14px !important; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
#chat-input-row { padding: 20px 24px; background: var(--bg-card); border-top: 1px solid var(--border); }
#chat-input { border-radius: 12px !important; padding: 12px 16px !important; }

/* Modals */
.modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); z-index: 100; display: none; align-items: center; justify-content: center; }
.modal-bg.open { display: flex; }
.modal { background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; padding: 32px; width: 100%; max-width: 560px; box-shadow: var(--shadow); }

.btn { padding: 8px 16px; border-radius: 4px; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; transition: var(--transition); border: 1px solid var(--border); background: var(--bg-input); color: var(--text); }
.btn:hover { background: var(--border); transform: translateY(-1px); }
.btn.primary { background: var(--accent); color: #0a0a0a; border: none; font-weight: 700; }
.btn.primary:hover { opacity: 0.9; transform: translateY(-1px); }
.btn.danger { border-color: var(--red); color: var(--red); }

/* Agents Grid */
#agents-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; }
.agent-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; transition: var(--transition); position: relative; overflow: hidden; display: flex; flex-direction: column; }
.agent-card:hover { transform: translateY(-4px); box-shadow: 0 10px 30px rgba(0,0,0,0.3); border-color: var(--accent); }
.agent-card-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.agent-avatar { width: 56px; height: 56px; border-radius: 50%; border: 2px solid var(--accent); object-fit: cover; background: var(--bg-input); flex-shrink: 0; }
.agent-avatar-placeholder { width: 56px; height: 56px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; flex-shrink: 0; font-family: var(--font-tactical); }
.agent-card-info { flex: 1; min-width: 0; }
.agent-card-id { font-size: 16px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-card-name { font-size: 12px; color: var(--muted); margin-top: -2px; }
.agent-card-def { font-size: 10px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; margin-top: 4px; }
.agent-card-personality { font-size: 11px; color: var(--muted); font-style: italic; margin-bottom: 16px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4; }
.agent-card-row { font-size: 12px; color: var(--muted); margin-bottom: 8px; display: flex; justify-content: space-between; }
.agent-card-row span { color: var(--text); font-family: var(--font-mono); }
.agent-card-actions { margin-top: auto; display: flex; gap: 8px; border-top: 1px solid var(--border); padding-top: 16px; }
</style>

</head>
<body class="theme-dark">

<aside>
  <div class="sidebar-hdr">
    <div class="sidebar-logo">
      <div class="logo-box">A</div>
      <div class="logo-text">AI_DESK</div>
      <div class="logo-ver">CONSOLE · v0.4</div>
    </div>
  </div>
  <div class="nav-group">
    <button class="nav-tab active" id="ntab-status" onclick="switchTab('status')"><span class="icon">📊</span> Status</button>
    <button class="nav-tab" id="ntab-agents" onclick="switchTab('agents')"><span class="icon">⚙️</span> Agents</button>
    <button class="nav-tab" id="ntab-teams" onclick="switchTab('teams')"><span class="icon">👥</span> Teams</button>
    <button class="nav-tab" id="ntab-skills" onclick="switchTab('skills')"><span class="icon">🎯</span> Skills</button>
    <button class="nav-tab" id="ntab-mcp" onclick="switchTab('mcp')"><span class="icon">🔌</span> MCP</button>
    <button class="nav-tab" id="ntab-messaging" onclick="switchTab('messaging')"><span class="icon">🤖</span> Messaging</button>
    <button class="nav-tab" id="ntab-chat" onclick="switchTab('chat')"><span class="icon">💬</span> Chat</button>
    <button class="nav-tab" id="ntab-creds" onclick="switchTab('creds')"><span class="icon">🔑</span> Credentials</button>
  </div>
  <div class="sidebar-ftr">
    <div class="theme-toggle" onclick="toggleTheme()">
      <span>THEME</span>
      <span id="theme-label">DARK</span>
    </div>
    <div class="logout-btn" onclick="logout()">Logout</div>
  </div>
</aside>

<main>
  <div class="main-hdr">
    <div style="display:flex; flex-direction:column">
      <h2 id="view-title" style="margin-bottom: 4px; font-family: var(--font-tactical); letter-spacing: 0.1em">SYSTEM STATUS</h2>
      <div style="height: 2px; width: 80px; background: var(--accent); opacity: 0.6; margin-bottom: 2px"></div>
      <div style="height: 2px; width: 40px; background: var(--accent); opacity: 0.3"></div>
    </div>
    <div class="sys-stats">
      <div class="stat-item">UPTIME <span id="uptime">—</span></div>
      <div class="stat-item">CONNECTIONS <span id="conn-cnt">—</span></div>
      <div class="stat-item">PROVIDERS <span id="providers">—</span></div>
      <div id="conn-status" style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em">CONNECTING…</div>
      <div class="status-dot" id="dot" style="width:8px;height:8px;border-radius:2px;background:var(--green);margin-left:8px;box-shadow:0 0 10px var(--green)"></div>
    </div>
  </div>

  <!-- Status -->
  <div class="content-area active" id="tab-status">
    <div class="grid-2">
      <div class="card">
        <h3>⚡ Agents</h3>
        <table id="agents-tbl">
          <thead><tr><th>ID</th><th>Model</th><th>Sessions</th><th>Status</th></tr></thead>
          <tbody><tr><td colspan="4" class="empty">loading…</td></tr></tbody>
        </table>
      </div>
      <div class="card">
        <h3>👥 Teams</h3>
        <table id="teams-tbl">
          <thead><tr><th>Team</th><th>Lead</th><th>Members</th></tr></thead>
          <tbody><tr><td colspan="3" class="empty">loading…</td></tr></tbody>
        </table>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3>💰 Budget</h3>
        <div id="budget-wrap"><div class="empty">loading…</div></div>
      </div>
      <div class="card">
        <h3>🎯 Skills</h3>
        <table id="skills-tbl-stat">
          <thead><tr><th>Name</th><th>Version</th><th>Status</th></tr></thead>
          <tbody><tr><td colspan="3" class="empty">loading…</td></tr></tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <h3>🔌 MCP Servers</h3>
      <table id="mcp-tbl-stat">
        <thead><tr><th>Server</th><th>Tools</th><th>Status</th></tr></thead>
        <tbody><tr><td colspan="3" class="empty">loading…</td></tr></tbody>
      </table>
    </div>
    <div class="card">
      <h3>💬 Messaging</h3>
      <table id="msg-tbl-stat">
        <thead><tr><th>Platform</th><th>Status</th></tr></thead>
        <tbody><tr><td colspan="2" class="empty">loading…</td></tr></tbody>
      </table>
    </div>
    <div class="card">
      <h3>📋 Live Event Log <span id="ev-count" style="margin-left:8px;opacity:0.6"></span></h3>
      <div id="event-log" style="height:300px;overflow-y:auto;font-family:var(--font-mono);font-size:11px"></div>
    </div>
  </div>


  <!-- Agents -->
  <div class="content-area" id="tab-agents">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px">
      <h3 style="margin:0">⚙️ AGENT MANAGEMENT</h3>
      <div style="display:flex; gap:12px">
        <button class="btn" onclick="openDefaultsModal()">Global Defaults</button>
        <button class="btn primary" onclick="openAgentModal(null)">+ Add Agent</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:32px">
      <h3>Global Defaults <span style="font-size:10px; color:var(--muted); margin-left:8px; text-transform:none">(fallback values)</span></h3>
      <div class="grid-2">
        <div style="display:flex; flex-direction:column; gap:8px">
          <div class="stat-item">Model <span id="def-model">—</span></div>
          <div class="stat-item">Tools <span id="def-tools">—</span></div>
          <div class="stat-item">Sandbox <span id="def-sandbox">—</span></div>
          <div class="stat-item">Timeout <span id="def-timeout">—</span></div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px">
          <div class="stat-item">Daily Tokens <span id="def-daily">—</span></div>
          <div class="stat-item">Monthly Tokens <span id="def-monthly">—</span></div>
          <div class="stat-item">Monthly Cost <span id="def-cost">—</span></div>
        </div>
      </div>
    </div>

    <div id="agents-grid"></div>
  </div>

  <!-- Chat -->

  <div class="content-area" id="tab-chat">
    <div id="chat-toolbar" style="padding:16px;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center">
      <label style="font-size:12px;color:var(--muted)">Agent</label>
      <select id="chat-agent" style="background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:6px;border-radius:8px"><option value="">default</option></select>
      <input type="password" id="chat-token" class="login-input" style="width:180px;margin-bottom:0;padding:6px 12px" placeholder="Auth Token…">
      <button id="chat-connect-btn" class="btn primary" onclick="chatToggleConnect()">Connect WebSocket</button>
      <span id="ws-badge" class="badge">disconnected</span>
    </div>
    <div id="chat-messages"></div>
    <div id="chat-input-row">
      <div style="display:flex;gap:12px">
        <textarea id="chat-input" rows="1" placeholder="Type a message…" disabled style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text);outline:none;resize:none"></textarea>
        <button id="chat-send-btn" class="btn primary" onclick="chatSend()" disabled>Send</button>
      </div>
    </div>
  </div>

  <div class="content-area" id="tab-teams">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px">
      <h3 style="margin:0">👥 TEAMS & ROLES</h3>
      <div style="display:flex; gap:12px">
        <button class="btn" onclick="openRoleModal(null)">+ New Role</button>
        <button class="btn primary" onclick="openTeamModal(null)">+ New Team</button>
      </div>
    </div>
    <div class="card">
      <h3>Roles</h3>
      <div id="roles-grid" class="grid-2"></div>
    </div>
    <div class="card">
      <h3>Teams</h3>
      <div id="teams-grid" style="display:flex;flex-direction:column;gap:16px"></div>
    </div>
  </div>

  <!-- Skills -->
  <div class="content-area" id="tab-skills">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px">
      <h3 style="margin:0">🎯 SKILL MANAGEMENT</h3>
      <div style="display:flex; gap:12px">
        <button class="btn" onclick="refreshSkills()">Refresh Skills</button>
      </div>
    </div>
    <div class="card">
      <h3>Installed Skills</h3>
      <table id="skills-tbl" style="width:100%">
        <thead><tr><th>Name</th><th>Version</th><th>Description</th><th>Status</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <!-- MCP -->
  <div class="content-area" id="tab-mcp">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px">
      <h3 style="margin:0">🔌 MCP SERVERS</h3>
    </div>
    <div class="card">
      <h3>Connected Servers</h3>
      <table id="mcp-tbl" style="width:100%">
        <thead><tr><th>Name</th><th>Tools</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <!-- Messaging -->
  <div class="content-area" id="tab-messaging">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px">
      <h3 style="margin:0">🤖 MESSAGING ADAPTERS</h3>
    </div>
    <div class="card">
      <h3>Platform Status</h3>
      <table id="msg-tbl" style="width:100%">
        <thead><tr><th>Platform</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <div class="content-area" id="tab-creds">
    <div class="grid-2">
      <!-- Anthropic -->
      <div class="card">
        <h3>Anthropic</h3>
        <div style="font-size:12px;margin-bottom:12px">Status: <span id="ant-status">...</span></div>
        <div style="display:flex;gap:8px;margin-bottom:16px">
          <button class="btn active" id="tab-ant-apikey" onclick="switchAnthropicTab('apikey')">API Key</button>
          <button class="btn" id="tab-ant-cc" onclick="switchAnthropicTab('cc')">Claude Code</button>
        </div>
        <div id="ant-apikey-pane">
          <input type="password" id="ant-key" class="login-input" placeholder="sk-ant-...">
          <button class="btn primary" onclick="saveAnthropicKey()">Save Key</button>
        </div>
        <div id="ant-cc-pane" style="display:none">
          <div style="font-size:12px;margin-bottom:8px">Status: <span id="cc-detect-status">checking...</span></div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:12px;word-break:break-all" id="cc-path"></div>
          <button class="btn primary" id="cc-import-btn" onclick="importClaudeCode()">Import Auth</button>
        </div>
        <div id="ant-msg" style="margin-top:12px;font-size:12px;min-height:16px"></div>
        <button class="btn danger" style="margin-top:12px" onclick="clearCred('anthropic', 'ant-status', 'ant-msg')">Clear</button>
      </div>

      <!-- Google -->
      <div class="card">
        <h3>Google</h3>
        <div style="font-size:12px;margin-bottom:12px">Status: <span id="goo-status">...</span></div>
        <div style="display:flex;gap:8px;margin-bottom:16px">
          <button class="btn active" id="tab-apikey" onclick="switchGoogleTab('apikey')">API Key</button>
          <button class="btn" id="tab-oauth" onclick="switchGoogleTab('oauth')">OAuth</button>
        </div>
        <div id="google-apikey-pane">
          <input type="password" id="goo-key" class="login-input" placeholder="AIzaSy...">
          <button class="btn primary" onclick="saveGoogleKey()">Save Key</button>
        </div>
        <div id="google-oauth-pane" style="display:none">
          <button class="btn primary" id="oauth-start-btn" onclick="startGoogleOAuth()">Sign in with Google</button>
          <div id="device-box" style="display:none;margin-top:16px;padding:12px;background:var(--bg-input);border-radius:8px">
            <div>Visit <a id="device-url" href="#" target="_blank" style="color:var(--accent)"></a></div>
            <div style="margin:8px 0">Code: <strong id="device-code" style="font-size:18px;letter-spacing:2px"></strong></div>
            <div id="device-timer" style="font-size:11px;color:var(--muted)"></div>
          </div>
        </div>
        <div id="goo-msg" style="margin-top:12px;font-size:12px;min-height:16px"></div>
        <button class="btn danger" style="margin-top:12px" onclick="clearCred('google', 'goo-status', 'goo-msg')">Clear</button>
      </div>

      <!-- OpenRouter -->
      <div class="card">
        <h3>OpenRouter</h3>
        <div style="font-size:12px;margin-bottom:12px">Status: <span id="or-status">...</span></div>
        <input type="password" id="or-key" class="login-input" placeholder="sk-or-v1-...">
        <button class="btn primary" onclick="saveOpenRouterKey()">Save Key</button>
        <div id="or-msg" style="margin-top:12px;font-size:12px;min-height:16px"></div>
        <button class="btn danger" style="margin-top:12px" onclick="clearCred('openrouter', 'or-status', 'or-msg')">Clear</button>
      </div>

      <!-- Telegram -->
      <div class="card">
        <h3>Telegram Bot</h3>
        <div style="font-size:12px;margin-bottom:12px">Status: <span id="tg-status">...</span></div>
        <input type="password" id="tg-token" class="login-input" placeholder="123456:ABC-DEF...">
        <div style="display:flex;gap:8px">
          <button class="btn primary" id="tg-connect-btn" onclick="connectTelegram()">Connect</button>
          <button class="btn danger" onclick="disconnectTelegram()">Disconnect</button>
        </div>
        <div id="tg-msg" style="margin-top:12px;font-size:12px;min-height:16px"></div>
      </div>
    </div>
  </div>
</main>

  <!-- ── Role modal ──────────────────────────────────────── -->
  <div class="modal-bg" id="role-modal-bg" onclick="if(event.target===this)closeRoleModal()">
    <div class="modal" style="max-width:540px">
      <h2 id="role-modal-title">New Role</h2>

      <div class="form-row">
        <div class="form-field">
          <label>Role ID <span style="color:var(--muted)">(a-z, 0-9, -, _)</span></label>
          <input id="rl-id" placeholder="dev-lead" autocomplete="off" spellcheck="false">
        </div>
        <div class="form-field">
          <label>Display name</label>
          <input id="rl-name" placeholder="Dev Lead" autocomplete="off">
        </div>
      </div>

      <div class="form-field">
        <label>Description</label>
        <input id="rl-desc" placeholder="Short description of this role's purpose" autocomplete="off">
      </div>

      <div class="form-field">
        <label>Responsibilities <span style="color:var(--muted)">(one per line)</span></label>
        <textarea id="rl-resp" rows="4" style="resize:vertical" placeholder="Design system architecture&#10;Review pull requests&#10;Mentor junior agents"></textarea>
      </div>

      <div class="form-field">
        <label>Can delegate to <span style="color:var(--muted)">(role IDs, comma-separated)</span></label>
        <input id="rl-delegate" placeholder="reviewer, qa-engineer" autocomplete="off">
      </div>

      <div class="form-section">
        <div class="form-section-title">System Prompt Prefix <span style="color:var(--muted);text-transform:none;font-size:10px">(optional — prepended to agent's system prompt when filling this role)</span></div>
        <textarea id="rl-sysprompt" rows="3" style="width:100%;resize:vertical" placeholder="You are acting as the Dev Lead. Your primary responsibility is…"></textarea>
      </div>

      <div class="modal-footer">
        <button class="btn" onclick="closeRoleModal()">Cancel</button>
        <button class="btn primary" onclick="saveRole()">Save Role</button>
      </div>
      <div id="rl-msg" style="margin-top:8px;font-size:11px;min-height:16px"></div>
    </div>
  </div>

  <!-- ── Team modal ─────────────────────────────────────── -->
  <div class="modal-bg" id="team-modal-bg" onclick="if(event.target===this)closeTeamModal()">
    <div class="modal" style="max-width:580px">
      <h2 id="team-modal-title">New Team</h2>

      <div class="form-row">
        <div class="form-field">
          <label>Team ID <span style="color:var(--muted)">(a-z, 0-9, -, _)</span></label>
          <input id="tm-id" placeholder="dev-team" autocomplete="off" spellcheck="false">
        </div>
        <div class="form-field">
          <label>Team name</label>
          <input id="tm-name" placeholder="Dev Team" autocomplete="off">
        </div>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label>Lead agent</label>
          <select id="tm-lead"></select>
        </div>
      </div>

      <div class="form-field">
        <label>Shared goal <span style="color:var(--muted)">(optional)</span></label>
        <input id="tm-goal" placeholder="Build and maintain the core product feature" autocomplete="off">
      </div>

      <div class="form-section">
        <div class="form-section-title">Members <span style="color:var(--muted);text-transform:none;font-size:10px">(Role → Agent assignment)</span></div>
        <table class="member-table" id="tm-members-table">
          <thead><tr><th>Role (ตำแหน่ง)</th><th>Agent (คนทำ)</th><th></th></tr></thead>
          <tbody id="tm-members-body"></tbody>
        </table>
        <button class="btn" style="font-size:11px" onclick="addMemberRow()">+ Add member</button>
      </div>

      <div class="modal-footer">
        <button class="btn" onclick="closeTeamModal()">Cancel</button>
        <button class="btn primary" onclick="saveTeam()">Save Team</button>
      </div>
      <div id="tm-msg" style="margin-top:8px;font-size:11px;min-height:16px"></div>
    </div>
  </div>

  <!-- ── Run team modal ─────────────────────────────────── -->
  <div class="modal-bg" id="run-modal-bg" onclick="if(event.target===this)closeRunModal()">
    <div class="modal" style="max-width:480px">
      <h2 id="run-modal-title">Run Team</h2>
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px">
        The team will orchestrate across all members to achieve the goal.
      </div>
      <div class="form-field">
        <label>Goal / Task</label>
        <textarea id="run-goal" rows="4" style="resize:vertical" placeholder="Describe what this team should accomplish…"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeRunModal()">Cancel</button>
        <button class="btn primary" id="run-submit-btn" onclick="submitRunTeam()">🚀 Run</button>
      </div>
      <div id="run-msg" style="margin-top:8px;font-size:11px;min-height:16px;white-space:pre-wrap"></div>
    </div>
  </div>

  <!-- ── Edit Defaults modal ────────────────────────────── -->
  <div class="modal-bg" id="defaults-modal-bg" onclick="if(event.target===this)closeDefaultsModal()">
    <div class="modal">
      <h2>Edit Global Defaults</h2>
      <div class="form-field">
        <label>Primary model</label>
        <input id="dft-model" list="model-list" placeholder="anthropic/claude-sonnet-4-5">
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>Tools profile</label>
          <select id="dft-tools">
            <option value="full">full (all tools)</option>
            <option value="messaging">messaging only</option>
            <option value="readonly">readonly</option>
            <option value="deny-all">deny-all (no tools)</option>
          </select>
        </div>
        <div class="form-field">
          <label>Sandbox mode</label>
          <select id="dft-sandbox">
            <option value="all">all (sandbox everything)</option>
            <option value="untrusted">untrusted (sandbox untrusted only)</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>Timeout (seconds)</label>
          <input id="dft-timeout" type="number" min="10" max="300" placeholder="60">
        </div>
        <div class="form-field">
          <label>Max steps per run</label>
          <input id="dft-steps" type="number" min="1" max="50" placeholder="10">
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">Budget</div>
        <div class="form-row">
          <div class="form-field">
            <label>Daily token limit</label>
            <input id="dft-daily" type="number" min="0" placeholder="100000">
          </div>
          <div class="form-field">
            <label>Monthly token limit</label>
            <input id="dft-monthly" type="number" min="0" placeholder="3000000">
          </div>
        </div>
        <div class="form-field" style="max-width:200px">
          <label>Monthly cost limit ($)</label>
          <input id="dft-cost" type="number" min="0" step="0.01" placeholder="50">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeDefaultsModal()">Cancel</button>
        <button class="btn primary" onclick="saveDefaults()">Save Defaults</button>
      </div>
      <div id="dft-msg" style="margin-top:8px;font-size:11px;min-height:16px"></div>
    </div>
  </div>

  <!-- ── Add / Edit Agent modal ─────────────────────────── -->
  <div class="modal-bg" id="agent-modal-bg" onclick="if(event.target===this)closeAgentModal()">
    <div class="modal">
      <h2 id="agent-modal-title">Add Agent</h2>
      <div class="form-row">
        <div class="form-field">
          <label>Agent ID <span style="color:var(--muted)">(alphanumeric, -, _)</span></label>
          <input id="ag-id" placeholder="my-agent" autocomplete="off" spellcheck="false">
        </div>
        <div class="form-field">
          <label>Display Name</label>
          <input id="ag-name" placeholder="Agent 007" autocomplete="off">
        </div>
      </div>
      <div class="form-field">
        <label>Avatar URL</label>
        <input id="ag-avatar" placeholder="https://..." autocomplete="off">
      </div>
      <div class="form-field">
        <label>Personality Prompt</label>
        <textarea id="ag-personality" rows="2" placeholder="e.g. A helpful assistant with a witty personality..." style="width:100%; background:var(--bg-input); border:1px solid var(--border); color:var(--text); padding:8px; border-radius:4px; outline:none; resize:vertical"></textarea>
      </div>
      <div class="form-field">
        <label>Workspace path</label>
        <input id="ag-workspace" placeholder="." autocomplete="off">
      </div>

      <div class="form-section">
        <div class="form-section-title">Model</div>
        <div class="form-field">
          <label>Primary model</label>
          <input id="ag-model" list="model-list" placeholder="(use global default)">
        </div>
        <div class="form-field">
          <label>Failover models</label>
          <div class="failover-list" id="ag-failover-list"></div>
          <button class="btn" style="font-size:11px" onclick="addFailoverRow()">+ Add failover</button>
        </div>
        <div class="form-field">
          <label>Compaction model <span style="color:var(--muted)">(optional)</span></label>
          <input id="ag-compaction" list="model-list" placeholder="(same as primary)">
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Tools &amp; Sandbox</div>
        <div class="form-row">
          <div class="form-field">
            <label>Tools profile</label>
            <select id="ag-tools">
              <option value="">(use global default)</option>
              <option value="full">full (all tools)</option>
              <option value="messaging">messaging only</option>
              <option value="readonly">readonly</option>
              <option value="deny-all">deny-all (no tools)</option>
            </select>
          </div>
          <div class="form-field">
            <label>Sandbox mode</label>
            <select id="ag-sandbox">
              <option value="">(use global default)</option>
              <option value="all">all (sandbox everything)</option>
              <option value="untrusted">untrusted (sandbox untrusted only)</option>
            </select>
          </div>
        </div>
        <div class="form-row" id="ag-sandbox-opts" style="display:none">
          <div class="form-field">
            <label>Timeout (ms)</label>
            <input id="ag-sandbox-timeout" type="number" min="1000" step="1000" placeholder="30000">
          </div>
          <div class="form-field">
            <label>Max memory (MB)</label>
            <input id="ag-sandbox-mem" type="number" min="64" step="64" placeholder="512">
          </div>
        </div>
        <div class="form-check" id="ag-net-row" style="display:none">
          <input id="ag-net" type="checkbox">
          <label for="ag-net">Allow network access in sandbox</label>
        </div>
      </div>

      <div class="form-check" style="margin-top:14px">
        <input id="ag-default" type="checkbox">
        <label for="ag-default">Set as default agent</label>
      </div>

      <div class="modal-footer">
        <button class="btn" onclick="closeAgentModal()">Cancel</button>
        <button class="btn primary" id="ag-save-btn" onclick="saveAgent()">Save Agent</button>
      </div>
      <div id="ag-msg" style="margin-top:8px;font-size:11px;min-height:16px"></div>
    </div>
  </div>

  <!-- model datalist shared by all inputs -->
  <datalist id="model-list">
    <option value="anthropic/claude-opus-4-5">
    <option value="anthropic/claude-sonnet-4-5">
    <option value="anthropic/claude-haiku-4-5">
    <option value="anthropic/claude-3-5-sonnet-20241022">
    <option value="anthropic/claude-3-5-haiku-20241022">
    <option value="openrouter/anthropic/claude-opus-4-5">
    <option value="openrouter/anthropic/claude-sonnet-4-5">
    <option value="openrouter/anthropic/claude-haiku-4-5">
    <option value="openrouter/openai/gpt-4o">
    <option value="openrouter/openai/gpt-4o-mini">
    <option value="openrouter/openai/o3-mini">
    <option value="openrouter/google/gemini-2.0-flash-001">
    <option value="openrouter/google/gemini-2.5-pro-preview-03-25">
    <option value="openrouter/meta-llama/llama-3.3-70b-instruct">
    <option value="openrouter/deepseek/deepseek-r1">
    <option value="openrouter/mistralai/mistral-large-2411">
    <option value="google/gemini-2.0-flash-001">
    <option value="google/gemini-2.5-pro-preview-03-25">
  </datalist>

<script>
const $ = id => document.getElementById(id);
const esc = s => s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '';
const badge = (text, cls) => \`<span class="badge \${cls || ''}">\${text}</span>\`;
const getHashParams = () => {
  const params = {};
  location.hash.substring(1).split('&').forEach(p => {
    const [k, v] = p.split('=');
    if (k) params[k] = decodeURIComponent(v || '');
  });
  return params;
};

// ═══════════════════════════════════════════════════════════════
//  Auth & Theme
// ═══════════════════════════════════════════════════════════════
let authToken = localStorage.getItem('ai_desk_token') || '';

function checkLogin() {
  if (!authToken) {
    window.location.href = '/login';
  } else {
    initApp();
  }
}


function logout() {
  localStorage.removeItem('ai_desk_token');
  window.location.href = '/login';
}

function toggleTheme() {
  const isDark = document.body.classList.contains('theme-dark');
  setTheme(isDark ? 'light' : 'dark');
}

function setTheme(mode) {
  document.body.classList.toggle('theme-dark', mode === 'dark');
  document.body.classList.toggle('theme-light', mode === 'light');
  $('theme-label').textContent = mode.toUpperCase();
  localStorage.setItem('ai_desk_theme', mode);
}

// Global API Wrapper
async function apiFetch(url, opts = {}) {
  const separator = url.includes('?') ? '&' : '?';
  const finalUrl = url + separator + 'token=' + encodeURIComponent(authToken);
  const r = await fetch(finalUrl, opts);
  if (r.status === 401) logout();
  return r;
}

function initApp() {
  connect();
  loadCredStatus();
}

// ═══════════════════════════════════════════════════════════════
//  Tab navigation
// ═══════════════════════════════════════════════════════════════
function switchTab(name) {
  const titles = { 
    status: 'System Status', 
    agents: 'Agent Management', 
    teams: 'Teams & Roles', 
    skills: 'Skill Management',
    mcp: 'MCP Servers',
    messaging: 'Messaging Adapters',
    chat: 'AI Chat', 
    creds: 'Credentials' 
  };
  $('view-title').textContent = titles[name] || name;
  
  ['status','agents','teams','skills','mcp','messaging','chat','creds'].forEach(t => {
    const content = $('tab-' + t);
    if (content) content.classList.toggle('active', t === name);
    
    const ntab = $('ntab-' + t);
    if (ntab) ntab.classList.toggle('active', t === name);
  });
  if (name === 'agents') loadAgents();
  if (name === 'teams')  loadTeams();
}

// ═══════════════════════════════════════════════════════════════
//  SSE — dashboard snapshot (Status tab)
// ═══════════════════════════════════════════════════════════════
const MAX_LOG = 150;
let eventCount = 0;
let reconnectDelay = 1000;
let es;
let snapshotAgents = [];

function connect() {
  if (!authToken) return;
  $('conn-status').textContent = 'connecting…';
  $('dot').classList.add('offline');

  const url = '/dashboard/events?token=' + encodeURIComponent(authToken);
  es = new EventSource(url);

  es.addEventListener('snapshot', e => {
    reconnectDelay = 1000;
    $('dot').classList.remove('offline');
    $('conn-status').textContent = 'live';
    const s = JSON.parse(e.data);
    renderSnapshot(s);
    // Keep agent list for chat selector
    snapshotAgents = s.agents || [];
    populateChatAgents(snapshotAgents);
  });

  es.addEventListener('event', e => {
    appendEvent(JSON.parse(e.data));
  });

  es.onerror = async () => {
    // If it's an auth error, fetch will confirm it (EventSource doesn't show status)
    try {
      const r = await fetch(url);
      if (r.status === 401) {
        logout();
        return;
      }
    } catch { /* network error, continue to retry */ }

    $('conn-status').textContent = 'reconnecting in ' + (reconnectDelay/1000) + 's…';
    $('dot').classList.add('offline');
    es.close();
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      connect();
    }, reconnectDelay);
  };
}

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return d + 'd ' + (h % 24) + 'h';
  if (h > 0) return h + 'h ' + (m % 60) + 'm';
  if (m > 0) return m + 'm ' + (s % 60) + 's';
  return s + 's';
}

function renderSnapshot(s) {
  $('uptime').textContent = fmtUptime(s.uptime || 0);
  $('conn-cnt').textContent = s.connections || 0;
  $('providers').textContent = (s.providers || []).filter(p => p.available).map(p => p.name).join(', ') || 'none';

  // Agents
  const ab = $('agents-tbl').querySelector('tbody');
  if (!s.agents || s.agents.length === 0) {
    ab.innerHTML = '<tr><td colspan="4" class="empty">no agents configured</td></tr>';
  } else {
    ab.innerHTML = s.agents.map(a => {
      const model = (a.model || '').split('/').pop() || a.model;
      return '<tr>'
        + '<td>' + esc(a.id) + '</td>'
        + '<td style="color:var(--muted)">' + esc(model) + '</td>'
        + '<td>' + (a.sessions || 0) + '</td>'
        + '<td>' + badge(a.status || 'idle', a.status === 'running' ? 'green' : 'muted') + '</td>'
        + '</tr>';
    }).join('');
  }

  // Teams
  const tb = $('teams-tbl').querySelector('tbody');
  if (!s.teams || s.teams.length === 0) {
    tb.innerHTML = '<tr><td colspan="3" class="empty">no teams configured</td></tr>';
  } else {
    tb.innerHTML = s.teams.map(t => '<tr>'
      + '<td>' + esc(t.name) + '</td>'
      + '<td style="color:var(--muted)">' + esc(t.leadAgentId) + '</td>'
      + '<td>' + (t.members || []).length + '</td>'
      + '</tr>').join('');
  }

  // Budget
  const bw = $('budget-wrap');
  const b = s.budget;
  if (!b) {
    bw.innerHTML = '<div class="empty">no budget data</div>';
  } else {
    function bar(label, used, limit) {
      if (!limit) return '';
      const pct = Math.min(100, Math.round(used / limit * 100));
      const cls = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : 'ok';
      const fmt = n => n >= 1000 ? (n/1000).toFixed(1)+'k' : n;
      return '<div class="budget-row">'
        + '<div class="budget-label"><span>' + label + '</span>'
        + '<span class="pct">' + fmt(used) + ' / ' + fmt(limit) + ' &nbsp;' + pct + '%</span></div>'
        + '<div class="bar-track"><div class="bar-fill ' + cls + '" style="width:' + pct + '%"></div></div>'
        + '</div>';
    }
    bw.innerHTML =
      bar('Daily tokens',    b.dailyUsed   || 0, b.dailyLimit   || 0) +
      bar('Monthly tokens',  b.monthlyUsed || 0, b.monthlyLimit || 0) +
      bar('Monthly cost $',  b.monthlyCostUsed || 0, b.monthlyCostLimit || 0);
  }

  // Skills
  const sbStat = $('skills-tbl-stat').querySelector('tbody');
  const sbMain = $('skills-tbl').querySelector('tbody');
  if (!s.skills || s.skills.length === 0) {
    const empty = '<tr><td colspan="4" class="empty">no skills found</td></tr>';
    if (sbStat) sbStat.innerHTML = empty;
    if (sbMain) sbMain.innerHTML = empty;
  } else {
    const rowsStat = s.skills.map(sk => '<tr>'
      + '<td>' + esc(sk.name) + '</td>'
      + '<td style="color:var(--muted)">' + esc(sk.version || '') + '</td>'
      + '<td>' + badge(sk.enabled ? 'enabled' : 'disabled', sk.enabled ? 'green' : 'muted') + '</td>'
      + '</tr>').join('');
    const rowsMain = s.skills.map(sk => '<tr>'
      + '<td>' + esc(sk.name) + '</td>'
      + '<td>' + esc(sk.version || '') + '</td>'
      + '<td style="color:var(--muted); font-size:12px">' + esc(sk.description || '') + '</td>'
      + '<td>' + badge(sk.enabled ? 'enabled' : 'disabled', sk.enabled ? 'green' : 'muted') + '</td>'
      + '</tr>').join('');
    if (sbStat) sbStat.innerHTML = rowsStat;
    if (sbMain) sbMain.innerHTML = rowsMain;
  }

  // MCP Servers
  const mbStat = $('mcp-tbl-stat').querySelector('tbody');
  const mbMain = $('mcp-tbl').querySelector('tbody');
  if (!s.mcpServers || s.mcpServers.length === 0) {
    const empty = '<tr><td colspan="3" class="empty">no MCP servers</td></tr>';
    if (mbStat) mbStat.innerHTML = empty;
    if (mbMain) mbMain.innerHTML = empty;
  } else {
    const rowsStat = s.mcpServers.map(m => '<tr>'
      + '<td>' + esc(m.name) + '</td>'
      + '<td>' + (m.tools || 0) + '</td>'
      + '<td>' + badge(m.ready ? 'ready' : 'error', m.ready ? 'green' : 'red') + '</td>'
      + '</tr>').join('');
    const rowsMain = s.mcpServers.map(m => '<tr>'
      + '<td>' + esc(m.name) + '</td>'
      + '<td>' + (m.tools || 0) + '</td>'
      + '<td>' + badge(m.ready ? 'ready' : 'error', m.ready ? 'green' : 'red') + '</td>'
      + '<td><button class="btn" style="font-size:10px" data-name="' + esc(m.name) + '" onclick="refreshMcp(this.dataset.name)">Refresh</button></td>'
      + '</tr>').join('');
    if (mbStat) mbStat.innerHTML = rowsStat;
    if (mbMain) mbMain.innerHTML = rowsMain;
  }

  // Messaging
  const msgbStat = $('msg-tbl-stat').querySelector('tbody');
  const msgbMain = $('msg-tbl').querySelector('tbody');
  if (!s.messaging || s.messaging.length === 0) {
    const empty = '<tr><td colspan="2" class="empty">no messaging adapters</td></tr>';
    if (msgbStat) msgbStat.innerHTML = empty;
    if (msgbMain) msgbMain.innerHTML = empty;
  } else {
    const rowsStat = s.messaging.map(m => '<tr>'
      + '<td>' + esc(m.platform) + '</td>'
      + '<td>' + badge(m.running ? 'connected' : 'offline', m.running ? 'green' : 'red') + '</td>'
      + '</tr>').join('');
    const rowsMain = s.messaging.map(m => '<tr>'
      + '<td>' + esc(m.platform) + '</td>'
      + '<td>' + badge(m.running ? 'connected' : 'offline', m.running ? 'green' : 'red') + '</td>'
      + '<td><button class="btn" style="font-size:10px" onclick="switchTab(\\\'creds\\\')">Configure</button></td>'
      + '</tr>').join('');
    if (msgbStat) msgbStat.innerHTML = rowsStat;
    if (msgbMain) msgbMain.innerHTML = rowsMain;
  }
}

function appendEvent(payload) {
  eventCount++;
  $('ev-count').textContent = eventCount + ' events';
  const log = $('event-log');
  const div = document.createElement('div');
  div.className = 'entry';
  const ts = new Date(payload.timestamp).toTimeString().slice(0, 8);
  const detail = JSON.stringify(payload.data || {}).slice(0, 120);
  div.innerHTML = '<span class="ts">' + ts + '</span>'
    + '<span class="ev">' + esc(payload.event) + '</span>'
    + '<span class="detail">' + esc(detail) + '</span>';
  log.prepend(div);
  while (log.children.length > MAX_LOG) log.removeChild(log.lastChild);
}

// ═══════════════════════════════════════════════════════════════
//  Chat — WebSocket + streaming
// ═══════════════════════════════════════════════════════════════
let chatWs = null;
let chatConnected = false;
let streamingMsgEl = null;  // current streaming bubble element
let streamingContent = '';

function populateChatAgents(agents) {
  const sel = $('chat-agent');
  const cur = sel.value;
  sel.innerHTML = '<option value="">default</option>';
  (agents || []).forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.id + (a.default ? ' ★' : '');
    sel.appendChild(opt);
  });
  if (cur) sel.value = cur;
}

function setChatState(state) {
  // state: 'disconnected' | 'connecting' | 'authenticating' | 'ready' | 'error'
  const badge = $('ws-badge');
  const btn   = $('chat-connect-btn');
  const input = $('chat-input');
  const send  = $('chat-send-btn');

  badge.className = 'disconnected connecting authenticating ready error'.includes(state) ? 'ws-badge' : '';

  if (state === 'disconnected') {
    badge.id = 'ws-badge'; badge.textContent = 'disconnected'; badge.className = '';
    btn.textContent = 'Connect'; btn.className = '';
    input.disabled = true; send.disabled = true;
  } else if (state === 'connecting') {
    badge.textContent = 'connecting…';
    btn.textContent = 'Cancel'; btn.className = 'disconnect';
    input.disabled = true; send.disabled = true;
  } else if (state === 'authenticating') {
    badge.textContent = 'authenticating…';
    btn.textContent = 'Cancel'; btn.className = 'disconnect';
    input.disabled = true; send.disabled = true;
  } else if (state === 'ready') {
    badge.textContent = 'connected'; badge.className = 'connected'; badge.id = 'ws-badge';
    btn.textContent = 'Disconnect'; btn.className = 'disconnect';
    input.disabled = false; send.disabled = false;
    input.focus();
    $('chat-empty') && ($('chat-empty').style.display = 'none');
  } else if (state === 'error') {
    badge.textContent = 'error'; badge.className = 'error'; badge.id = 'ws-badge';
    btn.textContent = 'Retry'; btn.className = '';
    input.disabled = true; send.disabled = true;
  }
}

function chatToggleConnect() {
  if (chatWs && chatWs.readyState <= 1 /* OPEN or CONNECTING */) {
    chatWs.close();
    chatWs = null;
    chatConnected = false;
    setChatState('disconnected');
    return;
  }
  const token = $('chat-token').value.trim();
  if (!token) {
    $('chat-token').focus();
    $('chat-token').style.borderColor = 'var(--red)';
    setTimeout(() => { $('chat-token').style.borderColor = ''; }, 1500);
    return;
  }
  chatConnect(token);
}

function chatConnect(token) {
  setChatState('connecting');
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl  = proto + '//' + location.host;

  chatWs = new WebSocket(wsUrl);

  chatWs.onopen = () => {
    setChatState('authenticating');
    // Wait for auth:challenge
  };

  chatWs.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    switch (msg.type) {
      case 'auth:challenge': {
        // Send raw token as response
        const reply = {
          id: crypto.randomUUID(),
          type: 'auth:response',
          timestamp: Date.now(),
          payload: { challengeId: msg.payload.challengeId, response: token },
        };
        chatWs.send(JSON.stringify(reply));
        break;
      }
      case 'auth:result': {
        if (msg.payload.success) {
          chatConnected = true;
          setChatState('ready');
        } else {
          appendChatNotice('⚠️ Authentication failed: ' + (msg.payload.error || 'invalid token'));
          chatWs.close();
          setChatState('error');
        }
        break;
      }
      case 'chat:stream:start': {
        streamingContent = '';
        streamingMsgEl = appendChatBubble('agent', '', true);
        break;
      }
      case 'chat:stream:delta': {
        const delta = msg.payload || {};
        streamingContent += delta.content || '';
        if (streamingMsgEl) {
          const bubble = streamingMsgEl.querySelector('.msg-bubble');
          if (bubble) bubble.textContent = streamingContent;
          scrollChatToBottom();
        }
        if (delta.done) {
          // Remove cursor class
          if (streamingMsgEl) streamingMsgEl.classList.remove('streaming');
          streamingMsgEl = null;
        }
        break;
      }
      case 'chat:reply': {
        const p = msg.payload || {};
        // If we have a streaming element still open (in case stream:end wasn't sent), close it
        if (streamingMsgEl) {
          streamingMsgEl.classList.remove('streaming');
          streamingMsgEl = null;
        }
        // If no streaming happened (non-streaming agent), show reply now
        if (!streamingContent) {
          appendChatBubble('agent', p.content || '');
        }
        // Show token usage
        const t = p.tokensUsed;
        if (t) {
          const last = $('chat-messages').querySelector('.msg.agent:last-child');
          if (last) {
            const meta = document.createElement('div');
            meta.className = 'msg-tokens';
            meta.textContent = (p.model || '').split('/').pop() + ' · '
              + 'in:' + t.input + ' out:' + t.output
              + (t.cost ? ' · $' + t.cost.toFixed(5) : '');
            last.appendChild(meta);
          }
        }
        streamingContent = '';
        // Re-enable input
        $('chat-send-btn').disabled = false;
        $('chat-input').disabled = false;
        $('chat-input').focus();
        break;
      }
      case 'error': {
        const p = msg.payload || {};
        appendChatNotice('⚠️ ' + (p.message || p.error || 'Server error'));
        $('chat-send-btn').disabled = false;
        $('chat-input').disabled = false;
        break;
      }
      default: break;
    }
  };

  chatWs.onerror = () => {
    appendChatNotice('⚠️ WebSocket error');
  };

  chatWs.onclose = () => {
    chatConnected = false;
    if (streamingMsgEl) { streamingMsgEl.classList.remove('streaming'); streamingMsgEl = null; }
    setChatState('disconnected');
    $('chat-send-btn').disabled = true;
    $('chat-input').disabled = true;
  };
}

function appendChatBubble(role, text, streaming) {
  const empty = $('chat-empty');
  if (empty) empty.style.display = 'none';

  const wrap = document.createElement('div');
  wrap.className = 'msg ' + role + (streaming ? ' streaming' : '');

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = text;
  if (streaming) {
    const cursor = document.createElement('span');
    cursor.className = 'msg-cursor';
    bubble.appendChild(cursor);
  }

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = new Date().toTimeString().slice(0, 8);

  wrap.appendChild(bubble);
  wrap.appendChild(meta);
  $('chat-messages').appendChild(wrap);
  scrollChatToBottom();
  return wrap;
}

function appendChatNotice(text) {
  const div = document.createElement('div');
  div.style.cssText = 'text-align:center;font-size:11px;color:var(--muted);padding:6px 0';
  div.textContent = text;
  $('chat-messages').appendChild(div);
  scrollChatToBottom();
}

function scrollChatToBottom() {
  const el = $('chat-messages');
  el.scrollTop = el.scrollHeight;
}

function chatSend() {
  if (!chatConnected || !chatWs) return;
  const input = $('chat-input');
  const text  = input.value.trim();
  if (!text) return;

  // Show user bubble
  appendChatBubble('user', text, false);
  input.value = '';
  input.style.height = '';

  // Disable until reply
  $('chat-send-btn').disabled = true;
  $('chat-input').disabled = true;

  const agentId = $('chat-agent').value || undefined;
  const msg = {
    id: crypto.randomUUID(),
    type: 'chat:message',
    timestamp: Date.now(),
    payload: { content: text, ...(agentId ? { agentId } : {}) },
  };
  chatWs.send(JSON.stringify(msg));
}

// Auto-resize textarea
$('chat-input').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 160) + 'px';
});
$('chat-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatSend();
  }
});

// ═══════════════════════════════════════════════════════════════
//  Credentials
// ═══════════════════════════════════════════════════════════════
let googleTab = 'apikey';
let devicePollTimer = null;

function switchAnthropicTab(tab) {
  $('tab-ant-apikey').classList.toggle('active', tab === 'apikey');
  $('tab-ant-cc').classList.toggle('active',     tab === 'cc');
  $('ant-apikey-pane').style.display = tab === 'apikey' ? '' : 'none';
  $('ant-cc-pane').style.display     = tab === 'cc'     ? '' : 'none';
}

function switchGoogleTab(tab) {
  googleTab = tab;
  $('tab-apikey').classList.toggle('active', tab === 'apikey');
  $('tab-oauth').classList.toggle('active', tab === 'oauth');
  $('google-apikey-pane').style.display = tab === 'apikey' ? '' : 'none';
  $('google-oauth-pane').style.display  = tab === 'oauth'  ? '' : 'none';
}

async function loadCredStatus() {
  try {
    const r = await apiFetch('/dashboard/api/credentials/status');
    if (!r.ok) return;
    const s = await r.json();

    // Anthropic
    const ant = s.anthropic || {};
    if (ant.fromEnv) {
      $('ant-status').innerHTML = badge('env var', 'blue');
    } else if (ant.configured && ant.type === 'claude_code') {
      $('ant-status').innerHTML = badge('Claude Code', 'green');
    } else if (ant.configured) {
      $('ant-status').innerHTML = badge('stored', 'green');
    } else {
      $('ant-status').innerHTML = badge('not set', 'red');
    }

    // Show "Claude Code available" hint on the tab
    if (ant.claudeCodeAvailable) {
      $('tab-ant-cc').textContent = 'Use Claude Code ✓';
      $('tab-ant-cc').style.opacity = '';
      $('cc-detect-status').textContent = 'credentials found';
      $('cc-detect-status').style.color = 'var(--green)';
    } else {
      $('tab-ant-cc').style.opacity = '0.5';
      $('cc-detect-status').textContent = 'not found';
    }
    if (ant.claudeCodePath) $('cc-path').textContent = ant.claudeCodePath;

    // Google
    const goo = s.google || {};
    if (goo.fromEnv) {
      $('goo-status').innerHTML = badge('env var', 'blue');
    } else if (goo.configured && goo.type === 'oauth') {
      $('goo-status').innerHTML = badge(goo.email ? goo.email : 'oauth', 'green');
    } else if (goo.configured) {
      $('goo-status').innerHTML = badge('stored', 'green');
    } else {
      $('goo-status').innerHTML = badge('not set', 'red');
    }
    if (!s.google?.oauthAvailable) {
      $('tab-oauth').title = 'Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in .env to enable';
      $('tab-oauth').style.opacity = '0.45';
    }

    // OpenRouter
    const or_ = s.openrouter || {};
    $('or-status').innerHTML = or_.fromEnv
      ? badge('env var', 'blue')
      : or_.configured ? badge('stored', 'green') : badge('not set', 'muted');

    // Telegram
    const tg = s.telegram || {};
    if (tg.running) {
      $('tg-status').innerHTML = badge('connected', 'green');
      $('tg-connect-btn').textContent = 'Reconnect';
    } else if (tg.configured || tg.fromEnv) {
      $('tg-status').innerHTML = badge('token saved', 'yellow');
      $('tg-connect-btn').textContent = 'Connect';
    } else {
      $('tg-status').innerHTML = badge('not set', 'muted');
      $('tg-connect-btn').textContent = 'Connect';
    }
  } catch { /* ignore */ }
}

async function saveAnthropicKey() {
  const key = $('ant-key').value.trim();
  if (!key) { showMsg('ant-msg', 'Enter your Anthropic API key first', 'err'); return; }
  try {
    const r = await apiFetch('/dashboard/api/credentials/anthropic', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const d = await r.json();
    if (d.ok) { $('ant-key').value = ''; showMsg('ant-msg', 'Saved. Active on next API call.', 'ok'); loadCredStatus(); }
    else showMsg('ant-msg', d.error || 'Save failed', 'err');
  } catch (e) { showMsg('ant-msg', String(e), 'err'); }
}

async function importClaudeCode() {
  $('cc-import-btn').disabled = true;
  try {
    const r = await apiFetch('/dashboard/api/credentials/anthropic/claude-code', { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      showMsg('ant-msg', 'Claude Code login imported. Active on next API call.', 'ok');
      loadCredStatus();
    } else {
      showMsg('ant-msg', d.error || 'Import failed', 'err');
    }
  } catch (e) { showMsg('ant-msg', String(e), 'err'); }
  finally { $('cc-import-btn').disabled = false; }
}

async function saveOpenRouterKey() {
  const key = $('or-key').value.trim();
  if (!key) { showMsg('or-msg', 'Enter your OpenRouter API key first', 'err'); return; }
  try {
    const r = await apiFetch('/dashboard/api/credentials/openrouter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const d = await r.json();
    if (d.ok) { $('or-key').value = ''; showMsg('or-msg', 'Saved. Active on next API call.', 'ok'); loadCredStatus(); }
    else showMsg('or-msg', d.error || 'Save failed', 'err');
  } catch (e) { showMsg('or-msg', String(e), 'err'); }
}

async function saveGoogleKey() {
  const key = $('goo-key').value.trim();
  if (!key) { showMsg('goo-msg', 'Enter your Google API key first', 'err'); return; }
  try {
    const r = await apiFetch('/dashboard/api/credentials/google/apikey', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const d = await r.json();
    if (d.ok) { $('goo-key').value = ''; showMsg('goo-msg', 'Saved. Active on next API call.', 'ok'); loadCredStatus(); }
    else showMsg('goo-msg', d.error || 'Save failed', 'err');
  } catch (e) { showMsg('goo-msg', String(e), 'err'); }
}

async function clearCred(provider, statusId, msgId) {
  try {
    const r = await apiFetch('/dashboard/api/credentials/' + provider, { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) { showMsg(msgId, 'Removed.', 'ok'); loadCredStatus(); }
    else showMsg(msgId, d.error || 'Failed', 'err');
  } catch (e) { showMsg(msgId, String(e), 'err'); }
}

async function startGoogleOAuth() {
  $('oauth-start-btn').disabled = true;
  $('device-box').style.display = 'none';
  showMsg('goo-msg', '', '');
  try {
    const r = await apiFetch('/dashboard/api/auth/google/device/start', { method: 'POST' });
    const d = await r.json();
    if (d.error) {
      showMsg('goo-msg', d.error, 'err');
      $('oauth-start-btn').disabled = false;
      return;
    }
    const urlEl = $('device-url');
    urlEl.href = d.verificationUrl;
    urlEl.textContent = d.verificationUrl;
    $('device-code').textContent = d.userCode;
    $('device-box').style.display = '';

    const expiresAt = Date.now() + d.expiresIn * 1000;
    const interval  = (d.interval || 5) * 1000;

    function tick() {
      const rem = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      $('device-timer').textContent = rem > 0 ? 'Expires in ' + rem + 's' : 'Expired';
    }
    tick();
    const tickTimer = setInterval(tick, 1000);

    devicePollTimer = setInterval(async () => {
      try {
        const pr = await apiFetch('/dashboard/api/auth/google/device/poll');
        const pd = await pr.json();
        if (pd.status === 'complete') {
          clearInterval(devicePollTimer); clearInterval(tickTimer);
          $('device-box').style.display = 'none';
          $('oauth-start-btn').disabled = false;
          showMsg('goo-msg', 'Signed in' + (pd.email ? ' as ' + pd.email : '') + '. Active on next API call.', 'ok');
          loadCredStatus();
        } else if (pd.status === 'denied' || pd.status === 'expired' || pd.status === 'error') {
          clearInterval(devicePollTimer); clearInterval(tickTimer);
          $('device-box').style.display = 'none';
          $('oauth-start-btn').disabled = false;
          showMsg('goo-msg', 'Sign-in ' + pd.status + (pd.message ? ': ' + pd.message : ''), 'err');
        }
      } catch { /* poll failure — keep trying */ }
    }, interval);
  } catch (e) {
    showMsg('goo-msg', String(e), 'err');
    $('oauth-start-btn').disabled = false;
  }
}

async function connectTelegram() {
  const token = $('tg-token').value.trim();
  if (!token) { showMsg('tg-msg', 'Paste your bot token first', 'err'); return; }
  $('tg-connect-btn').disabled = true;
  $('tg-connect-btn').textContent = 'Connecting…';
  try {
    const r = await apiFetch('/dashboard/api/messaging/telegram/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const d = await r.json();
    if (d.ok) {
      $('tg-token').value = '';
      showMsg('tg-msg', 'Connected' + (d.botUsername ? ' as @' + d.botUsername : '') + ' 🎉', 'ok');
      loadCredStatus();
    } else {
      showMsg('tg-msg', d.error || 'Connection failed', 'err');
    }
  } catch (e) { showMsg('tg-msg', String(e), 'err'); }
  finally { $('tg-connect-btn').disabled = false; }
}

async function disconnectTelegram() {
  try {
    const r = await apiFetch('/dashboard/api/messaging/telegram/disconnect', { method: 'POST' });
    const d = await r.json();
    if (d.ok) { showMsg('tg-msg', 'Disconnected.', 'ok'); loadCredStatus(); }
    else showMsg('tg-msg', d.error || 'Failed', 'err');
  } catch (e) { showMsg('tg-msg', String(e), 'err'); }
}

function showMsg(id, text, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'cred-msg' + (cls ? ' ' + cls : '');
}

// ═══════════════════════════════════════════════════════════════
//  Agents tab — CRUD
// ═══════════════════════════════════════════════════════════════
let agentEditId = null;   // null = create mode, string = edit mode
let agentsData  = { list: [], defaults: {} };

async function loadAgents() {
  try {
    const r = await apiFetch('/dashboard/api/agents');
    if (!r.ok) return;
    agentsData = await r.json();
    renderDefaults(agentsData.defaults || {});
    renderAgentCards(agentsData.list || []);
  } catch { /* ignore */ }
}

function renderDefaults(d) {
  $('def-model').textContent   = d.model?.primary   || '(none)';
  $('def-tools').textContent   = d.tools?.profile    || '(none)';
  $('def-sandbox').textContent = d.sandbox?.mode     || '(none)';
  $('def-timeout').textContent = d.timeoutSeconds    ? d.timeoutSeconds + 's' : '(none)';
  $('def-daily').textContent   = d.budget?.dailyTokens   ? d.budget.dailyTokens.toLocaleString() : '(none)';
  $('def-monthly').textContent = d.budget?.monthlyTokens ? d.budget.monthlyTokens.toLocaleString() : '(none)';
  $('def-cost').textContent    = d.budget?.monthlyCost   ? '$' + d.budget.monthlyCost : '(none)';
}

function renderAgentCards(list) {
  const grid = $('agents-grid');
  if (!list || list.length === 0) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1">No agents configured yet. Click <strong>+ Add Agent</strong> to create one.</div>';
    return;
  }
  grid.innerHTML = list.map(a => {
    const model   = (a.model?.primary || '').split('/').pop() || '—';
    const profile = a.tools?.profile || '';
    const sandbox = a.sandbox?.mode  || '';
    const aid = esc(a.id);
    const name = a.name ? esc(a.name) : '';
    const avatarHtml = a.avatarUrl 
      ? \`<img src="\${esc(a.avatarUrl)}" class="agent-avatar" onerror="this.outerHTML='<div class=\\'agent-avatar-placeholder\\'>\${aid[0].toUpperCase()}</div>'">\`
      : \`<div class="agent-avatar-placeholder">\${aid[0].toUpperCase()}</div>\`;

    return '<div class="agent-card">'
      + '<div class="agent-card-header">'
      +   avatarHtml
      +   '<div class="agent-card-info">'
      +     '<div class="agent-card-id">' + aid + '</div>'
      +     (name ? '<div class="agent-card-name">' + name + '</div>' : '')
      +     (a.default ? '<div class="agent-card-def">★ default</div>' : '')
      +   '</div>'
      + '</div>'
      + (a.personality ? '<div class="agent-card-personality">' + esc(a.personality) + '</div>' : '')
      + (a.model?.primary ? '<div class="agent-card-row">model <span>' + esc(model) + '</span></div>' : '')
      + (a.workspace && a.workspace !== '.' ? '<div class="agent-card-row">workspace <span>' + esc(a.workspace) + '</span></div>' : '')
      + (profile  ? '<div class="agent-card-row">tools <span>' + esc(profile)  + '</span></div>' : '')
      + (sandbox  ? '<div class="agent-card-row">sandbox <span>' + esc(sandbox) + '</span></div>' : '')
      + '<div class="agent-card-actions">'
      +   '<button class="btn" style="font-size:11px" data-aid="' + aid + '" onclick="editAgentById(this.dataset.aid)">Edit</button>'
      +   (a.default ? '' : '<button class="btn" style="font-size:11px" data-aid="' + aid + '" onclick="setDefaultAgent(this.dataset.aid)">Set default</button>')
      +   '<button class="btn danger" style="font-size:11px;margin-left:auto" data-aid="' + aid + '" onclick="deleteAgent(this.dataset.aid)">Delete</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

function editAgentById(id) {
  const a = (agentsData.list || []).find(x => x.id === id);
  if (a) openAgentModal(a);
}

// ── Defaults modal ──────────────────────────────────────────────
function openDefaultsModal() {
  const d = agentsData.defaults || {};
  $('dft-model').value   = d.model?.primary      || '';
  $('dft-tools').value   = d.tools?.profile      || 'full';
  $('dft-sandbox').value = d.sandbox?.mode       || 'all';
  $('dft-timeout').value = d.timeoutSeconds      || 60;
  $('dft-steps').value   = d.maxStepsPerRun      || 10;
  $('dft-daily').value   = d.budget?.dailyTokens   || '';
  $('dft-monthly').value = d.budget?.monthlyTokens || '';
  $('dft-cost').value    = d.budget?.monthlyCost    || '';
  showAgMsg('dft-msg', '', '');
  $('defaults-modal-bg').classList.add('open');
}

function closeDefaultsModal() {
  $('defaults-modal-bg').classList.remove('open');
}

async function saveDefaults() {
  const patch = {};
  const model = $('dft-model').value.trim();
  if (model) patch.model = { primary: model };
  const tp = $('dft-tools').value;
  if (tp) patch.tools = { profile: tp };
  const sp = $('dft-sandbox').value;
  if (sp) patch.sandbox = { mode: sp };
  const to = parseInt($('dft-timeout').value);
  if (to > 0) patch.timeoutSeconds = to;
  const ms = parseInt($('dft-steps').value);
  if (ms > 0) patch.maxStepsPerRun = ms;
  const daily   = parseInt($('dft-daily').value);
  const monthly = parseInt($('dft-monthly').value);
  const cost    = parseFloat($('dft-cost').value);
  if (daily || monthly || cost) {
    patch.budget = {};
    if (daily)   patch.budget.dailyTokens   = daily;
    if (monthly) patch.budget.monthlyTokens = monthly;
    if (cost)    patch.budget.monthlyCost   = cost;
  }
  try {
    const r = await apiFetch('/dashboard/api/agents/defaults', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const d = await r.json();
    if (d.ok) {
      agentsData.defaults = d.defaults;
      renderDefaults(d.defaults || {});
      showAgMsg('dft-msg', 'Defaults saved.', 'ok');
      setTimeout(closeDefaultsModal, 900);
    } else {
      showAgMsg('dft-msg', d.error || 'Save failed', 'err');
    }
  } catch (e) { showAgMsg('dft-msg', String(e), 'err'); }
}

// ── Agent modal ─────────────────────────────────────────────────
function openAgentModal(agent) {
  agentEditId = agent ? agent.id : null;
  $('agent-modal-title').textContent = agent ? 'Edit Agent: ' + agent.id : 'Add Agent';
  $('ag-id').value        = agent ? agent.id        : '';
  $('ag-id').readOnly     = !!agent;
  $('ag-name').value      = agent ? (agent.name || '') : '';
  $('ag-avatar').value    = agent ? (agent.avatarUrl || '') : '';
  $('ag-personality').value = agent ? (agent.personality || '') : '';
  $('ag-workspace').value = agent ? (agent.workspace || '.') : '.';
  $('ag-model').value     = agent?.model?.primary    || '';
  $('ag-compaction').value= agent?.model?.compaction || '';
  $('ag-tools').value     = agent?.tools?.profile    || '';
  $('ag-sandbox').value   = agent?.sandbox?.mode     || '';
  $('ag-default').checked = !!agent?.default;

  // Failover list
  const failList = $('ag-failover-list');
  failList.innerHTML = '';
  const failovers = agent?.model?.failover || [];
  failovers.forEach(f => addFailoverRow(f));

  // Sandbox opts visibility
  updateSandboxOpts();
  if (agent?.sandbox) {
    $('ag-sandbox-timeout').value = agent.sandbox.timeoutMs  || 30000;
    $('ag-sandbox-mem').value     = agent.sandbox.maxMemoryMb || 512;
    $('ag-net').checked           = !!agent.sandbox.networkAccess;
  } else {
    $('ag-sandbox-timeout').value = '';
    $('ag-sandbox-mem').value     = '';
    $('ag-net').checked           = false;
  }

  showAgMsg('ag-msg', '', '');
  $('agent-modal-bg').classList.add('open');
  setTimeout(() => { if (!agent) $('ag-id').focus(); }, 50);
}

function closeAgentModal() {
  $('agent-modal-bg').classList.remove('open');
}

function addFailoverRow(value) {
  const item = document.createElement('div');
  item.className = 'failover-item';
  item.innerHTML = '<input list="model-list" placeholder="fallback model" value="' + esc(value || '') + '">'
    + '<button onclick="this.parentElement.remove()" title="Remove">×</button>';
  $('ag-failover-list').appendChild(item);
}

function updateSandboxOpts() {
  const mode = $('ag-sandbox').value;
  const show = mode && mode !== '';
  $('ag-sandbox-opts').style.display = show ? '' : 'none';
  $('ag-net-row').style.display      = show ? '' : 'none';
}
// Wire sandbox select change (done at bottom via event listener)

async function saveAgent() {
  const id = $('ag-id').value.trim();
  if (!id) { showAgMsg('ag-msg', 'Agent ID is required', 'err'); return; }

  const body = { 
    id, 
    name: $('ag-name').value.trim() || undefined,
    avatarUrl: $('ag-avatar').value.trim() || undefined,
    personality: $('ag-personality').value.trim() || undefined,
    workspace: $('ag-workspace').value.trim() || '.' 
  };

  const pm = $('ag-model').value.trim();
  const cmp = $('ag-compaction').value.trim();
  const failItems = [...$('ag-failover-list').querySelectorAll('input')]
    .map(i => i.value.trim()).filter(Boolean);

  if (pm || failItems.length || cmp) {
    body.model = {};
    if (pm) body.model.primary = pm;
    if (failItems.length) body.model.failover = failItems;
    if (cmp) body.model.compaction = cmp;
  }

  const tp = $('ag-tools').value;
  if (tp) body.tools = { profile: tp };

  const sp = $('ag-sandbox').value;
  if (sp) {
    body.sandbox = {
      mode: sp,
      timeoutMs:     parseInt($('ag-sandbox-timeout').value) || 30000,
      maxMemoryMb:   parseInt($('ag-sandbox-mem').value)     || 512,
      networkAccess: $('ag-net').checked,
    };
  }

  if ($('ag-default').checked) body.default = true;

  try {
    const isEdit  = !!agentEditId;
    const url     = isEdit ? '/dashboard/api/agents/' + encodeURIComponent(agentEditId) : '/dashboard/api/agents';
    const method  = isEdit ? 'PUT' : 'POST';
    const r = await apiFetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.ok || d.agent) {
      showAgMsg('ag-msg', isEdit ? 'Agent updated.' : 'Agent created.', 'ok');
      await loadAgents();
      // Also refresh chat agent selector
      populateChatAgents(agentsData.list || []);
      setTimeout(closeAgentModal, 800);
    } else {
      showAgMsg('ag-msg', d.error || 'Save failed', 'err');
    }
  } catch (e) { showAgMsg('ag-msg', String(e), 'err'); }
}

async function deleteAgent(id) {
  if (!confirm('Delete agent "' + id + '"? This cannot be undone.')) return;
  try {
    const r = await apiFetch('/dashboard/api/agents/' + encodeURIComponent(id), { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) {
      await loadAgents();
      populateChatAgents(agentsData.list || []);
    } else {
      alert(d.error || 'Delete failed');
    }
  } catch (e) { alert(String(e)); }
}

async function setDefaultAgent(id) {
  try {
    const r = await apiFetch('/dashboard/api/agents/' + encodeURIComponent(id) + '/default', { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      await loadAgents();
      populateChatAgents(agentsData.list || []);
    } else {
      alert(d.error || 'Failed');
    }
  } catch (e) { alert(String(e)); }
}

function showAgMsg(id, text, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = cls === 'ok' ? 'var(--green)' : cls === 'err' ? 'var(--red)' : 'var(--muted)';
}

// (sandbox select is wired in init below)

// ═══════════════════════════════════════════════════════════════
//  Teams tab — Roles & Teams CRUD
// ═══════════════════════════════════════════════════════════════
let teamsData = { roles: [], teams: [], agents: [] };
let roleEditId = null;   // null = create, string = edit
let teamEditId = null;
let runTeamId  = null;

async function loadTeams() {
  try {
    const r = await apiFetch('/dashboard/api/teams');
    if (!r.ok) return;
    teamsData = await r.json();
    renderRoles(teamsData.roles || []);
    renderTeams(teamsData.teams || [], teamsData.roles || []);
  } catch { /* ignore */ }
}

// ── Roles render ────────────────────────────────────────────────
function renderRoles(roles) {
  const grid = $('roles-grid');
  if (!roles || roles.length === 0) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1">No roles yet. Click <strong>+ New Role</strong> to define a position.</div>';
    return;
  }
  grid.innerHTML = roles.map(r => {
    const delegates = (r.canDelegateTo || []).join(', ');
    const respItems = (r.responsibilities || []).map(x => '<li>' + esc(x) + '</li>').join('');
    const rid = esc(r.id);
    return '<div class="role-card">'
      + '<div class="role-card-name">' + esc(r.name) + '</div>'
      + '<div class="role-card-desc">' + esc(r.description || '') + '</div>'
      + (respItems ? '<div class="role-card-resp"><div class="role-card-resp-title">Responsibilities</div><ul>' + respItems + '</ul></div>' : '')
      + (delegates ? '<div class="role-card-delegate">Can delegate to: <span>' + esc(delegates) + '</span></div>' : '')
      + '<div class="role-card-actions">'
      +   '<button class="btn" style="font-size:11px" data-rid="' + rid + '" onclick="editRoleById(this.dataset.rid)">Edit</button>'
      +   '<button class="btn danger" style="font-size:11px;margin-left:auto" data-rid="' + rid + '" onclick="deleteRole(this.dataset.rid)">Delete</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

// ── Teams render ────────────────────────────────────────────────
function renderTeams(teams, roles) {
  const grid = $('teams-grid');
  if (!teams || teams.length === 0) {
    grid.innerHTML = '<div class="empty">No teams yet. Click <strong>+ New Team</strong> to create one.</div>';
    return;
  }
  const roleMap = {};
  roles.forEach(r => { roleMap[r.id] = r; });

  grid.innerHTML = teams.map(t => {
    const tid = esc(t.id);
    const slotHtml = (t.members || []).map(m => {
      const isLead = m.agentId === t.leadAgentId;
      const roleName = roleMap[m.roleId] ? roleMap[m.roleId].name : m.roleId;
      return '<div class="org-slot' + (isLead ? ' lead' : '') + '">'
        + '<div class="org-slot-role">' + esc(roleName) + (isLead ? ' ★ lead' : '') + '</div>'
        + '<div class="org-slot-agent">@' + esc(m.agentId) + '</div>'
        + '</div>';
    }).join('');
    return '<div class="team-card">'
      + '<div class="team-card-header">'
      +   '<div class="team-card-name">🏢 ' + esc(t.name) + '</div>'
      +   '<div class="team-card-lead">lead: <span>' + esc(t.leadAgentId) + '</span></div>'
      + '</div>'
      + (t.sharedGoal ? '<div class="team-card-goal">"' + esc(t.sharedGoal) + '"</div>' : '')
      + '<div class="org-chart">' + (slotHtml || '<span class="empty">no members</span>') + '</div>'
      + '<div class="team-card-actions">'
      +   '<button class="btn" style="font-size:11px" data-tid="' + tid + '" onclick="editTeamById(this.dataset.tid)">Edit</button>'
      +   '<button class="btn primary" style="font-size:11px" data-tid="' + tid + '" onclick="openRunModal(this.dataset.tid)">▶ Run</button>'
      +   '<button class="btn danger" style="font-size:11px;margin-left:auto" data-tid="' + tid + '" onclick="deleteTeam(this.dataset.tid)">Delete</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

// ── Role modal ──────────────────────────────────────────────────
function editRoleById(id) {
  const r = (teamsData.roles || []).find(x => x.id === id);
  if (r) openRoleModal(r);
}

function openRoleModal(role) {
  roleEditId = role ? role.id : null;
  $('role-modal-title').textContent = role ? 'Edit Role: ' + role.name : 'New Role';
  $('rl-id').value        = role ? role.id   : '';
  $('rl-id').readOnly     = !!role;
  $('rl-name').value      = role ? role.name : '';
  $('rl-desc').value      = role ? (role.description || '') : '';
  $('rl-resp').value      = role ? (role.responsibilities || []).join('\\n') : '';
  $('rl-delegate').value  = role ? (role.canDelegateTo || []).join(', ') : '';
  $('rl-sysprompt').value = role ? (role.systemPromptPrefix || '') : '';
  showTeamMsg('rl-msg', '', '');
  $('role-modal-bg').classList.add('open');
  setTimeout(() => { if (!role) $('rl-id').focus(); }, 50);
}

function closeRoleModal() {
  $('role-modal-bg').classList.remove('open');
}

async function saveRole() {
  const id   = $('rl-id').value.trim();
  const name = $('rl-name').value.trim();
  if (!id)   { showTeamMsg('rl-msg', 'Role ID is required', 'err'); return; }
  if (!name) { showTeamMsg('rl-msg', 'Name is required', 'err'); return; }

  const resp = $('rl-resp').value.split('\\n').map(s => s.trim()).filter(Boolean);
  const delegates = $('rl-delegate').value.split(',').map(s => s.trim()).filter(Boolean);
  const sysprompt = $('rl-sysprompt').value.trim();

  const body = { id, name, description: $('rl-desc').value.trim() };
  if (resp.length)      body.responsibilities   = resp;
  if (delegates.length) body.canDelegateTo      = delegates;
  if (sysprompt)        body.systemPromptPrefix = sysprompt;

  try {
    const isEdit = !!roleEditId;
    const url    = isEdit ? '/dashboard/api/roles/' + encodeURIComponent(roleEditId) : '/dashboard/api/roles';
    const r = await apiFetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.ok) {
      showTeamMsg('rl-msg', isEdit ? 'Role updated.' : 'Role created.', 'ok');
      await loadTeams();
      setTimeout(closeRoleModal, 800);
    } else {
      showTeamMsg('rl-msg', d.error || 'Save failed', 'err');
    }
  } catch (e) { showTeamMsg('rl-msg', String(e), 'err'); }
}

async function deleteRole(id) {
  if (!confirm('Delete role "' + id + '"?')) return;
  try {
    const r = await apiFetch('/dashboard/api/roles/' + encodeURIComponent(id), { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) { await loadTeams(); }
    else alert(d.error || 'Delete failed');
  } catch (e) { alert(String(e)); }
}

// ── Team modal ──────────────────────────────────────────────────
function editTeamById(id) {
  const t = (teamsData.teams || []).find(x => x.id === id);
  if (t) openTeamModal(t);
}

function buildAgentOptions(selectedId) {
  const agents = teamsData.agents || [];
  return agents.map(a =>
    '<option value="' + esc(a.id) + '"' + (a.id === selectedId ? ' selected' : '') + '>' + esc(a.id) + (a.default ? ' ★' : '') + '</option>'
  ).join('');
}

function buildRoleOptions(selectedId) {
  const roles = teamsData.roles || [];
  return '<option value="">(select role)</option>'
    + roles.map(r =>
        '<option value="' + esc(r.id) + '"' + (r.id === selectedId ? ' selected' : '') + '>' + esc(r.name) + '</option>'
      ).join('');
}

function openTeamModal(team) {
  teamEditId = team ? team.id : null;
  $('team-modal-title').textContent = team ? 'Edit Team: ' + team.name : 'New Team';
  $('tm-id').value    = team ? team.id   : '';
  $('tm-id').readOnly = !!team;
  $('tm-name').value  = team ? team.name : '';
  $('tm-goal').value  = team ? (team.sharedGoal || '') : '';

  // Lead agent dropdown
  const leadSel = $('tm-lead');
  leadSel.innerHTML = buildAgentOptions(team ? team.leadAgentId : '');

  // Member rows
  const tbody = $('tm-members-body');
  tbody.innerHTML = '';
  (team ? team.members || [] : []).forEach(m => addMemberRow(m.roleId, m.agentId));

  showTeamMsg('tm-msg', '', '');
  $('team-modal-bg').classList.add('open');
  setTimeout(() => { if (!team) $('tm-id').focus(); }, 50);
}

function closeTeamModal() {
  $('team-modal-bg').classList.remove('open');
}

function addMemberRow(roleId, agentId) {
  const tbody = $('tm-members-body');
  const tr = document.createElement('tr');
  tr.innerHTML = '<td><select class="member-role-sel">' + buildRoleOptions(roleId || '') + '</select></td>'
    + '<td><select class="member-agent-sel">' + buildAgentOptions(agentId || '') + '</select></td>'
    + '<td><button onclick="this.parentNode.parentNode.remove()" title="Remove">×</button></td>';
  tbody.appendChild(tr);
}

async function saveTeam() {
  const id   = $('tm-id').value.trim();
  const name = $('tm-name').value.trim();
  const lead = $('tm-lead').value.trim();
  if (!id)   { showTeamMsg('tm-msg', 'Team ID is required', 'err'); return; }
  if (!name) { showTeamMsg('tm-msg', 'Name is required', 'err'); return; }
  if (!lead) { showTeamMsg('tm-msg', 'Lead agent is required', 'err'); return; }

  const members = [];
  $('tm-members-body').querySelectorAll('tr').forEach(tr => {
    const roleId  = tr.querySelector('.member-role-sel')?.value  || '';
    const agentId = tr.querySelector('.member-agent-sel')?.value || '';
    if (roleId && agentId) members.push({ roleId, agentId });
  });

  const body = {
    id, name, leadAgentId: lead,
    sharedGoal: $('tm-goal').value.trim() || undefined,
    members,
  };

  try {
    const isEdit = !!teamEditId;
    const url    = isEdit ? '/dashboard/api/teams/' + encodeURIComponent(teamEditId) : '/dashboard/api/teams';
    const r = await apiFetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.ok) {
      showTeamMsg('tm-msg', isEdit ? 'Team updated.' : 'Team created.', 'ok');
      await loadTeams();
      setTimeout(closeTeamModal, 800);
    } else {
      showTeamMsg('tm-msg', d.error || 'Save failed', 'err');
    }
  } catch (e) { showTeamMsg('tm-msg', String(e), 'err'); }
}

async function deleteTeam(id) {
  if (!confirm('Delete team "' + id + '"?')) return;
  try {
    const r = await apiFetch('/dashboard/api/teams/' + encodeURIComponent(id), { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) { await loadTeams(); }
    else alert(d.error || 'Delete failed');
  } catch (e) { alert(String(e)); }
}

// ── Run team ────────────────────────────────────────────────────
function openRunModal(teamId) {
  runTeamId = teamId;
  const t = (teamsData.teams || []).find(x => x.id === teamId);
  $('run-modal-title').textContent = 'Run Team: ' + (t ? t.name : teamId);
  $('run-goal').value = t?.sharedGoal || '';
  $('run-submit-btn').disabled = false;
  showTeamMsg('run-msg', '', '');
  $('run-modal-bg').classList.add('open');
  setTimeout(() => $('run-goal').focus(), 50);
}

function closeRunModal() {
  $('run-modal-bg').classList.remove('open');
}

async function submitRunTeam() {
  const goal = $('run-goal').value.trim();
  if (!goal) { showTeamMsg('run-msg', 'Enter a goal first', 'err'); return; }
  $('run-submit-btn').disabled = true;
  showTeamMsg('run-msg', '⏳ Running team… this may take a moment.', '');
  try {
    const r = await apiFetch('/dashboard/api/teams/' + encodeURIComponent(runTeamId) + '/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal }),
    });
    const d = await r.json();
    if (d.error) {
      showTeamMsg('run-msg', '❌ ' + d.error, 'err');
    } else {
      showTeamMsg('run-msg',
        (d.success ? '✅ Done' : '⚠️ Partial') + ' — '
        + (d.doneCount || 0) + ' tasks done, '
        + (d.failedCount || 0) + ' failed\\n\\n'
        + (d.synthesis || ''),
        d.success ? 'ok' : 'err'
      );
    }
  } catch (e) { showTeamMsg('run-msg', String(e), 'err'); }
  finally { $('run-submit-btn').disabled = false; }
}

function showTeamMsg(id, text, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = cls === 'ok' ? 'var(--green)' : cls === 'err' ? 'var(--red)' : 'var(--muted)';
}

// ═══════════════════════════════════════════════════════════════
//  Init
// ═══════════════════════════════════════════════════════════════
(function init() {
  const hp = getHashParams();

  // Auto-fill token from URL hash (#chat&tok=xxx)
  if (hp.tok) {
    $('chat-token').value = hp.tok;
    // Clean token from URL bar (don't leak it in history)
    history.replaceState(null, '', location.pathname);
  }

  // Auto-switch to chat tab and connect if #chat in hash
  if (location.hash.startsWith('#chat')) {
    switchTab('chat');
    if (hp.tok) {
      // Small delay so WS server has time to start after setup redirect
      setTimeout(() => chatConnect(hp.tok), 600);
    }
  }

  // Wire sandbox select change
  const agSandboxSel = $('ag-sandbox');
  if (agSandboxSel) agSandboxSel.addEventListener('change', updateSandboxOpts);

  // Apply saved theme and check login
  setTheme(localStorage.getItem('ai_desk_theme') || 'dark');
  checkLogin();
})();
</script>
</body>
</html>`;
}
