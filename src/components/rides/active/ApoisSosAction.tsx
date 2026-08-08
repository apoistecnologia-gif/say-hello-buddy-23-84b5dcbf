import { useState } from "react";
import { CheckCircle2, LoaderCircle, ShieldAlert } from "lucide-react";
import { rideSafetyService } from "@/services/rides/ride-safety-service";

interface ApoisSosActionProps {
  rideId: string;
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Não foi possível registrar o alerta agora.";
  if (error.message === "location_permission_denied") {
    return "A localização é necessária para registrar o alerta. Autorize o acesso e tente novamente.";
  }
  if (error.message === "location_unavailable") {
    return "Não foi possível obter sua localização atual. Ative a localização e tente novamente.";
  }
  return "Não foi possível registrar o alerta na central APOIS. Use os serviços públicos de emergência se houver risco imediato.";
}

export function ApoisSosAction({ rideId }: ApoisSosActionProps) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleClick = async (): Promise<void> => {
    if (state === "loading" || state === "success") return;
    setState("loading");
    setMessage("Obtendo sua localização e registrando o alerta...");

    try {
      await rideSafetyService.triggerSosWithCurrentLocation(
        rideId,
        "Alerta de segurança acionado pelo passageiro no aplicativo APOIS.",
      );
      setState("success");
      setMessage("Alerta registrado na central operacional APOIS com sua localização atual.");
    } catch (error) {
      setState("error");
      setMessage(getErrorMessage(error));
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={state === "loading" || state === "success"}
        onClick={() => void handleClick()}
        className="app-pressable flex min-h-20 w-full items-center gap-4 rounded-2xl border border-red-500/35 bg-red-500/12 p-4 text-left disabled:cursor-not-allowed disabled:opacity-70"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/20 text-red-300">
          {state === "loading" ? (
            <LoaderCircle className="animate-spin" size={20} />
          ) : state === "success" ? (
            <CheckCircle2 size={20} />
          ) : (
            <ShieldAlert size={20} />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-white">
            {state === "success" ? "Alerta APOIS registrado" : "Acionar alerta APOIS"}
          </p>
          <p className="mt-1 text-xs leading-5 text-red-100/65">
            Registra um evento operacional da corrida com sua localização atual. Não aciona automaticamente serviços públicos.
          </p>
        </div>
      </button>

      {message ? (
        <p
          role={state === "error" ? "alert" : "status"}
          className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
            state === "error"
              ? "border-red-500/20 bg-red-500/8 text-red-200"
              : state === "success"
                ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-200"
                : "border-white/8 bg-white/[0.03] text-zinc-400"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
