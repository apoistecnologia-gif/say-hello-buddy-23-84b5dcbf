import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useDragControls, useAnimation } from "framer-motion";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  preventClose?: boolean;
  showBackdrop?: boolean;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  children,
  preventClose = false,
  showBackdrop = true,
}) => {
  const controls = useAnimation();
  const dragControls = useDragControls();
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      controls.start({ y: 0 });
    }
  }, [isOpen, controls]);

  const handleDragEnd = async (_: any, info: any) => {
    const shouldClose = info.offset.y > 100 || info.velocity.y > 500;

    if (shouldClose && !preventClose) {
      setIsClosing(true);
      await controls.start({ y: "100%" });
      onClose();
    } else {
      controls.start({ y: 0 });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          {showBackdrop && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={!preventClose ? onClose : undefined}
              className="fixed inset-0 bg-black/60 z-40"
            />
          )}

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={controls}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            className={cn(
              "fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-[60]",
              "bg-[#121212] rounded-t-[32px] overflow-hidden shadow-[0_-12px_40px_rgba(0,0,0,0.6)] border-x border-t border-white/5",
              "flex flex-col",
              "h-auto max-h-[85vh]",
            )}
            style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}
          >
            {/* Handle Bar Area */}
            <div
              className="w-full flex justify-center py-4 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="w-10 h-1.5 bg-gray-600 rounded-full" />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-8">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
