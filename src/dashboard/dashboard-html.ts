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

import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
const _pkg = _require('../../package.json') as { version: string };

export function getDashboardHtml(): string {
  const version = _pkg.version;
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
  --transition: all 0.15s ease;
  --font-main: 'Inter', 'Outfit', sans-serif;
  --font-tactical: 'Bebas Neue', 'Impact', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --shadow: 0 4px 20px rgba(0,0,0,0.1);
}

/* Theme Dark (Default) */
.theme-dark {
  --bg: #0c0c0c;
  --bg-sidebar: #0c0c0c;
  --bg-card: rgba(244,239,229,0.015);
  --bg-input: #151515;
  --border: rgba(244,239,229,0.10);
  --text: #f4efe5;
  --muted: rgba(244,239,229,0.55);
  --dim: rgba(244,239,229,0.30);
  --accent: #c89048;
  --accent-soft: rgba(200, 144, 72, 0.1);
  --glass: rgba(12, 12, 12, 0.95);
  --green: #7ddc6b;
  --red: #e26b5a;
  --yellow: #facc15;
  --purple: #c084fc;
}

/* Theme Light */
.theme-light {
  --bg: #f3f4f6;
  --bg-sidebar: #ffffff;
  --bg-card: rgba(0,0,0,0.02);
  --bg-input: #f9fafb;
  --border: rgba(0, 0, 0, 0.10);
  --text: #1f2937;
  --muted: rgba(31,41,55,0.55);
  --dim: rgba(31,41,55,0.30);
  --accent: #c89048;
  --accent-soft: rgba(200, 144, 72, 0.1);
  --glass: rgba(255, 255, 255, 0.85);
  --green: #16a34a;
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


/* ── SVG Icon helper ───────────────────────────────────── */
.svg-icon { display: inline-block; flex-shrink: 0; }

/* ── Sidebar ───────────────────────────────────────────── */
aside {
  width: var(--sidebar-w); background: var(--bg-sidebar); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; height: 100%;
}
.sidebar-hdr { padding: 26px 24px 22px; border-bottom: 1px solid var(--border); }
.sidebar-logo { display: flex; align-items: center; gap: 12px; }
.logo-box {
  width: 34px; height: 34px; background: var(--accent); color: #0c0c0c;
  display: grid; place-items: center;
  font-family: var(--font-tactical); font-size: 22px; line-height: 1; flex-shrink: 0;
}
.logo-name { font-family: var(--font-tactical); font-size: 22px; line-height: 1; letter-spacing: 0.06em; }
.logo-name span { color: var(--accent); }
.logo-ver { font-family: var(--font-mono); font-size: 9px; color: var(--muted); margin-top: 4px; letter-spacing: 0.22em; }
.nav-section-label {
  padding: 20px 24px 8px; font-family: var(--font-mono); font-size: 9px;
  letter-spacing: 0.24em; color: var(--muted);
}
.nav-group { display: flex; flex-direction: column; }
.nav-tab {
  all: unset; cursor: pointer; display: flex; align-items: center; gap: 12px;
  padding: 12px 24px; padding-left: 21px;
  color: var(--muted); background: transparent;
  border-left: 3px solid transparent;
  transition: var(--transition); font-size: 12px; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.nav-tab:hover { color: var(--text); }
.nav-tab.active { color: var(--text); background: var(--accent-soft); border-left-color: var(--accent); }
.nav-tab.active .nav-icon { stroke: var(--accent); }
.nav-arrow { margin-left: auto; font-family: var(--font-mono); font-size: 9px; color: var(--muted); display: none; }
.nav-tab.active .nav-arrow { display: inline; }
.nav-icon { stroke: currentColor; transition: var(--transition); }
.sidebar-ftr { margin-top: auto; }
.theme-toggle {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 24px; border-top: 1px solid var(--border);
  font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.22em;
  cursor: pointer; color: var(--muted); transition: var(--transition);
}
.theme-toggle:hover { color: var(--text); }
.theme-toggle-right { display: inline-flex; align-items: center; gap: 8px; color: var(--accent); }
.logout-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 14px 24px 22px; font-size: 12px; font-weight: 700;
  letter-spacing: 0.06em; color: var(--accent); cursor: pointer; transition: var(--transition);
}
.logout-btn:hover { opacity: 0.8; }

/* ── Main Layout ────────────────────────────────────────── */
main { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }
main::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0.9; z-index: 0;
  background-image: repeating-linear-gradient(-45deg, rgba(244,239,229,0.025) 0 1px, transparent 1px 10px);
}
main > * { position: relative; z-index: 1; }
.main-hdr {
  padding: 18px 32px; background: var(--bg);
  border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;
  flex-wrap: wrap; gap: 16px;
}
.view-overview { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.24em; color: var(--muted); margin-bottom: 4px; }
#view-title { font-family: var(--font-tactical); font-size: 38px; letter-spacing: 0.03em; white-space: nowrap; margin: 0; line-height: 1; }
#view-title .title-accent { color: var(--accent); }
.sys-stats { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; justify-content: flex-end; }
.stat-item { font-family: var(--font-mono); font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.18em; display: inline-flex; align-items: center; gap: 8px; }
.stat-item span { color: var(--text); font-weight: 700; }

.content-area {
  flex: 1; padding: 26px 32px 32px; overflow-y: auto; display: none;
  animation: fadeIn 0.3s ease;
}
.content-area.active { display: block; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

/* Form inputs */
.login-input {
  width: 100%; background: var(--bg-input); border: 1px solid var(--border);
  color: var(--text); padding: 10px 14px; outline: none;
  font-family: var(--font-mono); font-size: 13px; transition: var(--transition);
  margin-bottom: 12px; border-radius: 0;
}
.login-input:focus { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
input, textarea, select {
  background: var(--bg-input); border: 1px solid var(--border);
  color: var(--text); padding: 8px 12px; outline: none;
  font-family: var(--font-main); font-size: 13px; transition: var(--transition);
  border-radius: 0; width: 100%;
}
input:focus, textarea:focus, select:focus { border-color: var(--accent); }
label { display: block; font-family: var(--font-mono); font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 6px; }
th { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.22em; color: var(--muted); padding: 12px; text-align: left; border-bottom: 1px solid var(--border); text-transform: uppercase; }
.empty { color: var(--muted); font-style: italic; font-size: 12px; }

/* ── Cards & UI Components ──────────────────────────────── */
.card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 0;
  padding: 0; margin-bottom: 24px; position: relative; overflow: hidden;
}
.card::before {
  content: ''; position: absolute; top: 0; right: 0; width: 96px; height: 96px; pointer-events: none;
  background-image: repeating-linear-gradient(-45deg, rgba(200,144,72,0.10) 0 1px, transparent 1px 8px);
  -webkit-mask-image: linear-gradient(225deg, #000 0%, transparent 70%);
  mask-image: linear-gradient(225deg, #000 0%, transparent 70%);
}
/* Structured card: .card-header + .card-body */
.card-header {
  padding: 16px 22px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 14px; position: relative;
}
.card-num { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.22em; color: var(--muted); }
.card-num-sep { width: 1px; height: 18px; background: var(--border); }
.card-icon { stroke: var(--accent); flex-shrink: 0; }
.card-body { padding: 10px 22px 22px; }
.card-count {
  padding: 2px 8px; border: 1px solid var(--border);
  font-family: var(--font-mono); font-size: 10px; color: var(--accent); letter-spacing: 0.18em;
}
/* Legacy h3-based cards */
.card h3 {
  font-family: var(--font-tactical); font-size: 20px; letter-spacing: 0.10em;
  color: var(--text); text-transform: uppercase; display: flex; align-items: center; gap: 10px;
  padding: 16px 22px; border-bottom: 1px solid var(--border); margin: 0;
}
.card h3 .card-h3-icon { stroke: var(--accent); flex-shrink: 0; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }

td { padding: 12px; border-bottom: 1px solid var(--border); font-size: 13px; }
tr:hover td { background: rgba(200,144,72,0.06); }

/* Badges — StatusPill style */
.badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 8px; border: 1px solid currentColor; background: transparent;
  font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.22em; font-weight: 400;
}
.badge::before { content: ''; width: 5px; height: 5px; border-radius: 999px; background: currentColor; flex-shrink: 0; }
.badge.green { color: var(--green); }
.badge.red { color: var(--red); }
.badge.yellow { color: var(--yellow); }
.badge.blue { color: var(--accent); }
.badge.muted { color: var(--muted); }

/* Status dot */
#dot.offline { background: var(--red); box-shadow: 0 0 8px rgba(226,107,90,.7); }

/* Form modal utilities */
.form-field { margin-bottom: 16px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.form-section { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
.form-section-title { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.22em; color: var(--muted); text-transform: uppercase; margin-bottom: 12px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); }
.form-check { display: flex; align-items: center; gap: 8px; }
.form-check input[type="checkbox"] { width: auto; }
.member-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
.member-table th, .member-table td { padding: 8px; border-bottom: 1px solid var(--border); font-size: 12px; }
.failover-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }

/* Custom Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 0; }
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

/* Agents Two-Panel */
.agents-panels { display: grid; grid-template-columns: 1.6fr 1fr; gap: 24px; align-items: start; }
.filter-bar { display: flex; gap: 8px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.filter-btn { all: unset; cursor: pointer; font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; padding: 4px 10px; border: 1px solid var(--border); color: var(--muted); transition: var(--transition); }
.filter-btn:hover { color: var(--text); border-color: var(--text); }
.filter-btn.active { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
.roster-head { display: grid; grid-template-columns: 36px 1fr 2fr 0.7fr 0.7fr 0.9fr; gap: 0; font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.2em; color: var(--muted); padding: 10px 16px; border-bottom: 1px solid var(--border); text-transform: uppercase; }
.roster-row { display: grid; grid-template-columns: 36px 1fr 2fr 0.7fr 0.7fr 0.9fr; gap: 0; padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.1s; font-size: 12px; align-items: center; border-left: 2px solid transparent; }
.roster-row:last-child { border-bottom: none; }
.roster-row:hover { background: rgba(244,239,229,0.03); }
.roster-row.selected { background: var(--accent-soft); border-left-color: var(--accent); padding-left: 14px; }
.roster-row .r-num { font-family: var(--font-mono); font-size: 9px; color: var(--dim); }
.roster-row .r-id { font-family: var(--font-mono); font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.roster-row .r-id small { display: block; font-size: 9px; color: var(--muted); font-weight: 400; margin-top: 1px; }
.roster-row .r-model { color: var(--muted); font-size: 10px; font-family: var(--font-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.roster-row .r-stat { font-size: 10px; color: var(--muted); font-family: var(--font-mono); }
/* Dossier panel */
.dossier-empty { display: flex; align-items: center; justify-content: center; min-height: 280px; color: var(--dim); font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; }
.dossier-num { font-family: var(--font-mono); font-size: 9px; color: var(--muted); letter-spacing: 0.26em; text-transform: uppercase; margin-bottom: 6px; }
.dossier-name { font-family: var(--font-tactical); font-size: 48px; line-height: 1; color: var(--text); margin-bottom: 6px; letter-spacing: 0.04em; }
.dossier-pill-row { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.dossier-provider { font-family: var(--font-mono); font-size: 10px; color: var(--muted); letter-spacing: 0.16em; }
.dossier-desc { font-size: 12px; color: var(--muted); line-height: 1.6; margin-bottom: 20px; font-style: italic; }
.dossier-config-label { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.22em; color: var(--muted); text-transform: uppercase; margin-bottom: 12px; }
.dossier-config { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); border: 1px solid var(--border); margin-bottom: 20px; }
.dossier-config-cell { background: var(--bg); padding: 12px 14px; }
.dossier-config-cell-label { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.18em; color: var(--muted); text-transform: uppercase; margin-bottom: 4px; }
.dossier-config-cell-val { font-family: var(--font-mono); font-size: 13px; color: var(--text); }
.dossier-actions { display: flex; gap: 8px; flex-wrap: wrap; }
/* Role dossier specifics */
.dossier-resp-list { list-style: none; padding: 0; margin: 0 0 20px 0; display: flex; flex-direction: column; gap: 4px; }
.dossier-resp-list li { font-size: 11px; color: var(--muted); padding: 7px 12px; border: 1px solid var(--border); border-left: 2px solid var(--accent); font-family: var(--font-mono); line-height: 1.4; }
.dossier-delegate { font-family: var(--font-mono); font-size: 10px; color: var(--muted); letter-spacing: 0.12em; margin-bottom: 20px; }
.dossier-delegate span { color: var(--accent); }
.dossier-sysprompt { font-size: 10px; color: var(--muted); line-height: 1.6; padding: 10px 12px; background: var(--bg-input); border: 1px solid var(--border); margin-bottom: 20px; font-family: var(--font-mono); white-space: pre-wrap; max-height: 100px; overflow-y: auto; }
/* Team dossier specifics */
.dossier-goal { font-size: 12px; color: var(--muted); font-style: italic; line-height: 1.6; margin-bottom: 20px; padding-left: 12px; border-left: 2px solid var(--accent); }
.member-list { display: flex; flex-direction: column; gap: 1px; background: var(--border); border: 1px solid var(--border); margin-bottom: 20px; }
.member-slot { background: var(--bg); padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; }
.member-slot.lead { background: var(--accent-soft); }
.member-slot-role { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.18em; color: var(--muted); text-transform: uppercase; }
.member-slot.lead .member-slot-role { color: var(--accent); }
.member-slot-agent { font-family: var(--font-mono); font-size: 12px; color: var(--text); }
/* keep avatar classes for modal compatibility */
.agent-avatar { width: 40px; height: 40px; border-radius: 0; border: 1px solid var(--accent); object-fit: cover; }
.agent-avatar-placeholder { width: 40px; height: 40px; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; font-family: var(--font-tactical); }
</style>

</head>
<body class="theme-dark">

<aside>
  <div class="sidebar-hdr">
    <div class="sidebar-logo">
      <div class="logo-box">A</div>
      <div>
        <div class="logo-name">AI<span>_</span>DESK</div>
        <div class="logo-ver">CONSOLE·v${version}</div>
      </div>
    </div>
  </div>
  <div class="nav-section-label">OPERATIONS</div>
  <nav class="nav-group">
    <button class="nav-tab active" id="ntab-status" onclick="switchTab('status')">
      <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>
      Status<span class="nav-arrow">→</span>
    </button>
    <button class="nav-tab" id="ntab-agents" onclick="switchTab('agents')">
      <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.4 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.4 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.4-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.4-1.9l-.1-.1A2 2 0 116.9 4.5l.1.1a1.7 1.7 0 001.9.4h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.4l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.4 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>
      Agents
    </button>
    <button class="nav-tab" id="ntab-teams" onclick="switchTab('teams')">
      <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="3"/><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="7" r="2"/><path d="M15 19c0-2.5 1.8-4.5 4-5"/></svg>
      Teams<span class="nav-arrow">→</span>
    </button>
    <button class="nav-tab" id="ntab-roles" onclick="switchTab('roles')">
      <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
      Roles<span class="nav-arrow">→</span>
    </button>
    <button class="nav-tab" id="ntab-skills" onclick="switchTab('skills')">
      <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/></svg>
      Skills
    </button>
    <button class="nav-tab" id="ntab-mcp" onclick="switchTab('mcp')">
      <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 11-12 0V8zM12 18v4"/></svg>
      MCP
    </button>
    <button class="nav-tab" id="ntab-messaging" onclick="switchTab('messaging')">
      <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H8l-4 4V5z"/></svg>
      Messaging
    </button>
    <button class="nav-tab" id="ntab-chat" onclick="switchTab('chat')">
      <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      Chat
    </button>
    <button class="nav-tab" id="ntab-creds" onclick="switchTab('creds')">
      <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M16 6l3 3M14 8l3 3"/></svg>
      Credentials
    </button>
  </nav>
  <div class="sidebar-ftr">
    <div class="theme-toggle" onclick="toggleTheme()">
      <span>THEME</span>
      <span class="theme-toggle-right" id="theme-toggle-right">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" id="theme-icon"><path d="M20 14a8 8 0 11-9-11 6 6 0 009 11z"/></svg>
        <span id="theme-label">DARK</span>
      </span>
    </div>
    <div class="logout-btn" onclick="logout()">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H5a2 2 0 00-2 2v12a2 2 0 002 2h4M16 17l5-5-5-5M21 12H9"/></svg>
      Logout
    </div>
  </div>
</aside>

<main>
  <div class="main-hdr">
    <div>
      <div class="view-overview" id="view-overview">OVERVIEW</div>
      <h2 id="view-title">SYSTEM <span class="title-accent">STATUS</span></h2>
    </div>
    <div class="sys-stats">
      <div class="stat-item">UPTIME <span id="uptime">—</span></div>
      <div class="stat-item">CONNECTIONS <span id="conn-cnt">—</span></div>
      <div class="stat-item">PROVIDERS <span id="providers">—</span></div>
      <div id="conn-status" style="font-family:var(--font-mono);font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.1em">CONNECTING…</div>
      <div id="dot" style="width:7px;height:7px;border-radius:999px;background:var(--green);box-shadow:0 0 8px rgba(125,220,107,.7)"></div>
    </div>
  </div>

  <!-- Status -->
  <div class="content-area active" id="tab-status">
    <div class="grid-2">
      <div class="card">
        <h3><svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg> Agents</h3>
        <div class="card-body" style="padding-top:8px">
        <table id="agents-tbl" style="width:100%">
          <thead><tr><th>ID</th><th>Model</th><th>Sessions</th><th>Status</th></tr></thead>
          <tbody><tr><td colspan="4" class="empty">loading…</td></tr></tbody>
        </table>
        </div>
      </div>
      <div class="card">
        <h3><svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="3"/><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="7" r="2"/><path d="M15 19c0-2.5 1.8-4.5 4-5"/></svg> Teams</h3>
        <div class="card-body" style="padding-top:8px">
        <table id="teams-tbl" style="width:100%">
          <thead><tr><th>Team</th><th>Lead</th><th>Members</th></tr></thead>
          <tbody><tr><td colspan="3" class="empty">loading…</td></tr></tbody>
        </table>
        </div>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3><svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M9 10c0-1 1-2 3-2s3 1 3 2-1 1.5-3 2-3 1-3 2 1 2 3 2 3-1 3-2"/><path d="M12 6v12"/></svg> Budget</h3>
        <div class="card-body" style="padding-top:8px">
        <div id="budget-wrap"><div class="empty">loading…</div></div>
        </div>
      </div>
      <div class="card">
        <h3><svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/></svg> Skills</h3>
        <div class="card-body" style="padding-top:8px">
        <table id="skills-tbl-stat" style="width:100%">
          <thead><tr><th>Name</th><th>Version</th><th>Status</th></tr></thead>
          <tbody><tr><td colspan="3" class="empty">loading…</td></tr></tbody>
        </table>
        </div>
      </div>
    </div>
    <div class="card">
      <h3><svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 11-12 0V8zM12 18v4"/></svg> MCP Servers</h3>
      <div class="card-body" style="padding-top:8px">
      <table id="mcp-tbl-stat" style="width:100%">
        <thead><tr><th>Server</th><th>Tools</th><th>Status</th></tr></thead>
        <tbody><tr><td colspan="3" class="empty">loading…</td></tr></tbody>
      </table>
      </div>
    </div>
    <div class="card">
      <h3><svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H8l-4 4V5z"/></svg> Messaging</h3>
      <div class="card-body" style="padding-top:8px">
      <table id="msg-tbl-stat" style="width:100%">
        <thead><tr><th>Platform</th><th>Status</th></tr></thead>
        <tbody><tr><td colspan="2" class="empty">loading…</td></tr></tbody>
      </table>
      </div>
    </div>
    <div class="card">
      <h3><svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6V3z"/><path d="M14 3v5h5"/></svg> Live Event Log <span id="ev-count" style="margin-left:8px;font-size:10px;color:var(--muted);font-family:var(--font-mono)"></span></h3>
      <div class="card-body">
      <div id="event-log" style="height:300px;overflow-y:auto;font-family:var(--font-mono);font-size:11px"></div>
      </div>
    </div>
  </div>


  <!-- Agents -->
  <div class="content-area" id="tab-agents">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px">
      <h3 style="margin:0;font-family:var(--font-tactical);font-size:20px;letter-spacing:0.1em;text-transform:uppercase">AGENT ROSTER</h3>
      <div style="display:flex; gap:8px; align-items:center">
        <span id="def-model-badge" style="font-family:var(--font-mono);font-size:9px;color:var(--muted);letter-spacing:0.16em;margin-right:4px"></span>
        <button class="btn" onclick="openDefaultsModal()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;vertical-align:-1px"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.4 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.4 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.4-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.4-1.9l-.1-.1A2 2 0 116.9 4.5l.1.1a1.7 1.7 0 001.9.4h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.4l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.4 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>Defaults
        </button>
        <button class="btn primary" onclick="openAgentModal(null)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;vertical-align:-1px"><path d="M12 5v14M5 12h14"/></svg>Enroll Agent
        </button>
      </div>
    </div>

    <div class="agents-panels">
      <!-- LEFT: ROSTER -->
      <div class="card" style="margin-bottom:0">
        <h3 style="margin:0;padding:16px 16px 14px;border-bottom:1px solid var(--border)">
          <svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          ROSTER
        </h3>
        <div class="filter-bar">
          <button class="filter-btn active" data-filter="all" onclick="setAgentFilter('all')">ALL</button>
          <button class="filter-btn" data-filter="active" onclick="setAgentFilter('active')">ACTIVE</button>
          <button class="filter-btn" data-filter="idle" onclick="setAgentFilter('idle')">IDLE</button>
          <button class="filter-btn" data-filter="offline" onclick="setAgentFilter('offline')">OFFLINE</button>
        </div>
        <div class="roster-head">
          <div>№</div><div>ID</div><div>MODEL</div><div>SESS</div><div>TOKENS</div><div>STATUS</div>
        </div>
        <div id="agents-roster"></div>
      </div>

      <!-- RIGHT: DOSSIER -->
      <div class="card" style="margin-bottom:0">
        <h3 style="margin:0;padding:16px 16px 14px;border-bottom:1px solid var(--border)">
          <svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          DOSSIER
        </h3>
        <div id="agents-dossier" class="card-body" style="padding:20px 20px 24px">
          <div class="dossier-empty">SELECT AN AGENT</div>
        </div>
      </div>
    </div>

    <!-- hidden spans for defaults used by renderDefaults() -->
    <span id="def-model" style="display:none"></span>
    <span id="def-tools" style="display:none"></span>
    <span id="def-sandbox" style="display:none"></span>
    <span id="def-timeout" style="display:none"></span>
    <span id="def-daily" style="display:none"></span>
    <span id="def-monthly" style="display:none"></span>
    <span id="def-cost" style="display:none"></span>
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

  <!-- Teams -->
  <div class="content-area" id="tab-teams">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px">
      <h3 style="margin:0;font-family:var(--font-tactical);font-size:20px;letter-spacing:0.1em;text-transform:uppercase">WORKING TEAMS</h3>
      <button class="btn primary" onclick="openTeamModal(null)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;vertical-align:-1px"><path d="M12 5v14M5 12h14"/></svg>New Team
      </button>
    </div>
    <div class="agents-panels">
      <!-- LEFT: Teams roster -->
      <div class="card" style="margin-bottom:0">
        <h3 style="margin:0;padding:16px 16px 14px;border-bottom:1px solid var(--border)">
          <svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="3"/><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="7" r="2"/><path d="M15 19c0-2.5 1.8-4.5 4-5"/></svg>
          ROSTER
        </h3>
        <div class="roster-head" style="grid-template-columns:36px 1fr 1.5fr 0.7fr">
          <div>№</div><div>NAME</div><div>LEAD</div><div>MEMBERS</div>
        </div>
        <div id="teams-roster"></div>
      </div>
      <!-- RIGHT: Team brief -->
      <div class="card" style="margin-bottom:0">
        <h3 style="margin:0;padding:16px 16px 14px;border-bottom:1px solid var(--border)">
          <svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          BRIEF
        </h3>
        <div id="teams-dossier" class="card-body" style="padding:20px 20px 24px">
          <div class="dossier-empty">SELECT A TEAM</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Roles -->
  <div class="content-area" id="tab-roles">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px">
      <h3 style="margin:0;font-family:var(--font-tactical);font-size:20px;letter-spacing:0.1em;text-transform:uppercase">ROLE REGISTRY</h3>
      <button class="btn primary" onclick="openRoleModal(null)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;vertical-align:-1px"><path d="M12 5v14M5 12h14"/></svg>New Role
      </button>
    </div>
    <div class="agents-panels">
      <!-- LEFT: Roles roster -->
      <div class="card" style="margin-bottom:0">
        <h3 style="margin:0;padding:16px 16px 14px;border-bottom:1px solid var(--border)">
          <svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
          REGISTRY
        </h3>
        <div class="roster-head" style="grid-template-columns:36px 1fr 1.5fr 1fr">
          <div>№</div><div>NAME</div><div>ID</div><div>DELEGATES</div>
        </div>
        <div id="roles-roster"></div>
      </div>
      <!-- RIGHT: Role profile -->
      <div class="card" style="margin-bottom:0">
        <h3 style="margin:0;padding:16px 16px 14px;border-bottom:1px solid var(--border)">
          <svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          PROFILE
        </h3>
        <div id="roles-dossier" class="card-body" style="padding:20px 20px 24px">
          <div class="dossier-empty">SELECT A ROLE</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Skills -->
  <div class="content-area" id="tab-skills">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px">
      <h3 style="margin:0;font-family:var(--font-tactical);font-size:20px;letter-spacing:0.1em;text-transform:uppercase">SKILL MANAGEMENT</h3>
      <div style="display:flex; gap:12px">
        <button class="btn" onclick="refreshSkills()">Refresh Skills</button>
      </div>
    </div>
    <div class="card">
      <h3><svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/></svg> Installed Skills</h3>
      <div class="card-body" style="padding-top:8px">
      <table id="skills-tbl" style="width:100%">
        <thead><tr><th>Name</th><th>Version</th><th>Description</th><th>Status</th></tr></thead>
        <tbody></tbody>
      </table>
      </div>
    </div>
  </div>

  <!-- MCP -->
  <div class="content-area" id="tab-mcp">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px">
      <h3 style="margin:0;font-family:var(--font-tactical);font-size:20px;letter-spacing:0.1em;text-transform:uppercase">MCP SERVERS</h3>
    </div>
    <div class="card">
      <h3><svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 11-12 0V8zM12 18v4"/></svg> Connected Servers</h3>
      <div class="card-body" style="padding-top:8px">
      <table id="mcp-tbl" style="width:100%">
        <thead><tr><th>Name</th><th>Tools</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody></tbody>
      </table>
      </div>
    </div>
  </div>

  <!-- Messaging -->
  <div class="content-area" id="tab-messaging">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px">
      <h3 style="margin:0;font-family:var(--font-tactical);font-size:20px;letter-spacing:0.1em;text-transform:uppercase">MESSAGING ADAPTERS</h3>
    </div>
    <div class="card">
      <h3><svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H8l-4 4V5z"/></svg> Platform Status</h3>
      <div class="card-body" style="padding-top:8px">
      <table id="msg-tbl" style="width:100%">
        <thead><tr><th>Platform</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody></tbody>
      </table>
      </div>
    </div>
  </div>

  <div class="content-area" id="tab-creds">
    <div class="grid-2">
      <!-- Anthropic -->
      <div class="card">
        <h3><svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M16 6l3 3M14 8l3 3"/></svg> Anthropic</h3>
        <div class="card-body">
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
      </div>

      <!-- Google -->
      <div class="card">
        <h3><svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M16 6l3 3M14 8l3 3"/></svg> Google</h3>
        <div class="card-body">
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
      </div>

      <!-- OpenRouter -->
      <div class="card">
        <h3><svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg> OpenRouter</h3>
        <div class="card-body">
        <div style="font-size:12px;margin-bottom:12px">Status: <span id="or-status">...</span></div>
        <input type="password" id="or-key" class="login-input" placeholder="sk-or-v1-...">
        <button class="btn primary" onclick="saveOpenRouterKey()">Save Key</button>
        <div id="or-msg" style="margin-top:12px;font-size:12px;min-height:16px"></div>
        <button class="btn danger" style="margin-top:12px" onclick="clearCred('openrouter', 'or-status', 'or-msg')">Clear</button>
        </div>
      </div>

      <!-- Telegram -->
      <div class="card">
        <h3><svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-7-7 18-3-8-8-3z"/></svg> Telegram Bot</h3>
        <div class="card-body">
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
  const icon = $('theme-icon');
  if (icon) {
    icon.innerHTML = mode === 'dark'
      ? '<path d="M20 14a8 8 0 11-9-11 6 6 0 009 11z"/>'
      : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  }
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
    status:    ['SYSTEM', 'STATUS',      'OVERVIEW / №01'],
    agents:    ['MODEL',  'AGENTS',      'OVERVIEW / №02'],
    teams:     ['WORKING','TEAMS',       'OVERVIEW / №03'],
    roles:     ['ROLE',   'REGISTRY',    'OVERVIEW / №04'],
    skills:    ['SKILL',  'REGISTRY',    'OVERVIEW / №05'],
    mcp:       ['MCP',    'SERVERS',     'OVERVIEW / №06'],
    messaging: ['MSG',    'ADAPTERS',    'OVERVIEW / №07'],
    chat:      ['LIVE',   'CHAT',        'OVERVIEW / №08'],
    creds:     ['API',    'CREDENTIALS', 'OVERVIEW / №09'],
  };
  const [prefix, accent, overview] = titles[name] || [name.toUpperCase(), '', ''];
  $('view-title').innerHTML = prefix + (accent ? ' <span class="title-accent">' + accent + '</span>' : '');
  $('view-overview').textContent = overview;

  ['status','agents','teams','roles','skills','mcp','messaging','chat','creds'].forEach(t => {
    const content = $('tab-' + t);
    if (content) content.classList.toggle('active', t === name);

    const ntab = $('ntab-' + t);
    if (ntab) {
      ntab.classList.toggle('active', t === name);
      const arrow = ntab.querySelector('.nav-arrow');
      if (arrow) (arrow as HTMLElement).style.display = t === name ? '' : 'none';
    }
  });
  if (name === 'agents') loadAgents();
  if (name === 'teams')  loadTeams();
  if (name === 'roles')  loadTeams();
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
let agentEditId    = null;   // null = create mode, string = edit mode
let agentsData     = { list: [], defaults: {} };
let selectedAgentId = null;
let agentFilter    = 'all';

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
  // Hidden spans kept for modal compatibility
  $('def-model').textContent   = d.model?.primary   || '';
  $('def-tools').textContent   = d.tools?.profile    || '';
  $('def-sandbox').textContent = d.sandbox?.mode     || '';
  $('def-timeout').textContent = d.timeoutSeconds    ? d.timeoutSeconds + 's' : '';
  $('def-daily').textContent   = d.budget?.dailyTokens   ? d.budget.dailyTokens.toLocaleString() : '';
  $('def-monthly').textContent = d.budget?.monthlyTokens ? d.budget.monthlyTokens.toLocaleString() : '';
  $('def-cost').textContent    = d.budget?.monthlyCost   ? '$' + d.budget.monthlyCost : '';
  // Show default model badge in header
  const badge = $('def-model-badge');
  if (badge) badge.textContent = d.model?.primary ? 'DEFAULT · ' + (d.model.primary.split('/').pop() || d.model.primary) : '';
}

function setAgentFilter(f) {
  agentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', (b as HTMLElement).dataset.filter === f);
  });
  renderRoster(agentsData.list || []);
}

function renderAgentCards(list) {
  renderRoster(list);
  // If selected agent was removed, clear dossier
  if (selectedAgentId && !list.find(a => a.id === selectedAgentId)) {
    selectedAgentId = null;
    $('agents-dossier').innerHTML = '<div class="dossier-empty">SELECT AN AGENT</div>';
  } else if (selectedAgentId) {
    const a = list.find(x => x.id === selectedAgentId);
    if (a) renderAgentDossier(a, list);
  }
}

function renderRoster(list) {
  const roster = $('agents-roster');
  const filtered = agentFilter === 'all' ? list : list.filter(_a => agentFilter === 'offline');
  if (!filtered || filtered.length === 0) {
    roster.innerHTML = '<div class="empty" style="padding:24px 16px">' + (list.length === 0 ? 'No agents enrolled yet.' : 'No agents match filter.') + '</div>';
    return;
  }
  roster.innerHTML = filtered.map((a, i) => {
    const model = (a.model?.primary || '').split('/').pop() || '—';
    const isSelected = a.id === selectedAgentId;
    const aid = esc(a.id);
    const statusColor = a.default ? 'var(--accent)' : 'var(--muted)';
    const statusLabel = a.default ? 'DEFAULT' : 'IDLE';
    return '<div class="roster-row' + (isSelected ? ' selected' : '') + '" data-aid="' + aid + '" onclick="selectAgent(this.dataset.aid)">'
      + '<div class="r-num">' + String(i + 1).padStart(2, '0') + '</div>'
      + '<div class="r-id">' + aid + (a.name ? '<small>' + esc(a.name) + '</small>' : '') + '</div>'
      + '<div class="r-model">' + esc(model) + '</div>'
      + '<div class="r-stat">—</div>'
      + '<div class="r-stat">—</div>'
      + '<div class="r-stat" style="color:' + statusColor + '">' + statusLabel + '</div>'
      + '</div>';
  }).join('');
}

function selectAgent(id) {
  selectedAgentId = id;
  // Update row selection highlight
  document.querySelectorAll('.roster-row').forEach(r => {
    r.classList.toggle('selected', (r as HTMLElement).dataset.aid === id);
  });
  const a = (agentsData.list || []).find(x => x.id === id);
  if (a) renderAgentDossier(a, agentsData.list || []);
}

function renderAgentDossier(a, list) {
  const idx = list.findIndex(x => x.id === a.id);
  const num = String(idx + 1).padStart(3, '0');
  const model    = a.model?.primary  || '—';
  const modelShort = model.split('/').pop() || model;
  const provider = model.includes('/') ? model.split('/')[0] : '—';
  const tools    = a.tools?.profile  || '—';
  const sandbox  = a.sandbox?.mode   || '—';
  const timeout  = a.timeoutSeconds  ? a.timeoutSeconds + 's' : (agentsData.defaults as any)?.timeoutSeconds ? (agentsData.defaults as any).timeoutSeconds + 's' : '—';
  const statusLabel = a.default ? 'DEFAULT' : 'IDLE';
  const statusColor = a.default ? 'var(--accent)' : 'var(--muted)';
  const aid = esc(a.id);

  $('agents-dossier').innerHTML =
    '<div class="dossier-num">AGENT №' + num + '</div>'
    + '<div class="dossier-name">' + aid + '</div>'
    + '<div class="dossier-pill-row">'
    +   '<span class="badge" style="color:' + statusColor + '">' + statusLabel + '</span>'
    +   '<span class="dossier-provider">' + esc(provider) + '</span>'
    + '</div>'
    + (a.personality ? '<div class="dossier-desc">' + esc(a.personality) + '</div>' : '')
    + '<div class="dossier-config-label">MODEL CONFIG</div>'
    + '<div class="dossier-config">'
    +   '<div class="dossier-config-cell"><div class="dossier-config-cell-label">MODEL</div><div class="dossier-config-cell-val">' + esc(modelShort) + '</div></div>'
    +   '<div class="dossier-config-cell"><div class="dossier-config-cell-label">PROVIDER</div><div class="dossier-config-cell-val">' + esc(provider) + '</div></div>'
    +   '<div class="dossier-config-cell"><div class="dossier-config-cell-label">TOOLS</div><div class="dossier-config-cell-val">' + esc(tools) + '</div></div>'
    +   '<div class="dossier-config-cell"><div class="dossier-config-cell-label">SANDBOX</div><div class="dossier-config-cell-val">' + esc(sandbox) + '</div></div>'
    +   '<div class="dossier-config-cell"><div class="dossier-config-cell-label">TIMEOUT</div><div class="dossier-config-cell-val">' + esc(timeout) + '</div></div>'
    +   '<div class="dossier-config-cell"><div class="dossier-config-cell-label">WORKSPACE</div><div class="dossier-config-cell-val">' + esc(a.workspace || '.') + '</div></div>'
    + '</div>'
    + '<div class="dossier-actions">'
    +   '<button class="btn primary" style="font-size:11px" data-aid="' + aid + '" onclick="editAgentById(this.dataset.aid)">Edit</button>'
    +   (!a.default ? '<button class="btn" style="font-size:11px" data-aid="' + aid + '" onclick="setDefaultAgent(this.dataset.aid)">Set Default</button>' : '')
    +   '<button class="btn danger" style="font-size:11px;margin-left:auto" data-aid="' + aid + '" onclick="deleteAgent(this.dataset.aid)">Delete</button>'
    + '</div>';
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
let roleEditId    = null;   // null = create, string = edit
let teamEditId    = null;
let runTeamId     = null;
let selectedRoleId = null;
let selectedTeamId = null;

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
  const roster = $('roles-roster');
  if (!roster) return;
  if (!roles || roles.length === 0) {
    roster.innerHTML = '<div class="empty" style="padding:24px 16px">No roles defined yet.</div>';
    if (selectedRoleId) { selectedRoleId = null; const d = $('roles-dossier'); if (d) d.innerHTML = '<div class="dossier-empty">SELECT A ROLE</div>'; }
    return;
  }
  roster.innerHTML = roles.map((r, i) => {
    const rid = esc(r.id);
    const delegateCount = (r.canDelegateTo || []).length;
    const isSelected = r.id === selectedRoleId;
    return '<div class="roster-row' + (isSelected ? ' selected' : '') + '" style="grid-template-columns:36px 1fr 1.5fr 1fr" data-rid="' + rid + '" onclick="selectRole(this.dataset.rid)">'
      + '<div class="r-num">' + String(i + 1).padStart(2, '0') + '</div>'
      + '<div class="r-id">' + esc(r.name) + '</div>'
      + '<div class="r-model">' + rid + '</div>'
      + '<div class="r-stat">' + (delegateCount ? delegateCount + ' roles' : '—') + '</div>'
      + '</div>';
  }).join('');
  // Refresh dossier if a role is selected
  if (selectedRoleId) {
    const sel = roles.find(r => r.id === selectedRoleId);
    if (sel) renderRoleDossier(sel, roles);
  }
}

function selectRole(id) {
  selectedRoleId = id;
  document.querySelectorAll('#roles-roster .roster-row').forEach(r => {
    r.classList.toggle('selected', (r as HTMLElement).dataset.rid === id);
  });
  const role = (teamsData.roles || []).find(r => r.id === id);
  if (role) renderRoleDossier(role, teamsData.roles || []);
}

function renderRoleDossier(role, roles) {
  const idx = roles.findIndex(r => r.id === role.id);
  const num = String(idx + 1).padStart(3, '0');
  const rid = esc(role.id);
  const delegates = (role.canDelegateTo || []);
  const resp = (role.responsibilities || []);

  $('roles-dossier').innerHTML =
    '<div class="dossier-num">ROLE №' + num + '</div>'
    + '<div class="dossier-name">' + esc(role.name) + '</div>'
    + '<div class="dossier-pill-row">'
    +   '<span class="badge" style="color:var(--accent)">' + rid + '</span>'
    + '</div>'
    + (role.description ? '<div class="dossier-desc">' + esc(role.description) + '</div>' : '')
    + (resp.length ? '<div class="dossier-config-label">RESPONSIBILITIES</div><ul class="dossier-resp-list">' + resp.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '')
    + (delegates.length ? '<div class="dossier-config-label">CAN DELEGATE TO</div><div class="dossier-delegate">' + delegates.map(d => '<span>' + esc(d) + '</span>').join(' · ') + '</div>' : '')
    + (role.systemPromptPrefix ? '<div class="dossier-config-label">SYSTEM PROMPT</div><div class="dossier-sysprompt">' + esc(role.systemPromptPrefix) + '</div>' : '')
    + '<div class="dossier-actions">'
    +   '<button class="btn primary" style="font-size:11px" data-rid="' + rid + '" onclick="editRoleById(this.dataset.rid)">Edit</button>'
    +   '<button class="btn danger" style="font-size:11px;margin-left:auto" data-rid="' + rid + '" onclick="deleteRole(this.dataset.rid)">Delete</button>'
    + '</div>';
}

// ── Teams render ────────────────────────────────────────────────
function renderTeams(teams, roles) {
  const roster = $('teams-roster');
  if (!roster) return;
  if (!teams || teams.length === 0) {
    roster.innerHTML = '<div class="empty" style="padding:24px 16px">No teams yet.</div>';
    if (selectedTeamId) { selectedTeamId = null; const d = $('teams-dossier'); if (d) d.innerHTML = '<div class="dossier-empty">SELECT A TEAM</div>'; }
    return;
  }
  const roleMap = {};
  roles.forEach(r => { roleMap[r.id] = r; });

  roster.innerHTML = teams.map((t, i) => {
    const tid = esc(t.id);
    const memberCount = (t.members || []).length;
    const isSelected = t.id === selectedTeamId;
    return '<div class="roster-row' + (isSelected ? ' selected' : '') + '" style="grid-template-columns:36px 1fr 1.5fr 0.7fr" data-tid="' + tid + '" onclick="selectTeam(this.dataset.tid)">'
      + '<div class="r-num">' + String(i + 1).padStart(2, '0') + '</div>'
      + '<div class="r-id">' + esc(t.name) + '</div>'
      + '<div class="r-model">' + esc(t.leadAgentId || '—') + '</div>'
      + '<div class="r-stat">' + memberCount + '</div>'
      + '</div>';
  }).join('');
  // Refresh dossier if a team is selected
  if (selectedTeamId) {
    const sel = teams.find(t => t.id === selectedTeamId);
    if (sel) renderTeamDossier(sel, teams, roleMap);
  }
}

function selectTeam(id) {
  selectedTeamId = id;
  document.querySelectorAll('#teams-roster .roster-row').forEach(r => {
    r.classList.toggle('selected', (r as HTMLElement).dataset.tid === id);
  });
  const team = (teamsData.teams || []).find(t => t.id === id);
  const roleMap = {};
  (teamsData.roles || []).forEach(r => { roleMap[r.id] = r; });
  if (team) renderTeamDossier(team, teamsData.teams || [], roleMap);
}

function renderTeamDossier(team, teams, roleMap) {
  const idx = teams.findIndex(t => t.id === team.id);
  const num = String(idx + 1).padStart(3, '0');
  const tid = esc(team.id);
  const members = team.members || [];

  const memberSlots = members.map(m => {
    const isLead = m.agentId === team.leadAgentId;
    const roleName = roleMap[m.roleId] ? roleMap[m.roleId].name : (m.roleId || '—');
    return '<div class="member-slot' + (isLead ? ' lead' : '') + '">'
      + '<div class="member-slot-role">' + esc(roleName) + (isLead ? ' · LEAD' : '') + '</div>'
      + '<div class="member-slot-agent">@' + esc(m.agentId) + '</div>'
      + '</div>';
  }).join('');

  $('teams-dossier').innerHTML =
    '<div class="dossier-num">TEAM №' + num + '</div>'
    + '<div class="dossier-name">' + esc(team.name) + '</div>'
    + '<div class="dossier-pill-row">'
    +   '<span class="badge" style="color:var(--accent)">LEAD · ' + esc(team.leadAgentId || '—') + '</span>'
    + '</div>'
    + (team.sharedGoal ? '<div class="dossier-goal">' + esc(team.sharedGoal) + '</div>' : '')
    + '<div class="dossier-config-label">MEMBERS (' + members.length + ')</div>'
    + (members.length ? '<div class="member-list">' + memberSlots + '</div>' : '<div class="empty" style="margin-bottom:20px">No members assigned.</div>')
    + '<div class="dossier-actions">'
    +   '<button class="btn primary" style="font-size:11px" data-tid="' + tid + '" onclick="editTeamById(this.dataset.tid)">Edit</button>'
    +   '<button class="btn" style="font-size:11px" data-tid="' + tid + '" onclick="openRunModal(this.dataset.tid)">▶ Run</button>'
    +   '<button class="btn danger" style="font-size:11px;margin-left:auto" data-tid="' + tid + '" onclick="deleteTeam(this.dataset.tid)">Delete</button>'
    + '</div>';
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
