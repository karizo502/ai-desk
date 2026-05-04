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
.nav-scroll { flex: 1; overflow-y: auto; }
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

/* ── History Specific ──────────────────────────────────── */
#tab-history { padding: 0; height: 100%; display: none; flex-direction: column; }
#tab-history.active { display: flex; }
.hist-layout { flex: 1; display: grid; grid-template-columns: 300px 1fr; min-height: 0; overflow: hidden; }
.hist-left { display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid var(--border); }
.hist-right { display: flex; flex-direction: column; overflow: hidden; }
.hist-session-item { display: block; width: 100%; box-sizing: border-box; padding: 14px 16px; border-bottom: 1px solid var(--border); cursor: pointer; background: transparent; border-left: 3px solid transparent; text-align: left; transition: background 0.1s; }
.hist-session-item:hover { background: var(--bg-card); }
.hist-session-item.selected { background: var(--accent-soft); border-left-color: var(--accent); }
.hist-msg-row { display: grid; grid-template-columns: 52px 1fr; gap: 14px; align-items: flex-start; }
.hist-avatar { width: 44px; height: 44px; display: grid; place-items: center; font-family: var(--font-tactical); font-size: 20px; line-height: 1; flex-shrink: 0; }
.hist-msg-body { border: 1px solid var(--border); padding: 12px 16px; font-size: 13.5px; line-height: 1.6; color: var(--text); }
.hist-tool-bar { margin: 4px 0 4px 66px; padding: 6px 12px; background: var(--bg-input); border: 1px solid var(--border); font-family: var(--font-mono); font-size: 10px; color: var(--muted); }
.hist-code-block { margin-top: 8px; padding: 8px 10px; background: var(--bg); border: 1px solid var(--border); font-family: var(--font-mono); font-size: 11px; color: var(--accent); overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 120px; overflow-y: auto; }
#chat-messages { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.msg-bubble { border-radius: 16px !important; padding: 12px 18px !important; font-size: 14px !important; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
#chat-input-row { padding: 20px 24px; background: var(--bg-card); border-top: 1px solid var(--border); }
#chat-input { border-radius: 12px !important; padding: 12px 16px !important; }
/* ── Tool Approval Card ─────────────────────────────────── */
.approval-card { background: var(--bg-card); border: 1px solid #c4954a; border-left: 3px solid #c4954a; border-radius: 12px; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; animation: slideIn 0.15s ease; }
@keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.approval-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.approval-title { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.18em; color: #c4954a; text-transform: uppercase; }
.approval-countdown { font-family: var(--font-mono); font-size: 10px; color: var(--muted); }
.approval-countdown.urgent { color: var(--red); }
.approval-tool { font-family: var(--font-mono); font-size: 15px; font-weight: 700; color: var(--text); }
.approval-reason { font-size: 11px; color: var(--muted); font-style: italic; }
.approval-input { background: var(--bg-input); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-family: var(--font-mono); font-size: 10px; color: var(--muted); max-height: 80px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; }
.approval-actions { display: flex; gap: 8px; margin-top: 2px; }
.approval-actions .btn-approve { background: #2a4a2a; color: #6fcf6f; border: 1px solid #4a7a4a; padding: 7px 20px; border-radius: 8px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; cursor: pointer; letter-spacing: 0.1em; transition: background 0.1s; }
.approval-actions .btn-approve:hover { background: #3a6a3a; }
.approval-actions .btn-deny { background: #4a2020; color: #cf6f6f; border: 1px solid #7a4040; padding: 7px 20px; border-radius: 8px; font-family: var(--font-mono); font-size: 11px; font-weight: 700; cursor: pointer; letter-spacing: 0.1em; transition: background 0.1s; }
.approval-actions .btn-deny:hover { background: #6a2a2a; }

/* ── Notification Bell ──────────────────────────────────── */
.notif-bell-btn { position: relative; background: none; border: none; cursor: pointer; padding: 6px 8px; color: var(--muted); transition: color 0.15s; display: flex; align-items: center; border-radius: 6px; }
.notif-bell-btn:hover { color: var(--text); background: var(--bg-card); }
.notif-bell-btn.has-pending { color: var(--accent); }
.notif-badge { position: absolute; top: 1px; right: 1px; background: var(--red); color: #fff; font-family: var(--font-mono); font-size: 9px; font-weight: 700; min-width: 16px; height: 16px; border-radius: 8px; display: none; align-items: center; justify-content: center; padding: 0 3px; line-height: 1; pointer-events: none; }
.notif-panel { position: fixed; top: 56px; right: 16px; width: 380px; max-height: 560px; overflow-y: auto; background: var(--bg-sidebar); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.35); z-index: 500; display: none; flex-direction: column; }
.notif-panel.open { display: flex; }
.notif-panel-hdr { padding: 12px 16px; border-bottom: 1px solid var(--border); font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.2em; color: var(--muted); text-transform: uppercase; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.notif-panel-close { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 18px; line-height: 1; padding: 0 4px; }
.notif-panel-close:hover { color: var(--text); }
.notif-panel-empty { padding: 32px 16px; text-align: center; font-family: var(--font-mono); font-size: 10px; color: var(--dim); letter-spacing: 0.2em; }
.notif-item { padding: 14px 16px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; background: var(--bg-card); cursor: pointer; transition: background 0.1s; }
.notif-item:last-child { border-bottom: none; }
.notif-item:hover { background: rgba(196,149,74,0.06); }
.notif-item-hdr { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.notif-item-tool { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--text); }
.notif-item-cd { font-family: var(--font-mono); font-size: 10px; color: var(--muted); flex-shrink: 0; }
.notif-item-cd.urgent { color: var(--red); }
.notif-item-reason { font-size: 11px; color: var(--muted); font-style: italic; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.notif-item-hint { font-family: var(--font-mono); font-size: 9px; color: var(--dim); letter-spacing: 0.12em; text-transform: uppercase; margin-top: 2px; }
/* Approval detail popup */
.approval-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 800; display: none; align-items: center; justify-content: center; }
.approval-modal-bg.open { display: flex; }
.approval-modal { background: var(--bg-sidebar); border: 1px solid #c4954a; border-radius: 14px; padding: 28px 28px 22px; width: 480px; max-width: calc(100vw - 32px); max-height: calc(100vh - 64px); overflow-y: auto; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 16px 48px rgba(0,0,0,0.5); }
.approval-modal-title { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.22em; color: #c4954a; text-transform: uppercase; }
.approval-modal-tool { font-family: var(--font-tactical); font-size: 26px; color: var(--text); line-height: 1; letter-spacing: 0.04em; }
.approval-modal-cd { font-family: var(--font-mono); font-size: 11px; color: var(--muted); }
.approval-modal-cd.urgent { color: var(--red); font-weight: 700; }
.approval-modal-reason { font-size: 12px; color: var(--muted); font-style: italic; line-height: 1.6; padding: 10px 14px; border-left: 2px solid var(--border); }
.approval-modal-input-label { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.2em; color: var(--dim); text-transform: uppercase; }
.approval-modal-input { background: var(--bg-input); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; font-family: var(--font-mono); font-size: 11px; color: var(--muted); max-height: 180px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; line-height: 1.5; }
.approval-modal-actions { display: flex; gap: 10px; margin-top: 6px; }
.approval-modal-actions .btn-approve { flex: 1; background: #2a4a2a; color: #6fcf6f; border: 1px solid #4a7a4a; padding: 10px 0; border-radius: 8px; font-family: var(--font-mono); font-size: 12px; font-weight: 700; cursor: pointer; letter-spacing: 0.1em; transition: background 0.1s; }
.approval-modal-actions .btn-approve:hover { background: #3a6a3a; }
.approval-modal-actions .btn-deny { flex: 1; background: #4a2020; color: #cf6f6f; border: 1px solid #7a4040; padding: 10px 0; border-radius: 8px; font-family: var(--font-mono); font-size: 12px; font-weight: 700; cursor: pointer; letter-spacing: 0.1em; transition: background 0.1s; }
.approval-modal-actions .btn-deny:hover { background: #6a2a2a; }
@keyframes bellShake { 0%,100%{transform:rotate(0)} 15%{transform:rotate(12deg)} 30%{transform:rotate(-10deg)} 45%{transform:rotate(7deg)} 60%{transform:rotate(-5deg)} 75%{transform:rotate(3deg)} }
.notif-bell-btn.shake { animation: bellShake 0.5s ease; }
@keyframes notifToast { 0%{opacity:0;transform:translateY(-8px)} 10%{opacity:1;transform:translateY(0)} 80%{opacity:1} 100%{opacity:0;transform:translateY(-8px)} }
.notif-toast { position: fixed; top: 60px; left: 50%; transform: translateX(-50%); background: #2d2010; border: 1px solid var(--accent); border-radius: 8px; padding: 10px 18px; font-family: var(--font-mono); font-size: 11px; color: var(--accent); letter-spacing: 0.08em; z-index: 600; pointer-events: none; animation: notifToast 3s ease forwards; white-space: nowrap; }

/* ── Budget Progress Bars ───────────────────────────────── */
.budget-bar-row { margin-bottom: 22px; }
.budget-bar-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.budget-bar-key { font-family: var(--font-mono); font-size: 10px; letter-spacing: .22em; color: var(--muted); text-transform: uppercase; }
.budget-bar-val { font-family: var(--font-mono); font-size: 11px; }
.budget-bar-val .used { color: var(--accent); font-weight: 700; }
.budget-bar-val .cap  { color: var(--dim); }
.budget-bar-track-row { display: flex; align-items: center; gap: 12px; }
.budget-bar-track { flex: 1; height: 6px; background: rgba(244,239,229,0.06); position: relative; overflow: hidden; }
.theme-light .budget-bar-track { background: rgba(0,0,0,0.08); }
.budget-bar-fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--accent); transition: width 0.4s ease; background-image: repeating-linear-gradient(45deg, rgba(0,0,0,0.18) 0, rgba(0,0,0,0.18) 1px, transparent 0, transparent 50%); background-size: 5px 5px; }
.budget-bar-fill.warn { background-color: var(--yellow); }
.budget-bar-fill.danger { background-color: var(--red); }
.budget-bar-pct { font-family: var(--font-tactical); font-size: 24px; color: var(--text); line-height: 1; min-width: 50px; text-align: right; }
.budget-bar-pct small { font-family: var(--font-mono); font-size: 11px; color: var(--muted); margin-left: 2px; }
.budget-spend { margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--border); display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; }
.budget-spend-left {}
.budget-spend-title { font-family: var(--font-mono); font-size: 10px; letter-spacing: .24em; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; }
.budget-spend-amount { font-family: var(--font-tactical); font-size: 56px; line-height: 0.9; color: var(--text); letter-spacing: .005em; }
.budget-spend-amount .accent { color: var(--accent); }
.budget-spend-sub { font-family: var(--font-mono); font-size: 10px; letter-spacing: .18em; color: var(--muted); margin-top: 6px; }
.budget-status-badge { padding: 6px 10px; border: 2px solid var(--accent); color: var(--accent); font-family: var(--font-tactical); font-size: 18px; letter-spacing: .10em; transform: rotate(-4deg); transform-origin: right bottom; white-space: nowrap; }
.budget-status-badge.over { border-color: var(--red); color: var(--red); }

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
.roster-row { display: grid; grid-template-columns: 36px 28px 1fr 2fr 0.7fr 0.7fr 0.9fr; gap: 0; padding: 10px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.1s; font-size: 12px; align-items: center; border-left: 2px solid transparent; }
.roster-row:last-child { border-bottom: none; }
.roster-row:hover { background: rgba(244,239,229,0.03); }
.roster-row.selected { background: var(--accent-soft); border-left-color: var(--accent); padding-left: 14px; }
.roster-row .r-num { font-family: var(--font-mono); font-size: 9px; color: var(--dim); }
.roster-row .r-avatar { display: flex; align-items: center; }
.roster-row .r-id { font-family: var(--font-mono); font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.roster-row .r-id small { display: block; font-size: 9px; color: var(--muted); font-weight: 400; margin-top: 1px; }
.roster-row .r-model { color: var(--muted); font-size: 10px; font-family: var(--font-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.roster-row .r-stat { font-size: 10px; color: var(--muted); font-family: var(--font-mono); }
.dossier-avatar { position: absolute; top: 0; right: 0; opacity: 0.85; }
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
.dossier-skills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
.dossier-skill-pill { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.14em; padding: 3px 8px; border: 1px solid var(--accent); color: var(--accent); border-radius: 2px; text-transform: uppercase; }
.skill-toggle-btn { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 10px; padding: 3px 10px; border-radius: 2px; cursor: pointer; border: 1px solid var(--border); background: var(--bg); color: var(--muted); transition: all 0.15s; }
.skill-toggle-btn.on { border-color: var(--accent); color: var(--accent); }
.skill-toggle-btn:hover { opacity: 0.8; }
.skill-toggle-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.ag-skills-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.ag-skill-check { display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 11px; color: var(--muted); cursor: pointer; padding: 6px 10px; border: 1px solid var(--border); border-radius: 2px; }
.ag-skill-check:has(input:checked) { border-color: var(--accent); color: var(--accent); }
.ag-skill-check input { accent-color: var(--accent); }
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
/* Projects tab */
.project-grid { display: grid; grid-template-columns: minmax(360px, 1.1fr) minmax(420px, 1.4fr); gap: 24px; align-items: start; }
.project-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 18px; }
.project-mini-list { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; }
.project-mini-row { border: 1px solid var(--border); background: var(--bg); padding: 9px 11px; cursor: pointer; display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; }
.project-mini-row:hover { border-color: var(--accent); }
.project-mini-title { font-family: var(--font-mono); font-size: 11px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-mini-meta { font-family: var(--font-mono); font-size: 9px; color: var(--muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-brief-box { width: 100%; min-height: 130px; resize: vertical; font-family: var(--font-mono); font-size: 11px; line-height: 1.5; margin-bottom: 10px; }
.project-run-card { border-left: 3px solid var(--border); }
.project-run-card.done { border-left-color: var(--green); }
.project-run-card.failed { border-left-color: var(--red); }
.project-run-card.running { border-left-color: var(--accent); }
.project-run-card.paused { border-left-color: var(--yellow); }
.project-task-row { border: 1px solid var(--border); padding: 9px 10px; display: grid; grid-template-columns: 1fr auto; gap: 10px; margin-bottom: 6px; background: var(--bg); }
.project-task-title { font-family: var(--font-mono); font-size: 11px; color: var(--text); }
.project-task-prompt { margin-top: 4px; font-family: var(--font-mono); font-size: 9px; line-height: 1.45; color: var(--muted); white-space: pre-wrap; max-height: 72px; overflow: hidden; }
@media (max-width: 1100px) { .project-grid, .project-detail-grid { grid-template-columns: 1fr; } }
/* keep avatar classes for modal compatibility */
.agent-avatar { width: 40px; height: 40px; border-radius: 0; border: 1px solid var(--accent); object-fit: cover; }
.agent-avatar-placeholder { width: 40px; height: 40px; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; font-family: var(--font-tactical); }
/* ── Workspace tab ───────────────────────────────────────────────── */
.ws-grid { display: grid; grid-template-columns: 1fr 2fr; gap: 16px; }
.ws-agent-list { display: flex; flex-direction: column; gap: 1px; background: var(--border); border: 1px solid var(--border); }
.ws-agent-row { background: var(--bg); padding: 11px 14px; display: flex; align-items: center; gap: 12px; }
.ws-agent-id { font-family: var(--font-mono); font-size: 11px; color: var(--text); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-agent-badge { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.14em; padding: 3px 7px; border: 1px solid; }
.ws-agent-badge.idle     { border-color: var(--muted); color: var(--muted); }
.ws-agent-badge.thinking { border-color: var(--accent); color: var(--accent); animation: ws-pulse 1.2s ease-in-out infinite; }
.ws-agent-badge.tool_use { border-color: var(--yellow); color: var(--yellow); }
.ws-agent-badge.waiting  { border-color: var(--red); color: var(--red); }
.ws-agent-detail { font-family: var(--font-mono); font-size: 9px; color: var(--muted); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@keyframes ws-pulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }
.ws-task-filters { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; align-items: center; }
.ws-task-board { display: flex; flex-direction: column; gap: 2px; }
.ws-task-card { background: var(--bg); border: 1px solid var(--border); padding: 10px 14px; display: grid; grid-template-columns: 14px 1fr auto auto; align-items: center; gap: 10px; transition: border-color 0.2s; }
.ws-task-card.running  { border-left: 3px solid var(--accent); }
.ws-task-card.done     { border-left: 3px solid var(--green); opacity: 0.7; }
.ws-task-card.failed   { border-left: 3px solid var(--red); }
.ws-task-card.skipped  { border-left: 3px solid var(--muted); opacity: 0.5; }
.ws-task-card.pending  { border-left: 3px solid var(--border); }
.ws-task-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex-shrink: 0; }
.ws-task-dot.running  { background: var(--accent); animation: ws-pulse 1.2s ease-in-out infinite; }
.ws-task-dot.done     { background: var(--green); }
.ws-task-dot.failed   { background: var(--red); }
.ws-task-dot.pending  { background: var(--border); }
.ws-task-label { font-family: var(--font-mono); font-size: 11px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ws-task-meta  { font-family: var(--font-mono); font-size: 9px; color: var(--muted); white-space: nowrap; }
.ws-task-agent { font-family: var(--font-mono); font-size: 9px; color: var(--muted); border: 1px solid var(--border); padding: 2px 6px; white-space: nowrap; }
.ws-task-step  { font-family: var(--font-mono); font-size: 9px; color: var(--accent); margin-top: 3px; }
.ws-team-header { padding: 8px 0 4px; font-family: var(--font-tactical); font-size: 12px; letter-spacing: 0.12em; color: var(--muted); border-bottom: 1px solid var(--border); margin-bottom: 4px; margin-top: 10px; display: flex; align-items: center; gap: 8px; }
.ws-team-header:first-child { margin-top: 0; }
.ws-team-status-dot { width: 7px; height: 7px; border-radius: 50%; }
.ws-empty { font-family: var(--font-mono); font-size: 11px; color: var(--muted); letter-spacing: 0.14em; text-align: center; padding: 40px 0; }
/* Flow DAG */
.ws-dag-section { margin-top: 24px; border-top: 1px solid var(--border); padding-top: 16px; }
.ws-dag-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; cursor: pointer; user-select: none; }
.ws-dag-title { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.22em; color: var(--muted); text-transform: uppercase; }
.ws-dag-toggle { font-family: var(--font-mono); font-size: 10px; color: var(--muted); }
.ws-dag-canvas { overflow: auto; }
svg.ws-dag-svg { display: block; }
.dag-node { cursor: default; }
.dag-node-rect { fill: var(--bg); stroke: var(--border); stroke-width: 1; rx: 0; }
.dag-node-rect.pending  { stroke: var(--border); }
.dag-node-rect.running  { stroke: var(--accent); stroke-width: 2; }
.dag-node-rect.done     { stroke: var(--green); }
.dag-node-rect.failed   { stroke: var(--red); }
.dag-node-rect.skipped  { stroke: var(--muted); opacity: 0.5; }
.dag-node-text { font-family: var(--font-mono); font-size: 9px; fill: var(--text-rgb, 255, 255, 255); dominant-baseline: middle; text-anchor: middle; pointer-events: none; }
.dag-node-status { font-family: var(--font-mono); font-size: 8px; dominant-baseline: middle; text-anchor: middle; pointer-events: none; }
.dag-node-status.running { fill: var(--accent); }
.dag-node-status.done    { fill: var(--green);  }
.dag-node-status.failed  { fill: var(--red);    }
.dag-node-status.skipped { fill: var(--muted);  }
.dag-node-status.pending { fill: var(--muted);  }
.dag-edge { fill: none; stroke: var(--border); stroke-width: 1; }
.dag-edge.active { stroke: var(--accent); }
.dag-edge.done   { stroke: var(--green); }
.dag-arrowhead { fill: var(--border); }
.dag-arrowhead.active { fill: var(--accent); }
.dag-arrowhead.done   { fill: var(--green); }
.dag-pulse { animation: ws-pulse 1.2s ease-in-out infinite; }
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
  <div class="nav-scroll">
    <div class="nav-section-label">WORK</div>
    <nav class="nav-group">
      <button class="nav-tab active" id="ntab-status" onclick="switchTab('status')">
        <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>
        Status<span class="nav-arrow">→</span>
      </button>
      <button class="nav-tab" id="ntab-chat" onclick="switchTab('chat')">
        <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        Chat<span class="nav-arrow">→</span>
      </button>
      <button class="nav-tab" id="ntab-workspace" onclick="switchTab('workspace')">
        <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 17.5h7M17.5 14v7"/></svg>
        Workspace<span class="nav-arrow">→</span>
      </button>
      <button class="nav-tab" id="ntab-projects" onclick="switchTab('projects')">
        <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M8 13h8"/></svg>
        Projects<span class="nav-arrow">→</span>
      </button>
    </nav>

    <div class="nav-section-label">BUILD</div>
    <nav class="nav-group">
      <button class="nav-tab" id="ntab-agents" onclick="switchTab('agents')">
        <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.4 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.4 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.4-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.4-1.9l-.1-.1A2 2 0 116.9 4.5l.1.1a1.7 1.7 0 001.9.4h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.4l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.4 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>
        Agents<span class="nav-arrow">→</span>
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
        Skills<span class="nav-arrow">→</span>
      </button>
      <button class="nav-tab" id="ntab-mcp" onclick="switchTab('mcp')">
        <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 11-12 0V8zM12 18v4"/></svg>
        MCP<span class="nav-arrow">→</span>
      </button>
    </nav>

    <div class="nav-section-label">AUTOMATE</div>
    <nav class="nav-group">
      <button class="nav-tab" id="ntab-schedule" onclick="switchTab('schedule')">
        <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
        Schedule<span class="nav-arrow">→</span>
      </button>
      <button class="nav-tab" id="ntab-webhooks" onclick="switchTab('webhooks')">
        <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 018-8"/><path d="M20 12a8 8 0 01-8 8"/><path d="M12 4v4M12 16v4M4 12H2M22 12h-2"/><circle cx="12" cy="12" r="3"/></svg>
        Webhooks<span class="nav-arrow">→</span>
      </button>
      <button class="nav-tab" id="ntab-messaging" onclick="switchTab('messaging')">
        <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H8l-4 4V5z"/></svg>
        Messaging<span class="nav-arrow">→</span>
      </button>
    </nav>

    <div class="nav-section-label">REVIEW</div>
    <nav class="nav-group">
      <button class="nav-tab" id="ntab-history" onclick="switchTab('history')">
        <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/><path d="M2.5 8.5A9 9 0 0112 3"/><path d="M2 5l1 5h5"/></svg>
        History<span class="nav-arrow">→</span>
      </button>
      <button class="nav-tab" id="ntab-audit" onclick="switchTab('audit')">
        <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
        Audit<span class="nav-arrow">→</span>
      </button>
    </nav>

    <div class="nav-section-label">SETTINGS</div>
    <nav class="nav-group">
      <button class="nav-tab" id="ntab-creds" onclick="switchTab('creds')">
        <svg class="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M16 6l3 3M14 8l3 3"/></svg>
        Credentials<span class="nav-arrow">→</span>
      </button>
    </nav>
  </div>
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
      <button class="notif-bell-btn" id="notif-bell" onclick="toggleNotifPanel()" title="Pending Approvals">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
        <span class="notif-badge" id="notif-badge">0</span>
      </button>
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

  <!-- Projects -->
  <div class="content-area" id="tab-projects">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;gap:16px;flex-wrap:wrap">
      <h3 style="margin:0;font-family:var(--font-tactical);font-size:20px;letter-spacing:0.1em;text-transform:uppercase">TEAM PROJECTS</h3>
      <div style="display:flex;gap:8px;align-items:center">
        <select id="project-team-filter" onchange="loadProjects()" style="min-width:180px">
          <option value="">All teams</option>
        </select>
        <button class="btn" onclick="loadProjects()">Refresh</button>
      </div>
    </div>
    <div class="project-grid">
      <div class="card" style="margin-bottom:0">
        <h3 style="margin:0;padding:16px 16px 14px;border-bottom:1px solid var(--border)">
          <svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          PROJECTS
        </h3>
        <div class="roster-head" style="grid-template-columns:36px 1.3fr 0.8fr 0.7fr 0.7fr">
          <div>No</div><div>NAME</div><div>TEAM</div><div>RUNS</div><div>ISSUES</div>
        </div>
        <div id="projects-roster"><div class="dossier-empty">Loading...</div></div>
      </div>
      <div class="card" style="margin-bottom:0">
        <h3 style="margin:0;padding:16px 16px 14px;border-bottom:1px solid var(--border)">
          <svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
          DETAIL
        </h3>
        <div id="project-detail" class="card-body" style="padding:20px 20px 24px">
          <div class="dossier-empty">SELECT A PROJECT</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Workspace -->
  <div class="content-area" id="tab-workspace">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h3 style="margin:0;font-family:var(--font-tactical);font-size:20px;letter-spacing:0.1em;text-transform:uppercase">WORKSPACE</h3>
      <div style="display:flex;gap:8px;align-items:center">
        <span id="ws-live-dot" style="width:7px;height:7px;border-radius:50%;background:var(--muted);display:inline-block"></span>
        <span id="ws-live-label" style="font-family:var(--font-mono);font-size:10px;color:var(--muted);letter-spacing:0.14em">LOADING</span>
        <button class="btn" style="font-size:10px;padding:4px 10px" onclick="clearWorkspace()">Clear</button>
      </div>
    </div>
    <div class="ws-grid">
      <!-- LEFT: Agent Activity -->
      <div>
        <div style="font-family:var(--font-mono);font-size:9px;letter-spacing:0.22em;color:var(--muted);margin-bottom:10px;text-transform:uppercase">Agent Activity</div>
        <div id="ws-agents"><div class="ws-empty">NO AGENT DATA</div></div>
      </div>
      <!-- RIGHT: Task Board -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-family:var(--font-mono);font-size:9px;letter-spacing:0.22em;color:var(--muted);text-transform:uppercase">Task Board</div>
          <div class="ws-task-filters">
            <button class="btn active" id="wsf-all"     onclick="setWsFilter('all')"     style="font-size:9px;padding:3px 8px">ALL</button>
            <button class="btn"        id="wsf-running" onclick="setWsFilter('running')" style="font-size:9px;padding:3px 8px">RUNNING</button>
            <button class="btn"        id="wsf-done"    onclick="setWsFilter('done')"    style="font-size:9px;padding:3px 8px">DONE</button>
            <button class="btn"        id="wsf-failed"  onclick="setWsFilter('failed')"  style="font-size:9px;padding:3px 8px">FAILED</button>
          </div>
        </div>
        <div id="ws-tasks"><div class="ws-empty">NO TASKS YET — RUN A TEAM TO SEE WORK FLOW</div></div>
      </div>
    </div>
    <!-- DAG Visualizer -->
    <div class="ws-dag-section" id="ws-dag-section">
      <div class="ws-dag-header" onclick="toggleDag()">
        <span class="ws-dag-title">FLOW DIAGRAM</span>
        <span class="ws-dag-toggle" id="ws-dag-toggle-btn">[SHOW]</span>
      </div>
      <div id="ws-dag-body" style="display:none">
        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap" id="ws-dag-team-btns"></div>
        <div class="ws-dag-canvas" id="ws-dag-canvas">
          <div class="ws-empty">SELECT A TEAM RUN ABOVE TO SEE ITS FLOW DIAGRAM</div>
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
    <div class="card" style="margin-bottom:16px">
      <h3><svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H8l-4 4V5z"/></svg> Platform Status</h3>
      <div class="card-body" style="padding-top:8px">
      <table id="msg-tbl" style="width:100%">
        <thead><tr><th>Platform</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody></tbody>
      </table>
      </div>
    </div>

    <!-- Per-Agent Connections -->
    <div class="card" style="margin-bottom:16px">
      <h3>
        <svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v4M7 17l3-4M17 17l-3-4"/></svg>
        Per-Agent Connections
      </h3>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
          <div>
            <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px">LABEL</label>
            <input id="conn-label" class="login-input" style="margin-bottom:0" placeholder="e.g. Sales bot">
          </div>
          <div>
            <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px">PLATFORM</label>
            <select id="conn-platform" style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:10px 12px;border-radius:10px;font-size:13px">
              <option value="telegram">Telegram</option>
              <option value="discord">Discord</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px">AGENT</label>
            <select id="conn-agent" style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:10px 12px;border-radius:10px;font-size:13px">
              <option value="">— select agent —</option>
            </select>
          </div>
        </div>
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px">BOT TOKEN</label>
          <input id="conn-token" class="login-input" style="margin-bottom:0;font-family:var(--font-mono);font-size:12px" type="password" placeholder="Paste bot token here (stored encrypted)">
        </div>
        <button class="btn btn-primary" onclick="createConnection()">+ Add Connection</button>
        <span id="conn-msg" style="font-family:var(--font-mono);font-size:11px;margin-left:10px"></span>
      </div>
    </div>

    <div class="card">
      <h3>
        <svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
        Active Connections
      </h3>
      <div class="card-body" style="padding-top:8px">
        <table id="conn-tbl" style="width:100%">
          <thead><tr><th>Label</th><th>Platform</th><th>Agent</th><th>Bot / Status</th><th>Running</th><th>Actions</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="content-area" id="tab-history">
    <div class="hist-layout">

      <!-- ── LEFT: session list ────────────────────────────── -->
      <div class="hist-left">
        <div style="padding:14px 14px 10px;border-bottom:1px solid var(--border);flex-shrink:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
            <input id="hist-search" style="flex:1;background:transparent;border:none;outline:none;font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;color:var(--text)" placeholder="Search sessions…" oninput="histFilter()">
          </div>
          <div style="display:flex;gap:6px">
            <select id="hist-agent" style="flex:1;background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:5px 8px;border-radius:8px;font-size:11px;font-family:var(--font-mono)" onchange="histFilter()">
              <option value="">All agents</option>
            </select>
            <select id="hist-state" style="background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:5px 8px;border-radius:8px;font-size:11px;font-family:var(--font-mono)" onchange="histFilter()">
              <option value="">All states</option>
              <option value="active">Active</option>
              <option value="idle">Idle</option>
              <option value="closed">Closed</option>
            </select>
            <button class="btn" style="font-size:10px;padding:5px 10px;flex-shrink:0" onclick="loadHistory()">↻</button>
          </div>
        </div>
        <div style="padding:6px 14px;border-bottom:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:space-between">
          <span id="hist-count" style="font-family:var(--font-mono);font-size:9px;letter-spacing:.2em;color:var(--muted)">SESSIONS: 0</span>
          <span id="hist-unread" style="font-family:var(--font-mono);font-size:9px;letter-spacing:.2em;color:var(--accent)"></span>
        </div>
        <div id="hist-list" style="flex:1;overflow-y:auto"></div>
      </div>

      <!-- ── RIGHT: transcript view ────────────────────────── -->
      <div class="hist-right">
        <!-- Header (hidden until a session is selected) -->
        <div id="hist-header" style="padding:18px 26px 14px;border-bottom:1px solid var(--border);flex-shrink:0;display:none">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
            <div style="min-width:0">
              <div id="hist-hdr-meta" style="font-family:var(--font-mono);font-size:9px;letter-spacing:.24em;color:var(--muted);margin-bottom:6px"></div>
              <h3 id="hist-hdr-title" style="font-family:var(--font-tactical);font-size:36px;margin:0;line-height:.9;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></h3>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              <span id="hist-hdr-state"></span>
              <button id="hist-del-btn" class="btn" style="font-size:11px;color:var(--red)" onclick="deleteHistSession()">Delete</button>
            </div>
          </div>
          <div id="hist-hdr-stats" style="margin-top:10px;display:flex;gap:18px;font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;color:var(--muted)"></div>
        </div>

        <!-- Empty state -->
        <div id="hist-empty" style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:var(--dim)">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
          <span style="font-family:var(--font-mono);font-size:10px;letter-spacing:.2em">SELECT A SESSION</span>
        </div>

        <!-- Transcript scroll area -->
        <div id="hist-transcript" style="flex:1;overflow-y:auto;padding:26px 28px 32px;display:none;flex-direction:column;gap:22px"></div>
      </div>

    </div>
  </div>

  <div class="content-area" id="tab-schedule">
    <!-- Create job -->
    <div class="card" style="margin-bottom:16px">
      <h3 style="margin-bottom:16px">
        <svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
        New Scheduled Job
      </h3>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px">NAME</label>
            <input id="cron-name" class="login-input" style="margin-bottom:0" placeholder="e.g. Daily digest">
          </div>
          <div>
            <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px">AGENT</label>
            <select id="cron-agent" style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:10px 12px;border-radius:10px;font-size:13px">
              <option value="">— select agent —</option>
            </select>
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px">SCHEDULE (cron)</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input id="cron-schedule" class="login-input" style="margin-bottom:0;font-family:var(--font-mono);flex:1" placeholder="0 9 * * *" oninput="updateCronPreview()">
            <select id="cron-preset" style="background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:10px 12px;border-radius:10px;font-size:12px" onchange="applyCronPreset()">
              <option value="">Presets…</option>
              <option value="* * * * *">Every minute</option>
              <option value="0 * * * *">Every hour</option>
              <option value="0 9 * * *">Daily 9:00 UTC</option>
              <option value="0 0 * * *">Daily midnight UTC</option>
              <option value="0 9 * * 1">Mondays 9:00 UTC</option>
              <option value="0 9 * * 1-5">Weekdays 9:00 UTC</option>
              <option value="0 9 1 * *">Monthly 1st 9:00 UTC</option>
            </select>
          </div>
          <div id="cron-preview" style="font-size:11px;color:var(--muted);margin-top:5px;font-family:var(--font-mono)">Next run: —</div>
        </div>
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px">PROMPT</label>
          <textarea id="cron-prompt" class="login-input" style="margin-bottom:0;height:90px;resize:vertical;font-family:var(--font-mono);font-size:12px" placeholder="Summarise today's events and send a brief report."></textarea>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <button class="btn primary" onclick="createCronJob()">Create Job</button>
          <span id="cron-msg" style="font-size:12px"></span>
        </div>
      </div>
    </div>

    <!-- Job list -->
    <div class="card">
      <div class="card-header" style="display:flex;align-items:center;gap:10px">
        <span style="font-size:13px;font-weight:600">Scheduled Jobs</span>
        <button class="btn" style="font-size:11px;margin-left:auto" onclick="loadSchedule()">↻ Refresh</button>
      </div>
      <div class="card-body" style="padding:0">
        <div id="cron-list"><div class="dossier-empty">Loading…</div></div>
      </div>
    </div>
  </div>

  <div class="content-area" id="tab-webhooks">
    <!-- Create webhook -->
    <div class="card" style="margin-bottom:16px">
      <h3 style="margin-bottom:16px">
        <svg class="card-h3-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M4 12a8 8 0 018-8M20 12a8 8 0 01-8 8"/></svg>
        New Webhook
      </h3>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px">NAME</label>
            <input id="wh-name" class="login-input" style="margin-bottom:0" placeholder="e.g. GitHub push">
          </div>
          <div>
            <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px">AGENT</label>
            <select id="wh-agent" style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:10px 12px;border-radius:10px;font-size:13px">
              <option value="">— select agent —</option>
            </select>
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px">PROMPT TEMPLATE <span style="font-weight:400">(use <code style="background:var(--bg-card);padding:1px 4px;border-radius:4px">{{body}}</code> for request body)</span></label>
          <textarea id="wh-template" class="login-input" style="margin-bottom:0;height:90px;resize:vertical;font-family:var(--font-mono);font-size:12px" placeholder="Process this event and reply with a summary: {{body}}"></textarea>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <button class="btn primary" onclick="createWebhook()">Create Webhook</button>
          <span id="wh-msg" style="font-size:12px"></span>
        </div>
      </div>
    </div>

    <!-- Webhook list -->
    <div class="card">
      <div class="card-header" style="display:flex;align-items:center;gap:10px">
        <span style="font-size:13px;font-weight:600">Registered Webhooks</span>
        <button class="btn" style="font-size:11px;margin-left:auto" onclick="loadWebhooks()">↻ Refresh</button>
      </div>
      <div class="card-body" style="padding:0">
        <div id="wh-list"><div class="dossier-empty">Loading…</div></div>
      </div>
    </div>
  </div>

  <div class="content-area" id="tab-audit">
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <input id="audit-search" class="login-input" style="width:200px;margin-bottom:0;padding:6px 12px;font-size:12px" placeholder="Search actor / event…" oninput="loadAuditLog()">
        <select id="audit-event-filter" style="background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:6px;border-radius:8px;font-size:12px" onchange="loadAuditLog()">
          <option value="">All events</option>
          <option value="connection:auth">Auth</option>
          <option value="connection:auth:failed">Auth failed</option>
          <option value="tool:request">Tool request</option>
          <option value="tool:denied">Tool denied</option>
          <option value="security:alert">Security alert</option>
          <option value="security:threat">Security threat</option>
          <option value="agent:start">Agent start</option>
          <option value="agent:end">Agent end</option>
          <option value="memory:stored">Memory stored</option>
        </select>
        <select id="audit-limit" style="background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:6px;border-radius:8px;font-size:12px" onchange="loadAuditLog()">
          <option value="50">50 entries</option>
          <option value="100" selected>100 entries</option>
          <option value="250">250 entries</option>
          <option value="500">500 entries</option>
        </select>
        <button class="btn" style="font-size:11px" onclick="loadAuditLog()">↻ Refresh</button>
        <button class="btn" id="audit-verify-btn" style="font-size:11px;margin-left:auto" onclick="verifyAuditChain()">Verify Chain</button>
        <span id="audit-integrity-badge" style="font-family:var(--font-mono);font-size:10px;display:none"></span>
      </div>
    </div>
    <div class="card">
      <div class="card-body" style="padding:0;overflow:hidden">
        <div id="audit-log-table" style="overflow-x:auto">
          <div class="dossier-empty">Loading…</div>
        </div>
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
          <button class="btn" id="tab-oauth" onclick="switchGoogleTab('oauth')">Gemini CLI</button>
        </div>
        <div id="google-apikey-pane">
          <input type="password" id="goo-key" class="login-input" placeholder="AIzaSy...">
          <button class="btn primary" onclick="saveGoogleKey()">Save Key</button>
        </div>
        <div id="google-oauth-pane" style="display:none">
          <div id="gemini-cli-detect" style="font-size:12px;color:var(--muted);margin-bottom:10px"></div>
          <button class="btn primary" id="oauth-start-btn" onclick="importGeminiCli()">Import from Gemini CLI</button>
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

      <div class="form-section" id="ag-skills-section" style="display:none">
        <div class="form-section-title">Skills</div>
        <div class="ag-skills-grid" id="ag-skills-grid"></div>
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
  const headers = { ...opts.headers, 'Authorization': 'Bearer ' + authToken };
  const r = await fetch(url, { ...opts, headers });
  if (r.status === 401) logout();
  return r;
}

function initApp() {
  connect();
  loadCredStatus();
  // Auto-connect WebSocket using the same token used for HTTP/SSE.
  // This is essential for receiving tool:approval:request messages and
  // skills:updated events without the user having to manually open the Chat tab.
  if (authToken) {
    $('chat-token').value = authToken;
    chatConnect(authToken);
  }
}

// ═══════════════════════════════════════════════════════════════
//  Tab navigation
// ═══════════════════════════════════════════════════════════════
function switchTab(name) {
  const titles = {
    status:    ['SYSTEM', 'STATUS',      'OVERVIEW / №01'],
    agents:    ['MODEL',  'AGENTS',      'OVERVIEW / №02'],
    teams:     ['WORKING','TEAMS',       'OVERVIEW / №03'],
    workspace: ['LIVE',   'WORKSPACE',   'OVERVIEW / №03B'],
    projects:  ['TEAM',   'PROJECTS',    'OVERVIEW / №03C'],
    roles:     ['ROLE',   'REGISTRY',    'OVERVIEW / №04'],
    skills:    ['SKILL',  'REGISTRY',    'OVERVIEW / №05'],
    mcp:       ['MCP',    'SERVERS',     'OVERVIEW / №06'],
    messaging: ['MSG',    'ADAPTERS',    'OVERVIEW / №07'],
    chat:      ['LIVE',   'CHAT',        'OVERVIEW / №08'],
    history:   ['SESSION','HISTORY',     'OVERVIEW / №09'],
    schedule:  ['CRON',   'SCHEDULE',    'OVERVIEW / №10'],
    webhooks:  ['HTTP',   'WEBHOOKS',    'OVERVIEW / №11'],
    creds:     ['API',    'CREDENTIALS', 'OVERVIEW / №12'],
    audit:     ['AUDIT',  'LOG',         'OVERVIEW / №13'],
  };
  const [prefix, accent, overview] = titles[name] || [name.toUpperCase(), '', ''];
  $('view-title').innerHTML = prefix + (accent ? ' <span class="title-accent">' + accent + '</span>' : '');
  $('view-overview').textContent = overview;

  ['status','agents','teams','workspace','projects','roles','skills','mcp','messaging','chat','history','schedule','webhooks','creds','audit'].forEach(t => {
    const content = $('tab-' + t);
    if (content) content.classList.toggle('active', t === name);

    const ntab = $('ntab-' + t);
    if (ntab) {
      ntab.classList.toggle('active', t === name);
      const arrow = ntab.querySelector('.nav-arrow');
      if (arrow) /** @type {HTMLElement} */(arrow).style.display = t === name ? '' : 'none';
    }
  });
  if (name === 'agents')    loadAgents();
  if (name === 'teams')     loadTeams();
  if (name === 'workspace') loadWorkspace();
  if (name === 'projects')  loadProjects();
  if (name === 'roles')     loadTeams();
  if (name === 'messaging') loadConnections();
  if (name === 'history')   loadHistory();
  if (name === 'schedule')  loadSchedule();
  if (name === 'webhooks')  loadWebhooks();
  if (name === 'audit')     loadAuditLog();
}

// ═══════════════════════════════════════════════════════════════
//  SSE — dashboard snapshot (Status tab)
// ═══════════════════════════════════════════════════════════════
const MAX_LOG = 150;
let eventCount = 0;
let reconnectDelay = 1000;
let es;
let snapshotAgents = [];
let snapshotSkills = [];

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

  es.addEventListener('workspace:update', e => {
    applyWorkspaceUpdate(JSON.parse(e.data));
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
    function budgetBar(label, used, limit, isCost) {
      if (!limit) return '';
      const pct = Math.min(100, Math.round(used / limit * 100));
      const cls = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : '';
      const fmt = n => isCost ? '$' + n.toFixed(2) : (n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n));
      const capFmt = isCost ? '$' + limit : fmt(limit);
      return '<div class="budget-bar-row">'
        + '<div class="budget-bar-header">'
        +   '<span class="budget-bar-key">' + label + '</span>'
        +   '<span class="budget-bar-val"><span class="used">' + fmt(used) + '</span><span class="cap"> / ' + capFmt + '</span></span>'
        + '</div>'
        + '<div class="budget-bar-track-row">'
        +   '<div class="budget-bar-track"><div class="budget-bar-fill ' + cls + '" style="width:' + pct + '%"></div></div>'
        +   '<span class="budget-bar-pct">' + pct + '<small>%</small></span>'
        + '</div>'
        + '</div>';
    }

    const costUsed  = b.monthlyCostUsed  || 0;
    const costLimit = b.monthlyCostLimit || 0;
    const costPct   = costLimit ? Math.min(100, costUsed / costLimit * 100) : 0;
    const isOver    = costUsed > costLimit && costLimit > 0;

    // Format the big cost display: split at last digit for accent colouring
    function bigCost(n) {
      const s = '$' + n.toFixed(2);
      return s.slice(0, -1) + '<span class="accent">' + s.slice(-1) + '</span>';
    }

    const spendSection = costLimit > 0
      ? '<div class="budget-spend">'
        + '<div class="budget-spend-left">'
        +   '<div class="budget-spend-title">Spend to date</div>'
        +   '<div class="budget-spend-amount">' + bigCost(costUsed) + '</div>'
        +   '<div class="budget-spend-sub">Of $' + costLimit.toFixed(0) + ' monthly cap &middot; ' + costPct.toFixed(1) + '% utilized</div>'
        + '</div>'
        + '<div class="budget-status-badge' + (isOver ? ' over' : '') + '">' + (isOver ? 'OVER CAP' : 'UNDER CAP') + '</div>'
        + '</div>'
      : '';

    bw.innerHTML =
      budgetBar('Daily tokens',   b.dailyUsed   || 0, b.dailyLimit   || 0, false) +
      budgetBar('Monthly tokens', b.monthlyUsed || 0, b.monthlyLimit || 0, false) +
      budgetBar('Monthly cost',   costUsed,           costLimit,            true)  +
      spendSection;
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
    snapshotSkills = s.skills;
    const rowsMain = s.skills.map(sk => '<tr>'
      + '<td>' + esc(sk.name) + '</td>'
      + '<td>' + esc(sk.version || '') + '</td>'
      + '<td style="color:var(--muted); font-size:12px">' + esc(sk.description || '') + '</td>'
      + '<td><button class="skill-toggle-btn' + (sk.enabled ? ' on' : '') + '" data-skill="' + esc(sk.name) + '" data-enabled="' + sk.enabled + '" onclick="toggleSkill(this.dataset.skill, this.dataset.enabled!==&apos;true&apos;)">'
      + '<span class="skill-toggle-dot"></span>' + (sk.enabled ? 'ENABLED' : 'DISABLED') + '</button></td>'
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
let chatReconnectDelay = 1000;
let chatReconnectTimer = null;
let chatManualDisconnect = false;
let streamingMsgEl = null;  // current streaming bubble element
let streamingContent = '';
const approvalTimers = new Map(); // requestId → intervalId
const pendingNotifications = new Map(); // requestId → { toolName, reason, input }

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
    // Manual disconnect — disable auto-reconnect until user reconnects
    chatManualDisconnect = true;
    if (chatReconnectTimer) { clearTimeout(chatReconnectTimer); chatReconnectTimer = null; }
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
  chatManualDisconnect = false;
  chatReconnectDelay = 1000;
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
          chatReconnectDelay = 1000; // reset backoff on successful auth
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
        // If streaming happened, bubble already shows the content — just close it.
        // If there's an open streaming bubble but no streamed content (e.g. team run),
        // fill it with the reply content rather than leaving an empty ghost bubble.
        if (streamingMsgEl) {
          if (!streamingContent) {
            const bubble = streamingMsgEl.querySelector('.msg-bubble');
            if (bubble) bubble.textContent = p.content || '';
          }
          streamingMsgEl.classList.remove('streaming');
          streamingMsgEl = null;
        } else if (!streamingContent) {
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
      case 'tool:approval:request': {
        const p = msg.payload || {};
        showApprovalCard(p.requestId, p.toolName, p.input, p.reason);
        break;
      }
      case 'error': {
        const p = msg.payload || {};
        appendChatNotice('⚠️ ' + (p.message || p.error || 'Server error'));
        $('chat-send-btn').disabled = false;
        $('chat-input').disabled = false;
        break;
      }
      case 'skills:updated': {
        const skills = msg.payload?.skills || [];
        snapshotSkills = skills;
        renderSnapshot({ skills });
        break;
      }
      case 'skill:toggle:error': {
        const p = msg.payload || {};
        alert('Skill toggle failed: ' + (p.error || 'unknown error'));
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

    // Auto-reconnect with exponential backoff (max 30s) — but only if user didn't manually disconnect
    if (!chatManualDisconnect && authToken) {
      if (chatReconnectTimer) clearTimeout(chatReconnectTimer);
      chatReconnectTimer = setTimeout(() => {
        chatReconnectTimer = null;
        chatReconnectDelay = Math.min(chatReconnectDelay * 2, 30000);
        chatConnect(authToken);
      }, chatReconnectDelay);
    }
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

function updateBell() {
  const count = pendingNotifications.size;
  const bell  = $('notif-bell');
  const badge = $('notif-badge');
  if (!bell || !badge) return;
  badge.textContent = String(count);
  badge.style.display = count > 0 ? 'flex' : 'none';
  bell.classList.toggle('has-pending', count > 0);
  // Re-render panel if open
  const panel = $('notif-panel');
  if (panel && panel.classList.contains('open')) renderNotifPanel();
}

function toggleNotifPanel() {
  const panel = $('notif-panel');
  if (!panel) return;
  const willOpen = !panel.classList.contains('open');
  panel.classList.toggle('open', willOpen);
  if (willOpen) renderNotifPanel();
}

function renderNotifPanel() {
  const body = $('notif-panel-body');
  if (!body) return;
  body.innerHTML = '';
  if (pendingNotifications.size === 0) {
    body.innerHTML = '<div class="notif-panel-empty">NO PENDING REQUESTS</div>';
    return;
  }
  pendingNotifications.forEach((data, rid) => {
    const item = document.createElement('div');
    item.className = 'notif-item';
    item.id = 'nitem-' + rid;
    item.setAttribute('onclick', 'openApprovalModal(' + JSON.stringify(rid) + ')');
    item.innerHTML =
      '<div class="notif-item-hdr">'
      + '<span class="notif-item-tool">' + esc(data.toolName) + '</span>'
      + '<span class="notif-item-cd" id="nicd-' + rid + '">…</span>'
      + '</div>'
      + (data.reason ? '<div class="notif-item-reason">' + esc(data.reason) + '</div>' : '')
      + '<div class="notif-item-hint">tap to review &amp; approve</div>';
    body.appendChild(item);
  });
}

function openApprovalModal(rid) {
  const data = pendingNotifications.get(rid);
  if (!data) return;

  $('approval-modal-bg').classList.add('open');
  $('approval-modal-tool').textContent   = data.toolName;
  $('approval-modal-reason').textContent = data.reason || '';
  $('approval-modal-reason').style.display = data.reason ? '' : 'none';
  $('approval-modal-input').textContent  = JSON.stringify(data.input || {}, null, 2);

  // wire buttons
  $('approval-modal-approve').onclick = () => respondApproval(rid, true);
  $('approval-modal-deny').onclick    = () => respondApproval(rid, false);

  // sync countdown display
  const cdEl = $('approval-modal-cd');
  const srcEl = document.getElementById('nicd-' + rid);
  if (cdEl && srcEl) cdEl.textContent = srcEl.textContent;

  // close panel
  $('notif-panel').classList.remove('open');
}

function closeApprovalModal() {
  $('approval-modal-bg').classList.remove('open');
}

function showNotifToast(toolName) {
  const toast = document.createElement('div');
  toast.className = 'notif-toast';
  toast.textContent = '⚠ Permission request: ' + toolName;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3100);
}

// Close notification panel when clicking outside it
document.addEventListener('click', function(e) {
  const panel = $('notif-panel');
  const bell  = $('notif-bell');
  if (!panel || !panel.classList.contains('open')) return;
  if (!panel.contains(e.target) && !bell.contains(e.target)) {
    panel.classList.remove('open');
  }
});

function showApprovalCard(requestId, toolName, input, reason) {
  const TIMEOUT_S = 60;
  let remaining = TIMEOUT_S;

  // Track in notification system
  pendingNotifications.set(requestId, { toolName, reason, input });
  updateBell();

  // Shake bell animation
  const bell = $('notif-bell');
  if (bell) {
    bell.classList.remove('shake');
    void bell.offsetWidth; // reflow to restart animation
    bell.classList.add('shake');
    setTimeout(() => bell.classList.remove('shake'), 600);
  }

  // Show toast if user is not on the Chat tab
  const chatTab = $('tab-chat');
  if (!chatTab || !chatTab.classList.contains('active')) {
    showNotifToast(toolName);
  }

  // Show card in chat messages if chat tab is available
  const chatMessages = $('chat-messages');
  if (chatMessages) {
    const card = document.createElement('div');
    card.className = 'approval-card';
    card.dataset.rid = requestId;

    const inputJson = JSON.stringify(input || {}, null, 2);

    card.innerHTML =
      '<div class="approval-header">'
      + '<span class="approval-title">⚠ Tool Approval Required</span>'
      + '<span class="approval-countdown" id="acd-' + requestId + '">' + TIMEOUT_S + 's</span>'
      + '</div>'
      + '<div class="approval-tool">' + esc(toolName) + '</div>'
      + (reason ? '<div class="approval-reason">' + esc(reason) + '</div>' : '')
      + '<div class="approval-input">' + esc(inputJson) + '</div>'
      + '<div class="approval-actions">'
      +   '<button class="btn-approve" onclick="openApprovalModal(' + JSON.stringify(requestId) + ')">✓ Review &amp; Approve</button>'
      +   '<button class="btn-deny"    onclick="respondApproval(' + JSON.stringify(requestId) + ', false)">✗ Deny</button>'
      + '</div>';

    chatMessages.appendChild(card);
    scrollChatToBottom();
  }

  const interval = setInterval(() => {
    remaining--;
    // Update countdown in chat card
    const chatEl = document.getElementById('acd-' + requestId);
    if (chatEl) {
      chatEl.textContent = remaining + 's';
      if (remaining <= 10) chatEl.classList.add('urgent');
    }
    // Update countdown in notification panel
    const notifEl = document.getElementById('nicd-' + requestId);
    if (notifEl) {
      notifEl.textContent = remaining + 's';
      if (remaining <= 10) notifEl.classList.add('urgent');
    }
    // Update countdown in approval modal (if open for this request)
    const modalCd = $('approval-modal-cd');
    if (modalCd && $('approval-modal-bg').classList.contains('open')) {
      modalCd.textContent = remaining + 's remaining';
      if (remaining <= 10) modalCd.classList.add('urgent'); else modalCd.classList.remove('urgent');
    }
    if (remaining <= 0) {
      clearInterval(interval);
      approvalTimers.delete(requestId);
      pendingNotifications.delete(requestId);
      updateBell();
      dismissApprovalCard(requestId);
      appendChatNotice('⏱ Tool approval timed out — ' + toolName + ' denied');
    }
  }, 1000);

  approvalTimers.set(requestId, interval);
}

function respondApproval(requestId, approved) {
  const timer = approvalTimers.get(requestId);
  if (timer) { clearInterval(timer); approvalTimers.delete(requestId); }

  // Remove from pending notifications and update bell
  pendingNotifications.delete(requestId);
  updateBell();

  // Close modals
  closeApprovalModal();
  const panel = $('notif-panel');
  if (panel && pendingNotifications.size === 0) panel.classList.remove('open');

  if (chatWs && chatWs.readyState === WebSocket.OPEN) {
    chatWs.send(JSON.stringify({
      id: crypto.randomUUID(),
      type: 'tool:approval:response',
      timestamp: Date.now(),
      payload: { requestId, approved },
    }));
  }

  dismissApprovalCard(requestId);
  appendChatNotice(approved ? '✓ Tool approved — continuing…' : '✗ Tool denied');
}

function dismissApprovalCard(requestId) {
  const chatMessages = $('chat-messages');
  if (chatMessages) {
    const card = chatMessages.querySelector('[data-rid="' + requestId + '"]');
    if (card) card.remove();
  }
  // Remove notification item from panel
  const nitem = document.getElementById('nitem-' + requestId);
  if (nitem) nitem.remove();
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
    if (s.google?.geminiCliAvailable) {
      $('gemini-cli-detect').textContent = 'Gemini CLI credentials found at ' + s.google.geminiCliPath;
      $('oauth-start-btn').disabled = false;
      $('tab-oauth').style.opacity = '';
    } else {
      $('gemini-cli-detect').textContent = 'No Gemini CLI credentials found. Run: gemini auth login';
      $('oauth-start-btn').disabled = true;
      $('tab-oauth').style.opacity = '0.6';
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

async function importGeminiCli() {
  $('oauth-start-btn').disabled = true;
  showMsg('goo-msg', 'Importing...', '');
  try {
    const r = await apiFetch('/dashboard/api/credentials/google/gemini-cli', { method: 'POST' });
    const d = await r.json();
    if (d.error) {
      showMsg('goo-msg', d.error, 'err');
    } else {
      showMsg('goo-msg', 'Imported' + (d.email ? ' as ' + d.email : '') + '. Active on next API call.', 'ok');
      loadCredStatus();
    }
  } catch (e) {
    showMsg('goo-msg', String(e), 'err');
  }
  $('oauth-start-btn').disabled = false;
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

function toggleSkill(name, enable) {
  if (!chatWs || chatWs.readyState !== WebSocket.OPEN) {
    alert('Not connected — open the Chat tab first to establish a WebSocket connection');
    return;
  }
  chatWs.send(JSON.stringify({
    id: crypto.randomUUID(),
    type: 'skill:toggle',
    timestamp: Date.now(),
    payload: { name, enabled: enable },
  }));
}

function refreshSkills() {
  if (snapshotSkills.length > 0) {
    renderSnapshot({ skills: snapshotSkills });
  }
}

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
    b.classList.toggle('active', /** @type {HTMLElement} */(b).dataset.filter === f);
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

function agentAvatar(id, size, avatarUrl) {
  const s = size || 24;
  if (avatarUrl) {
    return '<img src="' + esc(avatarUrl) + '" width="' + s + '" height="' + s + '" '
      + 'data-id="' + esc(id) + '" data-sz="' + s + '" '
      + 'onerror="this.outerHTML=agentAvatar(this.dataset.id,+this.dataset.sz)" '
      + 'style="display:block;flex-shrink:0;border-radius:20%;object-fit:cover;border:1px solid var(--border)">';
  }
  const palette = ['#8B7355','#6B8E7F','#7B6B8E','#8E7B6B','#6B8E8E','#8E6B7B','#7B8E6B','#8E8E6B'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  const col = palette[h % palette.length];
  const initials = id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '??';
  const fs = Math.round(s * 0.36);
  const r = s / 2;
  const rx = Math.round(s * 0.20);
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + ' ' + s + '" xmlns="http://www.w3.org/2000/svg" style="display:block;flex-shrink:0">'
    + '<rect x="1" y="1" width="' + (s - 2) + '" height="' + (s - 2) + '" rx="' + rx + '" ry="' + rx + '" fill="' + col + '22" stroke="' + col + '" stroke-width="1.2"/>'
    + '<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="monospace" font-size="' + fs + '" font-weight="700" fill="' + col + '" letter-spacing="0.04em">' + initials + '</text>'
    + '</svg>';
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
      + '<div class="r-avatar">' + agentAvatar(a.id, 22, a.avatarUrl) + '</div>'
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
    r.classList.toggle('selected', /** @type {HTMLElement} */(r).dataset.aid === id);
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
  const timeout  = a.timeoutSeconds  ? a.timeoutSeconds + 's' : agentsData.defaults?.timeoutSeconds ? agentsData.defaults.timeoutSeconds + 's' : '—';
  const statusLabel = a.default ? 'DEFAULT' : 'IDLE';
  const statusColor = a.default ? 'var(--accent)' : 'var(--muted)';
  const aid = esc(a.id);

  $('agents-dossier').innerHTML =
    '<div style="position:relative;padding-right:116px">'
    + '<div class="dossier-num">AGENT №' + num + '</div>'
    + '<div class="dossier-name">' + aid + '</div>'
    + '<div class="dossier-pill-row">'
    +   '<span class="badge" style="color:' + statusColor + '">' + statusLabel + '</span>'
    +   '<span class="dossier-provider">' + esc(provider) + '</span>'
    + '</div>'
    + '<div class="dossier-avatar">' + agentAvatar(a.id, 100, a.avatarUrl) + '</div>'
    + '</div>'
    + (a.personality ? '<div class="dossier-desc">' + esc(a.personality) + '</div>' : '')
    + (a.skills && a.skills.length > 0
        ? '<div class="dossier-config-label">SKILLS</div>'
          + '<div class="dossier-skills">'
          + a.skills.map(s => '<span class="dossier-skill-pill">' + esc(s) + '</span>').join('')
          + '</div>'
        : '')
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

  // Skills checkboxes
  const skillsGrid = $('ag-skills-grid');
  const skillsSection = $('ag-skills-section');
  if (snapshotSkills.length > 0) {
    skillsSection.style.display = '';
    const agentSkills = agent?.skills || [];
    skillsGrid.innerHTML = snapshotSkills.map(sk =>
      '<label class="ag-skill-check">'
      + '<input type="checkbox" name="ag-skill" value="' + esc(sk.name) + '"' + (agentSkills.includes(sk.name) ? ' checked' : '') + '>'
      + esc(sk.name)
      + '</label>'
    ).join('');
  } else {
    skillsSection.style.display = 'none';
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

  const checkedSkills = [...document.querySelectorAll('input[name="ag-skill"]:checked')].map(i => i.value);
  if (checkedSkills.length > 0) body.skills = checkedSkills;

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
    r.classList.toggle('selected', /** @type {HTMLElement} */(r).dataset.rid === id);
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
    r.classList.toggle('selected', /** @type {HTMLElement} */(r).dataset.tid === id);
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
//  Session History
// ═══════════════════════════════════════════════════════════════
let projectsData = [];
let selectedProjectId = null;
let selectedProjectDetail = null;

async function loadProjects() {
  const roster = $('projects-roster');
  if (!roster) return;
  roster.innerHTML = '<div class="dossier-empty" style="padding:20px">Loading...</div>';
  await ensureProjectTeamFilter();
  const teamId = $('project-team-filter')?.value || '';
  try {
    const r = await apiFetch('/dashboard/api/projects' + (teamId ? '?team=' + encodeURIComponent(teamId) : ''));
    const d = await r.json();
    if (!r.ok || d.error) {
      roster.innerHTML = '<div class="dossier-empty" style="color:var(--red)">' + esc(d.error || 'Failed to load projects') + '</div>';
      return;
    }
    projectsData = d.projects || [];
    renderProjects();
    if (selectedProjectId && projectsData.some(p => p.id === selectedProjectId)) await selectProject(selectedProjectId);
    else if (projectsData[0]) await selectProject(projectsData[0].id);
    else {
      selectedProjectId = null;
      $('project-detail').innerHTML = '<div class="dossier-empty">NO PROJECTS YET</div>';
    }
  } catch (e) {
    roster.innerHTML = '<div class="dossier-empty" style="color:var(--red)">' + esc(String(e)) + '</div>';
  }
}

async function ensureProjectTeamFilter() {
  const sel = $('project-team-filter');
  if (!sel) return;
  if (!teamsData.teams || teamsData.teams.length === 0) {
    try {
      const r = await apiFetch('/dashboard/api/teams');
      if (r.ok) teamsData = await r.json();
    } catch { /* ignore */ }
  }
  const current = sel.value;
  sel.innerHTML = '<option value="">All teams</option>'
    + (teamsData.teams || []).map(t => '<option value="' + esc(t.id) + '"' + (t.id === current ? ' selected' : '') + '>' + esc(t.name || t.id) + '</option>').join('');
}

function renderProjects() {
  const roster = $('projects-roster');
  if (!roster) return;
  if (!projectsData.length) {
    roster.innerHTML = '<div class="empty" style="padding:24px 16px">No projects found.</div>';
    return;
  }
  roster.innerHTML = projectsData.map((p, i) => {
    const pid = esc(p.id);
    const active = p.id === selectedProjectId;
    const issueColor = p.openIssueCount > 0 ? 'var(--yellow)' : 'var(--muted)';
    return '<div class="roster-row' + (active ? ' selected' : '') + '" style="grid-template-columns:36px 1.3fr 0.8fr 0.7fr 0.7fr" data-pid="' + pid + '" onclick="selectProject(this.dataset.pid)">'
      + '<div class="r-num">' + String(i + 1).padStart(2, '0') + '</div>'
      + '<div class="r-id">' + esc(p.name) + '<small>' + esc(p.status) + ' - ' + timeAgo(p.updatedAt) + '</small></div>'
      + '<div class="r-model">' + esc(p.teamId) + '</div>'
      + '<div class="r-stat">' + Number(p.runCount || 0) + '</div>'
      + '<div class="r-stat" style="color:' + issueColor + '">' + Number(p.openIssueCount || 0) + '</div>'
      + '</div>';
  }).join('');
}

async function selectProject(id) {
  selectedProjectId = id;
  document.querySelectorAll('#projects-roster .roster-row').forEach(r => {
    r.classList.toggle('selected', /** @type {HTMLElement} */(r).dataset.pid === id);
  });
  const detail = $('project-detail');
  if (!detail) return;
  detail.innerHTML = '<div class="dossier-empty">Loading...</div>';
  try {
    const r = await apiFetch('/dashboard/api/projects/' + encodeURIComponent(id));
    const d = await r.json();
    if (!r.ok || d.error) {
      detail.innerHTML = '<div class="dossier-empty" style="color:var(--red)">' + esc(d.error || 'Project not found') + '</div>';
      return;
    }
    selectedProjectDetail = d;
    renderProjectDetail();
  } catch (e) {
    detail.innerHTML = '<div class="dossier-empty" style="color:var(--red)">' + esc(String(e)) + '</div>';
  }
}

function renderProjectDetail() {
  if (!selectedProjectDetail) return;
  const p = selectedProjectDetail.project;
  const artifacts = selectedProjectDetail.artifacts || [];
  const runs = selectedProjectDetail.runs || [];
  const issues = selectedProjectDetail.issues || [];
  const openIssues = issues.filter(i => i.status === 'open' || i.status === 'in_progress');

  $('project-detail').innerHTML =
    '<div class="dossier-num">PROJECT ' + esc(p.id) + '</div>'
    + '<div class="dossier-name" style="font-size:40px">' + esc(p.name) + '</div>'
    + '<div class="dossier-pill-row">'
    +   '<span class="badge ' + (p.status === 'active' ? 'green' : 'muted') + '">' + esc(p.status.toUpperCase()) + '</span>'
    +   '<span class="badge blue">' + esc(p.teamId) + '</span>'
    +   '<span class="badge ' + (openIssues.length ? 'yellow' : 'muted') + '">' + openIssues.length + ' OPEN ISSUES</span>'
    + '</div>'
    + '<div class="dossier-config-label">WORKSPACE</div>'
    + '<div class="dossier-sysprompt" style="max-height:none;margin-bottom:14px">' + esc(p.workspacePath) + '</div>'
    + '<div class="dossier-config-label">BRIEF</div>'
    + '<textarea class="project-brief-box" id="project-brief-edit">' + esc(p.brief || '') + '</textarea>'
    + '<div class="dossier-actions" style="margin-bottom:18px"><button class="btn primary" style="font-size:11px" onclick="saveProjectBrief()">Save Brief</button></div>'
    + '<div class="dossier-config">'
    +   '<div class="dossier-config-cell"><div class="dossier-config-cell-label">Artifacts</div><div class="dossier-config-cell-val">' + artifacts.length + '</div></div>'
    +   '<div class="dossier-config-cell"><div class="dossier-config-cell-label">Runs</div><div class="dossier-config-cell-val">' + runs.length + '</div></div>'
    +   '<div class="dossier-config-cell"><div class="dossier-config-cell-label">Updated</div><div class="dossier-config-cell-val">' + timeAgo(p.updatedAt) + '</div></div>'
    +   '<div class="dossier-config-cell"><div class="dossier-config-cell-label">Last Run</div><div class="dossier-config-cell-val">' + esc(p.lastRunId || '-') + '</div></div>'
    + '</div>'
    + '<div class="project-detail-grid">'
    + renderProjectRuns(runs) + renderProjectArtifacts(artifacts) + renderProjectIssues(issues)
    + '<div class="card" style="margin-bottom:0"><h3>RUN DETAIL</h3><div class="card-body" id="project-run-detail"><div class="empty">Select a run.</div></div></div>'
    + '</div>';
}

function renderProjectRuns(runs) {
  return '<div class="card" style="margin-bottom:0"><h3>RUN TIMELINE</h3><div class="card-body"><div class="project-mini-list">'
    + (runs.length ? runs.map(r => {
        const counts = r.taskCounts || {};
        const total = Object.values(counts).reduce((a, b) => a + Number(b || 0), 0);
        const statusCls = r.status === 'done' ? 'green' : r.status === 'failed' ? 'red' : r.status === 'running' ? 'blue' : 'yellow';
        return '<div class="project-mini-row project-run-card ' + esc(r.status) + '" data-rid="' + esc(r.id) + '" onclick="loadProjectRun(this.dataset.rid)">'
          + '<div><div class="project-mini-title">' + esc(r.goal || r.id) + '</div><div class="project-mini-meta">' + esc(r.kind) + ' - ' + timeAgo(r.startedAt) + ' - ' + Number(counts.done || 0) + '/' + total + ' tasks</div></div>'
          + '<span class="badge ' + statusCls + '">' + esc(r.status.toUpperCase()) + '</span></div>';
      }).join('') : '<div class="empty">No runs recorded.</div>')
    + '</div></div></div>';
}

function renderProjectArtifacts(artifacts) {
  return '<div class="card" style="margin-bottom:0"><h3>ARTIFACTS</h3><div class="card-body"><div class="project-mini-list">'
    + (artifacts.length ? artifacts.map(a => '<div class="project-mini-row"><div><div class="project-mini-title">' + esc(a.path) + '</div><div class="project-mini-meta">' + esc(a.summary || 'No summary') + '</div></div><div class="project-mini-meta">' + formatBytes(a.bytes || 0) + '</div></div>').join('') : '<div class="empty">No artifacts tracked.</div>')
    + '</div></div></div>';
}

function renderProjectIssues(issues) {
  return '<div class="card" style="margin-bottom:0"><h3>ISSUES</h3><div class="card-body"><div class="project-mini-list">'
    + (issues.length ? issues.map(i => {
        const cls = i.status === 'closed' ? 'green' : i.status === 'wontfix' ? 'muted' : i.kind === 'bug' ? 'red' : 'yellow';
        const canClose = i.status === 'open' || i.status === 'in_progress';
        return '<div class="project-mini-row"><div><div class="project-mini-title">' + esc(i.title) + '</div><div class="project-mini-meta">' + esc(i.kind) + ' - ' + esc(i.status) + ' - ' + timeAgo(i.openedAt) + '</div></div>'
          + (canClose ? '<button class="btn" style="font-size:10px;padding:4px 8px" data-iid="' + esc(i.id) + '" onclick="event.stopPropagation();closeProjectIssue(this.dataset.iid)">Close</button>' : '<span class="badge ' + cls + '">' + esc(i.status.toUpperCase()) + '</span>')
          + '</div>';
      }).join('') : '<div class="empty">No issues recorded.</div>')
    + '</div></div></div>';
}

async function saveProjectBrief() {
  if (!selectedProjectDetail) return;
  const p = selectedProjectDetail.project;
  const brief = $('project-brief-edit')?.value || '';
  try {
    const r = await apiFetch('/dashboard/api/projects/' + encodeURIComponent(p.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief }) });
    const d = await r.json();
    if (!r.ok || d.error) { alert(d.error || 'Save failed'); return; }
    await selectProject(p.id);
    await loadProjects();
  } catch (e) { alert(String(e)); }
}

async function loadProjectRun(runId) {
  const el = $('project-run-detail');
  if (!el) return;
  el.innerHTML = '<div class="dossier-empty">Loading...</div>';
  try {
    const r = await apiFetch('/dashboard/api/runs/' + encodeURIComponent(runId));
    const d = await r.json();
    if (!r.ok || d.error) {
      el.innerHTML = '<div class="dossier-empty" style="color:var(--red)">' + esc(d.error || 'Run not found') + '</div>';
      return;
    }
    const run = d.run;
    const tasks = d.tasks || [];
    const resumeBtn = run.resumable ? '<button class="btn primary" style="font-size:11px" data-rid="' + esc(run.id) + '" onclick="resumeProjectRun(this.dataset.rid)">Resume</button>' : '';
    el.innerHTML =
      '<div class="dossier-config-label">RUN ' + esc(run.id) + '</div>'
      + '<div class="dossier-goal">' + esc(run.goal || '') + '</div>'
      + '<div class="dossier-pill-row"><span class="badge blue">' + esc(run.kind) + '</span><span class="badge ' + (run.status === 'done' ? 'green' : run.status === 'failed' ? 'red' : 'yellow') + '">' + esc(run.status.toUpperCase()) + '</span></div>'
      + '<div class="dossier-actions" style="margin-bottom:14px">' + resumeBtn + '</div>'
      + (tasks.length ? tasks.map(t => '<div class="project-task-row"><div><div class="project-task-title">' + esc(t.label || t.taskId) + '</div><div class="project-mini-meta">' + esc(t.agentId) + ' - depends: ' + esc((t.depends || []).join(', ') || '-') + '</div><div class="project-task-prompt">' + esc(t.result || t.error || t.prompt || '') + '</div></div><span class="badge ' + (t.status === 'done' ? 'green' : t.status === 'failed' ? 'red' : t.status === 'running' ? 'blue' : 'muted') + '">' + esc(t.status.toUpperCase()) + '</span></div>').join('') : '<div class="empty">No tasks recorded.</div>');
  } catch (e) {
    el.innerHTML = '<div class="dossier-empty" style="color:var(--red)">' + esc(String(e)) + '</div>';
  }
}

async function resumeProjectRun(runId) {
  if (!confirm('Resume run ' + runId + '?')) return;
  const el = $('project-run-detail');
  if (el) el.innerHTML = '<div class="dossier-empty">Resuming...</div>';
  try {
    const r = await apiFetch('/dashboard/api/runs/' + encodeURIComponent(runId) + '/resume', { method: 'POST' });
    const d = await r.json();
    if (!r.ok || d.error) { alert(d.error || 'Resume failed'); return; }
    if (selectedProjectId) await selectProject(selectedProjectId);
    await loadProjectRun(runId);
  } catch (e) { alert(String(e)); }
}

async function closeProjectIssue(issueId) {
  try {
    const r = await apiFetch('/dashboard/api/issues/' + encodeURIComponent(issueId) + '/close', { method: 'POST' });
    const d = await r.json();
    if (!r.ok || d.error) { alert(d.error || 'Close failed'); return; }
    if (selectedProjectId) await selectProject(selectedProjectId);
    await loadProjects();
  } catch (e) { alert(String(e)); }
}

function formatBytes(n) {
  n = Number(n || 0);
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

let histSessions = [];
let histSelected = null;

function timeAgo(ts) {
  if (!ts) return '—';
  const d = Date.now() - ts;
  if (d < 60_000)        return '<1m';
  if (d < 3_600_000)     return Math.floor(d / 60_000) + 'm';
  if (d < 86_400_000)    return Math.floor(d / 3_600_000) + 'h';
  if (d < 7 * 86_400_000) return Math.floor(d / 86_400_000) + 'd';
  return new Date(ts).toLocaleDateString();
}

function channelSource(channelId) {
  if (!channelId) return { icon: '🔌', label: 'unknown' };
  if (channelId.startsWith('conn:'))     return { icon: '🌐', label: 'WebSocket' };
  if (channelId.startsWith('webhook:'))  return { icon: '🔗', label: 'Webhook' };
  if (channelId.startsWith('cron:'))     return { icon: '⏰', label: 'Cron' };
  if (channelId.startsWith('telegram:')) return { icon: '✈️', label: 'Telegram' };
  if (channelId.startsWith('discord:'))  return { icon: '🎮', label: 'Discord' };
  return { icon: '📡', label: channelId.split(':')[0] };
}

async function loadHistory() {
  const container = $('hist-list');
  if (!container) return;
  container.innerHTML = '<div class="dossier-empty" style="padding:20px">Loading…</div>';
  try {
    const r = await apiFetch('/dashboard/api/sessions?limit=200');
    const d = await r.json();
    histSessions = d.sessions || [];

    // Populate agent filter
    const agSel = $('hist-agent');
    if (agSel) {
      const agents = [...new Set(histSessions.map(s => s.agentId))].sort();
      const cur = agSel.value;
      agSel.innerHTML = '<option value="">All agents</option>'
        + agents.map(a => '<option value="' + esc(a) + '"' + (a === cur ? ' selected' : '') + '>' + esc(a) + '</option>').join('');
    }

    histFilter();
  } catch (e) {
    container.innerHTML = '<div class="dossier-empty" style="color:var(--red)">' + esc(String(e)) + '</div>';
  }
}

function histFilter() {
  const search  = ($('hist-search')?.value || '').toLowerCase().trim();
  const agent   = $('hist-agent')?.value   || '';
  const state   = $('hist-state')?.value   || '';

  let list = histSessions;
  if (agent)  list = list.filter(s => s.agentId === agent);
  if (state)  list = list.filter(s => s.state === state);
  if (search) list = list.filter(s =>
    s.id.includes(search) ||
    s.agentId.toLowerCase().includes(search) ||
    s.channelId.toLowerCase().includes(search) ||
    s.peerId.toLowerCase().includes(search),
  );

  const countEl = $('hist-count');
  if (countEl) countEl.textContent = 'SESSIONS: ' + list.length;
  const activeEl = $('hist-unread');
  if (activeEl) {
    const n = list.filter(s => s.state === 'active').length;
    activeEl.textContent = n > 0 ? n + ' ACTIVE' : '';
  }

  const container = $('hist-list');
  if (!container) return;
  if (!list.length) {
    container.innerHTML = '<div class="dossier-empty" style="padding:20px">No sessions found</div>';
    return;
  }

  container.innerHTML = list.map(s => {
    const src = channelSource(s.channelId);
    const stateColor = s.state === 'active' ? 'var(--green)' : s.state === 'idle' ? 'var(--yellow)' : 'var(--dim)';
    const isSelected = histSelected?.id === s.id;
    const shortId = s.id.slice(-8).toUpperCase();
    return '<button class="hist-session-item' + (isSelected ? ' selected' : '') + '" onclick="openSession(\\'' + s.id + '\\')">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">'
      + '<div style="display:flex;align-items:center;gap:6px">'
      + '<span style="font-family:var(--font-mono);font-size:9px;letter-spacing:.18em;color:var(--muted)">' + esc(src.icon) + ' S-' + esc(shortId) + '</span>'
      + '</div>'
      + '<span style="font-family:var(--font-mono);font-size:9px;letter-spacing:.12em;color:var(--muted)">' + timeAgo(s.lastActiveAt) + '</span>'
      + '</div>'
      + '<div style="font-family:var(--font-tactical);font-size:22px;line-height:1;letter-spacing:.02em;color:var(--text);margin-bottom:5px">'
      + esc(s.agentId.toUpperCase())
      + '</div>'
      + '<div style="display:flex;align-items:center;justify-content:space-between">'
      + '<span style="font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;color:var(--accent)">' + esc(src.label) + '</span>'
      + '<span style="width:7px;height:7px;border-radius:50%;background:' + stateColor + ';display:inline-block"></span>'
      + '</div>'
      + '</button>';
  }).join('');
}

async function openSession(id) {
  histSelected = histSessions.find(s => s.id === id) || { id };
  histFilter(); // re-render list to highlight selection

  const headerEl    = $('hist-header');
  const emptyEl     = $('hist-empty');
  const transcriptEl = $('hist-transcript');

  if (emptyEl)      emptyEl.style.display = 'none';
  if (transcriptEl) { transcriptEl.style.display = 'flex'; transcriptEl.innerHTML = '<div class="dossier-empty">Loading…</div>'; }

  try {
    const r = await apiFetch('/dashboard/api/sessions/' + id);
    const d = await r.json();
    if (!d.session) throw new Error(d.error || 'Not found');
    const session = d.session;

    // Populate header
    if (headerEl) {
      headerEl.style.display = '';
      const src = channelSource(session.channelId);
      const stateColor = session.state === 'active' ? 'var(--green)' : session.state === 'idle' ? 'var(--yellow)' : 'var(--dim)';
      $('hist-hdr-meta').textContent =
        'SESSION ' + session.id.slice(-12).toUpperCase()
        + '  ·  ' + src.icon + ' ' + src.label.toUpperCase()
        + '  ·  PEER ' + session.peerId.slice(0, 20).toUpperCase();
      $('hist-hdr-title').textContent = session.agentId.toUpperCase();
      $('hist-hdr-state').innerHTML = '<span style="font-family:var(--font-mono);font-size:10px;letter-spacing:.18em;padding:3px 8px;border:1px solid ' + stateColor + ';color:' + stateColor + '">' + session.state.toUpperCase() + '</span>';
      const msgs = Array.isArray(session.transcript) ? session.transcript : [];
      const userTurns  = msgs.filter(m => m.role === 'user'  && !isToolResultMsg(m)).length;
      const agentTurns = msgs.filter(m => m.role === 'assistant').length;
      $('hist-hdr-stats').innerHTML =
        '<span>CREATED <span style="color:var(--text)">' + new Date(session.createdAt).toLocaleString() + '</span></span>'
        + '<span>LAST <span style="color:var(--text)">' + new Date(session.lastActiveAt).toLocaleString() + '</span></span>'
        + '<span>MESSAGES <span style="color:var(--accent)">' + (userTurns + agentTurns) + '</span></span>';
    }

    // Render transcript
    if (transcriptEl) {
      const html = renderTranscript(session);
      transcriptEl.innerHTML = html;
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
    }
  } catch (e) {
    if (transcriptEl) transcriptEl.innerHTML = '<div class="dossier-empty" style="color:var(--red)">' + esc(String(e)) + '</div>';
  }
}

function isToolResultMsg(msg) {
  return Array.isArray(msg.content)
    && msg.content.length > 0
    && msg.content.every(c => c && c.type === 'tool_result');
}

function renderTranscript(session) {
  const msgs = Array.isArray(session.transcript) ? session.transcript : [];
  if (!msgs.length) return '<div class="dossier-empty">No messages recorded</div>';

  const agentInitial = (session.agentId || 'A').slice(0, 1).toUpperCase();
  let html = '';
  let msgNum = 0;

  for (const msg of msgs) {
    const isUser  = msg.role === 'user';
    const content = msg.content;

    // Tool-result messages: render as subtle inline bar, not a full bubble
    if (isUser && isToolResultMsg({ content })) {
      html += renderToolResultRow(content, session);
      continue;
    }

    msgNum++;
    const numStr      = String(msgNum).padStart(2, '0');
    const isAssistant = !isUser;
    const avatarBg    = isUser ? 'var(--text)' : 'var(--accent)';
    const avatarFg    = 'var(--bg)';
    const avatarChar  = isUser ? 'U' : agentInitial;
    const borderColor = isUser ? 'var(--border)' : 'var(--accent)';
    const bodyBg      = isAssistant ? 'rgba(200,144,72,0.04)' : 'transparent';
    const senderName  = isUser ? 'YOU' : session.agentId.toUpperCase();

    const bodyHtml = renderMsgContent(content);

    html += '<div class="hist-msg-row">'
      + '<div class="hist-avatar" style="background:' + avatarBg + ';color:' + avatarFg + '">' + esc(avatarChar) + '</div>'
      + '<div>'
      + '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px">'
      + '<span style="font-family:var(--font-tactical);font-size:18px;letter-spacing:.06em;color:var(--text)">' + esc(senderName) + '</span>'
      + '<span style="font-family:var(--font-mono);font-size:10px;letter-spacing:.18em;color:var(--muted)">№' + numStr + '</span>'
      + '</div>'
      + '<div class="hist-msg-body" style="border-left:3px solid ' + borderColor + ';background:' + bodyBg + '">'
      + bodyHtml
      + '</div>'
      + '</div>'
      + '</div>';
  }

  return html || '<div class="dossier-empty">Empty session</div>';
}

function renderMsgContent(content) {
  if (typeof content === 'string') {
    return '<div style="white-space:pre-wrap">' + esc(content) + '</div>';
  }
  if (!Array.isArray(content)) {
    return '<div style="color:var(--muted);font-size:11px;font-style:italic">[unparseable content]</div>';
  }
  let html = '';
  for (const blk of content) {
    if (!blk) continue;
    if (blk.type === 'text') {
      html += '<div style="white-space:pre-wrap">' + esc(blk.text || '') + '</div>';
    } else if (blk.type === 'tool_use') {
      const inputStr = JSON.stringify(blk.input ?? {}, null, 2);
      html += '<div class="hist-code-block" style="margin-top:8px">'
        + '<div style="color:var(--accent);font-weight:600;margin-bottom:4px;font-size:10px;letter-spacing:.14em">⚙ TOOL: ' + esc(blk.name || '') + '</div>'
        + '<pre style="margin:0;color:var(--muted);font-size:10px;overflow-x:auto;white-space:pre-wrap;word-break:break-all">' + esc(inputStr) + '</pre>'
        + '</div>';
    } else if (blk.type === 'tool_result') {
      const rc = typeof blk.content === 'string' ? blk.content : JSON.stringify(blk.content);
      const isErr = Boolean(blk.is_error);
      html += '<div style="margin-top:4px;padding:5px 10px;background:var(--bg-input);border:1px solid var(--border);border-left:2px solid ' + (isErr ? 'var(--red)' : 'var(--green)') + ';font-family:var(--font-mono);font-size:10px;color:' + (isErr ? 'var(--red)' : 'var(--green)') + '">'
        + (isErr ? '✗' : '✓') + ' ' + esc(rc.slice(0, 300)) + (rc.length > 300 ? '…' : '')
        + '</div>';
    } else {
      html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--dim)">[' + esc(blk.type || 'unknown') + ']</div>';
    }
  }
  return html || '<div style="color:var(--dim);font-style:italic;font-size:12px">(empty)</div>';
}

function renderToolResultRow(content) {
  const results = Array.isArray(content) ? content : [];
  return '<div class="hist-tool-bar">'
    + results.map(r => {
      const text = typeof r.content === 'string' ? r.content : JSON.stringify(r.content);
      const isErr = Boolean(r.is_error);
      return '<span style="color:' + (isErr ? 'var(--red)' : 'var(--green)') + ';margin-right:6px">' + (isErr ? '✗' : '✓') + '</span>'
        + '<span style="color:var(--muted)">' + esc(text.slice(0, 180)) + (text.length > 180 ? '…' : '') + '</span>';
    }).join('<br>')
    + '</div>';
}

async function deleteHistSession() {
  if (!histSelected) return;
  if (!confirm('Permanently delete session ' + histSelected.id.slice(-8).toUpperCase() + '?')) return;
  try {
    const r = await apiFetch('/dashboard/api/sessions/' + histSelected.id, { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) {
      histSelected = null;
      $('hist-header').style.display = 'none';
      $('hist-transcript').style.display = 'none';
      $('hist-empty').style.display = '';
      await loadHistory();
    } else {
      alert(d.error || 'Delete failed');
    }
  } catch (e) { alert(String(e)); }
}

// ═══════════════════════════════════════════════════════════════
//  Scheduled Tasks (Cron)
// ═══════════════════════════════════════════════════════════════

// Describe a cron expression in plain English (client-side, no server needed)
function describeSchedule(expr) {
  if (!expr) return expr;
  const p = expr.trim().split(/\\s+/);
  if (p.length !== 5) return expr;
  const [mn, hr, dom, , dow] = p;
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const domAll = dom === '*', dowAll = dow === '*';

  if (expr === '* * * * *') return 'Every minute';
  if (mn === '0' && hr === '*' && domAll && dowAll) return 'Every hour';
  if (mn.match(/^\\*\\/\\d+$/) && hr === '*' && domAll && dowAll) return 'Every ' + mn.slice(2) + ' min';
  if (hr.match(/^\\*\\/\\d+$/) && mn === '0' && domAll && dowAll) return 'Every ' + hr.slice(2) + ' hours';

  const hrStr = hr.match(/^\\d+$/) ? hr.padStart(2,'0') + ':' + mn.padStart(2,'0') + ' UTC' : null;

  if (hrStr && domAll && dowAll) return 'Daily at ' + hrStr;
  if (hrStr && domAll && dow.match(/^\\d+$/)) {
    const d = parseInt(dow,10);
    return (days[d] || 'Day ' + d) + 's at ' + hrStr;
  }
  if (hrStr && domAll && dow.match(/^\\d+-\\d+$/)) {
    const [lo,hi] = dow.split('-').map(Number);
    if (lo === 1 && hi === 5) return 'Weekdays at ' + hrStr;
    return days.slice(lo, hi+1).join('–') + ' at ' + hrStr;
  }
  if (hrStr && dom.match(/^\\d+$/) && dowAll) return 'Monthly on ' + dom + ' at ' + hrStr;
  return expr;
}

// Compute "next run" preview from cron expression (approximation using server)
let cronPreviewDebounce = null;
function updateCronPreview() {
  const expr = $('cron-schedule')?.value?.trim() || '';
  const el = $('cron-preview');
  if (!el) return;
  if (!expr) { el.textContent = 'Next run: —'; return; }
  el.textContent = describeSchedule(expr);
}

function applyCronPreset() {
  const val = $('cron-preset')?.value;
  if (!val) return;
  const inp = $('cron-schedule');
  if (inp) { inp.value = val; updateCronPreview(); }
  $('cron-preset').value = '';
}

async function loadSchedule() {
  const container = $('cron-list');
  if (!container) return;

  // Populate agent selector
  const agSel = $('cron-agent');
  if (agSel && snapshotAgents.length) {
    const cur = agSel.value;
    agSel.innerHTML = '<option value="">— select agent —</option>'
      + snapshotAgents.map(a => '<option value="' + esc(a.id) + '"' + (a.id === cur ? ' selected' : '') + '>' + esc(a.id) + '</option>').join('');
  }

  try {
    const r = await apiFetch('/dashboard/api/cron');
    const d = await r.json();
    const jobs = d.jobs || [];

    if (!jobs.length) {
      container.innerHTML = '<div class="dossier-empty">No scheduled jobs yet</div>';
      return;
    }

    container.innerHTML = jobs.map(job => {
      const nextTs  = job.nextRunAt  ? new Date(job.nextRunAt).toLocaleString()  : '—';
      const lastTs  = job.lastRunAt  ? new Date(job.lastRunAt).toLocaleString()  : 'Never';
      const statusColor = job.lastStatus === 'ok' ? 'green' : job.lastStatus === 'error' ? 'red' : '';
      const statusBadge = job.lastStatus ? badge(job.lastStatus, statusColor) : '';
      const enabledLabel = job.enabled ? 'Enabled' : 'Disabled';
      const enabledColor = job.enabled ? 'green' : 'red';
      return '<div style="padding:14px 16px;border-bottom:1px solid var(--border)">'
        + '<div style="display:flex;align-items:flex-start;gap:10px">'
        + '<div style="flex:1;min-width:0">'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">'
        + '<span style="font-weight:600;font-size:13px">' + esc(job.name) + '</span>'
        + badge(job.agentId, 'purple')
        + badge(enabledLabel, enabledColor)
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">'
        + '<code style="font-family:var(--font-mono);font-size:12px;background:var(--bg-card);padding:2px 8px;border-radius:6px;color:var(--accent)">' + esc(job.schedule) + '</code>'
        + '<span style="font-size:12px;color:var(--muted)">' + esc(describeSchedule(job.schedule)) + '</span>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:500px;margin-bottom:4px">'
        + 'Prompt: ' + esc(job.prompt.length > 80 ? job.prompt.slice(0,80) + '…' : job.prompt)
        + '</div>'
        + '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:var(--dim)">'
        + '<span>Next: <span style="color:var(--text)">' + esc(nextTs) + '</span></span>'
        + '<span>Last: ' + statusBadge + ' <span style="color:var(--text)">' + esc(lastTs) + '</span></span>'
        + '<span>Runs: ' + job.runCount + '</span>'
        + '</div>'
        // Last result preview
        + (job.lastResult ? '<div style="margin-top:6px;font-size:11px;color:var(--muted);background:var(--bg-card);padding:5px 8px;border-radius:6px;max-height:50px;overflow:hidden">' + esc(job.lastResult.slice(0,200)) + '</div>' : '')
        + '</div>'
        // Action buttons column
        + '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0">'
        + '<button class="btn primary" style="font-size:11px" onclick="runCronNow(\\'' + job.id + '\\')">▶ Run Now</button>'
        + '<button class="btn" style="font-size:11px" onclick="toggleCronEnabled(\\'' + job.id + '\\',' + !job.enabled + ')">'
        + (job.enabled ? 'Disable' : 'Enable') + '</button>'
        + '<button class="btn" style="font-size:11px;color:var(--red)" onclick="deleteCronJob(\\'' + job.id + '\\')">Delete</button>'
        + '</div>'
        + '</div>'
        + '</div>';
    }).join('');
  } catch (e) {
    container.innerHTML = '<div class="dossier-empty" style="color:var(--red)">' + esc(String(e)) + '</div>';
  }
}

async function createCronJob() {
  const name     = ($('cron-name')?.value     || '').trim();
  const agentId  = $('cron-agent')?.value     || '';
  const schedule = ($('cron-schedule')?.value || '').trim();
  const prompt   = ($('cron-prompt')?.value   || '').trim();
  const msgEl    = $('cron-msg');

  if (!name || !agentId || !schedule || !prompt) {
    if (msgEl) { msgEl.textContent = 'Fill in all fields'; msgEl.style.color = 'var(--red)'; }
    return;
  }
  if (msgEl) { msgEl.textContent = 'Creating…'; msgEl.style.color = 'var(--muted)'; }

  try {
    const r = await apiFetch('/dashboard/api/cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, agentId, prompt, schedule }),
    });
    const d = await r.json();
    if (d.ok) {
      if (msgEl) { msgEl.textContent = 'Created! First run: ' + (d.job?.nextRunAt ? new Date(d.job.nextRunAt).toLocaleString() : '—'); msgEl.style.color = 'var(--green)'; }
      $('cron-name').value = '';
      $('cron-schedule').value = '';
      $('cron-prompt').value = '';
      updateCronPreview();
      await loadSchedule();
      setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 5000);
    } else {
      if (msgEl) { msgEl.textContent = d.error || 'Error'; msgEl.style.color = 'var(--red)'; }
    }
  } catch (e) {
    if (msgEl) { msgEl.textContent = String(e); msgEl.style.color = 'var(--red)'; }
  }
}

async function runCronNow(id) {
  try {
    const r = await apiFetch('/dashboard/api/cron/' + id + '/run', { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      await loadSchedule();
      alert('Done: ' + (d.content || '').slice(0, 300));
    } else {
      alert('Error: ' + (d.error || 'failed'));
    }
  } catch (e) { alert(String(e)); }
}

async function toggleCronEnabled(id, enabled) {
  try {
    const r = await apiFetch('/dashboard/api/cron/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    const d = await r.json();
    if (d.ok) await loadSchedule();
    else alert(d.error || 'Update failed');
  } catch (e) { alert(String(e)); }
}

async function deleteCronJob(id) {
  if (!confirm('Delete this scheduled job?')) return;
  try {
    const r = await apiFetch('/dashboard/api/cron/' + id, { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) await loadSchedule();
    else alert(d.error || 'Delete failed');
  } catch (e) { alert(String(e)); }
}

// ═══════════════════════════════════════════════════════════════
//  Webhooks
// ═══════════════════════════════════════════════════════════════
async function loadWebhooks() {
  const container = $('wh-list');
  if (!container) return;
  try {
    const r = await apiFetch('/dashboard/api/webhooks');
    const d = await r.json();
    const list = d.webhooks || [];

    // Populate agent selector
    const agSel = $('wh-agent');
    if (agSel && snapshotAgents.length) {
      const current = agSel.value;
      agSel.innerHTML = '<option value="">— select agent —</option>'
        + snapshotAgents.map(a => '<option value="' + esc(a.id) + '"' + (a.id === current ? ' selected' : '') + '>' + esc(a.id) + '</option>').join('');
    }

    if (!list.length) {
      container.innerHTML = '<div class="dossier-empty">No webhooks yet — create one above</div>';
      return;
    }

    container.innerHTML = list.map(wh => {
      const ts = wh.lastTriggeredAt ? new Date(wh.lastTriggeredAt).toLocaleString() : 'Never';
      return '<div style="padding:14px 16px;border-bottom:1px solid var(--border)">'
        + '<div style="display:flex;align-items:flex-start;gap:12px">'
        + '<div style="flex:1;min-width:0">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
        + '<span style="font-weight:600;font-size:13px">' + esc(wh.name) + '</span>'
        + badge(wh.agentId, 'purple')
        + '</div>'
        // URL row
        + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">'
        + '<code style="font-family:var(--font-mono);font-size:11px;background:var(--bg-card);padding:3px 8px;border-radius:6px;color:var(--accent);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(wh.url) + '</code>'
        + '<button class="btn" style="font-size:10px;flex-shrink:0" onclick="copyToClipboard(this.dataset.v,this)" data-v="' + esc(wh.url) + '">Copy URL</button>'
        + '</div>'
        // Secret row
        + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">'
        + '<span style="font-size:11px;color:var(--muted)">Secret:</span>'
        + '<code style="font-family:var(--font-mono);font-size:11px;background:var(--bg-card);padding:3px 8px;border-radius:6px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(wh.secret) + '</code>'
        + '<button class="btn" style="font-size:10px;flex-shrink:0" onclick="copyToClipboard(this.dataset.v,this)" data-v="' + esc(wh.secret) + '">Copy</button>'
        + '</div>'
        // Prompt template preview
        + '<div style="font-size:11px;color:var(--muted);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:500px">'
        + 'Template: ' + esc(wh.promptTemplate.length > 80 ? wh.promptTemplate.slice(0, 80) + '…' : wh.promptTemplate)
        + '</div>'
        + '<div style="font-size:11px;color:var(--dim)">Triggered ' + wh.triggerCount + ' times · Last: ' + esc(ts) + '</div>'
        + '</div>'
        + '<button class="btn" style="font-size:11px;color:var(--red);flex-shrink:0" onclick="deleteWebhook(\\'' + wh.id + '\\')">Delete</button>'
        + '</div>'
        + '<div style="margin-top:10px;padding:8px 10px;background:var(--bg-card);border-radius:8px;font-family:var(--font-mono);font-size:11px;color:var(--muted)">'
        + '<div style="margin-bottom:2px">curl -X POST ' + esc(wh.url) + ' \\\\</div>'
        + '<div style="margin-bottom:2px;padding-left:16px">-H "Authorization: Bearer ' + esc(wh.secret) + '" \\\\</div>'
        + '<div style="padding-left:16px">-d &#39;{"key":"value"}&#39;</div>'
        + '</div>'
        + '</div>';
    }).join('');
  } catch (e) {
    container.innerHTML = '<div class="dossier-empty" style="color:var(--red)">' + esc(String(e)) + '</div>';
  }
}

async function createWebhook() {
  const name     = ($('wh-name')?.value || '').trim();
  const agentId  = $('wh-agent')?.value || '';
  const template = ($('wh-template')?.value || '').trim();
  const msgEl    = $('wh-msg');

  if (!name || !agentId || !template) {
    if (msgEl) { msgEl.textContent = 'Fill in all fields'; msgEl.style.color = 'var(--red)'; }
    return;
  }
  if (msgEl) { msgEl.textContent = 'Creating…'; msgEl.style.color = 'var(--muted)'; }

  try {
    const r = await apiFetch('/dashboard/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, agentId, promptTemplate: template }),
    });
    const d = await r.json();
    if (d.ok) {
      if (msgEl) { msgEl.textContent = 'Created!'; msgEl.style.color = 'var(--green)'; }
      $('wh-name').value = '';
      $('wh-template').value = '';
      await loadWebhooks();
      setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 3000);
    } else {
      if (msgEl) { msgEl.textContent = d.error || 'Error'; msgEl.style.color = 'var(--red)'; }
    }
  } catch (e) {
    if (msgEl) { msgEl.textContent = String(e); msgEl.style.color = 'var(--red)'; }
  }
}

async function deleteWebhook(id) {
  if (!confirm('Delete this webhook?')) return;
  try {
    const r = await apiFetch('/dashboard/api/webhooks/' + id, { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) await loadWebhooks();
    else alert(d.error || 'Delete failed');
  } catch (e) { alert(String(e)); }
}

function copyToClipboard(text, btn) {
  navigator.clipboard?.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }).catch(() => {
    prompt('Copy:', text);
  });
}

// ═══════════════════════════════════════════════════════════════
//  Per-Agent Connections
// ═══════════════════════════════════════════════════════════════
async function loadConnections() {
  const tbody = $('conn-tbl')?.querySelector('tbody');
  if (!tbody) return;
  try {
    const r = await apiFetch('/dashboard/api/connections');
    const d = await r.json();
    const list = d.connections || [];
    // Populate agent selects (conn-agent)
    const agentSel = $('conn-agent');
    if (agentSel && snapshotAgents.length) {
      const cur = agentSel.value;
      agentSel.innerHTML = '<option value="">— select agent —</option>';
      snapshotAgents.forEach(function(a) {
        const o = document.createElement('option');
        o.value = a.id; o.textContent = a.id;
        agentSel.appendChild(o);
      });
      if (cur) agentSel.value = cur;
    }
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">no connections — add one above</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function(c) {
      const runBadge = c.running
        ? '<span class="badge green">●&nbsp;running</span>'
        : '<span class="badge red">○&nbsp;stopped</span>';
      const botLabel = c.botUsername ? '@' + esc(c.botUsername) : '—';
      const connBtn  = c.running
        ? '<button class="btn" style="font-size:10px;color:var(--red)" onclick="disconnectAdapter(\\'' + esc(c.id) + '\\')">Disconnect</button>'
        : '<button class="btn btn-primary" style="font-size:10px" onclick="connectAdapter(\\'' + esc(c.id) + '\\')">Connect</button>';
      return '<tr>'
        + '<td style="font-family:var(--font-mono);font-size:11px">' + esc(c.label) + '</td>'
        + '<td>' + badge(c.platform, 'muted') + '</td>'
        + '<td style="font-family:var(--font-mono);font-size:11px">' + esc(c.agentId) + '</td>'
        + '<td style="font-family:var(--font-mono);font-size:11px">' + botLabel + '</td>'
        + '<td>' + runBadge + '</td>'
        + '<td style="display:flex;gap:6px;align-items:center">'
        + connBtn
        + '<button class="btn" style="font-size:10px;color:var(--red)" onclick="deleteConnection(\\'' + esc(c.id) + '\\')">✕</button>'
        + '</td>'
        + '</tr>';
    }).join('');
  } catch (e) {
    const tbody2 = $('conn-tbl')?.querySelector('tbody');
    if (tbody2) tbody2.innerHTML = '<tr><td colspan="6" class="empty">Error: ' + esc(String(e)) + '</td></tr>';
  }
}

async function createConnection() {
  const msgEl  = $('conn-msg');
  const label  = ($('conn-label')?.value || '').trim();
  const plat   = $('conn-platform')?.value || '';
  const agentId = $('conn-agent')?.value || '';
  const token  = ($('conn-token')?.value || '').trim();
  if (!label || !plat || !agentId || !token) {
    if (msgEl) { msgEl.style.color = 'var(--red)'; msgEl.textContent = 'All fields required'; }
    return;
  }
  try {
    const r = await apiFetch('/dashboard/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, platform: plat, agentId, token }),
    });
    const d = await r.json();
    if (d.connection) {
      if (msgEl) { msgEl.style.color = 'var(--green)'; msgEl.textContent = 'Created — click Connect to start'; }
      $('conn-label').value = '';
      $('conn-token').value = '';
      await loadConnections();
      setTimeout(function() { if (msgEl) msgEl.textContent = ''; }, 4000);
    } else {
      if (msgEl) { msgEl.style.color = 'var(--red)'; msgEl.textContent = d.error || 'Create failed'; }
    }
  } catch (e) { if (msgEl) { msgEl.style.color = 'var(--red)'; msgEl.textContent = String(e); } }
}

async function connectAdapter(id) {
  try {
    const r = await apiFetch('/dashboard/api/connections/' + id + '/connect', { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      await loadConnections();
    } else {
      alert(d.error || 'Connect failed');
    }
  } catch (e) { alert(String(e)); }
}

async function disconnectAdapter(id) {
  try {
    const r = await apiFetch('/dashboard/api/connections/' + id + '/disconnect', { method: 'POST' });
    const d = await r.json();
    if (d.ok) await loadConnections();
    else alert(d.error || 'Disconnect failed');
  } catch (e) { alert(String(e)); }
}

async function deleteConnection(id) {
  if (!confirm('Delete this connection?')) return;
  try {
    const r = await apiFetch('/dashboard/api/connections/' + id, { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) await loadConnections();
    else alert(d.error || 'Delete failed');
  } catch (e) { alert(String(e)); }
}

// ═══════════════════════════════════════════════════════════════
//  Audit Log
// ═══════════════════════════════════════════════════════════════
let auditDebounce = null;

async function loadAuditLog() {
  clearTimeout(auditDebounce);
  auditDebounce = setTimeout(_doLoadAudit, 250);
}

async function _doLoadAudit() {
  const container = $('audit-log-table');
  if (!container) return;
  const search = ($('audit-search')?.value || '').trim();
  const event  = $('audit-event-filter')?.value || '';
  const limit  = $('audit-limit')?.value || '100';
  let qs = '?limit=' + limit;
  if (event)  qs += '&event=' + encodeURIComponent(event);
  if (search) qs += '&search=' + encodeURIComponent(search);
  try {
    const r = await apiFetch('/dashboard/api/audit' + qs);
    if (!r.ok) { container.innerHTML = '<div class="dossier-empty" style="color:var(--red)">Failed to load audit log</div>'; return; }
    const d = await r.json();
    const entries = d.entries || [];
    if (!entries.length) {
      container.innerHTML = '<div class="dossier-empty">No audit entries</div>';
      return;
    }
    const EVENT_COLORS = {
      'connection:auth': 'green',
      'connection:auth:failed': 'red',
      'tool:request': 'purple',
      'tool:denied': 'red',
      'security:alert': 'yellow',
      'security:threat': 'red',
      'agent:start': 'green',
      'agent:end': 'purple',
      'memory:stored': 'purple',
    };
    const rows = entries.map(e => {
      const ts = new Date(e.timestamp).toLocaleString();
      const color = EVENT_COLORS[e.event] || '';
      const evBadge = badge(e.event, color);
      const detail = esc(e.detail || '');
      const target = e.target ? '<span style="color:var(--muted);font-size:11px">' + esc(e.target) + '</span>' : '';
      const hashShort = e.hash ? ('<span style="font-family:var(--font-mono);color:var(--dim);font-size:10px">' + esc(e.hash.slice(0, 10)) + '…</span>') : '';
      return '<tr>'
        + '<td style="white-space:nowrap;font-family:var(--font-mono);font-size:11px;color:var(--muted)">' + esc(ts) + '</td>'
        + '<td>' + evBadge + '</td>'
        + '<td style="font-family:var(--font-mono);font-size:11px">' + esc(e.actor) + '</td>'
        + '<td>' + (target || '—') + '</td>'
        + '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">' + detail + '</td>'
        + '<td>' + hashShort + '</td>'
        + '</tr>';
    }).join('');
    container.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      + '<thead><tr style="border-bottom:1px solid var(--border);color:var(--muted);font-size:11px;text-transform:uppercase">'
      + '<th style="padding:8px 12px;text-align:left;font-weight:500">Time</th>'
      + '<th style="padding:8px 12px;text-align:left;font-weight:500">Event</th>'
      + '<th style="padding:8px 12px;text-align:left;font-weight:500">Actor</th>'
      + '<th style="padding:8px 12px;text-align:left;font-weight:500">Target</th>'
      + '<th style="padding:8px 12px;text-align:left;font-weight:500">Detail</th>'
      + '<th style="padding:8px 12px;text-align:left;font-weight:500">Hash</th>'
      + '</tr></thead><tbody>'
      + rows
      + '</tbody></table>';
    // style alternating rows
    const trs = container.querySelectorAll('tbody tr');
    trs.forEach((tr, i) => {
      /** @type {HTMLElement} */(tr).style.borderBottom = '1px solid var(--border)';
      if (i % 2 === 0) /** @type {HTMLElement} */(tr).style.background = 'var(--bg-card)';
    });
    container.querySelectorAll('td').forEach(td => {
      /** @type {HTMLElement} */(td).style.padding = '7px 12px';
      /** @type {HTMLElement} */(td).style.verticalAlign = 'middle';
    });
  } catch (e) {
    container.innerHTML = '<div class="dossier-empty" style="color:var(--red)">' + esc(String(e)) + '</div>';
  }
}

async function verifyAuditChain() {
  const badge_el = $('audit-integrity-badge');
  const btn = $('audit-verify-btn');
  if (!badge_el || !btn) return;
  btn.disabled = true;
  badge_el.style.display = '';
  badge_el.style.color = 'var(--muted)';
  badge_el.textContent = 'Verifying…';
  try {
    const r = await apiFetch('/dashboard/api/audit/verify');
    const d = await r.json();
    if (d.valid) {
      badge_el.style.color = 'var(--green)';
      badge_el.textContent = '✓ Chain intact (' + (d.totalEntries || 0) + ' entries)';
    } else {
      badge_el.style.color = 'var(--red)';
      badge_el.textContent = '✗ Tampered! ' + (d.error || '');
    }
    if (d.note) badge_el.textContent += ' — ' + d.note;
  } catch (e) {
    badge_el.style.color = 'var(--red)';
    badge_el.textContent = 'Error: ' + String(e);
  } finally {
    btn.disabled = false;
  }
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

// ═══════════════════════════════════════════════════════════════
//  Workspace — Flow DAG
// ═══════════════════════════════════════════════════════════════
let dagOpen       = false;
let dagSelectedTeam = null;

function toggleDag() {
  dagOpen = !dagOpen;
  const body = $('ws-dag-body');
  const btn  = $('ws-dag-toggle-btn');
  if (body) body.style.display = dagOpen ? '' : 'none';
  if (btn)  btn.textContent = dagOpen ? '[HIDE]' : '[SHOW]';
  if (dagOpen) renderDag();
}

function renderDag() {
  const teams = wsData.teams || [];
  const tasks = wsData.tasks || [];

  // Team selector buttons
  const btnContainer = $('ws-dag-team-btns');
  if (btnContainer) {
    if (!teams.length) {
      btnContainer.innerHTML = '';
    } else {
      btnContainer.innerHTML = teams.map(tr =>
        '<button class="btn' + (dagSelectedTeam === tr.teamId ? ' active' : '') + '" '
        + 'style="font-size:9px;padding:3px 9px" '
        + 'onclick="selectDagTeam(\\'' + esc(tr.teamId) + '\\')">\'
        + esc(tr.teamName || tr.teamId) + '</button>'
      ).join('');
      if (!dagSelectedTeam && teams.length) dagSelectedTeam = teams[0].teamId;
    }
  }

  const canvas = $('ws-dag-canvas');
  if (!canvas) return;

  const teamTasks = tasks.filter(t => t.teamId === dagSelectedTeam);
  if (!teamTasks.length) {
    canvas.innerHTML = '<div class="ws-empty">NO TASKS FOR THIS TEAM RUN YET</div>';
    return;
  }

  canvas.innerHTML = buildDagSvg(teamTasks);
}

function selectDagTeam(teamId) {
  dagSelectedTeam = teamId;
  renderDag();
}

/**
 * Topological layered layout:
 *   - Layer 0: nodes with no in-dag depends
 *   - Layer N: nodes whose all deps are in layer < N
 * Then place nodes left-to-right by layer, top-to-bottom within layer.
 */
function buildDagSvg(tasks) {
  const NODE_W = 130, NODE_H = 42, PAD_X = 60, PAD_Y = 36;

  // Build adjacency
  const ids = tasks.map(t => t.taskId);
  const taskMap = {};
  for (const t of tasks) taskMap[t.taskId] = t;

  // Assign layers
  const layers = {};
  const getLayer = (id) => {
    if (layers[id] != null) return layers[id];
    const t = taskMap[id];
    if (!t) return 0;
    const deps = (t.depends || []).filter(d => ids.includes(d));
    if (!deps.length) { layers[id] = 0; return 0; }
    const maxDep = Math.max(...deps.map(d => getLayer(d)));
    layers[id] = maxDep + 1;
    return layers[id];
  };
  for (const id of ids) getLayer(id);

  const maxLayer = Math.max(0, ...Object.values(layers));
  const byLayer = {};
  for (let l = 0; l <= maxLayer; l++) byLayer[l] = [];
  for (const id of ids) byLayer[layers[id]].push(id);

  // Node positions
  const pos = {};
  const maxInLayer = Math.max(1, ...Object.values(byLayer).map(a => a.length));
  const svgH = maxInLayer * (NODE_H + PAD_Y) + PAD_Y;
  const svgW = (maxLayer + 1) * (NODE_W + PAD_X) + PAD_X;

  for (let l = 0; l <= maxLayer; l++) {
    const nodesInLayer = byLayer[l];
    const totalH = nodesInLayer.length * (NODE_H + PAD_Y) - PAD_Y;
    const startY  = (svgH - totalH) / 2;
    nodesInLayer.forEach((id, i) => {
      pos[id] = {
        x: PAD_X + l * (NODE_W + PAD_X),
        y: startY + i * (NODE_H + PAD_Y),
      };
    });
  }

  // SVG elements
  let edges = '';
  let nodes = '';

  // Arrows marker
  const defs = '<defs>'
    + '<marker id="arr-default" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" class="dag-arrowhead"/></marker>'
    + '<marker id="arr-active"  markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" class="dag-arrowhead active"/></marker>'
    + '<marker id="arr-done"    markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" class="dag-arrowhead done"/></marker>'
    + '</defs>';

  // Draw edges first (behind nodes)
  for (const t of tasks) {
    for (const dep of (t.depends || []).filter(d => ids.includes(d))) {
      const from = pos[dep];
      const to   = pos[t.taskId];
      if (!from || !to) continue;
      const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2;
      const x2 = to.x,            y2 = to.y   + NODE_H / 2;
      const depTask  = taskMap[dep];
      const edgeCls  = depTask?.status === 'done' ? 'done' : depTask?.status === 'running' ? 'active' : '';
      const markerId = edgeCls === 'done' ? 'arr-done' : edgeCls === 'active' ? 'arr-active' : 'arr-default';
      const cx1 = x1 + (x2 - x1) * 0.5, cx2 = x2 - (x2 - x1) * 0.5;
      edges += '<path class="dag-edge ' + edgeCls + '" d="M' + x1 + ',' + y1
        + ' C' + cx1 + ',' + y1 + ' ' + cx2 + ',' + y2 + ' ' + (x2 - 6) + ',' + y2
        + '" marker-end="url(#' + markerId + ')"/>';
    }
  }

  // Draw nodes
  for (const t of tasks) {
    const p = pos[t.taskId];
    if (!p) continue;
    const st  = t.status;
    const lbl = (t.label || t.taskId).slice(0, 18);
    const phase = t.phase === 'decompose' ? '⬡' : t.phase === 'synthesize' ? '◈' : '';
    const pulseCls = st === 'running' ? ' dag-pulse' : '';
    nodes += '<g class="dag-node' + pulseCls + '" transform="translate(' + p.x + ',' + p.y + ')">'
      + '<rect class="dag-node-rect ' + st + '" width="' + NODE_W + '" height="' + NODE_H + '"/>'
      + (phase ? '<text x="10" y="' + (NODE_H / 2) + '" class="dag-node-text" text-anchor="start" style="font-size:11px">' + phase + '</text>' : '')
      + '<text x="' + (NODE_W / 2 + (phase ? 6 : 0)) + '" y="' + (NODE_H / 2 - 6) + '" class="dag-node-text">' + esc(lbl) + '</text>'
      + '<text x="' + (NODE_W / 2) + '" y="' + (NODE_H / 2 + 8) + '" class="dag-node-status ' + st + '">' + st.toUpperCase() + '</text>'
      + '</g>';
  }

  return '<svg class="ws-dag-svg" width="' + svgW + '" height="' + svgH + '" xmlns="http://www.w3.org/2000/svg" style="background:var(--bg-deep,var(--bg))">'
    + defs + edges + nodes + '</svg>';
}

// ═══════════════════════════════════════════════════════════════
//  Workspace tab
// ═══════════════════════════════════════════════════════════════
let wsData = { tasks: [], agents: [], teams: [], updatedAt: 0 };
let wsFilter = 'all';

async function loadWorkspace() {
  try {
    const r = await apiFetch('/dashboard/api/workspace');
    if (!r.ok) return;
    wsData = await r.json();
    renderWorkspace();
  } catch (e) { /* ignore */ }
}

function applyWorkspaceUpdate(data) {
  wsData = data;
  // Only re-render if workspace tab is active
  if ($('tab-workspace') && $('tab-workspace').classList.contains('active')) {
    renderWorkspace();
  }
  // Update live indicator
  const dot   = $('ws-live-dot');
  const label = $('ws-live-label');
  if (dot)   { dot.style.background = 'var(--accent)'; setTimeout(() => { dot.style.background = 'var(--green)'; }, 600); }
  if (label) label.textContent = 'LIVE';
}

function setWsFilter(f) {
  wsFilter = f;
  ['all','running','done','failed'].forEach(n => {
    const btn = $('wsf-' + n);
    if (btn) btn.classList.toggle('active', n === f);
  });
  renderWorkspace();
}

async function clearWorkspace() {
  try { await apiFetch('/dashboard/api/workspace/clear', { method: 'DELETE' }); }
  catch { /* ignore */ }
  wsData = { tasks: [], agents: [], teams: [], updatedAt: 0 };
  renderWorkspace();
}

function renderWorkspace() {
  renderWsAgents(wsData.agents || []);
  renderWsTasks(wsData.tasks || [], wsData.teams || []);
  if (dagOpen) renderDag();
}

function renderWsAgents(agents) {
  const el = $('ws-agents');
  if (!el) return;
  if (!agents.length) { el.innerHTML = '<div class="ws-empty">NO AGENT DATA</div>'; return; }
  el.innerHTML = '<div class="ws-agent-list">'
    + agents.map(a => {
        const statusLabel = a.status === 'tool_use' ? 'TOOL' : a.status.toUpperCase();
        const detail = a.status === 'tool_use' && a.currentTool ? a.currentTool
          : a.currentTaskId ? a.currentTaskId.replace(/^[^:]+:/, '') : '';
        return '<div class="ws-agent-row">'
          + '<div class="ws-agent-id">' + esc(a.agentId) + '</div>'
          + '<span class="ws-agent-badge ' + esc(a.status) + '">' + statusLabel + '</span>'
          + (detail ? '<div class="ws-agent-detail">' + esc(detail) + '</div>' : '')
          + '</div>';
      }).join('')
    + '</div>';
}

function renderWsTasks(tasks, teams) {
  const el = $('ws-tasks');
  if (!el) return;
  const filtered = wsFilter === 'all' ? tasks : tasks.filter(t => t.status === wsFilter);
  if (!filtered.length) {
    el.innerHTML = '<div class="ws-empty">'
      + (wsFilter === 'all' ? 'NO TASKS YET — RUN A TEAM TO SEE WORK FLOW' : 'NO ' + wsFilter.toUpperCase() + ' TASKS')
      + '</div>';
    return;
  }

  // Group by team
  const byTeam = {};
  for (const t of filtered) {
    const key = t.teamId || '__standalone__';
    if (!byTeam[key]) byTeam[key] = [];
    byTeam[key].push(t);
  }

  const teamMap = {};
  for (const tr of (teams || [])) teamMap[tr.teamId] = tr;

  let html = '<div class="ws-task-board">';
  for (const [teamId, tTasks] of Object.entries(byTeam)) {
    const tr = teamMap[teamId];
    const teamLabel = tr ? esc(tr.teamName || teamId) : (teamId === '__standalone__' ? 'STANDALONE' : esc(teamId));
    const statusDotColor = !tr ? 'var(--muted)' : tr.status === 'running' ? 'var(--accent)' : tr.status === 'complete' ? 'var(--green)' : 'var(--red)';
    html += '<div class="ws-team-header">'
      + '<span class="ws-team-status-dot" style="background:' + statusDotColor + '"></span>'
      + teamLabel;
    if (tr?.goal) html += ' <span style="font-family:var(--font-mono);font-size:9px;color:var(--muted);font-weight:normal;letter-spacing:0">— ' + esc(tr.goal.slice(0, 60)) + (tr.goal.length > 60 ? '…' : '') + '</span>';
    html += '</div>';

    for (const t of tTasks) {
      const dur = t.durationMs != null ? (t.durationMs / 1000).toFixed(1) + 's' : '';
      const phase = t.phase === 'decompose' ? '⬡ ' : t.phase === 'synthesize' ? '◈ ' : '';
      html += '<div class="ws-task-card ' + esc(t.status) + '">'
        + '<div class="ws-task-dot ' + esc(t.status) + '"></div>'
        + '<div>'
          + '<div class="ws-task-label">' + phase + esc(t.label || t.taskId) + '</div>'
          + (t.lastStep ? '<div class="ws-task-step">' + esc(t.lastStep) + '</div>' : '')
          + (t.error    ? '<div style="font-family:var(--font-mono);font-size:9px;color:var(--red);margin-top:2px">' + esc(t.error.slice(0,80)) + '</div>' : '')
        + '</div>'
        + '<div class="ws-task-agent">' + esc(t.agentId) + '</div>'
        + '<div class="ws-task-meta">' + esc(t.status.toUpperCase()) + (dur ? ' · ' + dur : '') + '</div>'
        + '</div>';
    }
  }
  html += '</div>';
  el.innerHTML = html;
}
</script>

<!-- Approval Detail Modal -->
<div class="approval-modal-bg" id="approval-modal-bg" onclick="if(event.target===this)closeApprovalModal()">
  <div class="approval-modal">
    <div class="approval-modal-title">⚠ Tool Approval Required</div>
    <div class="approval-modal-tool" id="approval-modal-tool"></div>
    <div class="approval-modal-cd" id="approval-modal-cd"></div>
    <div class="approval-modal-reason" id="approval-modal-reason"></div>
    <div>
      <div class="approval-modal-input-label" style="margin-bottom:6px">Input Parameters</div>
      <div class="approval-modal-input" id="approval-modal-input"></div>
    </div>
    <div class="approval-modal-actions">
      <button class="btn-approve" id="approval-modal-approve">✓ Approve</button>
      <button class="btn-deny"    id="approval-modal-deny">✗ Deny</button>
    </div>
  </div>
</div>

<!-- Notification Panel (floating, fixed position) -->
<div class="notif-panel" id="notif-panel">
  <div class="notif-panel-hdr">
    <span>PENDING APPROVALS</span>
    <button class="notif-panel-close" onclick="toggleNotifPanel()">×</button>
  </div>
  <div id="notif-panel-body">
    <div class="notif-panel-empty">NO PENDING REQUESTS</div>
  </div>
</div>

</body>
</html>`;
}
