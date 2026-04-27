# 🧠 AI_DESK — คู่มือการใช้งานฉบับสมบูรณ์ (Advanced Documentation)

ยินดีต้อนรับสู่คู่มือการใช้งาน **AI_DESK** ระบบ AI Gateway ระดับ Enterprise ที่ออกแบบมาเพื่อความปลอดภัยสูงสุด (Security-First) และการทำงานร่วมกันของ Multi-Agent อย่างมีประสิทธิภาพ คู่มือนี้จะครอบคลุมทุกฟีเจอร์ การตั้งค่า และคำสั่ง CLI ทุกคำสั่งที่มีในระบบครับ

---

## 1. การติดตั้งและการเริ่มต้น (Installation & Setup)

### ความต้องการของระบบ
*   **Node.js:** v18.0.0 ขึ้นไป
*   **OS:** Windows, Linux, หรือ macOS
*   **Memory:** แนะนำ 1GB ขึ้นไปสำหรับ Gateway และ Sandbox

### ขั้นตอนการติดตั้งแบบละเอียด
1.  **โคลนโปรเจกต์และติดตั้ง Dependencies:**
    ```bash
    npm install
    ```
2.  **ตั้งค่าตัวแปรสภาพแวดล้อม (Environment Variables):**
    คัดลอกไฟล์ `.env.example` ไปเป็น `.env`
    ```bash
    cp .env.example .env
    ```
    เปิดไฟล์ `.env` และตั้งค่า **`AI_DESK_MASTER_KEY`** (แนะนำให้สร้างรหัสผ่านยาวๆ ที่เดายาก ห้ามทำหายเด็ดขาด เพราะคีย์นี้จะใช้เข้ารหัสข้อมูลทุกอย่างในระบบ หากหาย ข้อมูลทั้งหมดจะไม่สามารถกู้คืนได้)

3.  **คอมไพล์ระบบ (Build):**
    ```bash
    npm run build
    ```
4.  **รันขั้นตอน Onboarding (ตั้งค่าครั้งแรก):**
    ```bash
    ai-desk onboard
    ```
    ขั้นตอนนี้จะเปิดหน้า Setup Wizard บนเว็บให้คุณตรวจสอบความพร้อมของระบบ ตั้งค่า Model Provider และช่วยสร้าง Auth Token แรกให้คุณ

---

## 2. คู่มือคำสั่ง CLI (Full CLI Reference)

ระบบของ AI_DESK มาพร้อมกับ CLI ที่ครอบคลุมทุกการจัดการ โดยแบ่งเป็นหมวดหมู่ดังนี้:

### 🚀 2.1 การจัดการ Gateway (Gateway Management)
คำสั่งสำหรับเปิดเซิร์ฟเวอร์หลักที่ใช้ควบคุม API, Dashboard และ WebSocket
| คำสั่ง | ออปชัน (Options) | คำอธิบาย |
| :--- | :--- | :--- |
| `ai-desk gateway` | `-c, --config <path>`<br>`--setup-port <port>`<br>`-b, --background` | เริ่มเซิร์ฟเวอร์ Gateway (ถ้ายังไม่เคยตั้งค่า จะเปิดหน้า Setup Wizard ให้อัตโนมัติ หากใส่ `-b` จะเป็นการรันเบื้องหลัง) |
| `ai-desk stop` | | หยุดโปรเซส Gateway ที่รันอยู่เบื้องหลัง (ด้วย `-b`) |
| `ai-desk restart` | `-c, --config <path>` | สั่งหยุดแล้วรีสตาร์ทโปรเซส Gateway ที่รันเบื้องหลัง |

### 🛠️ 2.2 การจัดการ Daemon (System Service)
ใช้สำหรับรัน AI_DESK เป็น Background Service ของระบบปฏิบัติการ (ให้เริ่มทำงานทันทีเมื่อเปิดเครื่อง)
| คำสั่ง | ออปชัน (Options) | คำอธิบาย |
| :--- | :--- | :--- |
| `ai-desk daemon install` | `-c, --config <path>` | ติดตั้งและเริ่มรัน AI_DESK เป็น System Service (Windows Task Scheduler, systemd, หรือ launchd) |
| `ai-desk daemon uninstall` | | หยุดและถอนการติดตั้ง Service ออกจากระบบ |
| `ai-desk daemon start` | | เริ่มการทำงานของ Service (ถ้าเคยติดตั้งไว้แล้ว) |
| `ai-desk daemon stop` | | หยุดการทำงานของ Service ชั่วคราว |
| `ai-desk daemon restart` | | สั่งหยุดแล้วเริ่มการทำงานของ Service ใหม่ |
| `ai-desk daemon status` | | ตรวจสอบสถานะการทำงานและการติดตั้งของ Service |

### 🔑 2.3 การจัดการโทเค็นและความปลอดภัย (Security & Tokens)
| คำสั่ง | ออปชัน (Options) | คำอธิบาย |
| :--- | :--- | :--- |
| `ai-desk security audit` | `-c, --config <path>` | รันระบบตรวจสอบความปลอดภัย (สแกนหาช่องโหว่ในการตั้งค่าทั้งหมด) |
| `ai-desk token create` | `-l, --label <label>` | สร้าง Auth Token ใหม่สำหรับการเข้าใช้งาน API หรือ Dashboard |
| `ai-desk token list` | | แสดงรายชื่อ Auth Tokens ทั้งหมดที่มีในระบบ |
| `ai-desk token revoke <tokenId>` | | ยกเลิกการใช้งาน (Revoke) โทเค็นที่ระบุทันที |

### 🤖 2.4 การจัดการ Agent, Team และ Role
| คำสั่ง | ออปชัน (Options) | คำอธิบาย |
| :--- | :--- | :--- |
| `ai-desk agent list` | `-c, --config <path>` | แสดงรายชื่อ Agent ทั้งหมดที่กำหนดไว้ในคอนฟิก |
| `ai-desk agent test <prompt>`| `-a, --agent <id>`<br>`--max-steps <n>` | ทดสอบรัน Agent ตัวเดียวผ่าน CLI (ไม่ต้องเปิด Gateway) เหมาะสำหรับเทสต์ Prompt ด่วนๆ |
| `ai-desk role list` | `-c, --config <path>` | แสดงรายชื่อบทบาท (Roles) ทั้งหมดที่กำหนดไว้ในทีม |
| `ai-desk team list` | `-c, --config <path>` | แสดงรายชื่อทีม (Teams) และสมาชิกในแต่ละทีม |
| `ai-desk team run <teamId> <goal>`| `-c, --config <path>` | สั่งให้ทีมระดมสมองและทำงานร่วมกันเพื่อบรรลุเป้าหมาย (Goal) ที่กำหนด |
| `ai-desk orchestrate run <jsonPath>`| `--max-concurrent <n>`<br>`--fail-fast` | รันงานตามไฟล์ Task Graph แบบระบุ JSON โดยตรง (ทำงานแบบขนาน) |

### 📊 2.5 การจัดการงบประมาณและ Cache
| คำสั่ง | ออปชัน (Options) | คำอธิบาย |
| :--- | :--- | :--- |
| `ai-desk budget show` | `-a, --agent <id>` | แสดงสถานะงบประมาณและจำนวน Token ที่ใช้งานไปของแต่ละ Agent |
| `ai-desk budget resume <agentId>` | | ปลดล็อก Agent ที่ถูกระงับการทำงาน (Pause) ชั่วคราวเนื่องจากใช้งบเกิน |
| `ai-desk cache stats` | | แสดงสถิติการใช้งาน Response Cache (อัตรา Hit/Miss และจำนวน Token ที่ประหยัดได้) |
| `ai-desk cache clear` | | ลบข้อมูล Cache ทั้งหมดทันที |
| `ai-desk cache purge` | | ลบเฉพาะข้อมูล Cache ที่หมดอายุแล้ว (Expired) |

### 🧠 2.6 ข้อมูล Model Providers, Skills และ MCP
| คำสั่ง | ออปชัน (Options) | คำอธิบาย |
| :--- | :--- | :--- |
| `ai-desk models` | | ตรวจสอบสถานะการเชื่อมต่อและรายชื่อโมเดลจากผู้ให้บริการ (Anthropic, Google, OpenRouter) |
| `ai-desk skill list` | `--skills-dir <path>` | แสดงรายชื่อ Skill ทั้งหมดที่ระบบค้นพบและสถานะ (เปิด/ปิด) |
| `ai-desk skill enable <name>` | `--skills-dir <path>` | เปิดใช้งาน Skill ที่ระบุ |
| `ai-desk skill disable <name>` | `--skills-dir <path>` | ปิดใช้งาน Skill ที่ระบุ |
| `ai-desk skill info <name>` | `--skills-dir <path>` | แสดงรายละเอียดความสามารถแบบเจาะลึกของ Skill นั้นๆ |
| `ai-desk mcp list` | `-c, --config <path>` | แสดงรายชื่อ MCP Servers ที่กำหนดไว้และ Tools ที่มี |
| `ai-desk mcp test <serverName>` | `-c, --config <path>` | ทดสอบการเชื่อมต่อกับ MCP Server ตัวใดตัวหนึ่งโดยเฉพาะ |
| `ai-desk serve-mcp` | `-c, --config <path>` | รันระบบ AI_DESK ให้อยู่ในโหมด MCP Server เพื่อให้ AI ภายนอก (เช่น Claude Desktop) มาเชื่อมต่อได้ |

### 💬 2.7 การตั้งค่าและการส่งข้อความ (Config & Messaging)
| คำสั่ง | ออปชัน (Options) | คำอธิบาย |
| :--- | :--- | :--- |
| `ai-desk config validate` | `-c, --config <path>` | ตรวจสอบความถูกต้องของไฟล์ `ai-desk.json` |
| `ai-desk messaging status` | `-c, --config <path>` | ตรวจสอบสถานะของ Messaging Adapters (Telegram, Discord) |
| `ai-desk messaging start` | `-c, --config <path>` | รัน Messaging Adapters แยกต่างหาก (Stand-alone) สำหรับการทดสอบ |

---

## 3. สถาปัตยกรรมความปลอดภัย (Security Architecture)

AI_DESK ถูกสร้างขึ้นด้วยแนวคิด **Zero-Trust** และ **Security-First** โดยมีฟีเจอร์หลักคือ:

1.  **Encryption At Rest (AES-256-GCM):**
    *   API Keys ที่กรอกผ่าน Dashboard จะถูกเก็บเข้ารหัสทันทีในไฟล์ `.ai-desk-data/security/credentials.db`
    *   ประวัติการสนทนา (Session) และ Audit Logs จะถูกเข้ารหัสทั้งหมด
    *   หากไม่มี `MASTER_KEY` ใน `.env` ไฟล์เหล่านี้จะไม่สามารถเปิดอ่านได้เลย
2.  **Mandatory Sandbox:**
    *   โค้ดที่รันโดยคำสั่ง `exec_command` จะต้องถูกส่งเข้าไปทำงานใน Sandbox เสมอ
    *   คุณสามารถเลือกระดับ Sandbox ได้: `all` (บังคับให้ Tools ทุกอันรันใน Sandbox) หรือ `untrusted` (รันเฉพาะตัวที่เสี่ยง)
3.  **Threat Detector:**
    *   ระบบมีเอนจิ้นสำหรับสแกน Prompt Injection, Jailbreak และข้อมูลอันตราย ทั้งในฝั่งขาเข้า (User Message) และฝั่งขาออก (Tool Output)

---

## 4. ระบบการทำงานร่วมกันแบบทีม (Teams, Roles & Orchestrator)

โครงสร้างการสั่งงานของทีมใน AI_DESK ประกอบไปด้วย 3 องค์ประกอบหลัก:

### 4.1 บทบาท (Roles)
ใช้กำหนดหน้าที่และลักษณะนิสัยให้แต่ละ Agent (ตั้งค่าได้ใน `ai-desk.json`) เช่น:
*   `executor` (เน้นการลงมือทำและใช้ Tool)
*   `reviewer` (เน้นตรวจสอบข้อผิดพลาดและวิจารณ์ผลงาน)
*   **systemPromptPrefix:** สามารถใส่คำสั่งเฉพาะเจาะจงให้ Role ได้ เช่น `"You are a security auditor. Always check for memory leaks."`

### 4.2 การทำงานของทีม (Teams & Lead Agent)
เมื่อคุณรันคำสั่ง `ai-desk team run` ระบบจะทำางานตามขั้นตอน (Phase) ดังนี้:
1.  **Phase 1 (Decomposition):** หัวหน้าทีม (`leadAgentId`) รับโจทย์มาและวิเคราะห์ แล้วแตกเป็นชิ้นงานย่อยๆ (Tasks)
2.  **Phase 2 (Orchestration):** ตัวจัดการลำดับคิว (Orchestrator) จะโยนงานย่อยไปให้สมาชิกในทีม (`members`) ทำแบบขนานกัน (Parallel) ตามลำดับเงื่อนไขก่อนหลัง (Dependencies)
3.  **Phase 3 (Synthesis):** เมื่อทุกคนทำงานเสร็จ หัวหน้าทีมจะรวบรวมผลลัพธ์ทั้งหมด สรุป และตอบกลับผู้ใช้

> **คำแนะนำสำหรับ Team:** คุณสามารถใส่คำสั่งควบคุมนิสัยของหัวหน้าทีม (Lead Agent) โดยเพิ่มฟิลด์ `"sharedGoal": "..."` ในค่าคอนฟิกของทีม หัวหน้าทีมจะนำกฎเหล่านี้ไปพิจารณาในขั้นตอนการวางแผนครับ

---

## 5. การจัดการงบประมาณและโมเดล (Budget & Model Routing)

### 5.1 ระบบงบประมาณ (Budget Policy)
ช่วยควบคุมค่าใช้จ่ายและการใช้โควต้าไม่ให้ไหลเกินขีดจำกัด:
*   คุณสามารถตั้งค่า `tokens` (จำนวน Token สูงสุด) และ `cost` (งบประมาณเป็น USD) รายวัน/รายเดือน แยกตามราย Agent
*   มีฟิลด์ `"action": "warn" | "pause" | "block"` เพื่อระบุว่าเมื่อถึงขีดจำกัดแล้วให้ระบบทำอะไร
*   มี Context Compactor คอยบีบอัดบทสนทนาที่ยาวเกินไปให้สั้นลงโดยอัตโนมัติ

### 5.2 ระบบเลือกโมเดลอัตโนมัติ (Model Router)
*   รองรับ **OpenRouter** ซึ่งทำให้คุณสามารถใช้โมเดลมากกว่า 200 ตัว (เช่น Claude 3.5, GPT-4o, Llama 3) ได้ในคีย์เดียว
*   รองรับระบบ **Failover** ถ้า `primary` โมเดลเกิดล่ม (API ตอบกลับ Error) ระบบจะวิ่งไปเรียกโมเดลสำรอง (`failover` list) ให้อัตโนมัติ

---

## 6. การขยายความสามารถ (Extensibility)

คุณสามารถเพิ่มความสามารถให้ระบบได้โดยไม่ต้องแก้โค้ดหลัก ผ่านระบบ **Skills** และ **MCP**:

### 6.1 การสร้าง Skill
สร้างไฟล์รูปแบบ JSON ลงในโฟลเดอร์ `skills/` เช่น `coding-assistant.skill.json`:
```json
{
  "name": "coding-assistant",
  "version": "1.0.0",
  "description": "ความสามารถพิเศษสำหรับนักเขียนโค้ด",
  "systemPromptAddition": "ทุกครั้งที่คุณเขียนโค้ด คุณต้องสร้าง Unit Test ด้วย",
  "toolAllowlist": ["write_file", "read_file", "list_files"]
}
```
*   `systemPromptAddition`: แทรกกฎหมายให้ Agent ของคุณ
*   `toolAllowlist`: เปิดสิทธิ์ Tool เหล่านี้ให้อัตโนมัติเมื่อเปิดใช้ Skill นี้
*   *(เปิดใช้งานด้วยคำสั่ง `ai-desk skill enable coding-assistant`)*

### 6.2 Model Context Protocol (MCP)
คุณสามารถนำ MCP Server จากแหล่งอื่นๆ มาพ่วงเข้ากับระบบได้ ทำให้ Agent สามารถใช้ Tools ของภายนอกได้ (เช่น Database Client, GitHub, Fetcher) โดยระบบจะรันผ่าน Sandbox เพื่อความปลอดภัย

---

## 7. ปัญหาที่พบบ่อย (Troubleshooting)

1.  **Error: `No model providers available`**
    *   **สาเหตุ:** คุณยังไม่ได้ใส่ API Key หรือคีย์อาจจะผิด
    *   **วิธีแก้:** กรอกในไฟล์ `.env` หรือเข้าไปกรอกผ่านหน้า Dashboard เมนู Credentials แล้วรันคำสั่งเดิมใหม่
2.  **Error: `MASTER_KEY mismatch` หรืออ่านไฟล์ Audit/Session ไม่ได้**
    *   **สาเหตุ:** มีการเปลี่ยนแปลงค่าใน `AI_DESK_MASTER_KEY` ทำให้ระบบถอดรหัสฐานข้อมูลที่เคยเข้ารหัสด้วยคีย์เดิมไม่ได้
    *   **วิธีแก้:** ต้องกลับไปใช้คีย์เดิม หรือลบโฟลเดอร์ `.ai-desk-data` ทิ้งเพื่อรีเซ็ตระบบใหม่ทั้งหมด
3.  **Agent บอกว่าทำงานเสร็จแล้ว แต่ความจริงไม่ได้สร้างไฟล์ / ไม่ได้ทำอะไรเลย (Hallucination)**
    *   **สาเหตุ:** โมเดลที่คุณเลือกอาจจะไม่เก่งพอสำหรับการจัดการ Tool หรือคำสั่ง (มักเกิดกับโมเดลสาย Free)
    *   **วิธีแก้:** ใน `ai-desk.json` ให้เลือกใช้ `leadAgent` และ Agent ที่ทำหน้า Executor เป็นโมเดลเกรดสูงขึ้น (เช่น Claude 3.5 Sonnet หรือ GPT-4o) เพื่อการันตีการตอบสนองที่ถูกต้องต่อคำสั่งครับ

---
*จัดทำเอกสารสำหรับ AI_DESK Framework รุ่นล่าสุด*
