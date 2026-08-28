import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { AppBrand } from "@/components/app/AppBrand";
import { PublicAuthShell } from "@/components/app/PublicAuthShell";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_public/")({
  component: EntryRedirect,
});

function EntryRedirect() {
  const { authState } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authState === "authenticated") {
      void navigate({ to: "/inicio", replace: true });
    } else if (authState === "unauthenticated") {
      void navigate({ to: "/login", replace: true });
    }
  }, [authState, navigate]);

  return (
    <PublicAuthShell contentClassName="items-center justify-center text-center">
      <AppBrand subtitle="Apois, vamos?" />
      <div className="mt-7 flex items-center gap-3 text-xs font-bold text-zinc-500">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-apois-yellow" />
        Preparando seu acesso
      </div>
    </PublicAuthShell>
  );
}
