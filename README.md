# Isan Bid Finder

เว็บหน้าเดียวสำหรับค้นหา E-Bidding และ E-Market ที่ยังเปิดรับข้อเสนอใน 20 จังหวัดภาคอีสาน ใช้ Gemini สกัดกรอบธุรกิจจากข้อมูลสัญญาส่วนตัวแบบ offline และจัดหมวดประกาศก่อนบันทึกลง Supabase

## Product boundary

- Production ไม่มีข้อมูล ชื่อ หรือหน้าผลงานของนิติบุคคลที่ใช้เป็น Discovery Seed
- แสดงเฉพาะประกาศที่มีวิธีจัดซื้อ พื้นที่ วันปิดรับ และ HTTPS source URL ที่ตรวจสอบได้
- การซิงก์ใหม่เป็น snapshot; รอบที่ล้มเหลวไม่แทนที่ snapshot ที่สำเร็จล่าสุด
- AI จัดหมวดตอน ingestion การค้นหาปกติจึงไม่ต้องรอ AI

## Run locally

Requires Node.js 20.9 or newer.

```powershell
npm install
npm run dev
```

หากยังไม่มี `.env.local` ระบบ development จะแสดงข้อมูลตัวอย่าง 3 รายการโดยอัตโนมัติ ข้อมูลตัวอย่างถูกปิดใน production เสมอ

## Supabase setup

1. สร้าง Supabase project สำหรับ environment ที่ต้องการ
2. รัน `supabase/migrations/0001_initial.sql` ผ่าน Supabase CLI หรือ SQL Editor
3. คัดลอก `.env.example` เป็น `.env.local` แล้วกรอก server-only credentials
4. ใส่ Secret Key (`sb_secret_...`) ใน `SUPABASE_SECRET_KEY` หรือใช้ legacy service-role key ใน `SUPABASE_SERVICE_ROLE_KEY`
5. อย่าใช้ `NEXT_PUBLIC_` กับ Secret/Service Role Key หรือ Gemini key

RLS ถูกเปิดทุกตารางและไม่มี policy สำหรับ `anon`/`authenticated` หน้าเว็บค้นผ่าน server เท่านั้น

## Build the autonomous taxonomy

ดึงชื่อโครงการของ Discovery Seed จากชุดข้อมูลจัดซื้อจัดจ้างทางการทุกปีที่มีบน Data.go.th โดยผลลัพธ์จะเก็บเฉพาะชื่อโครงการ ไม่เก็บชื่อหรือเลขนิติบุคคล:

```powershell
npm run seed:fetch-data-go
```

หรือวางข้อมูลส่วนตัวเป็น NDJSON/JSON array ที่ `data/private/company-contracts.ndjson` แต่ละ record ต้องมีฟิลด์ชื่อโครงการ เช่น `title`, `project_name` หรือ `ชื่อโครงการ` จากนั้นรัน:

```powershell
npm run taxonomy:discover
```

สคริปต์ส่งเฉพาะชื่อโครงการให้ Gemini ไม่ส่งชื่อบริษัท และบันทึกผลที่ `data/taxonomy.generated.json` ซึ่งถูก gitignore หากตั้งค่า Supabase แล้ว สคริปต์จะ publish taxonomy เวอร์ชันใหม่ด้วย transaction เดียว

## Daily ingestion

กำหนด `DATA_GO_TH_OPEN_TENDER_RESOURCE_IDS`, API key, Supabase และ Gemini แล้วรัน:

```powershell
npm run sync
```

Vercel Cron เรียก `/api/cron/sync` เวลา 22:00 UTC หรือ 05:00 น. เวลาไทย พร้อม `CRON_SECRET` การเรียกต้นทาง retry สูงสุด 3 ครั้ง หากกำหนด private `DISCOVERY_SEED_URL` ระบบจะสร้าง taxonomy เวอร์ชันใหม่ใน memory ก่อนซิงก์ โดยไม่บันทึก seed ลง production DB

ก่อน production ต้องยืนยัน endpoint ระดับประเทศและชื่อฟิลด์กับชุดประกาศทางการรุ่นปัจจุบันตาม [data-source gate](docs/data-source-gate.md) ชุด Data.go.th `opn00022` ถูกปฏิเสธแล้วเพราะครอบคลุมเฉพาะประกาศของ กบข. ไม่ใช่ทุกหน่วยงานในภาคอีสาน

## Verification

```powershell
npm run check
```

เกณฑ์เปิดใช้งานด้านข้อมูลอยู่ใน [docs/acceptance.md](docs/acceptance.md)
