import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_public/")({
  component: IndexDecisionComponent,
});

function IndexDecisionComponent() {
  const { authState } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authState === "authenticated") {
      navigate({ to: "/inicio", replace: true });
    } else if (authState === "unauthenticated") {
      navigate({ to: "/login", replace: true });
    }
  }, [authState, navigate]);

  // Renders nothing or a very minimal spinner while deciding
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader2 className="animate-spin text-apois-yellow" size={32} />
    </div>
  );
}
