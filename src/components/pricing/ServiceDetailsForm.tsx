import React, { useState } from "react";
import { usePricing } from "@/hooks/use-pricing";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { 
  FreightServiceDetails, 
  TowServiceDetails, 
  DeliveryServiceDetails,
  RideCategoryKey
} from "@/types/pricing";
import { cn } from "@/lib/utils";
import { X, ChevronRight, Check } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ServiceDetailsForm: React.FC<Props> = ({ isOpen, onClose }) => {
  const { selectedCategory } = useRideCategories();
  const { serviceDetails, setServiceDetails } = usePricing();

  if (!isOpen || !selectedCategory) return null;

  const renderFreightForm = () => {
    const details = (serviceDetails as FreightServiceDetails) || {
      tipo: "frete",
      ajudantes: 0,
      itemPesado: false,
      montagem: false,
      embalagem: false,
      retirada: { dificilAcesso: false, escadas: false, andar: 0, elevador: false },
      entrega: { dificilAcesso: false, escadas: false, andar: 0, elevador: false },
    };

    const update = (patch: Partial<FreightServiceDetails>) => {
      setServiceDetails({ ...details, ...patch });
    };

    return (
      <div className="space-y-6 pb-20">
        <section>
          <label className="text-sm font-bold text-zinc-500 uppercase mb-3 block">Tipo de Serviço</label>
          <div className="grid grid-cols-2 gap-3">
            {["frete", "mudança"].map((t) => (
              <button
                key={t}
                onClick={() => update({ tipo: t as any })}
                className={cn(
                  "py-3 rounded-xl border-2 font-bold capitalize transition-all",
                  details.tipo === t ? "bg-apois-yellow border-apois-yellow text-black" : "bg-zinc-900 border-zinc-800 text-zinc-400"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        <section>
          <label className="text-sm font-bold text-zinc-500 uppercase mb-3 block">Ajudantes</label>
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((n) => (
              <button
                key={n}
                onClick={() => update({ ajudantes: n as any })}
                className={cn(
                  "py-3 rounded-xl border-2 font-bold transition-all",
                  details.ajudantes === n ? "bg-apois-yellow border-apois-yellow text-black" : "bg-zinc-900 border-zinc-800 text-zinc-400"
                )}
              >
                {n === 0 ? "Nenhum" : n}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <label className="text-sm font-bold text-zinc-500 uppercase mb-1 block">Itens e Serviços</label>
          {[
            { key: "itemPesado", label: "Item Muito Pesado" },
            { key: "montagem", label: "Montagem / Desmontagem" },
            { key: "embalagem", label: "Embalagem Completa" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => update({ [item.key]: !details[item.key as keyof FreightServiceDetails] })}
              className={cn(
                "w-full py-4 px-4 rounded-xl border-2 flex items-center justify-between font-bold transition-all",
                details[item.key as keyof FreightServiceDetails] ? "bg-zinc-800 border-apois-yellow text-apois-yellow" : "bg-zinc-900 border-zinc-800 text-zinc-400"
              )}
            >
              {item.label}
              {details[item.key as keyof FreightServiceDetails] && <Check size={20} />}
            </button>
          ))}
        </section>
      </div>
    );
  };

  const renderTowForm = () => {
    const details = (serviceDetails as TowServiceDetails) || {
      tipoVeiculo: "carro",
      acidente: false,
      precisaPlataforma: false,
      rodasTravadas: false,
      garagemSubsolo: false,
      dificilAcesso: false,
    };

    const update = (patch: Partial<TowServiceDetails>) => {
      setServiceDetails({ ...details, ...patch });
    };

    return (
      <div className="space-y-6 pb-20">
        <section>
          <label className="text-sm font-bold text-zinc-500 uppercase mb-3 block">Tipo de Veículo</label>
          <div className="grid grid-cols-2 gap-3">
            {["carro", "moto", "utilitario", "caminhonete"].map((v) => (
              <button
                key={v}
                onClick={() => update({ tipoVeiculo: v as any })}
                className={cn(
                  "py-3 rounded-xl border-2 font-bold capitalize transition-all text-xs",
                  details.tipoVeiculo === v ? "bg-apois-yellow border-apois-yellow text-black" : "bg-zinc-900 border-zinc-800 text-zinc-400"
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <label className="text-sm font-bold text-zinc-500 uppercase mb-1 block">Condições</label>
          {[
            { key: "acidente", label: "Veículo Acidentado" },
            { key: "precisaPlataforma", label: "Precisa de Plataforma" },
            { key: "rodasTravadas", label: "Rodas Travadas" },
            { key: "garagemSubsolo", label: "Garagem / Subsolo" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => update({ [item.key]: !details[item.key as keyof TowServiceDetails] })}
              className={cn(
                "w-full py-4 px-4 rounded-xl border-2 flex items-center justify-between font-bold transition-all",
                details[item.key as keyof TowServiceDetails] ? "bg-zinc-800 border-apois-yellow text-apois-yellow" : "bg-zinc-900 border-zinc-800 text-zinc-400"
              )}
            >
              {item.label}
              {details[item.key as keyof TowServiceDetails] && <Check size={20} />}
            </button>
          ))}
        </section>
      </div>
    );
  };

  const renderDeliveryForm = () => {
    const details = (serviceDetails as DeliveryServiceDetails) || { weightKg: 0 };
    return (
      <div className="space-y-6 pb-20">
        <section>
          <label className="text-sm font-bold text-zinc-500 uppercase mb-3 block">Peso Estimado (kg)</label>
          <input
            type="number"
            value={details.weightKg || ""}
            onChange={(e) => setServiceDetails({ weightKg: Number(e.target.value) })}
            placeholder="Ex: 5"
            className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-xl py-4 px-4 text-white font-bold text-xl focus:border-apois-yellow outline-none transition-all"
          />
        </section>
      </div>
    );
  };

  const getForm = () => {
    switch (selectedCategory.key) {
      case "fretes": return renderFreightForm();
      case "guincho": return renderTowForm();
      case "envios": return renderDeliveryForm();
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-black rounded-t-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto border-t border-zinc-800">
        <div className="flex items-center justify-between mb-8 sticky top-0 bg-black py-2 z-10">
          <div>
            <h2 className="text-2xl font-black text-white">Detalhes do Serviço</h2>
            <p className="text-zinc-500 text-sm font-medium">{selectedCategory.label}</p>
          </div>
          <button onClick={onClose} className="p-3 bg-zinc-900 rounded-full text-zinc-400 active:scale-90 transition-all">
            <X size={24} />
          </button>
        </div>

        {getForm()}

        <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black to-transparent pointer-events-none">
          <button 
            onClick={onClose}
            className="w-full bg-apois-yellow text-black py-5 rounded-2xl font-black text-lg shadow-xl pointer-events-auto active:scale-[0.98] transition-all"
          >
            Confirmar e Ver Preço
          </button>
        </div>
      </div>
    </div>
  );
};
