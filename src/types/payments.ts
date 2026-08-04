export interface PaymentMethod {
  id: string;
  code: "pix" | "credit" | "debit" | "cash" | "wallet";
  name: string;
  description?: string | null;
  icon?: string | null;
  isActive: boolean;
  sortOrder: number;
  requiresBalance?: boolean;
}

export interface PassengerWallet {
  id: string;
  passengerId: string;
  balance: number;
  currency: "BRL";
  isBlocked: boolean;
  blockedReason?: string | null;
  updatedAt: string;
}

export interface CancellationFee {
  id: string;
  amount: number;
  reason: string;
  status: 'pending' | 'paid';
  createdAt: string;
}
