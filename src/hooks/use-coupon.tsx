import React, { createContext, useContext, useState, useCallback } from "react";
import { CouponValidationResult, CouponStatus } from "@/types/payments";
import { couponService } from "@/services/coupons/coupon-service";
import { useAuth } from "@/hooks/use-auth";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { usePricing } from "@/hooks/use-pricing";

interface CouponContextType {
  code: string;
  status: CouponStatus;
  result: CouponValidationResult | null;
  discount: number;
  isLoading: boolean;
  setCode: (code: string) => void;
  validate: () => Promise<void>;
  remove: () => void;
}

const CouponContext = createContext<CouponContextType | undefined>(undefined);

export const CouponProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { selectedCategory } = useRideCategories();
  const { estimate } = usePricing();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<CouponStatus>("idle");
  const [result, setResult] = useState<CouponValidationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const validate = useCallback(async () => {
    if (!code || !user || !selectedCategory || !estimate) return;

    try {
      setIsLoading(true);
      setStatus("validating");
      const validation = await couponService.validateCoupon(code, user.id, selectedCategory.key, estimate.total);
      setResult(validation);
      setStatus(validation.valid ? "valid" : "invalid");
    } catch (err) {
      setStatus("error");
    } finally {
      setIsLoading(false);
    }
  }, [code, user, selectedCategory, estimate]);

  const remove = () => {
    setCode("");
    setResult(null);
    setStatus("idle");
  };

  const discount = React.useMemo(() => {
    if (!result || !result.valid || !estimate) return 0;
    
    let value = 0;
    if (result.discount_type === "percentage") {
      value = estimate.total * (result.discount_value / 100);
      if (result.max_discount) value = Math.min(value, result.max_discount);
    } else {
      value = result.discount_value;
    }
    
    return Math.min(value, estimate.total);
  }, [result, estimate]);

  return (
    <CouponContext.Provider value={{ code, status, result, discount, isLoading, setCode, validate, remove }}>
      {children}
    </CouponContext.Provider>
  );
};

export const useCoupon = () => {
  const context = useContext(CouponContext);
  if (!context) throw new Error("useCoupon must be used within CouponProvider");
  return context;
};
