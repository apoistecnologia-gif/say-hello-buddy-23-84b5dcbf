import { supabase } from "@/integrations/supabase/client";
import { RideCategory, RideCategoryCode } from "@/types/pricing";

class CategoryService {
  async getCategories(): Promise<RideCategory[]> {
    const { data, error } = await supabase
      .from("ride_categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[CategoryService] Error fetching categories:", error);
      throw error;
    }

    return (data || []).map((cat) => ({
      id: cat.id,
      code: cat.code,
      key: cat.code as RideCategoryCode,
      name: cat.name,
      label: cat.name,
      description: cat.description,
      icon: cat.icon,
      imageUrl: cat.image_url,
      isActive: cat.is_active || false,
      sortOrder: cat.sort_order || 0,
      capacityLabel: cat.capacity_label,
      etaLabel: cat.eta_label,
      details: {},
    }));
  }
}

export const categoryService = new CategoryService();
