import React, { createContext, useContext, useMemo } from "react";
import { CheckoutEstimate } from "@/types/payments";
import { useRoute } from "@/hooks/use-route";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { usePricing } from "@/hooks/use-pricing";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { useWallet } from "@/hooks/use-wallet";
import { useCoupon } from "@/hooks/use-coupon";
import { useAuth } from "@/hooks/use-auth";

interface CheckoutPreparationContextType {
  checkout: CheckoutEstimate;
}

const CheckoutPreparationContext = createContext<CheckoutPreparationContextType | undefined>(undefined);

export const CheckoutPreparationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { route, status: routeStatus } = useRoute();
  const { selectedCategory } = useRideCategories();
  const { estimate, status: pricingStatus, serviceDetails } = usePricing();
  const { selectedMethod } = usePaymentMethods();
  const { wallet } = useWallet();
  const { discount, status: couponStatus } = useCoupon();

  const checkout = useMemo((): CheckoutEstimate => {
    const blockingReasons: string[] = [];
    
    if (!user) blockingReasons.push("auth_required");
    if (routeStatus !== "success") blockingReasons.push("route_missing");
    if (!selectedCategory) blockingReasons.push("category_missing");
    if (pricingStatus !== "success" || !estimate) blockingReasons.push("pricing_unavailable");
    if (!selectedMethod) blockingReasons.push("payment_missing");
    
    if (selectedMethod === "wallet") {
      const balance = wallet?.available_balance || 0;
      const total = (estimate?.total || 0) - discount;
      if (balance < total) blockingReasons.push("insufficient_wallet_balance");
      if (wallet?.status !== "active") blockingReasons.push("wallet_unavailable");
    }

    if (couponStatus === "validating") blockingReasons.push("coupon_validating");

    return {
      baseFare: estimate?.total || 0,
      extrasTotal: estimate?.breakdown.extras.reduce((sum, e) => sum + e.value, 0) || 0,
      discountTotal: discount,
      finalTotal: Math.max((estimate?.total || 0) - discount, 0),
      readiness: blockingReasons.length === 0,
      blockingReasons
    };
  }, [user, routeStatus, selectedCategory, pricingStatus, estimate, selectedMethod, wallet, discount, couponStatus]);

  return (
    <CheckoutPreparationContext.Provider value={{ checkout }}>
      {children}
    </CheckoutPreparationContext.Provider>
  );
};

export const useCheckoutPreparation = () => {
  const context = useContext(CheckoutPreparationContext);
  if (!context) throw new Error("useCheckoutPreparation must be used within CheckoutPreparationProvider");
  return context;
};
