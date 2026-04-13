-- File: database_schema.sql
-- นำโค้ด SQL ด้านล่างนี้ไปรันในช่อง SQL Editor ของ Supabase เพื่อสร้าง DB Schema ทันที

-- 1. Table สำหรับเก็บรายชื่อสมาชิก
CREATE TABLE public.members (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    borrowed NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Table สำหรับการจ่ายค่าส่วนกลางรายเดือน (Monthly Payments)
CREATE TABLE public.monthly_payments (
    id SERIAL PRIMARY KEY,
    member_id INTEGER REFERENCES public.members(id) ON DELETE CASCADE,
    month_index INTEGER NOT NULL,  -- 0 ถึง 11 (ม.ค. ถึง ธ.ค.)
    year INTEGER NOT NULL,         -- เช่น 2026
    is_paid BOOLEAN DEFAULT FALSE,
    paid_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(member_id, month_index, year)
);

-- 3. Table สำหรับหนี้/บิลอื่นๆ ที่ต้องจ่ายเพิ่ม (Other Debts)
CREATE TABLE public.other_debts (
    id SERIAL PRIMARY KEY,
    member_id INTEGER REFERENCES public.members(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    is_paid BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE
);

-- 4. Table สำหรับประวัติการทำรายการกระเป๋ากองกลาง (History/Transactions)
CREATE TABLE public.transactions (
    id SERIAL PRIMARY KEY,
    transaction_type TEXT CHECK (transaction_type IN ('INCOME', 'EXPENSE')),
    amount NUMERIC NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Table Setting เพื่อเก็บยอดคงเหลือกองกลาง หรือ Fee รายเดือน
CREATE TABLE public.settings (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL
);

-- เพิ่มค่าเริ่มต้นให้กับตั้งค่า
--INSERT INTO public.settings (key, value) VALUES 
--('monthly_fee', '500'),
--('total_balance', '5000');
