import { supabase } from "@/integrations/supabase/client";
import { CouponValidationResult, RideCategoryKey } from "@/types/payments";

class CouponService {
  async validateCoupon(
    code: string, 
    userId: string,
    categoryKey: RideCategoryKey,
    estimatedFare: number
  ): Promise<CouponValidationResult> {
    // O backend APOIS utiliza uma RPC ou tabela 'coupons' para validação
    // Tentamos buscar na tabela 'coupons' que é o padrão atual
    const { data, error } = await (supabase as any)
      .from("coupons")
      .select("*")
      .eq("code", code.toUpperCase().trim())
      .eq("active", true)
      .maybeSingle();

    if (error || !data) {
      return { valid: false, code, discount_type: "fixed", discount_value: 0, message: "Cupom inválido ou expirado" };
    }

    // Validações básicas no frontend (autoridade final é o backend)
    const now = new Date();
    if (data.expires_at && new Date(data.expires_at) < now) {
      return { valid: false, code, discount_type: "fixed", discount_value: 0, message: "Cupom expirado" };
    }

    return {
      valid: true,
      code: data.code,
      discount_type: data.discount_type as "percentage" | "fixed",
      discount_value: Number(data.discount_value),
      max_discount: data.max_discount ? Number(data.max_discount) : undefined,
      min_fare: data.min_fare ? Number(data.min_fare) : undefined
    };
  }
}

export const couponService = new CouponService();
