import React, { createContext, useContext, useState } from "react";
import { RideCategory } from "@/types/pricing";

interface RideCategoriesContextType {
  categories: RideCategory[];
  selectedCategory: RideCategory | null;
  setSelectedCategory: (category: RideCategory | null) => void;
  selectCategory: (category: RideCategory) => void;
  isLoading: boolean;
}

const RideCategoriesContext = createContext<RideCategoriesContextType | undefined>(undefined);

const DEFAULT_CATEGORIES: RideCategory[] = [
  { key: "carros", label: "Carros", description: "Viagens confortáveis" },
  { key: "motos", label: "Motos", description: "Mais rápido no trânsito" },
  { key: "fretes", label: "Fretes", description: "Mudanças e transportes" },
  { key: "guincho", label: "Guincho", description: "Resgate de veículos" },
  { key: "envios", label: "Envios", description: "Entregas rápidas" },
];

export const RideCategoriesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [categories] = useState<RideCategory[]>(DEFAULT_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState<RideCategory | null>(DEFAULT_CATEGORIES[0]);

  const selectCategory = (category: RideCategory) => {
    setSelectedCategory(category);
  };

  return (
    <RideCategoriesContext.Provider value={{ 
      categories, 
      selectedCategory, 
      setSelectedCategory, 
      selectCategory,
      isLoading: false 
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
