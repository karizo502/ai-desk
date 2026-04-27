ขั้นตอนติดตั้งบนเครื่องใหม่
ก่อนเริ่ม — สิ่งที่ต้องมีในเครื่องใหม่
สิ่งที่ต้องการ	ตรวจสอบ	ติดตั้ง
Node.js 22+	node --version	nodejs.org → LTS
npm	npm --version	มาพร้อม Node.js
Git	git --version	git-scm.com
Python 3 + C++ build tools	จำเป็นสำหรับ better-sqlite3	ดูด้านล่าง
ติดตั้ง Build Tools (ทำครั้งเดียว):

# Windows — เปิด PowerShell แบบ Administrator
npm install -g windows-build-tools
# หรือถ้าไม่ได้ ให้ติดตั้ง Visual Studio Build Tools แทน
# https://visualstudio.microsoft.com/visual-cpp-build-tools/

# Linux (Ubuntu/Debian)
sudo apt install python3 build-essential

# macOS
xcode-select --install
ขั้นที่ 1 — คัดลอก Project ไปเครื่องใหม่
ตัวเลือก A: ผ่าน Git (แนะนำถ้ามี repo)

git clone <your-repo-url> AI_DESK
cd AI_DESK
ตัวเลือก B: คัดลอกไฟล์ตรงๆ

คัดลอกทุกอย่างยกเว้น:  node_modules/
                        dist/
                        .ai-desk-data/
                        .env
สิ่งที่ ต้องคัดลอก:

AI_DESK/
├── src/
├── skills/
├── package.json
├── package-lock.json
├── tsconfig.json
├── .env.example
└── ai-desk.example.json
ขั้นที่ 2 — ติดตั้ง Dependencies
cd AI_DESK
npm install
better-sqlite3 จะ compile native binary อัตโนมัติ — อาจใช้เวลา 1-2 นาที
ถ้า error ให้ตรวจสอบว่าติดตั้ง build tools ในขั้นก่อนหน้าเรียบร้อย

ขั้นที่ 3 — สร้างไฟล์ .env
# Windows
copy .env.example .env

# Linux/macOS
cp .env.example .env
เปิดไฟล์ .env แล้วใส่ค่าเหล่านี้ (บังคับ):

# ต้องใส่ — ใช้สุ่มรหัสผ่านที่แข็งแรง อย่างน้อย 32 ตัวอักษร
AI_DESK_MASTER_KEY=your-super-strong-random-passphrase-here
# ใส่อย่างน้อย 1 อัน
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIza...
ค่าเพิ่มเติม (ถ้าใช้ features เหล่านี้):

# Messaging
TELEGRAM_BOT_TOKEN=123456:ABC-...
DISCORD_BOT_TOKEN=MTI...
# Skills (brave-search)
BRAVE_API_KEY=BSA...
⚠️ สำคัญมาก: AI_DESK_MASTER_KEY เข้ารหัสข้อมูลทั้งหมด — ถ้าหายจะกู้คืนไม่ได้ ให้เก็บไว้ใน password manager

ขั้นที่ 4 — สร้างไฟล์ ai-desk.json
# Windows
copy ai-desk.example.json ai-desk.json

# Linux/macOS
cp ai-desk.example.json ai-desk.json
แก้ค่าในไฟล์ตามต้องการ — ค่าเริ่มต้นใช้งานได้เลย ไม่ต้องแก้อะไรถ้าแค่อยากทดสอบ

ขั้นที่ 5 — ตรวจสอบความปลอดภัย
npx tsx src/cli/index.ts security audit
ผลที่ควรได้ — ต้องผ่าน 100% (ไม่มี FAIL):

🔒 AI_DESK Security Audit
══════════════════════════════════════
✓ Gateway binds to localhost only
✓ Auth mode configured
✓ Master key set
✓ Sandbox always-on
...
Score: 100% (20 passed, 0 failed)
ถ้ามี FAIL ให้แก้ตามที่ระบุก่อนดำเนินการต่อ

ขั้นที่ 6 — Build TypeScript (สำหรับ Production)
npm run build
จะสร้างโฟลเดอร์ dist/ — ใช้รันในโหมด production แทน tsx

ถ้าแค่ทดสอบหรือ development ข้ามขั้นนี้ได้ — ใช้ npx tsx โดยตรงได้เลย

ขั้นที่ 7 — เปิดใช้งาน
Development / ทดสอบ:

npx tsx src/cli/index.ts gateway
Production (หลัง build):

npm start
ผลที่ควรเห็น:

┌─────────────────────────────────────────────┐
│         AI_DESK Security Gateway            │
├─────────────────────────────────────────────┤
│  Status:    🟢 Running                      │
│  Bind:      127.0.0.1                       │
│  Port:      18789                           │
│  Dashboard: http://127.0.0.1:18789/dashboard│
└─────────────────────────────────────────────┘
🔑 Initial auth token generated:
   aid_xxxxxxxxxxxxxxxxxxxx
   Save this token — it will not be shown again.
คัดลอก token ไว้ — ใช้ตอน connect จาก client

ขั้นที่ 8 — ทดสอบว่าใช้งานได้
# ทดสอบ agent โดยตรงจาก CLI (ไม่ต้องผ่าน WebSocket)
npx tsx src/cli/index.ts agent test "สวัสดี บอกชื่อตัวเองหน่อย"

# เช็ค dashboard ในเบราว์เซอร์
# http://127.0.0.1:18789/dashboard

# เช็ค health endpoint
curl http://127.0.0.1:18789/health
(Optional) ขั้นที่ 9 — รันเป็น Background Service
Linux — systemd:

# /etc/systemd/system/ai-desk.service
[Unit]
Description=AI_DESK Gateway
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/AI_DESK
EnvironmentFile=/path/to/AI_DESK/.env
ExecStart=/usr/bin/node dist/cli/index.js gateway
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
sudo systemctl enable ai-desk
sudo systemctl start ai-desk
sudo systemctl status ai-desk
Windows — PM2:

npm install -g pm2
pm2 start dist/cli/index.js --name ai-desk -- gateway
pm2 save
pm2 startup   # ตาม instruction ที่แสดง
สรุปสั้นๆ (copy-paste)
git clone <repo> AI_DESK && cd AI_DESK
npm install
cp .env.example .env          # แก้ AI_DESK_MASTER_KEY + API keys
cp ai-desk.example.json ai-desk.json
npx tsx src/cli/index.ts security audit
npm run build
npm start
