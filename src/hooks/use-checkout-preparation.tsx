import React, { createContext, useContext, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { usePricing } from "@/hooks/use-pricing";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { useRoute } from "@/hooks/use-route";
import { useWallet } from "@/hooks/use-wallet";
import type { CheckoutEstimate } from "@/types/payments";

interface CheckoutPreparationContextType {
  checkout: CheckoutEstimate;
  canProceed: boolean;
}

const CheckoutPreparationContext = createContext<CheckoutPreparationContextType | undefined>(
  undefined,
);

const requirementLabels: Record<string, string> = {
  user_not_authenticated: "Entre novamente na sua conta.",
  route_missing: "Calcule a rota até o destino.",
  category_missing: "Escolha uma categoria de serviço.",
  pricing_invalid: "Aguarde a validação do valor ou escolha outra categoria.",
  payment_method_missing: "Escolha uma forma de pagamento.",
  passenger_debt_block: "Regularize a pendência da carteira.",
  insufficient_balance: "O saldo disponível da carteira é insuficiente para esta corrida.",
};

export const CheckoutPreparationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, profile } = useAuth();
  const { route } = useRoute();
  const { selectedCategory } = useRideCategories();
  const { estimate, status: pricingStatus } = usePricing();
  const { selectedMethod } = usePaymentMethods();
  const { state: walletState, wallet } = useWallet();

  const checkout = useMemo<CheckoutEstimate>(() => {
    const blockingReasons: string[] = [];

    if (!user || !profile) blockingReasons.push("user_not_authenticated");
    if (!route) blockingReasons.push("route_missing");
    if (!selectedCategory) blockingReasons.push("category_missing");
    if (pricingStatus !== "success" || !estimate || !estimate.available) {
      blockingReasons.push("pricing_invalid");
    }
    if (!selectedMethod) blockingReasons.push("payment_method_missing");

    if (walletState === "blocked") {
      blockingReasons.push("passenger_debt_block");
    }

    if (selectedMethod === "wallet" && estimate) {
      const availableBalance = wallet?.available_balance ?? 0;
      if (availableBalance < estimate.estimatedPrice) {
        blockingReasons.push("insufficient_balance");
      }
    }

    const baseFare = estimate?.estimatedPrice ?? 0;
    const extrasTotal = estimate?.extrasTotal ?? 0;

    return {
      baseFare,
      extrasTotal,
      discountTotal: 0,
      finalTotal: baseFare,
      readiness: blockingReasons.length === 0,
      blockingReasons,
      missingRequirements: blockingReasons.map(
        (reason) => requirementLabels[reason] ?? "Revise os dados da solicitação.",
      ),
    };
  }, [
    estimate,
    pricingStatus,
    profile,
    route,
    selectedCategory,
    selectedMethod,
    user,
    wallet?.available_balance,
    walletState,
  ]);

  return (
    <CheckoutPreparationContext.Provider
      value={{
        checkout,
        canProceed: checkout.readiness,
      }}
    >
      {children}
    </CheckoutPreparationContext.Provider>
  );
};

export const useCheckoutPreparation = () => {
  const context = useContext(CheckoutPreparationContext);
  if (!context) {
    throw new Error("useCheckoutPreparation must be used within CheckoutPreparationProvider");
  }
  return context;
};
