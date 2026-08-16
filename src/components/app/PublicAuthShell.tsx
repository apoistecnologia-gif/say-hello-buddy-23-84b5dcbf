import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PublicAuthShellProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function PublicAuthShell({ children, className, contentClassName }: PublicAuthShellProps) {
  return (
    <main className={cn("app-viewport app-safe-top app-safe-bottom flex min-h-[100dvh] flex-1 flex-col overflow-hidden", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-apois-yellow/10 blur-3xl" />
        <div className="absolute left-[-7rem] top-[42%] h-56 w-56 rounded-full border border-apois-yellow/10" />
        <div className="absolute bottom-[-8rem] right-[-6rem] h-64 w-64 rounded-full border border-white/5" />
      </div>

      <div className="app-scroll relative z-10 flex w-full flex-1 flex-col">
        <div className={cn("mx-auto flex min-h-full w-full max-w-[430px] flex-1 flex-col px-6 py-8", contentClassName)}>
          {children}
        </div>
      </div>
    </main>
  );
}
