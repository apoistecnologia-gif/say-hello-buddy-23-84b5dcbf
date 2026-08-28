import React, { useEffect } from "react";
import { AnimatePresence, motion, useAnimation } from "framer-motion";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  preventClose?: boolean;
  showBackdrop?: boolean;
  /** Altura fixa opcional. Útil em telas com mapa para impedir layout jumping. */
  height?: string;
  /** Limite de altura opcional. */
  maxHeight?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  children,
  preventClose = false,
  showBackdrop = true,
  height,
  maxHeight,
}) => {
  const controls = useAnimation();
  const isPersistentMapSheet = preventClose && !showBackdrop;

  useEffect(() => {
    if (isOpen) void controls.start({ y: 0 });
  }, [isOpen, controls]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          {showBackdrop ? (
            <motion.button
              type="button"
              aria-label="Fechar painel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={!preventClose ? onClose : undefined}
              className="fixed inset-0 z-40 bg-black/60"
            />
          ) : null}

          <motion.div
            initial={{ y: "100%" }}
            animate={controls}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 240 }}
            className={cn(
              "fixed bottom-0 left-1/2 z-[60] flex w-full max-w-[430px] -translate-x-1/2 flex-col",
              "overflow-hidden rounded-t-[28px] border-x border-t border-white/5 bg-[#121212] shadow-[0_-12px_40px_rgba(0,0,0,0.6)]",
            )}
            style={{
              height: isPersistentMapSheet ? "calc(100dvh - 168px)" : height,
              maxHeight: isPersistentMapSheet
                ? "calc(100dvh - 148px)"
                : maxHeight ?? "calc(100dvh - max(16px, var(--app-safe-top)) - 8px)",
              paddingBottom: "max(12px, var(--app-safe-bottom))",
            }}
          >
            <div className="flex w-full shrink-0 justify-center py-2.5" aria-hidden="true">
              <div className="h-1 w-9 rounded-full bg-gray-600" />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {children}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
};
