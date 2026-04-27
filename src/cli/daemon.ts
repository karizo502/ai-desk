/**
 * AI_DESK — Daemon Installer
 *
 * Installs the gateway as a background service that starts on boot.
 *
 * Platform support:
 *   Windows  — Task Scheduler (schtasks) with ONSTART trigger, no extra deps
 *   Linux    — systemd unit file at /etc/systemd/system/ai-desk.service
 *   macOS    — launchd plist at ~/Library/LaunchAgents/com.ai-desk.gateway.plist
 */
import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname as pathDirname, resolve } from 'node:path';
import { homedir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = pathDirname(__filename);

export const SERVICE_NAME = 'AI_DESK';
export const PLIST_ID     = 'com.ai-desk.gateway';

// ─── Public API ──────────────────────────────────────────────────────────────

export interface DaemonStatus {
  installed: boolean;
  running:   boolean;
  platform:  string;
  detail:    string;
}

export async function installDaemon(configPath = 'ai-desk.json'): Promise<void> {
  const nodePath  = process.execPath;
  const scriptPath = resolve(__dirname, 'index.js');

  switch (process.platform) {
    case 'win32':  await installWindows(nodePath, scriptPath, configPath); break;
    case 'linux':  await installLinux(nodePath, scriptPath, configPath);   break;
    case 'darwin': await installMacos(nodePath, scriptPath, configPath);   break;
    default: throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

export async function uninstallDaemon(): Promise<void> {
  switch (process.platform) {
    case 'win32':  await uninstallWindows(); break;
    case 'linux':  await uninstallLinux();   break;
    case 'darwin': await uninstallMacos();   break;
    default: throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

export async function startDaemon(): Promise<void> {
  switch (process.platform) {
    case 'win32':  runSafe('schtasks', ['/Run', '/TN', SERVICE_NAME]); break;
    case 'linux':  runSafe('systemctl', ['start', 'ai-desk']); break;
    case 'darwin': runSafe('launchctl', ['start', PLIST_ID]); break;
    default: throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

export async function stopDaemon(): Promise<void> {
  switch (process.platform) {
    case 'win32':  runSafe('schtasks', ['/End', '/TN', SERVICE_NAME]); break;
    case 'linux':  runSafe('systemctl', ['stop', 'ai-desk']); break;
    case 'darwin': runSafe('launchctl', ['stop', PLIST_ID]); break;
    default: throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

export async function restartDaemon(): Promise<void> {
  await stopDaemon();
  await daemonSleep(1500);
  await startDaemon();
}

function daemonSleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export function daemonStatus(): DaemonStatus {
  switch (process.platform) {
    case 'win32':  return statusWindows();
    case 'linux':  return statusLinux();
    case 'darwin': return statusMacos();
    default: return { installed: false, running: false, platform: process.platform, detail: 'unsupported platform' };
  }
}

// ─── Windows ─────────────────────────────────────────────────────────────────

async function installWindows(nodePath: string, scriptPath: string, configPath: string): Promise<void> {
  const absConfig = resolve(configPath);
  const workDir   = resolve(process.cwd());
  mkdirSync(resolve(workDir, '.ai-desk-data'), { recursive: true });

  // ── Approach 1: XML import (handles any path, all Windows versions) ──────────
  // schtasks /XML requires UTF-16 LE *with* BOM — Node's 'utf-16le' omits it.
  const xmlTask = windowsTaskXml(nodePath, scriptPath, absConfig, workDir);
  const tmpXml  = resolve(process.env.TEMP ?? process.env.TMP ?? homedir(), 'ai-desk-task.xml');
  const bom     = Buffer.from([0xff, 0xfe]);
  writeFileSync(tmpXml, Buffer.concat([bom, Buffer.from(xmlTask, 'utf16le')]));

  try {
    execSync(`schtasks /Create /TN "${SERVICE_NAME}" /XML "${tmpXml}" /F`, { stdio: 'pipe' });
    execSync(`schtasks /Run   /TN "${SERVICE_NAME}"`, { stdio: 'pipe' });
    return; // success
  } catch { /* fall through to PowerShell */ }

  // ── Approach 2: PowerShell Register-ScheduledTask (Win8+, no quoting issues) ─
  // PS single-quoted strings need '' to escape a literal '.
  const ps1 = (s: string) => s.replace(/'/g, "''");
  const psScript = [
    `$a = New-ScheduledTaskAction`,
    `  -Execute '${ps1(nodePath)}'`,
    `  -Argument '\\"${ps1(scriptPath)}\\" gateway --config \\"${ps1(absConfig)}\\"'`,
    `  -WorkingDirectory '${ps1(workDir)}'`,
    `$t = New-ScheduledTaskTrigger -AtLogOn`,
    `$s = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit 0`,
    `Register-ScheduledTask -Force -TaskName '${SERVICE_NAME}' -Action $a -Trigger $t -Settings $s`,
    `Start-ScheduledTask -TaskName '${SERVICE_NAME}'`,
  ].join('; ');

  try {
    execSync(`powershell -NonInteractive -NoProfile -Command "${psScript}"`, { stdio: 'pipe' });
    return; // success
  } catch { /* fall through to wrapper-cmd approach */ }

  // ── Approach 3: wrapper .cmd + schtasks (last resort, needs no-spaces path) ──
  // Write a tiny launcher script so /TR never needs embedded quotes.
  const dataDir   = resolve(homedir(), '.ai-desk');
  mkdirSync(dataDir, { recursive: true });
  const wrapperPath = resolve(dataDir, 'start.cmd');
  writeFileSync(
    wrapperPath,
    `@echo off\r\n"${nodePath}" "${scriptPath}" gateway --config "${absConfig}"\r\n`,
    'utf-8',
  );

  if (wrapperPath.includes(' ')) {
    throw new Error(
      `All three install methods failed.\n` +
      `Your home directory path contains spaces ("${dataDir}") which prevents the\n` +
      `fallback wrapper-script approach.\n\n` +
      `Manual fix: create a .cmd file in a space-free directory with content:\n` +
      `  @echo off\n  "${nodePath}" "${scriptPath}" gateway --config "${absConfig}"\n` +
      `Then run: schtasks /Create /TN "AI_DESK" /TR "C:\\no-spaces\\path\\start.cmd" /SC ONLOGON /F`,
    );
  }

  execSync(`schtasks /Create /TN "${SERVICE_NAME}" /TR "${wrapperPath}" /SC ONLOGON /F`, { stdio: 'pipe' });
  execSync(`schtasks /Run   /TN "${SERVICE_NAME}"`, { stdio: 'pipe' });
}

function windowsTaskXml(nodePath: string, scriptPath: string, configPath: string, workDir: string): string {
  // Escape XML special characters in attribute/text values
  const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>AI_DESK Security Gateway — auto-start on login</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled></LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure><Interval>PT1M</Interval><Count>10</Count></RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${x(nodePath)}</Command>
      <Arguments>&quot;${x(scriptPath)}&quot; gateway --config &quot;${x(configPath)}&quot;</Arguments>
      <WorkingDirectory>${x(workDir)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;
}

async function uninstallWindows(): Promise<void> {
  runSafe('schtasks', ['/Delete', '/TN', SERVICE_NAME, '/F']);
}

function statusWindows(): DaemonStatus {
  try {
    const out = execSync(`schtasks /Query /TN "${SERVICE_NAME}" /FO LIST 2>&1`, { stdio: 'pipe' }).toString();
    const running = out.includes('Running');
    const installed = !out.toLowerCase().includes('not found') && !out.toLowerCase().includes('cannot find');
    return { installed, running, platform: 'windows', detail: out.split('\n').slice(0, 6).join(' | ') };
  } catch {
    return { installed: false, running: false, platform: 'windows', detail: 'not installed' };
  }
}

// ─── Linux ───────────────────────────────────────────────────────────────────

async function installLinux(nodePath: string, scriptPath: string, configPath: string): Promise<void> {
  const workDir  = process.cwd();
  const envFile  = resolve(workDir, '.env');
  const envLine  = existsSync(envFile) ? `EnvironmentFile=${envFile}` : '';
  const user     = process.env.USER ?? process.env.USERNAME ?? 'root';

  const unit = `[Unit]
Description=AI_DESK Security-First AI Gateway
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${workDir}
ExecStart=${nodePath} ${scriptPath} gateway --config ${resolve(configPath)}
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
${envLine}

[Install]
WantedBy=multi-user.target
`;

  const unitPath = '/etc/systemd/system/ai-desk.service';

  try {
    writeFileSync(unitPath, unit, 'utf-8');
  } catch {
    // Likely need sudo
    const tmpPath = resolve(process.env.TMPDIR ?? '/tmp', 'ai-desk.service');
    writeFileSync(tmpPath, unit, 'utf-8');
    execSync(`sudo mv "${tmpPath}" "${unitPath}"`, { stdio: 'inherit' });
  }

  execSync('sudo systemctl daemon-reload', { stdio: 'inherit' });
  execSync('sudo systemctl enable ai-desk', { stdio: 'inherit' });
  execSync('sudo systemctl start ai-desk',  { stdio: 'inherit' });
}

async function uninstallLinux(): Promise<void> {
  runSafe('sudo', ['systemctl', 'stop', 'ai-desk']);
  runSafe('sudo', ['systemctl', 'disable', 'ai-desk']);
  try { unlinkSync('/etc/systemd/system/ai-desk.service'); } catch { /* already gone */ }
  runSafe('sudo', ['systemctl', 'daemon-reload']);
}

function statusLinux(): DaemonStatus {
  try {
    const out = execSync('systemctl is-active ai-desk 2>&1', { stdio: 'pipe' }).toString().trim();
    const running = out === 'active';
    const installed = existsSync('/etc/systemd/system/ai-desk.service');
    return { installed, running, platform: 'linux', detail: out };
  } catch (e) {
    const installed = existsSync('/etc/systemd/system/ai-desk.service');
    return { installed, running: false, platform: 'linux', detail: String(e) };
  }
}

// ─── macOS ───────────────────────────────────────────────────────────────────

async function installMacos(nodePath: string, scriptPath: string, configPath: string): Promise<void> {
  const workDir = process.cwd();
  const envFile = resolve(workDir, '.env');
  const launchDir = resolve(homedir(), 'Library', 'LaunchAgents');
  mkdirSync(launchDir, { recursive: true });

  // Build EnvironmentVariables dict from .env if it exists
  let envBlock = '';
  if (existsSync(envFile)) {
    const lines = readFileSync(envFile, 'utf-8').split('\n');
    const pairs: string[] = [];
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m) {
        pairs.push(`    <key>${m[1]}</key>\n    <string>${m[2].replace(/&/g,'&amp;').replace(/</g,'&lt;')}</string>`);
      }
    }
    if (pairs.length > 0) {
      envBlock = `  <key>EnvironmentVariables</key>\n  <dict>\n${pairs.join('\n')}\n  </dict>\n`;
    }
  }

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_ID}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${scriptPath}</string>
    <string>gateway</string>
    <string>--config</string>
    <string>${resolve(configPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${workDir}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${resolve(workDir, '.ai-desk-data', 'gateway.log')}</string>
  <key>StandardErrorPath</key>
  <string>${resolve(workDir, '.ai-desk-data', 'gateway-error.log')}</string>
${envBlock}</dict>
</plist>
`;

  const plistPath = resolve(launchDir, `${PLIST_ID}.plist`);
  writeFileSync(plistPath, plist, 'utf-8');
  execSync(`launchctl load -w "${plistPath}"`, { stdio: 'inherit' });
}

async function uninstallMacos(): Promise<void> {
  const plistPath = resolve(homedir(), 'Library', 'LaunchAgents', `${PLIST_ID}.plist`);
  if (existsSync(plistPath)) {
    runSafe('launchctl', ['unload', '-w', plistPath]);
    try { unlinkSync(plistPath); } catch { /* already gone */ }
  }
}

function statusMacos(): DaemonStatus {
  const plistPath = resolve(homedir(), 'Library', 'LaunchAgents', `${PLIST_ID}.plist`);
  const installed = existsSync(plistPath);
  try {
    const out = execSync(`launchctl list ${PLIST_ID} 2>&1`, { stdio: 'pipe' }).toString();
    const running = !out.includes('Could not find');
    return { installed, running, platform: 'macos', detail: out.split('\n')[0] ?? '' };
  } catch {
    return { installed, running: false, platform: 'macos', detail: 'not loaded' };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function runSafe(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { stdio: 'pipe' });
  if (r.error) throw r.error;
}
