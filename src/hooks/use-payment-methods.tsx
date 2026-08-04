import React, { createContext, useContext, useState, useEffect } from "react";
import { PaymentMethod, PaymentMethodKey } from "@/types/payments";
import { PAYMENT_CONFIG } from "@/services/payments/payment-config";
import { useAuth } from "@/hooks/use-auth";

interface PaymentMethodsContextType {
  methods: PaymentMethod[];
  selectedMethod: PaymentMethodKey | null;
  isLoading: boolean;
  selectMethod: (key: PaymentMethodKey) => void;
  clearSelection: () => void;
}

const PaymentMethodsContext = createContext<PaymentMethodsContextType | undefined>(undefined);

export const PaymentMethodsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodKey | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getStorageKey = () => {
    if (!user) return null;
    return `${PAYMENT_CONFIG.PREFERENCE_KEY_PREFIX}${user.id}${PAYMENT_CONFIG.PREFERENCE_KEY_SUFFIX}`;
  };

  useEffect(() => {
    const key = getStorageKey();
    if (key) {
      const saved = localStorage.getItem(key) as PaymentMethodKey;
      const validMethod = PAYMENT_CONFIG.METHODS.find(m => m.key === saved && m.enabled);
      if (validMethod) {
        setSelectedMethod(validMethod.key);
      } else {
        setSelectedMethod("pix"); // Default fallback
      }
    } else {
      setSelectedMethod(null);
    }
  }, [user]);

  const selectMethod = (key: PaymentMethodKey) => {
    const method = PAYMENT_CONFIG.METHODS.find(m => m.key === key);
    if (method && method.enabled) {
      setSelectedMethod(key);
      const storageKey = getStorageKey();
      if (storageKey) {
        localStorage.setItem(storageKey, key);
      }
    }
  };

  const clearSelection = () => setSelectedMethod(null);

  return (
    <PaymentMethodsContext.Provider
      value={{
        methods: [...PAYMENT_CONFIG.METHODS],
        selectedMethod,
        isLoading,
        selectMethod,
        clearSelection,
      }}
    >
      {children}
    </PaymentMethodsContext.Provider>
  );
};

export const usePaymentMethods = () => {
  const context = useContext(PaymentMethodsContext);
  if (!context) throw new Error("usePaymentMethods must be used within PaymentMethodsProvider");
  return context;
};
