# AI\_DESK

A security-first gateway for running personal AI agents in a hardened, controlled environment. Authentication, sandboxing, and threat detection are mandatory and always-on — not optional add-ons.

---

## What is AI\_DESK?

AI\_DESK is a self-hosted AI agent gateway that sits between you and the AI providers (Anthropic, Google, OpenRouter). It manages:

- **Multiple AI agents** with per-agent model, tools, budget, and sandbox configuration
- **Messaging platform bots** (Telegram, Discord) that route to your agents
- **Token and cost budgets** with hard caps and automatic failover to cheaper models
- **Tool execution** in isolated sandboxes with an explicit allowlist policy
- **A web dashboard** for real-time monitoring, credentials management, and configuration

The guiding principle: every secret is encrypted, every tool call is checked against policy, every user input is scanned for threats.

---

## Features

### Security
- Multi-mode authentication (token / password / certificate) with brute-force lockout
- AES-256-GCM encryption for all secrets, sessions, tokens, and memory at rest
- Real-time threat detection — prompt injection, jailbreaks, command injection, social engineering
- Deny-all-by-default tool policy with explicit allowlisting per agent
- Mandatory process sandbox for all tool execution (timeout + memory limits)
- Tamper-evident audit log with SHA-256 hash chain validation
- Human-in-the-loop approval flow for sensitive tool operations

### Token & Cost Efficiency
- Response cache (SQLite-backed, configurable TTL) — cache hits return in under 1 ms
- Context compaction — auto-summarises old conversation history before hitting token limits
- Per-agent daily and monthly budgets (tokens + dollar cost) with hard stops
- Smart model router: primary → failover chain; sub-agents forced to cheaper models (e.g. Gemini Flash)

### Multi-Agent Orchestration
- Unlimited named agents with independent configuration
- Sub-agent spawning with configurable depth and concurrency limits
- Task orchestration (DAG fan-out across multiple agents)
- Team coordination with role-based delegation
- Session persistence and replay

### Integrations
- Telegram and Discord bots (per-bot agent routing, typing indicator, concurrency locking)
- Skills — modular capability bundles that inject tools, system-prompt fragments, and MCP servers
- MCP (Model Context Protocol) server support for external tool providers
- Cron-based scheduled agent runs
- HTTP webhooks that trigger agent invocations from external systems

---

## Quick Start

### Prerequisites
- Node.js 22+
- An Anthropic, Google, or OpenRouter API key

### Install

```bash

# install globally
npm install -g ai-desk@latest
```

### First Run

```bash
ai-desk onboard        # interactive setup wizard

```

On first run without a config file the gateway opens a setup wizard at `http://127.0.0.1:18789/setup`. Complete it to generate `ai-desk.json` and your first auth token.

Dashboard: `http://127.0.0.1:18789/dashboard`
Login: `http://127.0.0.1:18789/login`

### Background Daemon

```bash
ai-desk gateway --background        # start in background
ai-desk daemon install              # install as system service (systemd / launchd / Task Scheduler)
ai-desk daemon start
ai-desk daemon stop
ai-desk daemon restart
```

---

## Configuration

### Environment Variables (`.env`)

| Variable | Required | Description |
|---|---|---|
| `AI_DESK_MASTER_KEY` | **Yes** | Encryption passphrase for all at-rest secrets. If lost, encrypted data is unrecoverable — back it up. |
| `AI_DESK_DATA_DIR` | No | Runtime data directory (default: `./.ai-desk-data`) |
| `ANTHROPIC_API_KEY` | No | Anthropic API key (can also be stored via dashboard) |
| `GOOGLE_AI_API_KEY` | No | Google Gemini API key |
| `OPENROUTER_API_KEY` | No | OpenRouter API key |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token |
| `DISCORD_BOT_TOKEN` | No | Discord bot token |

### Config File (`ai-desk.json`)

```jsonc
{
  "gateway": {
    "bind": "127.0.0.1",   // bind address — never expose to 0.0.0.0 without a reverse proxy
    "port": 18789,
    "auth": {
      "mode": "token",     // "token" | "password" | "certificate"
      "maxFailedAttempts": 5,
      "lockoutDurationMs": 300000
    },
    "rateLimit": {
      "maxPerSecond": 10,
      "maxConnections": 50
    }
  },

  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-6",
        "failover": ["anthropic/claude-haiku-4-5-20251001", "google/gemini-2.5-flash"]
      },
      "sandbox": {
        "mode": "all",          // "all" | "untrusted"
        "timeoutMs": 30000,
        "maxMemoryMb": 512
      },
      "tools": {
        "profile": "deny-all", // "deny-all" | "readonly" | "messaging" | "full"
        "allow": [],
        "deny": []
      },
      "budget": {
        "daily":   { "tokens": 500000, "cost": 5.0,  "action": "pause" },
        "monthly": { "tokens": 5000000, "cost": 50.0, "action": "warn" }
      },
      "subagents": {
        "model": "google/gemini-2.5-flash",
        "maxDepth": 3,
        "maxConcurrent": 5
      }
    },
    "list": [
      {
        "id": "main",
        "default": true,
        "workspace": "."
      }
    ]
  },

  "messaging": {
    "telegram": {
      "enabled": true,
      "agentId": "main",
      "allowedChatIds": []   // empty = accept all chats
    },
    "discord": {
      "enabled": true,
      "agentId": "main",
      "prefix": "!ask",
      "allowedGuildIds": [],
      "allowedChannelIds": []
    }
  },

  "cache": {
    "enabled": true,
    "backend": "sqlite",
    "ttlSeconds": 3600
  }
}
```

---

## CLI Reference

### Gateway

```bash
ai-desk gateway                          # start gateway (interactive)
ai-desk gateway --background             # start in background
ai-desk gateway --config path/to/config  # use custom config path
```

### Agents

```bash
ai-desk agent test "your prompt"         # run a one-shot agent call from CLI
ai-desk agent list                       # list configured agents
```

### Auth Tokens

```bash
ai-desk token create                     # generate a new dashboard token
ai-desk token list
ai-desk token revoke <tokenId>
```

### Budget

```bash
ai-desk budget show                      # show usage summary
ai-desk budget resume <agentId>          # resume a paused agent
```

### Cache

```bash
ai-desk cache stats
ai-desk cache clear
ai-desk cache purge                      # purge expired entries
```

### Skills & MCP

```bash
ai-desk skill list
ai-desk skill enable <name>
ai-desk skill disable <name>
ai-desk skill info <name>

ai-desk mcp list
ai-desk mcp test <serverName>
```

### Multi-Agent

```bash
ai-desk team list
ai-desk team run <teamId> "goal"
ai-desk role list
ai-desk orchestrate run '[{"prompt":"...", "agentId":"main"}]'
```

### Security

```bash
ai-desk security audit                   # comprehensive security recommendations
```

---

## AI Providers & Models

| Provider | Models | Auth |
|---|---|---|
| **Anthropic** | `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` | API key or Claude Code OAuth (auto-detected from `~/.claude/`) |
| **Google** | `gemini-2.5-flash`, `gemini-2.0-pro`, `gemini-1.5-pro` | `GOOGLE_AI_API_KEY` |
| **OpenRouter** | 200+ models (`openrouter/anthropic/...`, `openrouter/openai/gpt-4o`, …) | `OPENROUTER_API_KEY` |

**Model routing:** each agent has a primary model and an ordered failover chain. Sub-agents default to the configured sub-agent model (typically Gemini Flash) to keep costs low. The compaction model (used for summarising history) defaults to Haiku.

---

## Messaging Platforms

### Telegram
- Bot polling with per-chat allowlisting
- Typing indicator refreshed every 4.5 s while the agent works
- Per-chat concurrency lock — queues new messages instead of dropping them
- Hot-connect a bot token from the dashboard without restarting

### Discord
- Guild and channel allowlisting
- Mention-based or prefix-based triggering (`!ask`)
- Per-channel concurrency lock with queuing

Both adapters normalise incoming messages to a common `IncomingMessage` format and route through the same agent runtime, threat scanner, and budget tracker.

---

## Dashboard

Access at `http://127.0.0.1:18789/dashboard` (requires auth token).

| Tab | What it shows |
|---|---|
| **Status** | Live system snapshot — agents, budget, MCP servers, event log |
| **Agents** | Agent list, status, session count; edit config with hot-reload |
| **Teams** | Team definitions and role assignments |
| **Roles** | Role registry with system-prompt fragments and delegation rules |
| **Skills** | Enable/disable skill bundles; view tool allowlists |
| **MCP Servers** | Connected external tool servers and their status |
| **Messaging** | Telegram/Discord connections; add per-agent bots |
| **Chat** | Live WebSocket chat with any configured agent |
| **History** | Session replay — browse and search past conversations |
| **Schedule** | Cron job management — create, enable/disable, run now |
| **Webhooks** | HTTP trigger endpoints — create, view invocation history |
| **Audit** | Tamper-evident audit log — filter by time, agent, event type |
| **Credentials** | Encrypted key storage for Anthropic, Google, OpenRouter |

Real-time updates are delivered via Server-Sent Events (SSE). The dashboard reconnects automatically with exponential backoff.

---

## Security Architecture

### Authentication
- Token, password, or certificate mode — one must be chosen; no "none" mode exists
- Failed-attempt counter per IP with configurable lockout duration
- Dashboard tokens stored hashed; raw token shown only once at creation time

### Threat Detection
Every incoming message is scanned before reaching the agent:
- Prompt injection patterns ("ignore previous instructions", fake system prompts)
- Jailbreak patterns ("DAN mode", "do anything now", roleplay bypass)
- Data exfiltration attempts
- Command injection
- Social engineering

Detected threats are blocked and logged; a short canned reply is sent to the user.

### Tool Policy
1. **Profile** sets the baseline: `deny-all`, `readonly`, `messaging`, or `full`
2. **Allow list** explicitly permits additional tools (wildcard support: `read*`)
3. **Deny list** blocks specific tools even if the profile would permit them
4. **Approval flow** — high-risk tools (e.g. `write_file`, `execute_command`) can require live human consent via WebSocket before execution

### Sandbox
All tool execution runs in isolated child processes:
- Configurable timeout (default 30 s)
- Memory cap (default 512 MB)
- Environment sanitised — secrets stripped before spawning
- Output limited to 1 MB per call

### Audit Log
- Every authentication event, tool call, budget violation, and threat detection is recorded
- Hash chain: each entry includes the SHA-256 of the previous entry
- Integrity can be verified at any time from the dashboard or CLI
- Stored in `.ai-desk-data/audit.db`

### Budget Controls
- Daily and monthly caps in tokens and dollar cost
- Actions on breach: `warn` (log + notify), `pause` (block new calls), `block` (immediate stop)
- Per-run maximums prevent single runaway calls from consuming the entire budget

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Client (Browser / Telegram / Discord / CLI)            │
└───────────────────────┬─────────────────────────────────┘
                        │  WebSocket / HTTP
┌───────────────────────▼─────────────────────────────────┐
│  Gateway Server                                         │
│  ├── Auth Manager       (token validation, lockout)     │
│  ├── Rate Limiter       (per-IP, per-connection)        │
│  ├── Dashboard Server   (HTTP + SSE)                    │
│  └── WebSocket Handler  (streaming chat)                │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│  Agent Runtime                                          │
│  ├── Threat Scanner     (input validation)              │
│  ├── Response Cache     (SQLite, TTL-based)             │
│  ├── Budget Tracker     (daily / monthly caps)          │
│  ├── Context Compactor  (auto-summarise history)        │
│  ├── Model Router       (primary + failover chain)      │
│  ├── Tool Executor      (policy check → sandbox)        │
│  ├── Sub-agent Spawner  (recursive, depth-limited)      │
│  └── Session Store      (encrypted persistence)         │
└───────────┬─────────────────────┬───────────────────────┘
            │                     │
┌───────────▼──────────┐ ┌───────▼──────────────────────┐
│  AI Providers        │ │  Tool Providers               │
│  ├── Anthropic       │ │  ├── Built-in tools           │
│  ├── Google Gemini   │ │  ├── MCP servers              │
│  └── OpenRouter      │ │  └── Skills                   │
└──────────────────────┘ └───────────────────────────────┘
```

**Request path (happy path):**

```
User message
  → Threat scanner
  → Cache lookup          ← hit: return immediately
  → Budget check
  → Model router → API call (streaming)
  → Tool calls → Policy check → Approval? → Sandbox → recurse
  → Session save (encrypted)
  → Budget deduct
  → Response streamed back
```

---

