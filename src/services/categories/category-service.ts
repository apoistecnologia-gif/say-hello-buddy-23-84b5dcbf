import { supabase } from "@/integrations/supabase/client";
import { RideCategory, RideCategoryKey } from "@/types/pricing";

class CategoryService {
  private cache: RideCategory[] | null = null;
  private lastFetch: number = 0;
  private readonly TTL = 60 * 1000;

  async getEnabledCategories(): Promise<RideCategory[]> {
    const now = Date.now();
    if (this.cache && now - this.lastFetch < this.TTL) {
      return this.cache;
    }

    // Usando any para bypass do linter de tipos inexistentes no schema local
    const { data, error } = await (supabase.from("ride_categories") as any)
      .select("*")
      .eq("enabled", true)
      .order("sort_order");

    if (error) {
      console.error("Error loading categories:", error);
      throw new Error("categories_load_failed");
    }

    const validKeys: RideCategoryKey[] = ["carros", "motos", "fretes", "guincho", "envios"];
    const categories: RideCategory[] = (data || [])
      .filter((cat: any) => validKeys.includes(cat.key as RideCategoryKey))
      .map((cat: any) => ({
        id: cat.id,
        key: cat.key as RideCategoryKey,
        label: cat.label,
        icon: cat.icon,
        color: cat.color,
        enabled: cat.enabled,
        sort_order: cat.sort_order
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
