import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { messagingApi } from '@line/bot-sdk';

// Initialize the LINE client
const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

export async function GET() {
  try {
    const groupId = process.env.LINE_GROUP_ID;

    if (!groupId) {
      return NextResponse.json({ error: 'LINE_GROUP_ID is not set in .env.local' }, { status: 400 });
    }

    // 1. Get today's start and end boundaries
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1); // Start of tomorrow
    
    // 2. Fetch today's transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('amount, transaction_type, description')
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString());

    if (txError) {
      console.error('Error fetching transactions:', txError);
      throw txError;
    }

    // 3. Calculate today's income and expenses
    let todayIncome = 0;
    let todayExpense = 0;

    if (transactions) {
      transactions.forEach((tx) => {
        if (tx.transaction_type === 'INCOME') {
          todayIncome += Number(tx.amount);
        } else if (tx.transaction_type === 'EXPENSE') {
          todayExpense += Number(tx.amount);
        }
      });
    }

    // 4. Fetch total balance
    const { data: balanceData, error: balError } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'total_balance')
      .single();

    if (balError && balError.code !== 'PGRST116') // Not found error
    {
       console.error('Error fetching balance:', balError);
    }
    
    const totalBalance = balanceData?.value ? Number(balanceData.value) : 0;

    // 5. Create a dynamic string based on the data
    const summaryText = `📊 สรุปยอดบัญชีกองกลางประจำวัน\nวันที่: ${today.toLocaleDateString('th-TH')}\n\n🟢 รายรับวันนี้: +${todayIncome} บาท\n🔴 รายจ่ายวันนี้: -${todayExpense} บาท\n\n💰 ยอดคงเหลือกองกลางปัจจุบัน: ${totalBalance} บาท\n\n📌 ดูรายละเอียดเพิ่มเติมได้ที่ระบบจัดการ Money Hotline`;

    // 6. Send the message to the LINE Group
    await client.pushMessage({
      to: groupId,
      messages: [
        {
          type: 'text',
          text: summaryText,
        },
      ],
    });

    return NextResponse.json({ success: true, message: 'Daily summary sent successfully' });
  } catch (error) {
    console.error('Error in daily-summary cron job:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
