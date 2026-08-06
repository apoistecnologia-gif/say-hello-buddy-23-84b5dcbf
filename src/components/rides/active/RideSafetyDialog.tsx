import { Ambulance, Car, Phone, Share2, ShieldAlert, Siren, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface RideSafetyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverName?: string | undefined;
  driverPhone?: string | undefined;
  onShareRide: () => void | Promise<void>;
}

function callPhone(number: string): void {
  const normalized = number.replace(/[^\d+]/g, "");
  if (!normalized) return;
  window.location.href = `tel:${normalized}`;
}

export function RideSafetyDialog({
  open,
  onOpenChange,
  driverName,
  driverPhone,
  onShareRide,
}: RideSafetyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-32px)] max-w-md overflow-y-auto rounded-[30px] border-red-500/20 bg-zinc-950 p-0 text-white">
        <DialogHeader className="border-b border-white/8 p-5 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-400">
                <ShieldAlert size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                  Proteção durante a viagem
                </p>
                <DialogTitle className="mt-1 text-xl font-black">Central de segurança</DialogTitle>
              </div>
            </div>
            <button
              type="button"
              aria-label="Fechar central de segurança"
              onClick={() => onOpenChange(false)}
              className="app-pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-900"
            >
              <X size={18} />
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-3 p-5">
          <p className="rounded-2xl border border-red-500/15 bg-red-500/8 p-4 text-xs leading-5 text-red-100/80">
            Em risco imediato, procure um local seguro e acione o serviço público adequado. A APOIS não substitui os serviços de emergência.
          </p>

          <SafetyAction
            icon={Siren}
            title="Polícia — 190"
            description="Para ameaça, violência, roubo ou perigo imediato."
            tone="danger"
            onClick={() => callPhone("190")}
          />

          <SafetyAction
            icon={Ambulance}
            title="SAMU — 192"
            description="Para emergência médica com necessidade de atendimento urgente."
            tone="danger"
            onClick={() => callPhone("192")}
          />

          <SafetyAction
            icon={Share2}
            title="Compartilhar acompanhamento"
            description="Envie o link protegido desta corrida para alguém de confiança."
            onClick={() => void onShareRide()}
          />

          {driverPhone ? (
            <SafetyAction
              icon={Car}
              title={`Ligar para ${driverName?.trim() || "o motorista"}`}
              description="Use para combinar o ponto de encontro ou avisar sobre uma situação."
              onClick={() => callPhone(driverPhone)}
            />
          ) : null}

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="app-pressable mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 text-sm font-black text-zinc-300"
          >
            <Phone size={17} />
            Voltar para a corrida
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SafetyAction({
  icon: Icon,
  title,
  description,
  onClick,
  tone = "neutral",
}: {
  icon: typeof Siren;
  title: string;
  description: string;
  onClick: () => void;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`app-pressable flex min-h-20 w-full items-center gap-4 rounded-2xl border p-4 text-left ${
        tone === "danger"
          ? "border-red-500/20 bg-red-500/8"
          : "border-white/8 bg-white/[0.03]"
      }`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
          tone === "danger" ? "bg-red-500/15 text-red-400" : "bg-zinc-900 text-apois-yellow"
        }`}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-black text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
      </div>
    </button>
  );
}
