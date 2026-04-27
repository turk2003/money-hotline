export type TransactionType = "INCOME" | "EXPENSE";

export type Transaction = {
  id: number;
  date: string;
  type: TransactionType;
  amount: number;
  description: string;
};

export type OtherDebt = {
  id: number;
  desc: string;
  amount: number;
};

export type Member = {
  id: number;
  name: string;
  payments: Record<number, boolean>;
  borrowed: number;
  otherDebts: OtherDebt[];
};

export type MemberRow = {
  id: number;
  name: string;
  borrowed: number | string;
  monthly_payments: Array<{
    month_index: number;
    is_paid: boolean;
  }>;
  other_debts: Array<{
    id: number;
    description: string;
    amount: number | string;
    is_paid: boolean;
  }>;
};

export type ActiveTab = "DASHBOARD" | "HISTORY";
