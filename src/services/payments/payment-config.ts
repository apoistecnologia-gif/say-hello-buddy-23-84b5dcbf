import { PaymentMethodKey, PaymentMethod } from "@/types/payments";
import { CreditCard, Banknote, Wallet, Building2, QrCode } from "lucide-react";

export const PAYMENT_CONFIG = {
  PREFERENCE_KEY_PREFIX: "apois:passageiro:",
  PREFERENCE_KEY_SUFFIX: ":payment-preference",
  METHODS: [
    { key: "pix", label: "PIX", description: "Pagamento instantâneo", icon: "QrCode", enabled: true },
    { key: "credit_card", label: "Cartão de Crédito", description: "Pague no app", icon: "CreditCard", enabled: true },
    { key: "debit_card", label: "Cartão de Débito", description: "Pague no app", icon: "CreditCard", enabled: true },
    { key: "cash", label: "Dinheiro", description: "Pague ao motorista", icon: "Banknote", enabled: true },
    { key: "wallet", label: "Carteira APOIS", description: "Use seu saldo", icon: "Wallet", enabled: true },
    { key: "corporate", label: "Corporativo", description: "Conta empresa", icon: "Building2", enabled: false },
  ] as const,
};
