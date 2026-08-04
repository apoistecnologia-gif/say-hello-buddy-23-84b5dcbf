import React, { createContext, useContext, useMemo } from "react";
import { useRoute } from "@/hooks/use-route";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { usePricing } from "@/hooks/use-pricing";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { useWallet } from "@/hooks/use-wallet";
import { useAuth } from "@/hooks/use-auth";
import { CheckoutEstimate } from "@/types/payments";

interface CheckoutPreparationContextType {
  checkout: CheckoutEstimate;
  canProceed: boolean;
}

const CheckoutPreparationContext = createContext<CheckoutPreparationContextType | undefined>(undefined);

export const CheckoutPreparationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { route } = useRoute();
  const { selectedCategory } = useRideCategories();
  const { estimate, status: pricingStatus } = usePricing();
  const { selectedMethod } = usePaymentMethods();
  const { state: walletState } = useWallet();

  const checkout = useMemo(() => {
    const blockingReasons: string[] = [];
    
    if (!user) blockingReasons.push("user_not_authenticated");
    if (!route) blockingReasons.push("route_missing");
    if (!selectedCategory) blockingReasons.push("category_missing");
    if (pricingStatus !== "success" || !estimate) blockingReasons.push("pricing_invalid");
    if (!selectedMethod) blockingReasons.push("payment_method_missing");
    
    // Wallet block rule
    if (walletState === "blocked") {
      blockingReasons.push("passenger_debt_block");
    }

    // Wallet selection rule: Backend must support it
    if (selectedMethod === "wallet") {
       // Temporarily disabled if no real debt flow is confirmed
       blockingReasons.push("payment_method_unavailable");
    }

    const baseFare = estimate?.estimatedPrice || 0;
    const extrasTotal = 0;
    
    // AUTHORITY: No coupon discount applied here
    const finalTotal = baseFare;

    return {
      baseFare,
      extrasTotal,
      discountTotal: 0,
      finalTotal,
      readiness: blockingReasons.length === 0,
      blockingReasons
    };
  }, [user, route, selectedCategory, estimate, pricingStatus, selectedMethod, walletState]);

  return (
    <CheckoutPreparationContext.Provider value={{ 
      checkout, 
      canProceed: checkout.readiness 
    }}>
      {children}
    </CheckoutPreparationContext.Provider>
  );
};

export const useCheckoutPreparation = () => {
  const context = useContext(CheckoutPreparationContext);
  if (!context) throw new Error("useCheckoutPreparation must be used within CheckoutPreparationProvider");
  return context;
};
