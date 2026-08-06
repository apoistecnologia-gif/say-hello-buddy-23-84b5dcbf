export type PaymentMethodCode = "pix" | "credit" | "debit" | "cash" | "wallet";

export interface PaymentMethod {
  id: string;
  code: PaymentMethodCode;
  name: string;
  label?: string;
  description?: string | null;
  icon?: string | null;
  isActive: boolean;
  enabled?: boolean;
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

export interface WalletSummary extends PassengerWallet {
  available_balance: number;
  status: "active" | "blocked";
}

export interface CancellationFee {
  id: string;
  rideId: string | null;
  amount: number;
  reason: string;
  status: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface CancellationFeePixCharge {
  ok: true;
  reused: boolean;
  feeId: string;
  amount: number;
  qrCode: string;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: string | null;
}

export interface CheckoutEstimate {
  baseFare: number;
  extrasTotal: number;
  discountTotal: number;
  finalTotal: number;
  readiness: boolean;
  blockingReasons: string[];
  missingRequirements: string[];
}

export interface CouponValidationResult {
  valid: boolean;
  code: string;
  discount_type: "fixed" | "percentage";
  discount_value: number;
  message: string;
}

export type CouponStatus = "idle" | "validating" | "applied" | "not_applicable";
