import { supabase } from "@/integrations/supabase/client";
import { fetchRideFeatureFlags, isRideCategoryEnabled } from "@/lib/rideFeatureFlags";
import type { RideCategory, RideCategoryCode } from "@/types/pricing";

const normalizeCategoryCode = (value: string): RideCategoryCode | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "carro") return "carros";
  if (normalized === "moto") return "motos";
  if (["carros", "motos", "fretes", "guincho", "envios"].includes(normalized)) {
    return normalized as RideCategoryCode;
  }
  return null;
};

class CategoryService {
  async getCategories(): Promise<RideCategory[]> {
    const [{ data, error }, featureFlags] = await Promise.all([
      supabase
        .from("ride_categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      fetchRideFeatureFlags(),
    ]);

    if (error) {
      console.error("[CategoryService] Error fetching categories:", error);
      throw error;
    }

    return (data || []).flatMap((category) => {
      const code = normalizeCategoryCode(category.code);
      if (!code) {
        console.warn("[CategoryService] Ignoring unsupported category code", {
          id: category.id,
          code: category.code,
        });
        return [];
      }
      if (!isRideCategoryEnabled(code, featureFlags)) return [];

      return [
        {
          id: category.id,
          code,
          key: code,
          name: category.name,
          label: category.name,
          description: category.description,
          icon: category.icon,
          imageUrl: category.image_url,
          isActive: category.is_active || false,
          sortOrder: category.sort_order || 0,
          capacityLabel: category.capacity_label,
          etaLabel: category.eta_label,
        },
      ];
    });
  }
}

export const categoryService = new CategoryService();
