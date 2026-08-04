export type PaymentMethodKey = "pix" | "credit_card" | "debit_card" | "cash" | "wallet" | "corporate";

export interface PaymentMethod {
  key: PaymentMethodKey;
  label: string;
  icon: string;
  description: string;
  enabled: boolean;
}

export interface WalletSummary {
  id: string;
  user_id: string;
  balance: number;
  available_balance: number;
  blocked_balance: number;
  status: "active" | "blocked" | "inactive";
}

export interface CouponValidationResult {
  valid: boolean;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_discount?: number;
  min_fare?: number;
  message?: string;
  error_code?: string;
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

export type PaymentError = 
  | "payment_methods_load_failed"
  | "payment_method_unavailable"
  | "payment_method_invalid"
  | "wallet_not_found"
  | "wallet_blocked"
  | "wallet_unavailable"
  | "insufficient_wallet_balance"
  | "payment_unknown_error";

export type CouponError =
  | "coupon_configuration_missing"
  | "coupon_invalid"
  | "coupon_expired"
  | "coupon_exhausted"
  | "coupon_not_applicable"
  | "coupon_timeout"
  | "coupon_network_error"
  | "coupon_service_unavailable";
