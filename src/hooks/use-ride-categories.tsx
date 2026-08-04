import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { RideCategory, RideCategoryKey } from "@/types/pricing";
import { categoryService } from "@/services/categories/category-service";
import { supabase } from "@/integrations/supabase/client";

interface RideCategoriesContextType {
  categories: RideCategory[];
  isLoading: boolean;
  error: string | null;
  selectedCategory: RideCategory | null;
  selectCategory: (key: RideCategoryKey) => void;
  clearSelection: () => void;
  refresh: () => Promise<void>;
}

const RideCategoriesContext = createContext<RideCategoriesContextType | undefined>(undefined);

export const RideCategoriesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [categories, setCategories] = useState<RideCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<RideCategoryKey | null>(null);

  const loadCategories = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await categoryService.getEnabledCategories();
      setCategories(data);
      
      // Auto-select "carros" if available, or first enabled
      if (!selectedKey && data.length > 0) {
        const defaultCat = data.find(c => c.key === "carros") || data[0];
        if (defaultCat) {
          setSelectedKey(defaultCat.key);
        }
      }
    } catch (err: any) {
      setError(err.message || "categories_load_failed");
    } finally {
      setIsLoading(false);
    }
  }, [selectedKey]);

  useEffect(() => {
    loadCategories();

    // Realtime subscription - usando any para tabelas não tipadas
    const channel = (supabase as any)
      .channel("ride_categories_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ride_categories" },
        () => {
          categoryService.clearCache();
          loadCategories();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadCategories]);

  const selectCategory = (key: RideCategoryKey) => {
    const cat = categories.find(c => c.key === key);
    if (cat && cat.enabled) {
      setSelectedKey(key);
    }
  };

  const clearSelection = () => setSelectedKey(null);

  const selectedCategory = categories.find(c => c.key === selectedKey) || null;

  return (
    <RideCategoriesContext.Provider
      value={{
        categories,
        isLoading,
        error,
        selectedCategory,
        selectCategory,
        clearSelection,
        refresh: loadCategories,
      }}
    >
      {children}
    </RideCategoriesContext.Provider>
  );
};

export const useRideCategories = () => {
  const context = useContext(RideCategoriesContext);
  if (!context) throw new Error("useRideCategories must be used within RideCategoriesProvider");
  return context;
};
