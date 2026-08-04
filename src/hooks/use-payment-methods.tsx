import React, { createContext, useContext, useState, useEffect } from "react";
import { PaymentMethod, PaymentMethodCode } from "@/types/payments";
import { useAuth } from "@/hooks/use-auth";
import { paymentService } from "@/services/payments/payment-service";

interface PaymentMethodsContextType {
  methods: PaymentMethod[];
  selectedMethod: PaymentMethodCode | null;
  setSelectedMethod: (code: PaymentMethodCode) => void;
  selectMethod: (code: PaymentMethodCode) => void;
  isLoading: boolean;
}

const PaymentMethodsContext = createContext<PaymentMethodsContextType | undefined>(undefined);

export const PaymentMethodsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadMethods = async () => {
      try {
        setIsLoading(true);
        const data = await paymentService.getPaymentMethods();
        setMethods(data);
        
        // Load preference
        if (user) {
          const saved = localStorage.getItem(`apois:passageiro:${user.id}:payment_method`);
          if (saved && data && (data as PaymentMethod[]).some(m => m.code === saved)) {
            setSelectedMethod(saved as PaymentMethodCode);
          } else if (data && data.length > 0) {
            setSelectedMethod(data[0].code);
          }
        }
      } catch (error) {
        console.error("Failed to load payment methods", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMethods();
  }, [user]);

  const handleSelect = (code: PaymentMethodCode) => {
    setSelectedMethod(code);
    if (user) {
      localStorage.setItem(`apois:passageiro:${user.id}:payment_method`, code);
    }
  };

  return (
    <PaymentMethodsContext.Provider value={{ 
      methods, 
      selectedMethod, 
      setSelectedMethod: handleSelect, 
      selectMethod: handleSelect,
      isLoading 
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
