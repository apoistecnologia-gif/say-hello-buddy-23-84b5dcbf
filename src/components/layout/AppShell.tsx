import type { PropsWithChildren, ReactNode } from "react";
import { cn } from "@/lib/utils";

type AppShellProps = PropsWithChildren<{
  bottomNavigation?: ReactNode;
  className?: string;
  contentClassName?: string;
}>;

/**
 * Estrutura raiz do aplicativo Passageiro.
 * Mantém largura mobile consistente no navegador e ocupa a tela inteira no Android,
 * respeitando safe areas sem deixar a navegação sobrepor o conteúdo.
 */
export function AppShell({
  children,
  bottomNavigation,
  className,
  contentClassName,
}: AppShellProps) {
  return (
    <div className="app-viewport flex min-h-[100dvh] justify-center overflow-hidden bg-apois-black selection:bg-apois-yellow/30">
      <div
        className={cn(
          "relative flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-apois-black shadow-[0_0_80px_rgba(0,0,0,0.55)]",
          className,
        )}
      >
        <main
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-hidden",
            contentClassName,
          )}
        >
          {children}
        </main>
        {bottomNavigation}
      </div>
    </div>
  );
}
