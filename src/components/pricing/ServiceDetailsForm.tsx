import React from "react";
import { usePricing } from "@/hooks/use-pricing";
import { useRideCategories } from "@/hooks/use-ride-categories";

export const ServiceDetailsForm: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;
  const { selectedCategory } = useRideCategories();
  const { serviceDetails, setServiceDetails } = usePricing();

  if (!selectedCategory || !["fretes", "guincho", "envios"].includes(selectedCategory.key)) {
    return null;
  }

  return (
    <div className="px-6 py-4 space-y-4">
      <p className="text-xs font-black uppercase tracking-widest text-zinc-500">
        Detalhes do Serviço
      </p>
      {/* Form implementation for each category would go here */}
      <div className="bg-zinc-900/50 rounded-2xl p-4 border border-white/5">
        <p className="text-sm text-zinc-400">
          Configure as opções para sua categoria: {selectedCategory.name}
        </p>
      </div>
    </div>
  );
};
