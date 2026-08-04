import React, { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { rideRequestService } from "@/services/rides/ride-request-service";

interface CancellationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  rideId: string;
  onSuccess: () => void;
}

export const CancellationDialog: React.FC<CancellationDialogProps> = ({ 
  isOpen, 
  onClose, 
  rideId,
  onSuccess 
}) => {
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    setIsCancelling(true);
    setError(null);
    try {
      await rideRequestService.cancelRide(rideId);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Erro ao cancelar corrida.");
      setIsCancelling(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-[90vw] rounded-3xl p-6">
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <XCircle className="text-red-500" size={24} />
          </div>
          <DialogTitle className="text-xl font-black">Cancelar corrida?</DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm font-medium">
            Se você cancelar agora, poderá ser aplicada uma taxa de cancelamento caso o motorista já esteja próximo.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          <div className="flex gap-3 items-start p-3 bg-zinc-900 rounded-2xl border border-white/5">
            <AlertTriangle className="text-apois-yellow shrink-0 mt-0.5" size={16} />
            <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
              Taxas de cancelamento ajudam a compensar o tempo e combustível do motorista parceiro.
            </p>
          </div>
          {error && <p className="text-[11px] text-red-500 font-bold px-2">{error}</p>}
        </div>

        <DialogFooter className="flex flex-col gap-2 mt-2">
          <Button 
            variant="destructive" 
            className="w-full h-12 rounded-2xl font-black text-sm"
            onClick={handleCancel}
            disabled={isCancelling}
          >
            {isCancelling ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
            Confirmar Cancelamento
          </Button>
          <Button 
            variant="ghost" 
            className="w-full h-12 rounded-2xl font-black text-sm text-zinc-400"
            onClick={onClose}
            disabled={isCancelling}
          >
            Manter Corrida
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
