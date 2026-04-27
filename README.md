# AI_DESK (AI Desktop Security Gateway)

**AI_DESK** คือระบบ AI Gateway ที่ออกแบบมาโดยยึดหลัก **"Security-First"** และ **"Token-Efficient"** เป็นหัวใจสำคัญ สร้างขึ้นโดยอ้างอิงและพัฒนาต่อยอดจากสถาปัตยกรรม และ ปรับปรุงให้มีความปลอดภัยสูงขึ้นและประหยัดค่าใช้จ่ายในการเรียกใช้ Model ให้มากที่สุด

เหมาะสำหรับใช้เป็นศูนย์กลางในการรัน AI Agents และ Sub-agents ส่วนตัว โดยไม่ต้องกังวลเรื่องข้อมูลหลุด หรือค่าใช้จ่าย API ที่บานปลาย

---

## ✨ จุดเด่น (Core Principles)

### 🔒 Security-First (ปลอดภัยสูงสุด)
- **Mandatory Authentication:** บังคับให้มีการยืนยันตัวตนเสมอ (ไม่มี mode "none")
- **Encrypted at Rest:** ข้อมูลความลับทั้งหมด (Tokens, Sessions, Secrets, Memory) ถูกเข้ารหัสด้วย AES-256-GCM
- **Always-on Sandbox:** การทำงานของเครื่องมือต่างๆ (Tools) ถูกรันใน Sandbox เสมอ
- **Deny-all Default:** นโยบายเครื่องมือเริ่มต้นคือปิดทั้งหมด ต้องเปิดสิทธิ์ (allowlist) เท่านั้นถึงจะใช้งานได้
- **Tamper-evident Audit Log:** บันทึกประวัติการทำงานแบบ Hash-chain ป้องกันการแก้ไขข้อมูลย้อนหลัง
- **Threat Detection:** ตรวจจับ Prompt Injection, Jailbreak และคำสั่งอันตรายแบบเรียลไทม์

### 💰 Token-Efficient (ใช้ Token คุ้มค่าที่สุด)
- **Smart Model Router:** เลือกใช้ Model ให้เหมาะสมกับงาน (เช่น งานง่ายใช้ Flash, งานยากใช้ Opus)
- **Response Cache:** จดจำคำตอบที่เคยตอบไปแล้ว ไม่เสีย Token เรียกซ้ำ
- **Context Compaction:** สรุปประวัติการสนทนาอัตโนมัติเมื่อเริ่มยาวเกินไป
- **Budget Hard-stops:** กำหนดงบประมาณการใช้งานต่อวัน/เดือน ระบบจะหยุดการทำงานอัตโนมัติเมื่อเกินงบ
- **Sub-agent Flash Models:** งานคู่ขนาน (Parallel tasks) ถูกบังคับให้ใช้ Model ที่ถูกและเร็วที่สุดเสมอ

---

## 🚀 การติดตั้ง (Installation)

### ความต้องการของระบบ (Prerequisites)
- **Node.js**: เวอร์ชัน 22 ขึ้นไป
- **npm** (มาพร้อม Node.js)

### ขั้นตอนการติดตั้ง

1. **เปิดโฟลเดอร์โปรเจกต์**
   ```bash
   cd f:\AI_DESK
   ```

2. **ติดตั้ง Dependencies**
   ```bash
   npm install
   ```

3. **คัดลอกไฟล์ Environment**
   คัดลอกไฟล์เทมเพลต `.env.example` เป็น `.env`
   ```bash
   copy .env.example .env
   ```

4. **ตั้งค่ารหัสผ่านหลัก (Master Key) 🔒**
   เปิดไฟล์ `.env` ด้วย Text Editor และใส่รหัสผ่านหลักที่ `AI_DESK_MASTER_KEY` (ความยาวอย่างน้อย 16 ตัวอักษร)
   รหัสผ่านนี้ใช้สำหรับ**เข้ารหัสข้อมูลทั้งหมด** ห้ามทำหายเด็ดขาด
   ```env
   # ตัวอย่าง
   AI_DESK_MASTER_KEY="your-super-strong-master-key-here-1234"
   ```

---

## 🛠️ การใช้งาน (Usage)

AI_DESK มาพร้อมกับ Command Line Interface (CLI) สำหรับจัดการระบบ

### 1. การตรวจสอบความปลอดภัย (Security Audit)
แนะนำให้รันคำสั่งนี้ทุกครั้งหลังจากติดตั้งหรือปรับปรุงระบบ เพื่อให้แน่ใจว่าการตั้งค่าปลอดภัย
```bash
npx tsx src/cli/index.ts security audit
```
*ระบบจะตรวจสอบ 14 จุดสำคัญ และต้องได้คะแนน 100% ถึงจะถือว่าปลอดภัยเต็มรูปแบบ*

### 2. การสร้าง Token สำหรับเข้าใช้งาน
เนื่องจาก AI_DESK บังคับให้ยืนยันตัวตน คุณต้องสร้าง Token เพื่อใช้เชื่อมต่อ
```bash
npx tsx src/cli/index.ts token create --label "my-laptop"
```
*ระบบจะแสดง Token ออกมา **ให้คัดลอกเก็บไว้** เพราะจะแสดงเพียงครั้งเดียว*

การจัดการ Token อื่นๆ:
```bash
npx tsx src/cli/index.ts token list           # ดูรายการ Token ทั้งหมด
npx tsx src/cli/index.ts token revoke <id>    # ยกเลิก Token ที่ไม่ได้ใช้งาน
```

### 3. ตรวจสอบการตั้งค่า (Config Validation)
เช็คว่าไฟล์ `ai-desk.json` ถูกตั้งค่าอย่างถูกต้องและไม่มีจุดที่เสี่ยงต่อความปลอดภัย
```bash
npx tsx src/cli/index.ts config validate
```

### 4. ตั้งค่า API Key ของ Model Provider 🧠
AI_DESK รองรับหลาย Model Provider ใส่ key อย่างน้อย **หนึ่งตัว** ในไฟล์ `.env`
```env
ANTHROPIC_API_KEY="sk-ant-..."     # สำหรับ Claude
GOOGLE_AI_API_KEY="AIza..."        # สำหรับ Gemini (สำหรับ sub-agent / compaction)
```
*หมายเหตุ: Key อ่านจาก env เท่านั้น ห้ามใส่ใน `ai-desk.json`*

### 5. เปิดใช้งาน Gateway Server
เริ่มเปิดเซิร์ฟเวอร์เพื่อให้ Client เข้ามาเชื่อมต่อ (ค่าเริ่มต้น รันที่ `127.0.0.1:18789`)
```bash
npx tsx src/cli/index.ts gateway
```

### 6. คำสั่ง Phase 2 (Agent / Budget / Cache / Models)
```bash
# ทดสอบ agent loop จาก CLI โดยไม่ต้องผ่าน gateway
npx tsx src/cli/index.ts agent test "สรุปไฟล์ README ให้หน่อย"

# รายชื่อ agent ที่ตั้งไว้
npx tsx src/cli/index.ts agent list

# ดูสถานะงบประมาณ (token + cost)
npx tsx src/cli/index.ts budget show --agent main

# กลับมาใช้งานหลังถูก pause จากการเกิน budget
npx tsx src/cli/index.ts budget resume main

# ดูสถิติ Response Cache
npx tsx src/cli/index.ts cache stats
npx tsx src/cli/index.ts cache purge   # ลบเฉพาะที่หมดอายุ
npx tsx src/cli/index.ts cache clear   # ลบทั้งหมด

# รายการ Model Provider ที่ใช้งานได้
npx tsx src/cli/index.ts models
```

### 7. Skills Ecosystem 🎯
```bash
# ดู skill ทั้งหมดที่มี
npx tsx src/cli/index.ts skill list

# เปิดใช้ skill (เก็บสถานะใน .ai-desk-data/skills-state.json)
npx tsx src/cli/index.ts skill enable filesystem
npx tsx src/cli/index.ts skill enable code-review
npx tsx src/cli/index.ts skill enable brave-search   # ต้องตั้ง BRAVE_API_KEY ก่อน

# ดูรายละเอียด skill
npx tsx src/cli/index.ts skill info brave-search

# ปิด skill
npx tsx src/cli/index.ts skill disable shell
```

**เพิ่ม skill ของตัวเอง** — สร้างไฟล์ `skills/my-skill.skill.json`:
```json
{
  "name": "my-skill",
  "version": "1.0.0",
  "description": "Description here",
  "toolAllowlist": ["read_file", "grep"],
  "systemPromptAddition": "Extra instructions for the agent..."
}
```

### 8. เชื่อมต่อกับ Claude Code (MCP Server) 🔌
```bash
# เพิ่ม AI_DESK เป็น MCP server ใน Claude Code
claude mcp add ai-desk -- npx tsx src/cli/index.ts serve-mcp

# หรือรัน serve-mcp โดยตรง (Claude Desktop / Cursor)
npx tsx src/cli/index.ts serve-mcp
```

Claude Code จะเห็น tools ทั้งหมดจาก ToolRegistry + `agent_run` + `skill_list/enable/disable`

### 9. ตั้งค่า Messaging Adapters 💬
เพิ่มบอทใน `ai-desk.json` และใส่ token ใน `.env`:
```env
TELEGRAM_BOT_TOKEN="123456:ABC-..."
DISCORD_BOT_TOKEN="MTI..."
```

ตัวอย่าง config (`ai-desk.json`):
```json
{
  "messaging": {
    "telegram": {
      "enabled": true,
      "agentId": "main",
      "allowedChatIds": [123456789]
    },
    "discord": {
      "enabled": true,
      "agentId": "main",
      "prefix": "!",
      "allowedGuildIds": ["987654321098765432"]
    }
  }
}
```

```bash
# ตรวจสอบสถานะ adapter
npx tsx src/cli/index.ts messaging status

# เปิด adapter แบบ standalone (ไม่ต้องเปิด gateway เต็ม)
npx tsx src/cli/index.ts messaging start

# หรือเปิดพร้อม gateway (messaging เริ่มอัตโนมัติถ้าตั้งค่าไว้)
npx tsx src/cli/index.ts gateway
```

### 10. คำสั่ง Phase 3 (MCP / Orchestration)
```bash
# แสดง MCP server ทั้งหมดที่ตั้งค่าไว้ พร้อม tool ที่ค้นพบ
npx tsx src/cli/index.ts mcp list

# ทดสอบการเชื่อมต่อไปยัง MCP server ตัวใดตัวหนึ่ง
npx tsx src/cli/index.ts mcp test <server-name>

# รัน multi-agent task graph (JSON array ของ task definitions)
# แต่ละ task มี: id, agentId, prompt, depends (optional), label (optional)
npx tsx src/cli/index.ts orchestrate run '[
  {"id":"t1","agentId":"main","prompt":"สรุปไฟล์ README"},
  {"id":"t2","agentId":"main","prompt":"วิเคราะห์จาก: {{results.t1}}","depends":["t1"]}
]'
```

### 11. Teams & Roles  👥

เพิ่ม `teams` block ใน `ai-desk.json` (หรือดู `ai-desk.example.json`):
```json
{
  "teams": {
    "roles": [
      { "id": "planner",  "name": "Planner",  "description": "Breaks goals into tasks",
        "systemPromptPrefix": "You are a planning agent." },
      { "id": "executor", "name": "Executor", "description": "Implements assigned tasks" },
      { "id": "reviewer", "name": "Reviewer", "description": "Reviews output for quality" }
    ],
    "teams": [
      {
        "id": "dev-team", "name": "Dev Team",
        "leadAgentId": "main",
        "members": [
          { "agentId": "coder",    "roleId": "executor" },
          { "agentId": "reviewer", "roleId": "reviewer" }
        ]
      }
    ]
  }
}
```

```bash
# แสดง roles ที่ตั้งค่าไว้
npx tsx src/cli/index.ts role list

# แสดง teams ที่ตั้งค่าไว้
npx tsx src/cli/index.ts team list

# รัน team บน goal → decompose → execute in parallel → synthesise
npx tsx src/cli/index.ts team run dev-team "สร้าง REST API endpoint สำหรับ user registration"
```

**ขั้นตอนการทำงานของ TeamCoordinator:**
1. **Decompose** — lead agent รับ goal + ข้อมูลสมาชิกทีม แล้วส่งคืน JSON task list
2. **Execute** — Orchestrator รัน tasks แบบ parallel (ตาม dependencies)
3. **Synthesise** — lead agent รวมผลทุก task เป็นคำตอบสุดท้าย

### 12. Real-time Dashboard 📊

Dashboard เปิดอัตโนมัติพร้อม gateway:
```bash
npx tsx src/cli/index.ts gateway
# → http://127.0.0.1:18789/dashboard
```

Dashboard แสดง (live via SSE, auto-reconnect):
- **Agents** — สถานะแต่ละ agent (idle / running), model, active sessions
- **Teams** — team list พร้อมจำนวนสมาชิก
- **Budget** — daily/monthly token และ cost bars
- **Skills** — enabled/disabled พร้อม version
- **MCP Servers** — ready/error + tool count
- **Messaging** — Telegram/Discord connection status
- **Live Event Log** — 150 events ล่าสุดแบบ real-time

API เพิ่มเติม:
```
GET /dashboard/api/snapshot   → JSON snapshot ของสถานะปัจจุบัน
GET /dashboard/events         → SSE stream (event: snapshot / event: event)
```

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

### Phase 1 — Foundation
- `src/gateway/` - เซิร์ฟเวอร์และโปรโตคอลการเชื่อมต่อ WebSocket
- `src/auth/` - ระบบยืนยันตัวตน และจัดการ Token
- `src/security/` - Audit Log แบบ hash-chain และ Threat Detection
- `src/config/` - การจัดการและตรวจสอบความปลอดภัยของ Configuration
- `src/tools/` - Policy Engine (deny-all default) และ Sandbox
- `src/sessions/` - ระบบเก็บประวัติการสนทนา (เข้ารหัส)
- `src/shared/` - เครื่องมือที่ใช้ร่วมกัน เช่น crypto, event bus

### Phase 2 — Agent & Model Layer
- `src/models/` - Model Provider abstraction (Anthropic, Google), Smart Router with failover
- `src/budget/` - Budget Tracker พร้อมระบบ hard-stop (pause / warn / block)
- `src/cache/` - Response Cache (SQLite + AES-256-GCM encrypted)
- `src/agents/` - Agent Runtime, Context Compactor, Tool Registry/Executor, Sub-agent Spawner

### Phase 3 — MCP Integration & Multi-Agent Orchestration
- `src/mcp/` - MCP Client (stdio JSON-RPC 2.0), MCP Registry (multi-server lifecycle), MCP Tool Adapter
- `src/orchestration/` - Task Graph (DAG with cycle detection), Orchestrator (fan-out/fan-in parallel execution)

### Phase 4 (a) — Skills Ecosystem + MCP Server
- `src/skills/` - SkillDefinition (JSON), SkillLoader (env-var interpolation), SkillRegistry (enable/disable, composed system prompt, MCP injection, tool allowlist)
- `src/mcp/mcp-server.ts` - AI_DESK as MCP server (stdio, JSON-RPC 2.0) — tools/list, tools/call, prompts, agent_run meta-tool
- `skills/` - Built-in skill packs: `filesystem`, `web-fetch`, `code-review`, `shell`, `brave-search`

### Phase 4 (b) — Messaging Adapters
- `src/messaging/` - Telegram (long polling + typing indicator), Discord (Gateway WebSocket + auto-reconnect), MessagingManager (per-channel lock + queue, threat filtering)

### Phase 5 — Roles, Teams & Dashboard
- `src/roles/` - `RoleDefinition`, `TeamDefinition` (re-exported from config schema), `TeamCoordinator` (3-phase: decompose → execute → synthesise)
- `src/dashboard/` - `DashboardServer` (SSE at `/dashboard/events`, snapshot at `/dashboard/api/snapshot`), self-contained dark-theme SPA at `/dashboard`
- `src/__tests__/` - Unit tests: TaskGraph (15), PolicyEngine (13), ResponseCache (7), TeamCoordinator (9) — **44 tests, 0 failures**

---

## 🔁 Phase 2 Architecture (Agent Loop)

```
ChatMessage ─→ ThreatDetector ─→ Session ─→ Compactor ─→ BudgetCheck
                                                              │
                                                              ▼
                          ┌── ResponseCache ───────────── ModelRouter
                          │       (hit?)                       │
                          │                              ┌─────┴────┐
                          │                              ▼          ▼
                          │                          Anthropic    Google
                          │                              │          │
                          │                              └────┬─────┘
                          │                                   │
                          │                              ┌────┴────┐
                          │                              ▼         ▼
                          │                          end_turn?   tool_use?
                          │                              │         │
                          │                              │     ToolExecutor
                          │                              │       │
                          │                              │   PolicyEngine
                          │                              │       │
                          │                              │   ApprovalFlow ←─┐
                          │                              │       │          │
                          │                              │   SandboxManager │
                          │                              │       │          │
                          │                              │   ThreatDetector │
                          │                              │       │          │
                          │                              │   (loop back) ───┘
                          │                              ▼
                          └────── Reply + Cache.set + Budget.record + Session.update
```

**Sub-agents:** การ spawn sub-agent จะถูกบังคับใช้ flash model อัตโนมัติเสมอ (ผ่าน `ModelRouter.pickModel({ forSubagent: true })`) จำกัด depth ตาม config (default 3) และ inherit budget ของ parent

---
---

## 🔀 Phase 3 Architecture (MCP + Orchestration)

```
External MCP Server (stdio JSON-RPC 2.0)
        │
   McpClient ──→ McpRegistry ──→ McpToolAdapter
                                      │
                               ToolRegistry (transparent)
                                      │
                         PolicyEngine + ToolExecutor (same as built-ins)

Orchestrator
   ├─ TaskGraph (DAG, cycle detection, {{results.id}} template injection)
   └─ fan-out → AgentRuntime × N (parallel, up to maxConcurrent)
                    └─ fan-in → result aggregation + summary
```

**MCP:** External tool servers connect via stdio. Tools are filtered by `capabilities` allowlist, sandboxed, and subject to per-server daily token budgets. Named `mcp_<server>_<tool>` in the policy engine.

**Orchestration:** Tasks declare dependencies (DAG). Ready tasks run in parallel; results inject into downstream prompts via `{{results.<id>}}`. Failed tasks cascade-skip dependents unless `failFast: false`.

---
## 🏗️ Phase 5 Architecture (Teams)

```
ai-desk team run <teamId> <goal>
           │
    TeamCoordinator
           │
    ┌──────┴──────────────────────────────┐
    │  Phase 1: Decompose                 │
    │  lead agent → JSON task list        │
    └──────┬──────────────────────────────┘
           │
    ┌──────┴──────────────────────────────┐
    │  Phase 2: Execute (via Orchestrator) │
    │  TaskGraph (DAG)                    │
    │  ├─ task A  (agentId=coder)  ──┐    │
    │  ├─ task B  (agentId=coder)  ──┤ parallel
    │  └─ task C  (depends A,B)  ←──┘    │
    └──────┬──────────────────────────────┘
           │
    ┌──────┴──────────────────────────────┐
    │  Phase 3: Synthesise                │
    │  lead agent → final answer          │
    └─────────────────────────────────────┘
```

**Role system-prompt injection:** Each member's task prompt is prepended with their role's `systemPromptPrefix` before dispatch — no changes to AgentRuntime needed.

**Dashboard SSE flow:**
```
eventBus.emit(*) ─→ DashboardServer.broadcast() ─→ SSE clients
                         │
               periodic snapshot (10s) ─→ SSE clients
```

---

*ระบบอยู่ใน Phase 5 (Multi-agent Roles, Teams, Dashboard, 44 tests) — Phase ถัดไป: memory persistence (sqlite-vec), streaming responses, REST API*
