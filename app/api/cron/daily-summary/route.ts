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

    if (balError && balError.code !== 'PGRST116') {
      console.error('Error fetching balance:', balError);
    }
    const totalBalance = balanceData?.value ? Number(balanceData.value) : 0;

    // 5. Fetch monthly fee
    const { data: feeData } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'monthly_fee')
      .single();
    const monthlyFee = feeData?.value ? Number(feeData.value) : 500;

    // 6. Fetch members and their debts
    const { data: members } = await supabase.from('members').select('*');
    const { data: otherDebts } = await supabase.from('other_debts').select('*').eq('is_paid', false);
    const { data: unpaidMonths } = await supabase.from('monthly_payments').select('*').eq('is_paid', false);

    let totalBorrowed = 0;
    const memberDebts: string[] = [];

    if (members) {
      members.forEach((member) => {
        let hasDebt = false;
        const memberRows: string[] = [];
        
        const b = Number(member.borrowed) || 0;
        if (b > 0) {
          totalBorrowed += b;
          memberRows.push(`- ยืมเงิน: ${b.toLocaleString()} ฿`);
          hasDebt = true;
        }

        const memberUnpaidMonths = unpaidMonths?.filter(m => m.member_id === member.id) || [];
        if (memberUnpaidMonths.length > 0) {
          const monthDebt = memberUnpaidMonths.length * monthlyFee;
          memberRows.push(`- ค่าส่วนกลางค้างจ่าย ${memberUnpaidMonths.length} เดือน (${monthDebt.toLocaleString()} ฿)`);
          hasDebt = true;
        }

        const memberOtherDebts = otherDebts?.filter(d => d.member_id === member.id) || [];
        if (memberOtherDebts.length > 0) {
          const mOtherSum = memberOtherDebts.reduce((sum, d) => sum + Number(d.amount), 0);
          const descriptions = memberOtherDebts.map(d => d.description).join(', ');
          memberRows.push(`- หนี้อื่นๆ (${descriptions}): ${mOtherSum.toLocaleString()} ฿`);
          hasDebt = true;
        }

        if (hasDebt) {
          memberDebts.push(`👤 ${member.name}:\n  ${memberRows.join('\n  ')}`);
        }
      });
    }

    const debtSummaryText = memberDebts.length > 0 
      ? `\n\n📌 รายการค้างชำระ:\n${memberDebts.join('\n\n')}`
      : `\n\n📌 รายการค้างชำระ:\n✅ ทุกคนจ่ายครบหมดแล้ว!`;

    // 7. Create a dynamic string based on the data
    const summaryText = `📊 สรุปยอดบัญชีกองกลางประจำวัน\n📅 วันที่: ${today.toLocaleDateString('th-TH')}\n\n🟢 รายรับวันนี้: +${todayIncome.toLocaleString()} ฿\n🔴 รายจ่ายวันนี้: -${todayExpense.toLocaleString()} ฿\n\n💰 ยอดคงเหลือกองกลาง: ${totalBalance.toLocaleString()} ฿\n💸 ยอดเงินถูกยืมรวม: ${totalBorrowed.toLocaleString()} ฿${debtSummaryText}\n\n🔗 ดูรายละเอียดเพิ่มเติม: https://money-hotline.vercel.app/`;

    // 8. Send the message to the LINE Group
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
