"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Wallet,
  ArrowUpFromLine,
  AlertCircle,
  X,
  History,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_ADMIN_PIN,
  DEFAULT_MONTHLY_FEE,
  THAI_MONTHS,
} from "@/features/home/constants";
import type {
  ActiveTab,
  MemberRow,
  Member,
  Transaction,
  TransactionType,
} from "@/features/home/types";
import { calculateOwed, getTotalOtherDebts } from "@/features/home/utils";

export default function Home() {
  const CURRENT_MONTH_INDEX = new Date().getMonth();

  const [members, setMembers] = useState<Member[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal states
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");

  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [txType, setTxType] = useState<TransactionType>("EXPENSE");
  const [txAmount, setTxAmount] = useState("");
  const [txDesc, setTxDesc] = useState("");

  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [loanMemberId, setLoanMemberId] = useState<number | null>(null);
  const [loanAction, setLoanAction] = useState<"BORROW" | "REPAY">("BORROW");
  const [loanAmount, setLoanAmount] = useState("");

  const [isOtherDebtModalOpen, setIsOtherDebtModalOpen] = useState(false);
  const [debtMemberId, setDebtMemberId] = useState<number | null>(null);
  const [newDebtAmount, setNewDebtAmount] = useState("");
  const [newDebtDesc, setNewDebtDesc] = useState("");

  const [activeTab, setActiveTab] = useState<ActiveTab>("DASHBOARD");

  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoginModalOpen, setIsAdminLoginModalOpen] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState("");
  const [isSendingSummary, setIsSendingSummary] = useState(false);

  const monthlyFee = DEFAULT_MONTHLY_FEE;

  const handleAdminLogin = () => {
    const correctPin = process.env.NEXT_PUBLIC_ADMIN_PIN || DEFAULT_ADMIN_PIN;
    if (adminPinInput === correctPin) {
      setIsAdmin(true);
      setIsAdminLoginModalOpen(false);
      setAdminPinInput("");
    } else {
      alert("รหัสผ่านไม่ถูกต้อง");
    }
  };

  // Fetch Data from Supabase
  const loadData = async () => {
    setIsLoading(true);
    try {
      // 1. Load Settings
      const { data: settings } = await supabase.from("settings").select("*");
      const balanceSetting = settings?.find((s) => s.key === "total_balance");
      if (balanceSetting) setTotalBalance(Number(balanceSetting.value));

      // 2. Load Transactions
      const { data: txs } = await supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false });
      if (txs) {
        setTransactions(
          txs.map((tx) => ({
            id: tx.id,
            date: tx.created_at,
            type: tx.transaction_type,
            amount: Number(tx.amount),
            description: tx.description,
          })),
        );
      }

      // 3. Load Members with Payments and Debts
      const { data: membersData } = await supabase
        .from("members")
        .select(
          `
          id, name, borrowed,
          monthly_payments(month_index, is_paid),
          other_debts(id, description, amount, is_paid)
        `,
        )
        .order("id", { ascending: true });

      if (membersData) {
        const formattedMembers: Member[] = (membersData as MemberRow[]).map(
          (m) => {
            // Convert array of payments to Record<number, boolean>
            const paymentsRecord: Record<number, boolean> = {};
            m.monthly_payments?.forEach((p) => {
              paymentsRecord[p.month_index] = p.is_paid;
            });

            // Filter only unpaid other debts to show
            const unpaidDebts =
              m.other_debts
                ?.filter((d) => !d.is_paid)
                .map((d) => ({
                  id: d.id,
                  desc: d.description,
                  amount: Number(d.amount),
                })) || [];

            return {
              id: m.id,
              name: m.name,
              payments: paymentsRecord,
              borrowed: Number(m.borrowed),
              otherDebts: unpaidDebts,
            };
          },
        );
        setMembers(formattedMembers);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update totalBalance in Supabase
  const updateTotalBalance = async (newBalance: number) => {
    setTotalBalance(newBalance);
    await supabase
      .from("settings")
      .update({ value: newBalance })
      .eq("key", "total_balance");
  };

  const addTransaction = async (
    type: TransactionType,
    amount: number,
    description: string,
  ) => {
    const { data, error } = await supabase
      .from("transactions")
      .insert({
        transaction_type: type,
        amount,
        description,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase Error (addTransaction):", error);
      alert("เกิดข้อผิดพลาดในการบันทึกประวัติ: " + error.message);
      return;
    }

    if (data) {
      setTransactions((prev) => [
        {
          id: data.id,
          date: data.created_at,
          type: data.transaction_type,
          amount: Number(data.amount),
          description: data.description,
        },
        ...prev,
      ]);
    }
  };

  const totalBorrowed = members.reduce((sum, m) => sum + m.borrowed, 0);
  const totalOwed = members.reduce(
    (sum, m) =>
      sum +
      calculateOwed(m.payments, CURRENT_MONTH_INDEX, monthlyFee) +
      getTotalOtherDebts(m.otherDebts),
    0,
  );

  // Handlers for real interaction
  const toggleMonthlyPayment = async (memberId: number, monthIndex: number) => {
    if (!isAdmin) return;
    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    const isCurrentlyPaid = !!member.payments[monthIndex];
    const monthName = THAI_MONTHS[monthIndex];
    const currentYear = new Date().getFullYear();

    // Optimistic UI Update
    setMembers((prevMembers) =>
      prevMembers.map((m) => {
        if (m.id === memberId) {
          return {
            ...m,
            payments: {
              ...m.payments,
              [monthIndex]: !isCurrentlyPaid,
            },
          };
        }
        return m;
      }),
    );

    // Supabase Update
    try {
      if (!isCurrentlyPaid) {
        // It is a new payment
        const { error } = await supabase.from("monthly_payments").upsert(
          {
            member_id: memberId,
            month_index: monthIndex,
            year: currentYear,
            is_paid: true,
            paid_at: new Date().toISOString(),
          },
          { onConflict: "member_id,month_index,year" },
        );
        if (error) throw error;
        updateTotalBalance(totalBalance + monthlyFee);
        addTransaction(
          "INCOME",
          monthlyFee,
          `รับชำระส่วนกลางเดือน ${monthName} จาก ${member.name}`,
        );
      } else {
        // Undo payment
        const { error } = await supabase
          .from("monthly_payments")
          .delete()
          .eq("member_id", memberId)
          .eq("month_index", monthIndex)
          .eq("year", currentYear);
        if (error) throw error;
        updateTotalBalance(totalBalance - monthlyFee);
        addTransaction(
          "EXPENSE",
          monthlyFee,
          `ยกเลิกรายการชำระส่วนกลางเดือน ${monthName} ของ ${member.name}`,
        );
      }
    } catch (error: unknown) {
      console.error("Supabase Error (toggleMonthlyPayment):", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      alert("เกิดข้อผิดพลาดในการอัปเดตข้อมูลเดือน: " + message);
      // Rollback UI update
      setMembers((prevMembers) =>
        prevMembers.map((m) => {
          if (m.id === memberId) {
            return {
              ...m,
              payments: {
                ...m.payments,
                [monthIndex]: isCurrentlyPaid,
              },
            };
          }
          return m;
        }),
      );
    }
  };

  const openLoanModal = (id: number) => {
    setLoanMemberId(id);
    setLoanAmount("");
    setLoanAction("BORROW");
    setIsLoanModalOpen(true);
  };

  const handleSaveLoan = async () => {
    if (!isAdmin) return;
    if (loanMemberId === null) return;
    const amount = Number(loanAmount);
    if (isNaN(amount) || amount <= 0) return;

    const member = members.find((m) => m.id === loanMemberId);
    if (!member) return;

    let newBorrowed = member.borrowed;

    if (loanAction === "BORROW") {
      newBorrowed = member.borrowed + amount;
      updateTotalBalance(totalBalance - amount);
      addTransaction("EXPENSE", amount, `ให้ ${member.name} ยืมเงิน`);
    } else if (loanAction === "REPAY") {
      const effectiveRepay = Math.min(amount, member.borrowed);
      newBorrowed = member.borrowed - effectiveRepay;
      updateTotalBalance(totalBalance + effectiveRepay);
      addTransaction(
        "INCOME",
        effectiveRepay,
        `${member.name} คืนเงินที่ยืมไป`,
      );
    }

    // Supabase update
    const { error } = await supabase
      .from("members")
      .update({ borrowed: newBorrowed })
      .eq("id", loanMemberId);

    if (error) {
      console.error("Supabase Error (handleSaveLoan):", error);
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + error.message);
      return;
    }

    // Local UI update
    setMembers((prevMembers) =>
      prevMembers.map((m) =>
        m.id === loanMemberId ? { ...m, borrowed: newBorrowed } : m,
      ),
    );

    setIsLoanModalOpen(false);
  };

  const openOtherDebtModal = (id: number) => {
    setDebtMemberId(id);
    setNewDebtAmount("");
    setNewDebtDesc("");
    setIsOtherDebtModalOpen(true);
  };

  const handleAddOtherDebt = async () => {
    if (!isAdmin) return;
    if (debtMemberId === null) return;
    const amount = Number(newDebtAmount);
    if (isNaN(amount) || amount <= 0 || !newDebtDesc.trim()) return;

    const member = members.find((m) => m.id === debtMemberId);
    if (!member) return;

    // Supabase insert
    const { data, error } = await supabase
      .from("other_debts")
      .insert({
        member_id: debtMemberId,
        description: newDebtDesc.trim(),
        amount: amount,
        is_paid: false,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase Error (handleAddOtherDebt):", error);
      alert("เกิดข้อผิดพลาดในการบันทึกยอด: " + error.message);
      return;
    }

    if (data) {
      addTransaction(
        "INCOME",
        0,
        `บันทึกยอดค้างจ่ายเพิ่มให้ ${member.name}: ${newDebtDesc.trim()} (ยังไม่ชำระ)`,
      );

      // Update UI
      setMembers((prevMembers) =>
        prevMembers.map((m) => {
          if (m.id === debtMemberId) {
            return {
              ...m,
              otherDebts: [
                ...(m.otherDebts || []),
                {
                  id: data.id,
                  desc: data.description,
                  amount: Number(data.amount),
                },
              ],
            };
          }
          return m;
        }),
      );
    }

    setNewDebtAmount("");
    setNewDebtDesc("");
  };

  const handlePayOtherDebt = async (memberId: number, debtId: number) => {
    if (!isAdmin) return;
    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    const debtToPay = member.otherDebts.find((d) => d.id === debtId);
    if (!debtToPay) return;

    // Supabase update
    await supabase
      .from("other_debts")
      .update({ is_paid: true, paid_at: new Date().toISOString() })
      .eq("id", debtId);

    updateTotalBalance(totalBalance + debtToPay.amount);
    addTransaction(
      "INCOME",
      debtToPay.amount,
      `${member.name} ชำระยอดพิเศษ: ${debtToPay.desc}`,
    );

    // Update UI
    setMembers((prevMembers) =>
      prevMembers.map((m) => {
        if (m.id === memberId) {
          return {
            ...m,
            otherDebts: m.otherDebts.filter((d) => d.id !== debtId),
          };
        }
        return m;
      }),
    );
  };

  const handleDeleteMember = async (id: number) => {
    if (!isAdmin) return;
    if (confirm("คุณแน่ใจหรือไม่ที่จะลบสมาชิกคนนี้?")) {
      await supabase.from("members").delete().eq("id", id);
      setMembers((prev) => prev.filter((m) => m.id !== id));
    }
  };

  const saveNewMember = async () => {
    if (!isAdmin) return;
    if (!newMemberName || newMemberName.trim() === "") return;

    const { data, error } = await supabase
      .from("members")
      .insert({
        name: newMemberName.trim(),
        borrowed: 0,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase Insert Error:", error);
      alert("เกิดข้อผิดพลาดในการเพิ่มสมาชิก: " + error.message);
      return;
    }

    if (data) {
      setMembers((prev) => [
        ...prev,
        {
          id: data.id,
          name: data.name,
          payments: {},
          borrowed: Number(data.borrowed),
          otherDebts: [],
        },
      ]);
    }
    setNewMemberName("");
    setIsMemberModalOpen(false);
  };

  const saveTransaction = async () => {
    if (!isAdmin) return;
    const amount = Number(txAmount);
    if (isNaN(amount) || amount <= 0 || !txDesc.trim()) return;

    const newBalance =
      txType === "INCOME" ? totalBalance + amount : totalBalance - amount;
    await updateTotalBalance(newBalance);
    await addTransaction(txType, amount, txDesc.trim());

    setTxAmount("");
    setTxDesc("");
    setIsTransactionModalOpen(false);
  };

  const deleteTransaction = async (id: number) => {
    if (!isAdmin) return;
    if (
      !confirm(
        "เตือน: การลบประวัติจะไม่ทำการคืนค่าเงินกองกลาง คุณต้องการลบประวัตินี้ใช่หรือไม่?",
      )
    )
      return;

    await supabase.from("transactions").delete().eq("id", id);
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
  };

  const sendDailySummaryNow = async () => {
    if (!isAdmin || isSendingSummary) return;

    setIsSendingSummary(true);
    try {
      const response = await fetch("/api/cron/daily-summary", {
        method: "GET",
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok) {
        const missingList = Array.isArray(result?.missing)
          ? ` (${result.missing.join(", ")})`
          : "";
        throw new Error(
          result?.details ||
            result?.error ||
            `ส่งแจ้งเตือนไม่สำเร็จ${missingList}`,
        );
      }

      alert("ส่งสรุปรายวันเข้า LINE เรียบร้อยแล้ว");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
      alert(`ส่งแจ้งเตือนไม่สำเร็จ: ${message}`);
    } finally {
      setIsSendingSummary(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-gray-50 text-xl font-bold font-sans">
        กำลังเชื่อมต่อฐานข้อมูล...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 sm:p-6 rounded-2xl shadow-sm gap-4">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              กองกลาง
            </h1>

            {/* Admin Login Toggle for Mobile */}
            <button
              onClick={() =>
                isAdmin ? setIsAdmin(false) : setIsAdminLoginModalOpen(true)
              }
              className={`sm:hidden px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isAdmin ? "bg-gray-100 text-gray-700" : "bg-purple-100 text-purple-700"}`}
            >
              {isAdmin ? "ออกจากระบบ" : "🔑 เข้าสู่ระบบ"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Admin Login Toggle for Desktop */}
            <button
              onClick={() =>
                isAdmin ? setIsAdmin(false) : setIsAdminLoginModalOpen(true)
              }
              className={`hidden sm:block px-4 py-2.5 rounded-lg font-medium transition-colors ${isAdmin ? "bg-gray-100 text-gray-700 hover:bg-gray-200" : "bg-purple-100 text-purple-700 hover:bg-purple-200"}`}
            >
              {isAdmin ? "ออกจากระบบ Admin" : "🔑 เข้าสู่ระบบ Admin"}
            </button>

            {isAdmin && (
              <>
                <button
                  onClick={() => setIsMemberModalOpen(true)}
                  className="bg-blue-600 flex-1 sm:flex-none hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors text-sm sm:text-base text-center whitespace-nowrap"
                >
                  + เพิ่มสมาชิก
                </button>
                <button
                  onClick={() => setIsTransactionModalOpen(true)}
                  className="bg-green-600 flex-1 sm:flex-none hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors text-sm sm:text-base text-center whitespace-nowrap"
                >
                  + บันทึกรายรับ/จ่าย
                </button>
                <button
                  onClick={sendDailySummaryNow}
                  disabled={isSendingSummary}
                  className="bg-indigo-600 flex-1 sm:flex-none hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg font-medium transition-colors text-sm sm:text-base text-center whitespace-nowrap"
                >
                  {isSendingSummary
                    ? "กำลังส่งแจ้งเตือน..."
                    : "แจ้งเตือนเข้า LINE"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab("DASHBOARD")}
            className={`px-6 py-3 font-medium text-sm flex items-center gap-2 ${
              activeTab === "DASHBOARD"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Wallet size={18} />
            ภาพรวมกองกลาง (Dashboard)
          </button>
          <button
            onClick={() => setActiveTab("HISTORY")}
            className={`px-6 py-3 font-medium text-sm flex items-center gap-2 ${
              activeTab === "HISTORY"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <History size={18} />
            ประวัติการใช้เงิน (History)
          </button>
        </div>

        {activeTab === "DASHBOARD" && (
          <>
            {/* Dashboard Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div className="p-4 bg-blue-100 text-blue-600 rounded-xl">
                  <Wallet size={28} />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">
                    เงินกองกลางคงเหลือ
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    ฿{totalBalance.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div className="p-4 bg-red-100 text-red-600 rounded-xl">
                  <ArrowUpFromLine size={28} />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">
                    ยอดเงินที่ถูกยืม (รอดำเนินการ)
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    ฿{totalBorrowed.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div className="p-4 bg-orange-100 text-orange-600 rounded-xl">
                  <AlertCircle size={28} />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">
                    ยอดคงค้างจ่ายรายเดือน
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    ฿{totalOwed.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Members Dashboard */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-8">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Users size={24} className="text-gray-500" />
                  ตารางติดตามการจ่ายส่วนกลาง (ปี 2026)
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-sm">
                      <th className="p-4 font-medium min-w-[120px]">
                        ชื่อสมาชิก
                      </th>
                      <th className="p-4 font-medium min-w-[360px]">
                        สถานะ 12 เดือน (คลิกเพื่อเช็คจ่าย)
                      </th>
                      <th className="p-4 font-medium">ยอดค้างจ่ายรวม</th>
                      <th className="p-4 font-medium">
                        รายการที่ต้องจ่ายเพิ่ม
                      </th>
                      <th className="p-4 font-medium">ยอดเงินยืม</th>
                      <th className="p-4 font-medium">จัดการพิเศษ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {members.map((member) => {
                      const otherDebtsTotal = getTotalOtherDebts(
                        member.otherDebts,
                      );
                      const owedAmount =
                        calculateOwed(
                          member.payments,
                          CURRENT_MONTH_INDEX,
                          monthlyFee,
                        ) + otherDebtsTotal;
                      return (
                        <tr
                          key={member.id}
                          className="hover:bg-gray-50 transition-colors bg-white"
                        >
                          <td className="p-4 font-bold text-gray-900">
                            {member.name}
                          </td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1.5">
                              {THAI_MONTHS.map((month, idx) => {
                                const isPaid = !!member.payments[idx];
                                const isPastOrCurrent =
                                  idx <= CURRENT_MONTH_INDEX;

                                // กำหนดสไตล์ของปุ่มเดือนแต่ละเงื่อนไข
                                let btnClass =
                                  "text-[11px] w-9 h-9 flex items-center justify-center rounded-md border font-medium transition-colors cursor-pointer ";

                                if (isPaid) {
                                  btnClass +=
                                    "bg-green-500 border-green-600 text-white shadow-sm hover:bg-green-600";
                                } else if (isPastOrCurrent) {
                                  btnClass +=
                                    "bg-red-50 border-red-200 text-red-600 hover:bg-red-100";
                                } else {
                                  btnClass +=
                                    "bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100";
                                }

                                return (
                                  <button
                                    key={idx}
                                    onClick={() =>
                                      toggleMonthlyPayment(member.id, idx)
                                    }
                                    title={`คลิกเพื่อเปลี่ยนสถานะของเดือน ${month}`}
                                    disabled={!isAdmin}
                                    className={`${btnClass} ${!isAdmin ? "opacity-70 cursor-not-allowed" : ""}`}
                                  >
                                    {month}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="p-4 text-red-600 font-bold whitespace-nowrap">
                            {owedAmount > 0
                              ? `฿${owedAmount.toLocaleString()}`
                              : "-"}
                          </td>
                          <td className="p-4 text-blue-600 font-bold whitespace-nowrap text-sm">
                            {otherDebtsTotal > 0 ? (
                              <div className="flex flex-col">
                                <span>฿{otherDebtsTotal.toLocaleString()}</span>
                                <span className="text-xs font-normal text-blue-400">
                                  ({member.otherDebts.length} รายการ)
                                </span>
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="p-4 text-purple-600 font-bold whitespace-nowrap">
                            {member.borrowed > 0
                              ? `฿${member.borrowed.toLocaleString()}`
                              : "-"}
                          </td>
                          <td className="p-4 align-top">
                            {isAdmin ? (
                              <div className="flex flex-col xl:flex-row gap-2">
                                <button
                                  onClick={() => openOtherDebtModal(member.id)}
                                  className="text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-md transition-colors border border-blue-200 text-left sm:text-center whitespace-nowrap"
                                >
                                  + ยอดที่ต้องจ่าย
                                </button>
                                <button
                                  onClick={() => openLoanModal(member.id)}
                                  className="text-sm bg-orange-50 hover:bg-orange-100 text-orange-700 px-3 py-1.5 rounded-md transition-colors border border-orange-200 text-left sm:text-center whitespace-nowrap"
                                >
                                  ยืม/คืน
                                </button>
                                <button
                                  onClick={() => handleDeleteMember(member.id)}
                                  className="text-sm bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-md transition-colors border border-red-200 flex items-center justify-center w-fit"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => openOtherDebtModal(member.id)}
                                className="text-sm bg-slate-50 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-md transition-colors border border-slate-200 whitespace-nowrap"
                              >
                                ดูรายการที่ต้องจ่าย
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* History Tab */}
        {activeTab === "HISTORY" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <History size={24} className="text-gray-500" />
                ประวัติรายการเคลื่อนไหวของเงิน
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-sm">
                    <th className="p-4 font-medium">วันเวลา</th>
                    <th className="p-4 font-medium">ประเภท</th>
                    <th className="p-4 font-medium">คำอธิบาย</th>
                    <th className="p-4 font-medium">จำนวนเงิน</th>
                    <th className="p-4 font-medium">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500">
                        ยังไม่มีประวัติการทำรายการ
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="p-4 text-sm text-gray-500">
                          {new Date(tx.date).toLocaleString("th-TH")}
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                              tx.type === "INCOME"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {tx.type === "INCOME" ? "รายรับ" : "รายจ่าย"}
                          </span>
                        </td>
                        <td className="p-4 font-medium text-gray-900">
                          {tx.description}
                        </td>
                        <td
                          className={`p-4 font-medium ${tx.type === "INCOME" ? "text-green-600" : "text-red-600"}`}
                        >
                          {tx.type === "INCOME" ? "+" : "-"}฿
                          {tx.amount.toLocaleString()}
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => deleteTransaction(tx.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODALS */}

      {/* Add Member Modal */}
      {isMemberModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">
                เพิ่มสมาชิกใหม่
              </h3>
              <button
                onClick={() => setIsMemberModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อสมาชิก
                </label>
                <input
                  autoFocus
                  type="text"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="เช่น สมชาย"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black"
                />
              </div>
              <button
                onClick={saveNewMember}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors"
              >
                บันทึกสมาชิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {isTransactionModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">
                บันทึกรายรับ/จ่าย กองกลาง
              </h3>
              <button
                onClick={() => setIsTransactionModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-black">
                  <input
                    type="radio"
                    name="type"
                    checked={txType === "INCOME"}
                    onChange={() => setTxType("INCOME")}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  รายรับ (เงินเข้า)
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-black">
                  <input
                    type="radio"
                    name="type"
                    checked={txType === "EXPENSE"}
                    onChange={() => setTxType("EXPENSE")}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  รายจ่าย (ใช้เงิน)
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  จำนวนเงิน (บาท)
                </label>
                <input
                  type="number"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="ระบุตัวเลข"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  คำอธิบาย
                </label>
                <textarea
                  value={txDesc}
                  onChange={(e) => setTxDesc(e.target.value)}
                  placeholder="เช่น ซื้ออุปกรณ์ส่วนกลาง, จ่ายค่ามัดจำสนาม..."
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black"
                />
              </div>

              <button
                onClick={saveTransaction}
                className={`w-full py-2.5 rounded-lg font-medium transition-colors text-white ${
                  txType === "INCOME"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                บันทึกประวัติ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loan Modal */}
      {isLoanModalOpen && loanMemberId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">
                บันทึก ยืม/คืน เงิน
              </h3>
              <button
                onClick={() => setIsLoanModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-100">
                ทำรายการของ:{" "}
                <span className="font-bold">
                  {members.find((m) => m.id === loanMemberId)?.name}
                </span>
                <br />
                ยอดเงินยืมคงค้างปัจจุบัน:{" "}
                <span className="font-bold text-purple-700">
                  ฿
                  {members
                    .find((m) => m.id === loanMemberId)
                    ?.borrowed.toLocaleString() || 0}
                </span>
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-black">
                  <input
                    type="radio"
                    checked={loanAction === "BORROW"}
                    onChange={() => setLoanAction("BORROW")}
                    className="w-4 h-4 text-orange-600 focus:ring-orange-500"
                  />
                  ขอยืมเงินกองกลาง
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-black">
                  <input
                    type="radio"
                    checked={loanAction === "REPAY"}
                    onChange={() => setLoanAction("REPAY")}
                    className="w-4 h-4 text-green-600 focus:ring-green-500"
                  />
                  คืนเงินที่ยืมไป
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  จำนวนเงิน (บาท)
                </label>
                <input
                  autoFocus
                  type="number"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  placeholder="ระบุตัวเลข"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-black"
                />
              </div>

              <button
                onClick={handleSaveLoan}
                className={`w-full py-2.5 rounded-lg font-medium transition-colors text-white ${
                  loanAction === "BORROW"
                    ? "bg-orange-600 hover:bg-orange-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                บันทึกรายการ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Other Debts Modal */}
      {isOtherDebtModalOpen && debtMemberId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">
                รายการที่ต้องจ่ายเพิ่ม
              </h3>
              <button
                onClick={() => setIsOtherDebtModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {!isAdmin && (
                <div className="p-3 bg-slate-50 text-slate-700 rounded-lg text-sm border border-slate-200">
                  โหมดผู้ใช้งานทั่วไป: ดูข้อมูลได้อย่างเดียว
                </div>
              )}

              <div className="p-3 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-100 flex justify-between items-center">
                <span>
                  ทำรายการของ:{" "}
                  <span className="font-bold">
                    {members.find((m) => m.id === debtMemberId)?.name}
                  </span>
                </span>
                <span className="font-bold text-red-700">
                  รวม: ฿
                  {getTotalOtherDebts(
                    members.find((m) => m.id === debtMemberId)?.otherDebts ||
                      [],
                  ).toLocaleString()}
                </span>
              </div>

              {/* List of current debts */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 text-sm">
                  รายการค้างชำระปัจจุบัน:
                </h4>
                <div className="space-y-2">
                  {members.find((m) => m.id === debtMemberId)?.otherDebts
                    ?.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">
                      ไม่มีรายการค้างชำระพิเศษ
                    </p>
                  ) : (
                    members
                      .find((m) => m.id === debtMemberId)
                      ?.otherDebts?.map((debt) => (
                        <div
                          key={debt.id}
                          className="flex justify-between items-center p-3 border border-gray-200 rounded-lg bg-white"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {debt.desc}
                            </p>
                            <p className="text-xs text-red-500 font-bold">
                              ฿{debt.amount.toLocaleString()}
                            </p>
                          </div>
                          {isAdmin ? (
                            <button
                              onClick={() =>
                                handlePayOtherDebt(debtMemberId, debt.id)
                              }
                              className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-md hover:bg-green-100 font-medium"
                            >
                              ชำระแล้ว
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500">
                              รอการชำระ
                            </span>
                          )}
                        </div>
                      ))
                  )}
                </div>
              </div>

              {isAdmin && (
                <>
                  <hr className="border-gray-100" />

                  {/* Add New Debt */}
                  <div className="space-y-4">
                    <h4 className="font-semibold text-gray-900 text-sm">
                      บันทึกหนี้ค่าอื่นๆ เพิ่ม:
                    </h4>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        คำอธิบายรายการ
                      </label>
                      <input
                        type="text"
                        value={newDebtDesc}
                        onChange={(e) => setNewDebtDesc(e.target.value)}
                        placeholder="เช่น ค่าเสื้อทีม, ค่าปรับรอบพิเศษ..."
                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        จำนวนเงิน (บาท)
                      </label>
                      <input
                        type="number"
                        value={newDebtAmount}
                        onChange={(e) => setNewDebtAmount(e.target.value)}
                        placeholder="ระบุตัวเลข"
                        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black text-sm"
                      />
                    </div>

                    <button
                      onClick={handleAddOtherDebt}
                      disabled={!newDebtDesc || !newDebtAmount}
                      className="w-full py-2.5 rounded-lg font-medium transition-colors text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
                    >
                      + บันทึกรายการค้างชำระ
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Admin Login Modal */}
      {isAdminLoginModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">
                เข้าสู่ระบบ Admin
              </h3>
              <button
                onClick={() => {
                  setIsAdminLoginModalOpen(false);
                  setAdminPinInput("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รหัสความปลอดภัย (PIN)
                </label>
                <input
                  autoFocus
                  type="password"
                  value={adminPinInput}
                  onChange={(e) => setAdminPinInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
                  placeholder="ใส่รหัสเพื่อปลดล็อก"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-black text-center tracking-widest text-lg"
                />
              </div>
              <button
                onClick={handleAdminLogin}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg font-medium transition-colors"
              >
                ปลดล็อกสิทธิ์แก้ไข
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
