# Money Hotline

ระบบจัดการกองกลางทีมด้วย Next.js + Supabase พร้อม LINE webhook และ cron summary

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase
- LINE Messaging API

## Project Structure

```text
app/
	api/
		cron/daily-summary/route.ts     # สรุปรายวันและส่งเข้า LINE
		webhook/line/route.ts           # รับ webhook และตรวจลายเซ็น LINE
	globals.css
	layout.tsx
	page.tsx                          # หน้า dashboard หลัก

features/
	home/
		constants.ts                    # ค่าคงที่ของหน้าหลัก
		types.ts                        # Type ของ dashboard
		utils.ts                        # ตัวช่วยคำนวณทางการเงิน

lib/
	supabase/
		client.ts                       # สร้าง Supabase client
	supabase.ts                       # compatibility export

database_schema.sql                 # โครงสร้างฐานข้อมูล
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Environment Variables

ใส่ค่าใน `.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ADMIN_PIN=

LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_GROUP_ID=
```

## Notes

- หน้า dashboard ใช้ client component (`app/page.tsx`) สำหรับ interaction แบบ realtime
- route ใน `app/api/` ทำงานฝั่ง server
- ตั้งค่า `LINE_GROUP_ID` เพื่อเปิดใช้ daily summary cron
