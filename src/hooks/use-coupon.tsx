import React, { createContext, useContext, useState } from "react";
import { CouponValidationResult, CouponStatus } from "@/types/payments";

interface CouponContextType {
  coupon: CouponValidationResult | null;
  status: CouponStatus;
  validateCoupon: (code: string) => Promise<void>;
  removeCoupon: () => void;
  isAvailable: boolean;
}

const CouponContext = createContext<CouponContextType | undefined>(undefined);

export const CouponProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [coupon, setCoupon] = useState<CouponValidationResult | null>(null);
  const [status, setStatus] = useState<CouponStatus>("idle");

  const validateCoupon = async (code: string) => {
    setStatus("not_applicable");
    setCoupon({
      valid: false,
      code,
      discount_type: "fixed",
      discount_value: 0,
      message: "Cupons estarão disponíveis após integração com o servidor.",
    });
  };

  const removeCoupon = () => {
    setCoupon(null);
    setStatus("idle");
  };

  return (
    <CouponContext.Provider
      value={{
        coupon,
        status,
        validateCoupon,
        removeCoupon,
        isAvailable: false, // Honesty flag
      }}
    >
      {children}
    </CouponContext.Provider>
  );
};

export const useCoupon = () => {
  const context = useContext(CouponContext);
  if (!context) throw new Error("useCoupon must be used within CouponProvider");
  return context;
};
