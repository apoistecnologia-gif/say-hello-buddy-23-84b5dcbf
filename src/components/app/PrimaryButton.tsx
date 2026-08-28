import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
  icon?: ReactNode;
  fullWidth?: boolean;
};

export function PrimaryButton({
  children,
  className,
  disabled,
  loading = false,
  loadingLabel = "Aguarde...",
  icon,
  fullWidth = true,
  type = "button",
  ...props
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading}
      className={cn(
        "app-pressable app-gold-glow ripple-effect inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-apois-yellow px-6 py-3 text-base font-black text-black",
        "disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none",
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : icon}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
}
