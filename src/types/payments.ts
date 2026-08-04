export type PaymentMethodKey = "pix" | "credit_card" | "debit_card" | "cash" | "wallet" | "corporate";

export interface PaymentMethod {
  key: PaymentMethodKey;
  label: string;
  icon: string;
  description: string;
  enabled: boolean;
}

export interface WalletSummary {
  passenger_id: string;
  balance: number;
  is_blocked: boolean;
  available_balance?: number;
  status?: string;
  blocked_reason: string | null;
}

export interface CouponValidationResult {
  valid: boolean;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_discount?: number | null;
  min_fare?: number | null;
  message?: string;
}

export interface CheckoutEstimate {
  baseFare: number;
  extrasTotal: number;
  discountTotal: number;
  finalTotal: number;
  readiness: boolean;
  blockingReasons: string[];
}

export type CouponStatus = "idle" | "validating" | "valid" | "invalid" | "expired" | "exhausted" | "not_applicable" | "error";
