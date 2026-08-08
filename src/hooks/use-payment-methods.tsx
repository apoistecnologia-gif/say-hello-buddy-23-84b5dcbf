import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { PaymentMethod, PaymentMethodCode } from "@/types/payments";
import { useAuth } from "@/hooks/use-auth";
import { paymentService } from "@/services/payments/payment-service";

interface PaymentMethodsContextType {
  methods: PaymentMethod[];
  selectedMethod: PaymentMethodCode | null;
  setSelectedMethod: (code: PaymentMethodCode) => void;
  selectMethod: (code: PaymentMethodCode) => void;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const PaymentMethodsContext = createContext<PaymentMethodsContextType | undefined>(undefined);

export const PaymentMethodsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethodState] = useState<PaymentMethodCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMethods = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      // Keep active-but-unavailable methods in the UI so the app is explicit
      // about provider configuration instead of presenting a fake working method.
      const data = (await paymentService.getPaymentMethods()).filter((method) => method.isActive);
      setMethods(data);

      const enabledMethods = data.filter((method) => method.enabled === true);
      let savedMethod: string | null = null;
      if (userId) {
        try {
          savedMethod = window.localStorage.getItem(
            `apois:passageiro:${userId}:payment_method`,
          );
        } catch {
          savedMethod = null;
        }
      }

      const savedEnabledMethod =
        enabledMethods.find((method) => method.code === savedMethod)?.code ?? null;
      const currentEnabledMethod =
        enabledMethods.find((method) => method.code === selectedMethod)?.code ?? null;
      const nextMethod = savedEnabledMethod ?? currentEnabledMethod ?? enabledMethods[0]?.code ?? null;
      setSelectedMethodState(nextMethod);

      if (userId && savedMethod !== nextMethod) {
        try {
          if (nextMethod) {
            window.localStorage.setItem(
              `apois:passageiro:${userId}:payment_method`,
              nextMethod,
            );
          } else {
            window.localStorage.removeItem(`apois:passageiro:${userId}:payment_method`);
          }
        } catch {
          // A preferência em memória continua válida mesmo sem armazenamento local.
        }
      }

      if (enabledMethods.length === 0) {
        setError("Nenhuma forma de pagamento está disponível no momento.");
      }
    } catch (caughtError: unknown) {
      console.error("[PaymentMethodsProvider] Failed to load payment methods", caughtError);
      setMethods([]);
      setSelectedMethodState(null);
      setError("Não foi possível carregar as formas de pagamento.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedMethod, userId]);

  useEffect(() => {
    void loadMethods();
  }, [loadMethods]);

  const handleSelect = useCallback(
    (code: PaymentMethodCode): void => {
      const method = methods.find((item) => item.code === code);
      if (!method?.isActive || method.enabled !== true) return;

      setSelectedMethodState(code);
      if (userId) {
        try {
          window.localStorage.setItem(`apois:passageiro:${userId}:payment_method`, code);
        } catch {
          // A seleção permanece ativa na sessão atual.
        }
      }
    },
    [methods, userId],
  );

  return (
    <PaymentMethodsContext.Provider
      value={{
        methods,
        selectedMethod,
        setSelectedMethod: handleSelect,
        selectMethod: handleSelect,
        isLoading,
        error,
        refresh: loadMethods,
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
