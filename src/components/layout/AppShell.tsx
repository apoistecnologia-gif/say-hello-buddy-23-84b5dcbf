import type { PropsWithChildren } from "react";
import { MainHamburgerMenu } from "@/components/navigation/MainHamburgerMenu";
import { cn } from "@/lib/utils";

type AppShellProps = PropsWithChildren<{
  className?: string;
  contentClassName?: string;
}>;

/**
 * Estrutura raiz do aplicativo Passageiro.
 * Existe uma única viewport física (100dvh). Cada rota ocupa somente o espaço
 * interno disponível, respeitando as áreas seguras e rolando o próprio conteúdo.
 */
export function AppShell({
  children,
  className,
  contentClassName,
}: AppShellProps) {
  return (
    <div className="app-viewport flex h-[100dvh] min-h-0 justify-center overflow-hidden bg-apois-black selection:bg-apois-yellow/30">
      <div
        className={cn(
          "relative flex h-full min-h-0 w-full max-w-[430px] flex-col overflow-hidden bg-apois-black shadow-[0_0_80px_rgba(0,0,0,0.55)]",
          className,
        )}
      >
        <MainHamburgerMenu />
        <main
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-hidden",
            contentClassName,
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}