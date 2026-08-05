import type { LucideIcon } from "lucide-react";
import { CreditCard, Banknote, Wallet, QrCode } from "lucide-react";

export const PAYMENT_CONFIG = {
  PREFERENCE_KEY_PREFIX: "apois:passageiro:",
  PREFERENCE_KEY_SUFFIX: ":payment-preference",
} as const;

export const PAYMENT_ICONS: Record<string, LucideIcon> = {
  pix: QrCode,
  credit: CreditCard,
  credit_card: CreditCard,
  debit: CreditCard,
  debit_card: CreditCard,
  cash: Banknote,
  wallet: Wallet,
};
