import { CouponValidationResult } from "@/types/payments";
import { RideCategoryCode } from "@/types/pricing";

/**
 * CouponService is temporarily disabled for active calculations.
 * The backend 'request-ride' does not yet support coupons authoritatively.
 */
class CouponService {
  async validateCoupon(
    _code: string, 
    _userId: string,
    _categoryKey: RideCategoryCode,
    _estimatedFare: number
  ): Promise<CouponValidationResult> {
    // Honesty policy: Coupons are not yet integrated with the server
    return { 
      valid: false, 
      code: _code, 
      discount_type: "fixed", 
      discount_value: 0, 
      message: "Cupons estarão disponíveis após integração com o servidor." 
    };
  }
}

export const couponService = new CouponService();
