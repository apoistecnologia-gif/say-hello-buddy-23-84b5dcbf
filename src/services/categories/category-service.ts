import { supabase } from "@/integrations/supabase/client";
import { RideCategory, RideCategoryKey } from "@/types/pricing";

class CategoryService {
  private cache: RideCategory[] | null = null;
  private lastFetch: number = 0;
  private readonly TTL = 60 * 1000; // 1 minute memory cache

  async getEnabledCategories(): Promise<RideCategory[]> {
    const now = Date.now();
    if (this.cache && now - this.lastFetch < this.TTL) {
      return this.cache;
    }

    const { data, error } = await supabase
      .from("ride_categories")
      .select("*")
      .eq("enabled", true)
      .order("sort_order");

    if (error) {
      console.error("Error loading categories:", error);
      throw new Error("categories_load_failed");
    }

    const validKeys: RideCategoryKey[] = ["carros", "motos", "fretes", "guincho", "envios"];
    const categories = (data || [])
      .filter(cat => validKeys.includes(cat.key as RideCategoryKey))
      .map(cat => ({
        ...cat,
        key: cat.key as RideCategoryKey
      }));

    this.cache = categories;
    this.lastFetch = now;
    return categories;
  }

  clearCache() {
    this.cache = null;
    this.lastFetch = 0;
  }
}

export const categoryService = new CategoryService();
