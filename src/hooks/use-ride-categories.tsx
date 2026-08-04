import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { RideCategory } from "@/types/pricing";
import { categoryService } from "@/services/categories/category-service";
import { toast } from "sonner";

interface RideCategoriesContextType {
  categories: RideCategory[];
  selectedCategory: RideCategory | null;
  setSelectedCategory: (category: RideCategory | null) => void;
  selectCategory: (category: RideCategory) => void;
  isLoading: boolean;
  refreshCategories: () => Promise<void>;
}

const RideCategoriesContext = createContext<RideCategoriesContextType | undefined>(undefined);

export const RideCategoriesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [categories, setCategories] = useState<RideCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<RideCategory | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await categoryService.getCategories();
      setCategories(data);
      if (data.length > 0 && !selectedCategory) {
        setSelectedCategory(data[0] || null);
      }
    } catch (error) {
      console.error("[RideCategoriesProvider] Error:", error);
      toast.error("Não foi possível carregar as opções de viagem.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    fetchCategories();
  }, []);

  const selectCategory = (category: RideCategory) => {
    if (category.isActive) {
      setSelectedCategory(category);
    }
  };

  return (
    <RideCategoriesContext.Provider value={{ 
      categories, 
      selectedCategory, 
      setSelectedCategory, 
      selectCategory,
      isLoading,
      refreshCategories: fetchCategories
    }}>
      {children}
    </RideCategoriesContext.Provider>
  );
};

export const useRideCategories = () => {
  const context = useContext(RideCategoriesContext);
  if (!context) throw new Error("useRideCategories must be used within RideCategoriesProvider");
  return context;
};
