import { supabase } from "@/integrations/supabase/client";
import { CouponValidationResult } from "@/types/payments";
import { RideCategoryKey } from "@/types/pricing";

class CouponService {
  async validateCoupon(
    code: string, 
    userId: string,
    categoryKey: RideCategoryKey,
    estimatedFare: number
  ): Promise<CouponValidationResult> {
    const { data, error } = await (supabase as any)
      .from("coupons")
      .select("*")
      .eq("code", code.toUpperCase().trim())
      .eq("active", true)
      .maybeSingle();

    if (error || !data) {
      return { valid: false, code, discount_type: "fixed", discount_value: 0, message: "Cupom inválido ou expirado" };
    }

    const now = new Date();
    if (data.expires_at && new Date(data.expires_at) < now) {
      return { valid: false, code, discount_type: "fixed", discount_value: 0, message: "Cupom expirado" };
    }

    return {
      valid: true,
      code: data.code,
      discount_type: data.discount_type as "percentage" | "fixed",
      discount_value: Number(data.discount_value),
      max_discount: data.max_discount ? Number(data.max_discount) : null,
      min_fare: data.min_fare ? Number(data.min_fare) : null
    };
  }
}

export const couponService = new CouponService();
