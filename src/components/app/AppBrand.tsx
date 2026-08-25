import { cn } from "@/lib/utils";
import logo from "@/assets/logo.jpg";

type AppBrandProps = {
  className?: string;
  compact?: boolean;
  subtitle?: string;
};

export function AppBrand({ className, compact = false, subtitle }: AppBrandProps) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_24px_70px_rgba(0,0,0,0.45)]",
          compact ? "h-20 w-20" : "h-28 w-28",
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,184,0,0.16),transparent_66%)]" />
        <img src={logo} alt="APOIS VAMOS" className="relative h-full w-full object-cover" loading="eager" />
      </div>

      <div className={cn("mt-5", compact && "mt-3")}>
        <p className={cn("font-black tracking-[-0.05em] text-white", compact ? "text-2xl" : "text-4xl")}>
          APOIS
        </p>
        <p className={cn("font-black uppercase tracking-[0.38em] text-apois-yellow", compact ? "text-[9px]" : "text-[11px]")}>
          VAMOS
        </p>
        {subtitle ? <p className="mt-2 max-w-xs text-sm leading-6 text-zinc-400">{subtitle}</p> : null}
      </div>
    </div>
  );
}
