import React, { createContext, useContext, useState, useEffect } from "react";
import { RideCategory } from "@/types/pricing";

interface RideCategoriesContextType {
  categories: RideCategory[];
  selectedCategory: RideCategory | null;
  setSelectedCategory: (category: RideCategory | null) => void;
  selectCategory: (key: string) => void;
  isLoading: boolean;
}

const RideCategoriesContext = createContext<RideCategoriesContextType | undefined>(undefined);

const DEFAULT_CATEGORIES: RideCategory[] = [
  { key: "carros", label: "Carros", icon: "car", description: "Viagens confortáveis", enabled: true, order: 1 },
  { key: "motos", label: "Motos", icon: "bike", description: "Mais rápido no trânsito", enabled: true, order: 2 },
  { key: "fretes", label: "Fretes", icon: "truck", description: "Mudanças e transportes", enabled: true, order: 3 },
  { key: "guincho", label: "Guincho", icon: "tow", description: "Resgate de veículos", enabled: true, order: 4 },
  { key: "envios", label: "Envios", icon: "package", description: "Entregas rápidas", enabled: true, order: 5 },
];

export const RideCategoriesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [categories] = useState<RideCategory[]>(DEFAULT_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState<RideCategory | null>(DEFAULT_CATEGORIES[0]);

  const selectCategory = (key: string) => {
    const cat = categories.find(c => c.key === key) || null;
    setSelectedCategory(cat);
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
