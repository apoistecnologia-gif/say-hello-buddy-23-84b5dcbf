import { supabase } from "@/integrations/supabase/client";
import { PaymentMethod } from "@/types/payments";

class PaymentService {
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    const { data, error } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Error fetching payment methods:", error);
      throw error;
    }

    return (data || []).map(m => ({
      id: m.id,
      code: m.code as any,
      name: m.name,
      label: m.name,
      description: m.description,
      icon: m.icon,
      isActive: !!m.is_active,
      enabled: !!m.is_active,
      sortOrder: m.sort_order || 0,
      requiresBalance: !!m.requires_balance
    }));
  }

  async getCancellationFees(userId: string) {
    const { data, error } = await supabase
      .from("cancellation_fees")
      .select("*")
      .eq("passenger_id", userId)
      .eq("status", "pending");

    if (error) {
      console.error("Error fetching cancellation fees:", error);
      throw error;
    }

    return data || [];
  }
}

export const paymentService = new PaymentService();
