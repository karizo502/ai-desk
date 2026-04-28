/**
 * AI_DESK — Setup Wizard HTML
 *
 * Self-contained SPA. Steps:
 *   1  Welcome
 *   2  Master encryption key
 *   3  API credentials (Anthropic + Google)
 *   4  Gateway config (port, sandbox)
 *   5  Launching…
 *   6  Done — shows token + Go to Chat button
 */
export function getSetupHtml(): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI_DESK — Setup</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d1117;--bg2:#161b22;--bg3:#21262d;--border:#30363d;
  --text:#c9d1d9;--muted:#8b949e;--accent:#58a6ff;
  --green:#3fb950;--red:#f85149;--yellow:#d29922;
}
body{background:var(--bg);color:var(--text);font-family:'Cascadia Code','Fira Code',Consolas,monospace;
     min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}

/* ── progress bar ── */
.progress{width:100%;max-width:540px;margin-bottom:28px}
.progress-steps{display:flex;gap:6px}
.progress-step{flex:1;height:3px;border-radius:2px;background:var(--border);transition:background .3s}
.progress-step.done{background:var(--green)}
.progress-step.active{background:var(--accent)}

/* ── card ── */
.card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;
      padding:32px;width:100%;max-width:540px}
.card-title{font-size:18px;font-weight:700;color:var(--text);margin-bottom:6px}
.card-sub{color:var(--muted);font-size:13px;margin-bottom:24px;line-height:1.6}

/* ── form elements ── */
label{display:block;font-size:12px;color:var(--muted);margin-bottom:5px;letter-spacing:.04em}
input[type=text],input[type=password],input[type=number],select{
  width:100%;background:var(--bg3);border:1px solid var(--border);color:var(--text);
  padding:9px 12px;border-radius:6px;font-family:inherit;font-size:13px;margin-bottom:14px}
input:focus,select:focus{outline:none;border-color:var(--accent)}
input::placeholder{color:var(--muted)}

/* ── buttons ── */
.btn{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:6px;
     border:1px solid var(--border);background:var(--bg3);color:var(--text);
     cursor:pointer;font-family:inherit;font-size:13px;font-weight:500;transition:opacity .15s}
.btn:hover{opacity:.8}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#0d1117;font-weight:700}
.btn.full{width:100%;justify-content:center;margin-top:8px}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-row{display:flex;gap:10px;margin-top:4px}

/* ── key box ── */
.key-box{background:var(--bg3);border:1px solid var(--border);border-radius:6px;
         padding:10px 14px;font-size:12px;word-break:break-all;color:var(--accent);
         margin-bottom:14px;cursor:pointer;position:relative}
.key-box .copy-hint{position:absolute;right:10px;top:8px;color:var(--muted);font-size:10px}

/* ── tag ── */
.tag{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600}
.tag.green{background:rgba(63,185,80,.15);color:var(--green)}
.tag.red{background:rgba(248,81,73,.15);color:var(--red)}
.tag.blue{background:rgba(88,166,255,.15);color:var(--accent)}
.tag.muted{background:var(--bg3);color:var(--muted)}
.tag.cc{background:rgba(88,166,255,.15);color:var(--accent)} /* Claude Code auto-use */

/* ── status line ── */
.status{font-size:12px;min-height:18px;margin-top:6px}
.status.ok{color:var(--green)} .status.err{color:var(--red)} .status.info{color:var(--muted)}

/* ── launch steps ── */
.launch-step{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px}
.launch-step:last-child{border-bottom:none}
.spin{animation:spin 1s linear infinite;display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── done token ── */
.token-box{background:var(--bg3);border:1px dashed var(--accent);border-radius:6px;
           padding:12px 14px;font-size:12px;color:var(--accent);word-break:break-all;
           margin:14px 0;cursor:pointer;position:relative;text-align:center}
.token-box .copy-hint{font-size:10px;color:var(--muted);margin-top:4px}

/* ── toggle helper ── */
.step{display:none} .step.active{display:block}
</style>
</head>
<body>

<div class="progress">
  <div class="progress-steps" id="prog"></div>
</div>

<div class="card" id="card">

  <!-- ── Step 1: Welcome ── -->
  <div class="step active" id="s1">
    <div class="card-title">👋 Welcome to AI_DESK</div>
    <div class="card-sub">
      This wizard will configure your gateway in a few steps.<br>
      No files needed — everything is set up from here.
    </div>
    <div style="margin-bottom:18px">
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;gap:8px;font-size:13px">
          <span style="color:var(--green)">🔒</span> Encrypted credentials at rest
        </div>
        <div style="display:flex;align-items:center;gap:8px;font-size:13px">
          <span style="color:var(--accent)">⚡</span> Multi-model routing with failover
        </div>
        <div style="display:flex;align-items:center;gap:8px;font-size:13px">
          <span style="color:var(--yellow)">🤖</span> Multi-agent teams
        </div>
      </div>
    </div>
    <button class="btn primary full" onclick="go(2)">Get Started →</button>
  </div>

  <!-- ── Step 2: Master Key ── -->
  <div class="step" id="s2">
    <div class="card-title">🔑 Master Encryption Key</div>
    <div class="card-sub">
      Encrypts all secrets, sessions, and tokens at rest.<br>
      <strong style="color:var(--red)">Save it somewhere safe — if lost, data is unrecoverable.</strong>
    </div>
    <div id="gen-key-box" class="key-box" onclick="copyKey()" style="display:none">
      <span id="gen-key-val"></span>
      <span class="copy-hint">click to copy</span>
    </div>
    <button class="btn full" id="btn-gen-key" onclick="genKey()">⚙ Auto-generate secure key</button>
    <div style="text-align:center;color:var(--muted);font-size:11px;margin:10px 0">— or enter your own —</div>
    <label>Master key (min 16 characters)</label>
    <input type="password" id="master-key" placeholder="Enter a strong passphrase…">
    <div class="status" id="key-status"></div>
    <button class="btn primary full" onclick="nextFromKey()">Continue →</button>
  </div>

  <!-- ── Step 3: Credentials ── -->
  <div class="step" id="s3">
    <div class="card-title">🧠 API Credentials</div>
    <div class="card-sub">
      At least one provider is required. Keys are stored encrypted.<br>
      You can add or change them later via Dashboard → Credentials.
    </div>

    <!-- Claude Code auto-detect banner -->
    <div id="cc-banner" style="display:none;background:rgba(63,185,80,.08);border:1px solid rgba(63,185,80,.3);
         border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:12px">
      <div style="color:var(--green);font-weight:600;margin-bottom:4px">✓ Claude Code detected</div>
      <div style="color:var(--muted)">AI_DESK will reuse your existing Claude Code login — no API key needed.</div>
    </div>

    <label>
      Anthropic API key <span class="tag muted" id="ant-tag">optional</span>
    </label>
    <input type="password" id="ant-key" placeholder="sk-ant-api03-…" oninput="updateCredTags()">

    <label>
      Google / Gemini API key <span class="tag muted" id="goo-tag">optional</span>
    </label>
    <input type="password" id="goo-key" placeholder="AIza…" oninput="updateCredTags()">

    <label>
      OpenRouter API key <span class="tag muted" id="or-tag">optional</span>
      <span style="color:var(--muted);font-weight:400"> — access 200+ models via one key</span>
    </label>
    <input type="password" id="or-key" placeholder="sk-or-v1-…" oninput="updateCredTags()">

    <div class="status err" id="cred-status"></div>
    <div class="btn-row">
      <button class="btn" onclick="go(2)">← Back</button>
      <button class="btn primary" style="flex:1" onclick="nextFromCreds()">Continue →</button>
    </div>
  </div>

  <!-- ── Step 4: Gateway Config ── -->
  <div class="step" id="s4">
    <div class="card-title">⚙ Gateway Config</div>
    <div class="card-sub">Defaults work fine for most setups.</div>

    <label>Port</label>
    <input type="number" id="cfg-port" value="18789" min="1024" max="65535">

    <label>Bind address</label>
    <select id="cfg-bind">
      <option value="127.0.0.1">127.0.0.1 — localhost only (recommended)</option>
      <option value="0.0.0.0">0.0.0.0 — local network (less secure)</option>
    </select>

    <label>Sandbox mode</label>
    <select id="cfg-sandbox">
      <option value="all">all — sandbox every tool call (safest)</option>
      <option value="untrusted">untrusted — sandbox untrusted tools only</option>
      <option value="none">none — no sandbox (fastest)</option>
    </select>

    <div class="btn-row">
      <button class="btn" onclick="go(3)">← Back</button>
      <button class="btn primary" style="flex:1" onclick="launch()">🚀 Launch Gateway</button>
    </div>
  </div>

  <!-- ── Step 5: Launching ── -->
  <div class="step" id="s5">
    <div class="card-title">🚀 Setting up…</div>
    <div class="card-sub">Creating your configuration and starting the gateway.</div>
    <div id="launch-steps" style="margin-top:16px"></div>
    <div class="status" id="launch-status" style="margin-top:12px"></div>
  </div>

  <!-- ── Step 6: Done ── -->
  <div class="step" id="s6">
    <div class="card-title">✅ Gateway Running!</div>
    <div class="card-sub">
      Your auth token is shown below — save it now.<br>
      Access your gateway at: <strong style="color:var(--accent)" id="final-url-text">http://127.0.0.1:18789/</strong>
    </div>
    <div class="token-box" id="token-display" onclick="copyToken()">
      <span id="token-val">—</span>
      <div class="copy-hint">click to copy token</div>
    </div>
    <button class="btn primary full" id="btn-go-login" onclick="openDash()">
      🔑 Go to Login →
    </button>
  </div>

</div><!-- /card -->

<script>
// ── state ──────────────────────────────────────────────────
let currentStep = 1;
const TOTAL = 5; // visible steps (step 6 is "done")
let generatedKey     = '';
let savedToken       = '';
let chatUrl          = '';
let dashUrl          = '';
let claudeCodeFound  = false;

// ── progress bar ───────────────────────────────────────────
function renderProgress(step) {
  const prog = document.getElementById('prog');
  prog.innerHTML = '';
  for (let i = 1; i <= TOTAL; i++) {
    const d = document.createElement('div');
    d.className = 'progress-step' + (i < step ? ' done' : i === step ? ' active' : '');
    prog.appendChild(d);
  }
}

function go(n) {
  document.getElementById('s' + currentStep).classList.remove('active');
  currentStep = n;
  document.getElementById('s' + n).classList.add('active');
  renderProgress(Math.min(n, TOTAL));
  if (n === 3) checkClaudeCode();
}

// ── step 2 ─────────────────────────────────────────────────
async function genKey() {
  const r = await fetch('/setup/api/generate-key');
  const d = await r.json();
  generatedKey = d.key;
  document.getElementById('gen-key-val').textContent = generatedKey;
  document.getElementById('gen-key-box').style.display = '';
  document.getElementById('btn-gen-key').textContent = '↺ Regenerate';
  document.getElementById('master-key').value = '';
  setStatus('key-status', 'Generated key loaded — click the box to copy it.', 'info');
}

function copyKey() {
  const val = generatedKey || document.getElementById('master-key').value;
  if (val) navigator.clipboard?.writeText(val).then(() =>
    setStatus('key-status', '✔ Copied to clipboard.', 'ok'));
}

function nextFromKey() {
  const key = generatedKey || document.getElementById('master-key').value.trim();
  if (key.length < 16) {
    setStatus('key-status', 'Key must be at least 16 characters.', 'err');
    return;
  }
  setStatus('key-status', '', '');
  go(3);
}

// ── step 3 ─────────────────────────────────────────────────
async function checkClaudeCode() {
  try {
    const r = await fetch('/setup/api/check');
    const d = await r.json();
    claudeCodeFound = !!d.claudeCodeAvailable;
    document.getElementById('cc-banner').style.display = claudeCodeFound ? '' : 'none';
    updateCredTags();
  } catch { /* ignore */ }
}

function updateCredTags() {
  const ant = document.getElementById('ant-key').value.trim();
  const goo = document.getElementById('goo-key').value.trim();
  const or_ = document.getElementById('or-key').value.trim();
  setTag('ant-tag', ant ? 'set' : claudeCodeFound ? 'cc' : 'optional',
         ant ? 'green' : claudeCodeFound ? 'blue' : 'muted');
  setTag('goo-tag', goo ? 'set' : 'optional', goo ? 'green' : 'muted');
  setTag('or-tag',  or_ ? 'set' : 'optional', or_ ? 'green' : 'muted');
}

function nextFromCreds() {
  const ant = document.getElementById('ant-key').value.trim();
  const goo = document.getElementById('goo-key').value.trim();
  const or_ = document.getElementById('or-key').value.trim();
  if (!ant && !goo && !or_ && !claudeCodeFound) {
    document.getElementById('cred-status').textContent =
      'Enter at least one API key — or install Claude Code to use its login.';
    return;
  }
  document.getElementById('cred-status').textContent = '';
  go(4);
}

// ── step 5/6: launch ───────────────────────────────────────
async function launch() {
  go(5);

  const masterKey   = generatedKey || document.getElementById('master-key').value.trim();
  const antKey      = document.getElementById('ant-key').value.trim();
  const gooKey      = document.getElementById('goo-key').value.trim();
  const orKey       = document.getElementById('or-key').value.trim();
  const port        = parseInt(document.getElementById('cfg-port').value) || 18789;
  const bind        = document.getElementById('cfg-bind').value;
  const sandbox     = document.getElementById('cfg-sandbox').value;

  const steps = [
    { id: 'ls-env',     label: 'Writing .env …' },
    { id: 'ls-config',  label: 'Writing ai-desk.json …' },
    { id: 'ls-token',   label: 'Creating auth token …' },
    { id: 'ls-gateway', label: 'Starting gateway …' },
  ];

  const container = document.getElementById('launch-steps');
  container.innerHTML = steps.map(s =>
    '<div class="launch-step" id="' + s.id + '">' +
    '<span class="spin">⏳</span><span>' + s.label + '</span></div>'
  ).join('');

  try {
    // Animate through steps with short delay
    for (let i = 0; i < steps.length - 1; i++) {
      await sleep(300);
      tickStep(steps[i].id);
    }

    // Last step: actually send the launch request
    const res = await fetch('/setup/api/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        masterKey,
        anthropicKey:  antKey  || undefined,
        googleKey:     gooKey  || undefined,
        openrouterKey: orKey   || undefined,
        port, bind, sandbox,
      }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      setStatus('launch-status', '✖ ' + (data.error || 'Launch failed'), 'err');
      return;
    }

    tickStep(steps[steps.length - 1].id);

    savedToken = data.token ?? '';
    chatUrl    = data.chatUrl ?? 'http://127.0.0.1:' + port + '/#chat';
    dashUrl    = data.dashboardUrl ?? 'http://127.0.0.1:' + port + '/';

    document.getElementById('final-url-text').textContent = dashUrl;

    // Wait for gateway to bind before showing done
    await sleep(800);
    document.getElementById('token-val').textContent = savedToken;
    go(6);
    renderProgress(TOTAL + 1); // all done
  } catch (e) {
    setStatus('launch-status', '✖ ' + e.message, 'err');
  }
}

function openChat() {
  // Pass token via URL hash so it doesn't appear in server logs
  window.location.href = chatUrl + '&tok=' + encodeURIComponent(savedToken);
}
function openDash() {
  // Append token to hash for auto-login if possible
  window.location.href = dashUrl + '#tok=' + encodeURIComponent(savedToken);
}

function copyToken() {
  if (savedToken) navigator.clipboard?.writeText(savedToken)
    .then(() => { document.querySelector('#token-display .copy-hint').textContent = '✔ Copied!'; });
}

// ── helpers ────────────────────────────────────────────────
function setStatus(id, msg, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'status' + (cls ? ' ' + cls : '');
}
function setTag(id, text, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'tag ' + cls;
}
function tickStep(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = '<span style="color:var(--green)">✔</span><span>' + el.querySelector('span:last-child').textContent + '</span>';
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── init ───────────────────────────────────────────────────
renderProgress(1);
</script>
</body>
</html>`;
}
