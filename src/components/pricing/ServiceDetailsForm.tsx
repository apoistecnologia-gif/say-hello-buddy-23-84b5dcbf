import React, { useEffect, useMemo, useState } from "react";
import { Check, Package, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/ui/bottom-sheet/BottomSheet";
import { usePricing } from "@/hooks/use-pricing";
import { useRideCategories } from "@/hooks/use-ride-categories";
import type {
  DeliveryServiceDetails,
  FreightAccessDetails,
  FreightServiceDetails,
  TowServiceDetails,
} from "@/types/pricing";

const emptyFreight: FreightServiceDetails = {
  tipoServico: "frete",
  ajudantes: "nenhum",
  itemPesado: false,
  desmontar: false,
  embalar: false,
  retirada: {},
  entrega: {},
};

const emptyTow: TowServiceDetails = {
  tipoVeiculo: "carro",
  veiculoLiga: false,
  acidente: false,
  rodasTravadas: false,
  precisaPlataforma: false,
  dificilAcesso: false,
  garagemSubsolo: false,
};

const emptyDelivery: DeliveryServiceDetails = {
  tipoItem: "pacote",
  weightKg: 1,
  fragil: false,
  nomeDestinatario: "",
  telefoneDestinatario: "",
};

const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, 11);

const formatPhone = (value: string) => {
  const digits = onlyDigits(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readBoolean = (record: Record<string, unknown>, key: string) => record[key] === true;
const readString = (record: Record<string, unknown>, key: string, fallback = "") =>
  typeof record[key] === "string" ? String(record[key]) : fallback;
const readNumber = (record: Record<string, unknown>, key: string, fallback = 0) =>
  typeof record[key] === "number" && Number.isFinite(record[key])
    ? Number(record[key])
    : fallback;

export const ServiceDetailsForm: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { selectedCategory } = useRideCategories();
  const { serviceDetails, setServiceDetails } = usePricing();
  const [freight, setFreight] = useState<FreightServiceDetails>(emptyFreight);
  const [tow, setTow] = useState<TowServiceDetails>(emptyTow);
  const [delivery, setDelivery] = useState<DeliveryServiceDetails>(emptyDelivery);

  const categoryCode = selectedCategory?.code;
  const isSpecialCategory =
    categoryCode === "fretes" || categoryCode === "guincho" || categoryCode === "envios";

  useEffect(() => {
    if (!isOpen || !isRecord(serviceDetails)) return;

    if (categoryCode === "fretes") {
      const pickup = isRecord(serviceDetails["retirada"]) ? serviceDetails["retirada"] : {};
      const dropoff = isRecord(serviceDetails["entrega"]) ? serviceDetails["entrega"] : {};
      setFreight({
        tipoServico:
          readString(serviceDetails, "tipoServico") === "mudanca" ? "mudanca" : "frete",
        ajudantes: ["um", "dois"].includes(readString(serviceDetails, "ajudantes"))
          ? (readString(serviceDetails, "ajudantes") as "um" | "dois")
          : "nenhum",
        itemPesado: readBoolean(serviceDetails, "itemPesado"),
        desmontar: readBoolean(serviceDetails, "desmontar"),
        embalar: readBoolean(serviceDetails, "embalar"),
        retirada: {
          andar: readNumber(pickup, "andar"),
          elevador: readBoolean(pickup, "elevador"),
          escadas: readBoolean(pickup, "escadas"),
          dificilAcesso: readBoolean(pickup, "dificilAcesso"),
        },
        entrega: {
          andar: readNumber(dropoff, "andar"),
          elevador: readBoolean(dropoff, "elevador"),
          escadas: readBoolean(dropoff, "escadas"),
          dificilAcesso: readBoolean(dropoff, "dificilAcesso"),
        },
        observacoes: readString(serviceDetails, "observacoes"),
      });
    }

    if (categoryCode === "guincho") {
      const vehicleType = readString(serviceDetails, "tipoVeiculo");
      setTow({
        tipoVeiculo: ["moto", "utilitario", "caminhonete"].includes(vehicleType)
          ? (vehicleType as TowServiceDetails["tipoVeiculo"])
          : "carro",
        veiculoLiga: readBoolean(serviceDetails, "veiculoLiga"),
        acidente: readBoolean(serviceDetails, "acidente"),
        rodasTravadas: readBoolean(serviceDetails, "rodasTravadas"),
        precisaPlataforma: readBoolean(serviceDetails, "precisaPlataforma"),
        dificilAcesso: readBoolean(serviceDetails, "dificilAcesso"),
        garagemSubsolo: readBoolean(serviceDetails, "garagemSubsolo"),
        observacoes: readString(serviceDetails, "observacoes"),
      });
    }

    if (categoryCode === "envios") {
      const itemType = readString(serviceDetails, "tipoItem");
      setDelivery({
        tipoItem: ["documento", "comida", "outro"].includes(itemType)
          ? (itemType as DeliveryServiceDetails["tipoItem"])
          : "pacote",
        weightKg: Math.max(0.1, readNumber(serviceDetails, "weightKg", 1)),
        fragil: readBoolean(serviceDetails, "fragil"),
        nomeDestinatario: readString(serviceDetails, "nomeDestinatario"),
        telefoneDestinatario: formatPhone(readString(serviceDetails, "telefoneDestinatario")),
        observacoes: readString(serviceDetails, "observacoes"),
      });
    }
  }, [categoryCode, isOpen, serviceDetails]);

  const title = useMemo(() => {
    if (categoryCode === "fretes") return "Detalhes do frete";
    if (categoryCode === "guincho") return "Detalhes do veículo";
    return "Detalhes do envio";
  }, [categoryCode]);

  if (!isSpecialCategory) return null;

  const save = () => {
    if (categoryCode === "envios") {
      if (delivery.nomeDestinatario.trim().length < 2) {
        toast.error("Informe o nome de quem receberá o envio.");
        return;
      }
      if (onlyDigits(delivery.telefoneDestinatario).length < 10) {
        toast.error("Informe um telefone válido do destinatário.");
        return;
      }
      if (!Number.isFinite(delivery.weightKg) || delivery.weightKg <= 0) {
        toast.error("Informe o peso aproximado do item.");
        return;
      }
      setServiceDetails({
        ...delivery,
        nomeDestinatario: delivery.nomeDestinatario.trim(),
        telefoneDestinatario: onlyDigits(delivery.telefoneDestinatario),
        observacoes: delivery.observacoes?.trim() || undefined,
      });
    } else if (categoryCode === "guincho") {
      setServiceDetails({
        ...tow,
        observacoes: tow.observacoes?.trim() || undefined,
      });
    } else {
      setServiceDetails({
        ...freight,
        retirada: normalizeAccess(freight.retirada),
        entrega: normalizeAccess(freight.entrega),
        observacoes: freight.observacoes?.trim() || undefined,
      });
    }

    toast.success("Detalhes salvos. O valor será recalculado.");
    onClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="pb-2">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-apois-yellow">
              Serviço especial
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-white">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Essas informações serão enviadas ao profissional e usadas no cálculo quando houver tarifa configurada.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="app-pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/5 text-zinc-400"
            aria-label="Fechar detalhes"
          >
            <X size={19} />
          </button>
        </div>

        {categoryCode === "fretes" ? (
          <FreightForm value={freight} onChange={setFreight} />
        ) : null}
        {categoryCode === "guincho" ? <TowForm value={tow} onChange={setTow} /> : null}
        {categoryCode === "envios" ? (
          <DeliveryForm value={delivery} onChange={setDelivery} />
        ) : null}

        <button
          type="button"
          onClick={save}
          className="app-pressable app-gold-glow mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow px-5 font-black text-black"
        >
          <Check size={20} strokeWidth={3} />
          Salvar detalhes
        </button>
      </div>
    </BottomSheet>
  );
};

function normalizeAccess(value: FreightAccessDetails): FreightAccessDetails {
  return {
    andar: Math.max(0, Math.floor(value.andar || 0)),
    elevador: Boolean(value.elevador),
    escadas: Boolean(value.escadas),
    dificilAcesso: Boolean(value.dificilAcesso),
  };
}

function FreightForm({
  value,
  onChange,
}: {
  value: FreightServiceDetails;
  onChange: (value: FreightServiceDetails) => void;
}) {
  const updateAccess = (
    key: "retirada" | "entrega",
    update: Partial<FreightAccessDetails>,
  ) => onChange({ ...value, [key]: { ...value[key], ...update } });

  return (
    <div className="space-y-5">
      <OptionGroup label="Tipo de serviço">
        <ChoiceButton selected={value.tipoServico === "frete"} onClick={() => onChange({ ...value, tipoServico: "frete" })}>Frete</ChoiceButton>
        <ChoiceButton selected={value.tipoServico === "mudanca"} onClick={() => onChange({ ...value, tipoServico: "mudanca" })}>Mudança</ChoiceButton>
      </OptionGroup>

      <OptionGroup label="Ajudantes necessários">
        {(["nenhum", "um", "dois"] as const).map((amount) => (
          <ChoiceButton key={amount} selected={value.ajudantes === amount} onClick={() => onChange({ ...value, ajudantes: amount })}>
            {amount === "nenhum" ? "Nenhum" : amount === "um" ? "1 ajudante" : "2 ajudantes"}
          </ChoiceButton>
        ))}
      </OptionGroup>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ToggleCard label="Item pesado" checked={value.itemPesado} onChange={(checked) => onChange({ ...value, itemPesado: checked })} />
        <ToggleCard label="Desmontagem" checked={value.desmontar} onChange={(checked) => onChange({ ...value, desmontar: checked })} />
        <ToggleCard label="Embalagem" checked={value.embalar} onChange={(checked) => onChange({ ...value, embalar: checked })} />
      </div>

      <AccessCard title="Local de retirada" value={value.retirada} onChange={(update) => updateAccess("retirada", update)} />
      <AccessCard title="Local de entrega" value={value.entrega} onChange={(update) => updateAccess("entrega", update)} />

      <NotesField value={value.observacoes || ""} onChange={(observacoes) => onChange({ ...value, observacoes })} placeholder="Ex.: geladeira, sofá, caixas, dimensões e cuidados necessários." />
    </div>
  );
}

function TowForm({ value, onChange }: { value: TowServiceDetails; onChange: (value: TowServiceDetails) => void }) {
  return (
    <div className="space-y-5">
      <OptionGroup label="Veículo que será transportado">
        {(["moto", "carro", "utilitario", "caminhonete"] as const).map((type) => (
          <ChoiceButton key={type} selected={value.tipoVeiculo === type} onClick={() => onChange({ ...value, tipoVeiculo: type })}>
            {type === "moto" ? "Moto" : type === "carro" ? "Carro" : type === "utilitario" ? "Utilitário" : "Caminhonete"}
          </ChoiceButton>
        ))}
      </OptionGroup>

      <div className="grid grid-cols-2 gap-3">
        <ToggleCard label="Veículo liga" checked={value.veiculoLiga} onChange={(checked) => onChange({ ...value, veiculoLiga: checked })} />
        <ToggleCard label="Foi acidente" checked={value.acidente} onChange={(checked) => onChange({ ...value, acidente: checked })} />
        <ToggleCard label="Rodas travadas" checked={value.rodasTravadas} onChange={(checked) => onChange({ ...value, rodasTravadas: checked })} />
        <ToggleCard label="Precisa plataforma" checked={value.precisaPlataforma} onChange={(checked) => onChange({ ...value, precisaPlataforma: checked })} />
        <ToggleCard label="Acesso difícil" checked={value.dificilAcesso} onChange={(checked) => onChange({ ...value, dificilAcesso: checked })} />
        <ToggleCard label="Garagem/subsolo" checked={value.garagemSubsolo} onChange={(checked) => onChange({ ...value, garagemSubsolo: checked })} />
      </div>

      <NotesField value={value.observacoes || ""} onChange={(observacoes) => onChange({ ...value, observacoes })} placeholder="Ex.: modelo, condição do veículo e instruções para acesso." />
    </div>
  );
}

function DeliveryForm({ value, onChange }: { value: DeliveryServiceDetails; onChange: (value: DeliveryServiceDetails) => void }) {
  return (
    <div className="space-y-5">
      <OptionGroup label="Tipo de item">
        {(["documento", "pacote", "comida", "outro"] as const).map((type) => (
          <ChoiceButton key={type} selected={value.tipoItem === type} onClick={() => onChange({ ...value, tipoItem: type })}>
            {type === "documento" ? "Documento" : type === "pacote" ? "Pacote" : type === "comida" ? "Comida" : "Outro"}
          </ChoiceButton>
        ))}
      </OptionGroup>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <label className="app-surface rounded-2xl p-4">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Peso aproximado</span>
          <div className="mt-2 flex items-center gap-2">
            <input type="number" min="0.1" step="0.1" value={value.weightKg} onChange={(event) => onChange({ ...value, weightKg: Number(event.target.value) })} className="min-w-0 flex-1 bg-transparent text-lg font-black text-white outline-none" />
            <span className="text-sm font-bold text-zinc-500">kg</span>
          </div>
        </label>
        <ToggleCard label="Frágil" checked={value.fragil} onChange={(checked) => onChange({ ...value, fragil: checked })} />
      </div>

      <div className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="flex items-center gap-2 text-apois-yellow">
          <Package size={18} />
          <h3 className="text-sm font-black text-white">Quem vai receber?</h3>
        </div>
        <input value={value.nomeDestinatario} onChange={(event) => onChange({ ...value, nomeDestinatario: event.target.value })} placeholder="Nome do destinatário" autoComplete="name" className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-apois-yellow" />
        <input value={value.telefoneDestinatario} onChange={(event) => onChange({ ...value, telefoneDestinatario: formatPhone(event.target.value) })} placeholder="Telefone com DDD" type="tel" inputMode="tel" autoComplete="tel" className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-apois-yellow" />
      </div>

      <NotesField value={value.observacoes || ""} onChange={(observacoes) => onChange({ ...value, observacoes })} placeholder="Descreva o item, tamanho e cuidados importantes." />
    </div>
  );
}

function AccessCard({ title, value, onChange }: { title: string; value: FreightAccessDetails; onChange: (update: Partial<FreightAccessDetails>) => void }) {
  return (
    <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Truck size={18} className="text-apois-yellow" />
        <h3 className="text-sm font-black text-white">{title}</h3>
      </div>
      <label className="block">
        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Andar</span>
        <input type="number" min="0" step="1" value={value.andar || 0} onChange={(event) => onChange({ andar: Math.max(0, Number(event.target.value)) })} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-base text-white outline-none focus:border-apois-yellow" />
      </label>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <ToggleCard compact label="Elevador" checked={Boolean(value.elevador)} onChange={(checked) => onChange({ elevador: checked })} />
        <ToggleCard compact label="Escadas" checked={Boolean(value.escadas)} onChange={(checked) => onChange({ escadas: checked })} />
        <ToggleCard compact label="Acesso difícil" checked={Boolean(value.dificilAcesso)} onChange={(checked) => onChange({ dificilAcesso: checked })} />
      </div>
    </section>
  );
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`app-pressable min-h-11 rounded-xl border px-4 text-xs font-black ${selected ? "border-apois-yellow bg-apois-yellow text-black" : "border-white/10 bg-white/5 text-zinc-300"}`}>
      {children}
    </button>
  );
}

function ToggleCard({ label, checked, onChange, compact = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; compact?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`app-pressable flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3 text-left ${checked ? "border-apois-yellow/40 bg-apois-yellow/10 text-white" : "border-white/8 bg-white/[0.03] text-zinc-400"} ${compact ? "text-[10px]" : "text-xs"}`}>
      <span className="font-bold leading-tight">{label}</span>
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${checked ? "border-apois-yellow bg-apois-yellow text-black" : "border-zinc-600"}`}>{checked ? <Check size={12} strokeWidth={3} /> : null}</span>
    </button>
  );
}

function NotesField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-zinc-500">Observações</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value.slice(0, 600))} placeholder={placeholder} rows={3} className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 p-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-apois-yellow" />
      <span className="mt-1 block text-right text-[10px] text-zinc-600">{value.length}/600</span>
    </label>
  );
}
