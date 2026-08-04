import React, { createContext, useContext, useState, useEffect } from "react";
import { PaymentMethod, PaymentMethodKey } from "@/types/payments";
import { useAuth } from "@/hooks/use-auth";

interface PaymentMethodsContextType {
  methods: PaymentMethod[];
  selectedMethod: PaymentMethodKey | null;
  setSelectedMethod: (key: PaymentMethodKey) => void;
  isLoading: boolean;
}

const PaymentMethodsContext = createContext<PaymentMethodsContextType | undefined>(undefined);

const DEFAULT_METHODS: PaymentMethod[] = [
  { key: "pix", label: "PIX", icon: "qr-code", description: "Pagamento instantâneo", enabled: true },
  { key: "credit_card", label: "Cartão de Crédito", icon: "credit-card", description: "Pague no app", enabled: true },
  { key: "debit_card", label: "Cartão de Débito", icon: "credit-card", description: "Débito online", enabled: true },
  { key: "cash", label: "Dinheiro", icon: "banknote", description: "Pague ao motorista", enabled: true },
  { key: "wallet", label: "Carteira APOIS", icon: "wallet", description: "Saldo em conta", enabled: false }, // Disabled for STO-011
  { key: "corporate", label: "Corporativo", icon: "building", description: "Conta empresa", enabled: false },
];

export const PaymentMethodsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodKey | null>("cash");

  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem(`apois:passageiro:${user.id}:payment_method`);
      if (saved) setSelectedMethod(saved as PaymentMethodKey);
    }
  }, [user]);

  const handleSelect = (key: PaymentMethodKey) => {
    setSelectedMethod(key);
    if (user) {
      localStorage.setItem(`apois:passageiro:${user.id}:payment_method`, key);
    }
  };

  return (
    <PaymentMethodsContext.Provider value={{ 
      methods: DEFAULT_METHODS, 
      selectedMethod, 
      setSelectedMethod: handleSelect, 
      isLoading: false 
    }}>
      {children}
    </PaymentMethodsContext.Provider>
  );
};

export const usePaymentMethods = () => {
  const context = useContext(PaymentMethodsContext);
  if (!context) throw new Error("usePaymentMethods must be used within PaymentMethodsProvider");
  return context;
};
