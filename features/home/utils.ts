import type { OtherDebt } from "@/features/home/types";

export const calculateOwed = (
  payments: Record<number, boolean>,
  currentMonthIndex: number,
  monthlyFee: number,
) => {
  let owedMonths = 0;

  for (let i = 0; i <= currentMonthIndex; i++) {
    if (!payments[i]) owedMonths++;
  }

  return owedMonths * monthlyFee;
};

export const getTotalOtherDebts = (debts: OtherDebt[]) =>
  (debts || []).reduce((sum, debt) => sum + debt.amount, 0);
