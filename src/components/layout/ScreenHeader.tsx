import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  trailing?: ReactNode;
  className?: string;
};

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  trailing,
  className,
}: ScreenHeaderProps) {
  return (
    <header
      className={cn(
        "app-safe-top app-safe-x relative z-30 flex min-h-[72px] shrink-0 items-center gap-3 border-b border-white/7 bg-apois-black/92 pb-3 backdrop-blur-xl",
        className,
      )}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-apois-surface text-white"
        >
          <ArrowLeft size={21} strokeWidth={2.4} />
        </button>
      ) : null}

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-black tracking-tight text-white">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs font-medium text-apois-muted">{subtitle}</p>
        ) : null}
      </div>

      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </header>
  );
}
