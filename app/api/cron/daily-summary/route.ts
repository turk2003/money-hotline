import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { messagingApi } from "@line/bot-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Initialize the LINE client
const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
});

const THAILAND_TZ = "Asia/Bangkok";
const MAX_LINE_TEXT_LENGTH = 4900;

const getBangkokDayRangeUtc = () => {
  const now = new Date();
  const dayString = new Intl.DateTimeFormat("en-CA", {
    timeZone: THAILAND_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const start = new Date(`${dayString}T00:00:00+07:00`);
  const end = new Date(`${dayString}T23:59:59.999+07:00`);

  return { start, end };
};

const trimForLine = (text: string) => {
  if (text.length <= MAX_LINE_TEXT_LENGTH) return text;
  return `${text.slice(0, MAX_LINE_TEXT_LENGTH - 30)}\n\n...(ตัดข้อความบางส่วน)`;
};

const parseLineError = (error: unknown) => {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 500;

  const statusText =
    typeof error === "object" &&
    error !== null &&
    "statusText" in error &&
    typeof (error as { statusText?: unknown }).statusText === "string"
      ? (error as { statusText: string }).statusText
      : "Internal Server Error";

  const bodyText =
    typeof error === "object" &&
    error !== null &&
    "body" in error &&
    typeof (error as { body?: unknown }).body === "string"
      ? (error as { body: string }).body
      : "";

  const rawMessage = error instanceof Error ? error.message : "Unknown error";
  const message = `${status} - ${statusText}`;

  if (
    status === 401 &&
    (rawMessage.includes("DELETED CHANNEL") ||
      bodyText.includes("DELETED CHANNEL"))
  ) {
    return {
      status,
      message,
      details:
        "LINE channel ถูกลบหรือ token หมดอายุ/ไม่ถูกต้อง กรุณาสร้าง Messaging API Channel ใหม่ แล้วอัปเดต LINE_CHANNEL_ACCESS_TOKEN และ LINE_GROUP_ID ใน .env.local หรือ Vercel Environment Variables",
    };
  }

  if (status === 401) {
    return {
      status,
      message,
      details:
        "LINE access token ไม่ถูกต้องหรือหมดอายุ กรุณาออก token ใหม่จาก LINE Developers แล้วอัปเดต LINE_CHANNEL_ACCESS_TOKEN",
    };
  }

  return {
    status,
    message,
    details: rawMessage,
  };
};

export async function GET() {
  try {
    const requiredEnv = {
      LINE_GROUP_ID: process.env.LINE_GROUP_ID,
      LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    };
    const missing = Object.entries(requiredEnv)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "Missing required environment variables",
          missing,
        },
        { status: 500 },
      );
    }

    const groupId = requiredEnv.LINE_GROUP_ID as string;

    // 1. Get day range in Thailand time, converted to UTC for DB query
    const { start: dayStartUtc, end: dayEndUtc } = getBangkokDayRangeUtc();

    // 2. Fetch today's transactions
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("amount, transaction_type, description")
      .gte("created_at", dayStartUtc.toISOString())
      .lte("created_at", dayEndUtc.toISOString());

    if (txError) {
      console.error("Error fetching transactions:", txError);
      throw txError;
    }

    // 3. Calculate today's income and expenses
    let todayIncome = 0;
    let todayExpense = 0;

    if (transactions) {
      transactions.forEach((tx) => {
        if (tx.transaction_type === "INCOME") {
          todayIncome += Number(tx.amount);
        } else if (tx.transaction_type === "EXPENSE") {
          todayExpense += Number(tx.amount);
        }
      });
    }

    // 4. Fetch total balance
    const { data: balanceData, error: balError } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "total_balance")
      .single();

    if (balError && balError.code !== "PGRST116") {
      console.error("Error fetching balance:", balError);
    }
    const totalBalance = balanceData?.value ? Number(balanceData.value) : 0;

    // 5. Fetch monthly fee
    const { data: feeData } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "monthly_fee")
      .single();
    const monthlyFee = feeData?.value ? Number(feeData.value) : 500;

    // 6. Fetch members and their debts
    const { data: members } = await supabase.from("members").select("*");
    const { data: otherDebts } = await supabase
      .from("other_debts")
      .select("*")
      .eq("is_paid", false);
    const { data: unpaidMonths } = await supabase
      .from("monthly_payments")
      .select("*")
      .eq("is_paid", false);

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

        const memberUnpaidMonths =
          unpaidMonths?.filter((m) => m.member_id === member.id) || [];
        if (memberUnpaidMonths.length > 0) {
          const monthDebt = memberUnpaidMonths.length * monthlyFee;
          memberRows.push(
            `- ค่าส่วนกลางค้างจ่าย ${memberUnpaidMonths.length} เดือน (${monthDebt.toLocaleString()} ฿)`,
          );
          hasDebt = true;
        }

        const memberOtherDebts =
          otherDebts?.filter((d) => d.member_id === member.id) || [];
        if (memberOtherDebts.length > 0) {
          const mOtherSum = memberOtherDebts.reduce(
            (sum, d) => sum + Number(d.amount),
            0,
          );
          const descriptions = memberOtherDebts
            .map((d) => d.description)
            .join(", ");
          memberRows.push(
            `- หนี้อื่นๆ (${descriptions}): ${mOtherSum.toLocaleString()} ฿`,
          );
          hasDebt = true;
        }

        if (hasDebt) {
          memberDebts.push(`👤 ${member.name}:\n  ${memberRows.join("\n  ")}`);
        }
      });
    }

    const debtSummaryText =
      memberDebts.length > 0
        ? `\n\n📌 รายการค้างชำระ:\n${memberDebts.join("\n\n")}`
        : `\n\n📌 รายการค้างชำระ:\n✅ ทุกคนจ่ายครบหมดแล้ว!`;

    // 7. Create a dynamic string based on the data
    const summaryText = `📊 สรุปยอดบัญชีกองกลางประจำวัน\n📅 วันที่: ${new Date().toLocaleDateString("th-TH", { timeZone: THAILAND_TZ })}\n\n🟢 รายรับวันนี้: +${todayIncome.toLocaleString()} ฿\n🔴 รายจ่ายวันนี้: -${todayExpense.toLocaleString()} ฿\n\n💰 ยอดคงเหลือกองกลาง: ${totalBalance.toLocaleString()} ฿\n💸 ยอดเงินถูกยืมรวม: ${totalBorrowed.toLocaleString()} ฿${debtSummaryText}\n\n🔗 ดูรายละเอียดเพิ่มเติม: https://money-hotline.vercel.app/`;
    const safeSummaryText = trimForLine(summaryText);

    // 8. Send the message to the LINE Group
    await client.pushMessage({
      to: groupId,
      messages: [
        {
          type: "text",
          text: safeSummaryText,
        },
      ],
    });

    return NextResponse.json({
      success: true,
      message: "Daily summary sent successfully",
      dayRangeUtc: {
        start: dayStartUtc.toISOString(),
        end: dayEndUtc.toISOString(),
      },
      payloadLength: safeSummaryText.length,
    });
  } catch (error) {
    console.error("Error in daily-summary cron job:", error);

    const parsed = parseLineError(error);
    return NextResponse.json(
      {
        error: parsed.message,
        details: parsed.details,
      },
      { status: parsed.status },
    );
  }
}
