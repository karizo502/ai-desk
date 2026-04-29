/**
 * AI_DESK — Login Page HTML
 *
 * A dedicated, cinematic login page for the gateway.
 */

export function getLoginHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI_DESK — Login</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Bebas+Neue&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0c0c0c;
  --bg-card: rgba(244,239,229,0.015);
  --bg-input: #151515;
  --border: rgba(244,239,229,0.10);
  --text: #f4efe5;
  --muted: rgba(244,239,229,0.55);
  --accent: #c89048;
  --accent-soft: rgba(200, 144, 72, 0.1);
  --font-main: 'Inter', 'Outfit', sans-serif;
  --font-tactical: 'Bebas Neue', 'Impact', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --shadow: 0 4px 30px rgba(0,0,0,0.5);
  --transition: all 0.15s ease;
  --red: #e26b5a;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-main);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

/* ── Background Decoration ──────────────────────────────── */
body::before {
  content: '';
  position: absolute;
  width: 150%;
  height: 150%;
  background: radial-gradient(circle at center, var(--accent-soft) 0%, transparent 70%);
  opacity: 0.1;
  animation: pulse 10s infinite alternate;
}
@keyframes pulse { from { transform: scale(1); } to { transform: scale(1.1); } }

/* ── Login Card ─────────────────────────────────────────── */
.login-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 0;
  padding: 60px 40px;
  width: 100%;
  max-width: 440px;
  text-align: center;
  box-shadow: var(--shadow);
  z-index: 10;
  position: relative;
  overflow: hidden;
  animation: slideUp 0.5s ease;
}
.login-card::after {
  content: ''; position: absolute; top: 0; right: 0; width: 120px; height: 120px; pointer-events: none;
  background-image: repeating-linear-gradient(-45deg, rgba(200,144,72,0.10) 0 1px, transparent 1px 8px);
  -webkit-mask-image: linear-gradient(225deg, #000 0%, transparent 70%);
  mask-image: linear-gradient(225deg, #000 0%, transparent 70%);
}
@keyframes slideUp { from { transform: translateY(32px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.logo-box {
  width: 72px; height: 72px; background: var(--accent); color: #0c0c0c;
  display: grid; place-items: center;
  font-size: 52px; font-weight: 700; border-radius: 0;
  margin: 0 auto 32px auto;
  font-family: var(--font-tactical);
  box-shadow: 0 0 40px rgba(200,144,72,0.15);
}

.login-logo {
  font-size: 52px; font-weight: 700; margin-bottom: 8px; letter-spacing: 12px;
  font-family: var(--font-tactical);
  color: var(--text);
}

.login-subtitle {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 11px;
  margin-bottom: 48px;
  text-transform: uppercase;
  letter-spacing: 0.4em;
  opacity: 0.8;
}

/* ── Form ───────────────────────────────────────────────── */
.input-group {
  margin-bottom: 24px;
  text-align: left;
}
label {
  display: block;
  font-size: 10px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  margin-bottom: 8px;
  margin-left: 4px;
}

.login-input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 14px 18px;
  border-radius: 0;
  font-family: var(--font-mono);
  font-size: 14px;
  outline: none;
  transition: var(--transition);
  text-align: center;
  letter-spacing: 1px;
}
.login-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.login-btn {
  width: 100%;
  background: var(--accent);
  color: #000;
  border: none;
  padding: 16px;
  border-radius: 0;
  font-weight: 700;
  cursor: pointer;
  transition: var(--transition);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 13px;
  font-family: var(--font-mono);
  margin-top: 12px;
}
.login-btn:hover {
  filter: brightness(1.08);
}
.login-btn:active { filter: brightness(0.95); }

#login-err {
  color: #e26b5a;
  font-family: var(--font-mono);
  font-size: 11px;
  margin-top: 24px;
  min-height: 16px;
  letter-spacing: 0.05em;
}

/* ── Footer ─────────────────────────────────────────────── */
.footer-text {
  position: absolute;
  bottom: 40px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--muted);
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

/* ── Loading Overlay ────────────────────────────────────── */
.loader {
  display: none;
  margin: 0 auto;
  width: 20px;
  height: 20px;
  border: 2px solid var(--bg-input);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.btn-content.loading .text { display: none; }
.btn-content.loading .loader { display: block; }
</style>
</head>
<body>

<div class="login-card">
  <div class="logo-box">A</div>
  <div class="login-logo">AI_DESK</div>
  <div class="login-subtitle">SECURE TERMINAL ACCESS</div>

  <div class="input-group">
    <label for="login-token">Authentication Token</label>
    <input type="password" id="login-token" class="login-input" placeholder="••••••••••••••••" autocomplete="off">
  </div>

  <button class="login-btn" onclick="tryLogin()">
    <div class="btn-content" id="btn-content">
      <span class="text">INITIALIZE SESSION</span>
      <div class="loader"></div>
    </div>
  </button>

  <div id="login-err"></div>
</div>

<div class="footer-text">
  AUTHORIZED PERSONNEL ONLY • ENCRYPTION ACTIVE
</div>

<script>
const $ = id => document.getElementById(id);

async function tryLogin() {
  const t = $('login-token').value.trim();
  if (!t) return;

  const btn = $('btn-content');
  const err = $('login-err');

  btn.classList.add('loading');
  err.textContent = '';

  try {
    const r = await fetch('/dashboard/api/snapshot?token=' + encodeURIComponent(t));
    if (r.ok) {
      localStorage.setItem('ai_desk_token', t);
      // Success! Redirect to dashboard
      window.location.href = '/dashboard';
    } else {
      const data = await r.json();
      err.textContent = data.error || 'INVALID ACCESS TOKEN';
      btn.classList.remove('loading');
    }
  } catch (e) {
    err.textContent = 'CONNECTION FAILURE';
    btn.classList.remove('loading');
  }
}

// Allow Enter key
$('login-token').addEventListener('keypress', e => {
  if (e.key === 'Enter') tryLogin();
});

// Auto-fill from hash if present (useful after setup)
const hashToken = location.hash.match(/tok=([^&]+)/);
if (hashToken) {
  $('login-token').value = decodeURIComponent(hashToken[1]);
  // Clean hash
  history.replaceState(null, '', location.pathname);
  // Auto-login
  setTimeout(tryLogin, 500);
}

// If already logged in, redirect to dashboard
const existing = localStorage.getItem('ai_desk_token');
if (existing) {
  // Optional: verify it? For now just go.
  window.location.href = '/dashboard';
}
</script>

</body>
</html>`;
}
