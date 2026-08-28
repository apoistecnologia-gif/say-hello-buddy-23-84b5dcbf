import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Shield,
  Star,
  Trash2,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import {
  passengerProfileService,
  type EmergencyContact,
  type EmergencyContactInput,
  type PassengerPreferences,
  type PassengerProfileCenter as ProfileCenterData,
  type ProfileUpdateInput,
} from "@/services/profile/passenger-profile-service";
import {
  passengerSupportService,
  type PassengerSupportCategory,
} from "@/services/support/passenger-support-service";

const emptyProfileDraft: ProfileUpdateInput = {
  name: "",
  phone: "",
  city: "",
  birthDate: "",
  gender: "",
};

const emptyContactDraft: EmergencyContactInput = {
  name: "",
  phone: "",
  relationship: "",
  isPrimary: false,
};

const defaultPreferences: PassengerPreferences = {
  rideUpdates: true,
  promotions: false,
  safetyAlerts: true,
  paymentUpdates: true,
  accessibilityLargeText: false,
};

type DialogName =
  | "profile"
  | "preferences"
  | "contacts"
  | "security"
  | "support"
  | "delete"
  | null;

type SupportDraft = {
  category: PassengerSupportCategory;
  subject: string;
  message: string;
  rideId: string;
};

const emptySupportDraft: SupportDraft = {
  category: "other",
  subject: "",
  message: "",
  rideId: "",
};

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatPhone(value: string | null): string {
  if (!value) return "Não informado";
  const raw = digits(value);
  if (raw.length === 11) return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
  if (raw.length === 10) return `(${raw.slice(0, 2)}) ${raw.slice(2, 6)}-${raw.slice(6)}`;
  return value;
}

function formatCpf(value: string | null): string {
  if (!value) return "Não informado";
  const raw = digits(value);
  if (raw.length !== 11) return value;
  return `${raw.slice(0, 3)}.${raw.slice(3, 6)}.${raw.slice(6, 9)}-${raw.slice(9)}`;
}

function formatMemberSince(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "P";
}

export function PassengerProfileCenter() {
  const navigate = useNavigate();
  const { user, profile, signOut, refreshSession } = useAuth();
  const [center, setCenter] = useState<ProfileCenterData | null>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileUpdateInput>(emptyProfileDraft);
  const [preferencesDraft, setPreferencesDraft] =
    useState<PassengerPreferences>(defaultPreferences);
  const [contactDraft, setContactDraft] = useState<EmergencyContactInput>(emptyContactDraft);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [supportDraft, setSupportDraft] = useState<SupportDraft>(emptySupportDraft);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const loadCenter = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await passengerProfileService.load();
      setCenter(data);
      setPreferencesDraft(data.preferences);
    } catch (caughtError: unknown) {
      console.error("[PassengerProfileCenter] load failed", caughtError);
      setError("Não foi possível carregar todos os dados do seu perfil.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCenter();
  }, [loadCenter]);

  useEffect(() => {
    const enabled = center?.preferences.accessibilityLargeText === true;
    document.documentElement.classList.toggle("apois-large-text", enabled);
    return () => document.documentElement.classList.remove("apois-large-text");
  }, [center?.preferences.accessibilityLargeText]);

  const displayName =
    center?.profile.name || profile?.name || user?.email?.split("@")[0] || "Passageiro";
  const displayEmail = center?.profile.email || profile?.email || user?.email || "";
  const displayPhone = center?.profile.phone || profile?.phone || null;
  const displayAvatar = center?.profile.avatarUrl || profile?.avatar_url || undefined;

  const openProfile = () => {
    setProfileDraft({
      name: center?.profile.name ?? displayName,
      phone: center?.profile.phone ?? displayPhone ?? "",
      city: center?.profile.city ?? profile?.city ?? "",
      birthDate: center?.profile.birthDate ?? "",
      gender: center?.profile.gender ?? "",
    });
    setDialog("profile");
  };

  const openPreferences = () => {
    setPreferencesDraft(center?.preferences ?? defaultPreferences);
    setDialog("preferences");
  };

  const openContacts = () => {
    setContactDraft(emptyContactDraft);
    setIsEditingContact(false);
    setDialog("contacts");
  };

  const saveProfile = async (): Promise<void> => {
    if (isSaving) return;
    if (profileDraft.name.trim().length < 2 || digits(profileDraft.phone).length < 10) {
      toast.error("Informe um nome e telefone válidos.");
      return;
    }

    setIsSaving(true);
    try {
      const updated = await passengerProfileService.updateProfile(profileDraft);
      setCenter(updated);
      await refreshSession();
      setDialog(null);
      toast.success("Dados pessoais atualizados.");
    } catch (caughtError: unknown) {
      toast.error(
        caughtError instanceof Error ? caughtError.message : "Não foi possível salvar seus dados.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const savePreferences = async (): Promise<void> => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const updated = await passengerProfileService.updatePreferences(preferencesDraft);
      setCenter(updated);
      setDialog(null);
      toast.success("Preferências atualizadas.");
    } catch (caughtError: unknown) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível salvar suas preferências.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const startEditingContact = (contact?: EmergencyContact) => {
    setContactDraft(
      contact
        ? {
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            relationship: contact.relationship ?? "",
            isPrimary: contact.isPrimary,
          }
        : emptyContactDraft,
    );
    setIsEditingContact(true);
  };

  const saveContact = async (): Promise<void> => {
    if (isSaving) return;
    if (contactDraft.name.trim().length < 2 || digits(contactDraft.phone).length < 10) {
      toast.error("Informe o nome e o telefone do contato.");
      return;
    }

    setIsSaving(true);
    try {
      const updated = await passengerProfileService.saveEmergencyContact(contactDraft);
      setCenter(updated);
      setContactDraft(emptyContactDraft);
      setIsEditingContact(false);
      toast.success("Contato de emergência salvo.");
    } catch (caughtError: unknown) {
      toast.error(
        caughtError instanceof Error ? caughtError.message : "Não foi possível salvar o contato.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteContact = async (contact: EmergencyContact): Promise<void> => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const updated = await passengerProfileService.deleteEmergencyContact(contact.id);
      setCenter(updated);
      if (contactDraft.id === contact.id) {
        setContactDraft(emptyContactDraft);
        setIsEditingContact(false);
      }
      toast.success("Contato removido.");
    } catch (caughtError: unknown) {
      toast.error(
        caughtError instanceof Error ? caughtError.message : "Não foi possível remover o contato.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const sendPasswordReset = async (): Promise<void> => {
    if (!displayEmail || isSaving) return;
    setIsSaving(true);
    try {
      await passengerProfileService.sendPasswordReset(displayEmail);
      toast.success("Enviamos as instruções de alteração de senha para seu e-mail.");
    } catch (caughtError: unknown) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível enviar as instruções.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const submitSupport = async (): Promise<void> => {
    if (isSaving) return;
    if (supportDraft.subject.trim().length < 5 || supportDraft.message.trim().length < 10) {
      toast.error("Descreva o problema com mais detalhes.");
      return;
    }

    setIsSaving(true);
    try {
      const ticket = await passengerSupportService.createTicket({
        category: supportDraft.category,
        subject: supportDraft.subject,
        message: supportDraft.message,
        ...(supportDraft.rideId.trim() ? { rideId: supportDraft.rideId.trim() } : {}),
      });
      setSupportDraft(emptySupportDraft);
      setDialog(null);
      toast.success(`Atendimento registrado. Protocolo ${ticket.protocol}.`, {
        duration: 7000,
      });
    } catch (caughtError: unknown) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível registrar o atendimento.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async (): Promise<void> => {
    await signOut();
    await navigate({ to: "/login", replace: true });
  };

  const deleteAccount = async (): Promise<void> => {
    if (deleteConfirmation !== "EXCLUIR" || isSaving) return;
    setIsSaving(true);
    try {
      await passengerProfileService.deleteAccount();
      await signOut();
      await navigate({ to: "/login", replace: true });
      toast.success("Sua conta foi excluída.");
    } catch (caughtError: unknown) {
      toast.error(
        caughtError instanceof Error ? caughtError.message : "Não foi possível excluir sua conta.",
      );
      setIsSaving(false);
    }
  };

  const ratingLabel = useMemo(() => {
    const totalRatings = center?.profile.totalRatings ?? 0;
    const average = center?.profile.averageRating;
    if (totalRatings <= 0 || average === null || !Number.isFinite(average)) {
      return "Sem avaliações";
    }
    return average.toFixed(1).replace(".", ",");
  }, [center?.profile.averageRating, center?.profile.totalRatings]);

  if (isLoading && !center) {
    return (
      <div className="app-screen flex min-h-[100dvh] items-center justify-center bg-black text-white">
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-apois-yellow" size={34} />
          <p className="mt-3 text-sm font-bold text-zinc-500">Carregando seu perfil...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-screen min-h-[100dvh] bg-black text-white">
      <header className="app-safe-top border-b border-white/8 bg-gradient-to-b from-[#211900] to-black px-5 pb-6 text-center">
        <div className="flex justify-end">
          <button
            type="button"
            aria-label="Atualizar perfil"
            onClick={() => void loadCenter()}
            disabled={isLoading}
            className="app-pressable flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-zinc-300 disabled:opacity-50"
          >
            <RefreshCw className={isLoading ? "animate-spin" : ""} size={17} />
          </button>
        </div>

        <Avatar className="mx-auto h-24 w-24 border-2 border-apois-yellow p-1 shadow-[0_18px_50px_rgba(255,184,0,0.18)]">
          <AvatarImage src={displayAvatar} alt={displayName} />
          <AvatarFallback className="bg-zinc-900 text-2xl font-black text-apois-yellow">
            {initials(displayName)}
          </AvatarFallback>
        </Avatar>
        <h1 className="mt-4 text-2xl font-black tracking-[-0.04em]">{displayName}</h1>
        <p className="mt-1 text-sm text-zinc-500">{displayEmail}</p>

        <div className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-2">
          <div className="rounded-2xl border border-white/8 bg-black/40 p-3">
            <p className="flex items-center justify-center gap-1 text-sm font-black text-white">
              <Star className="text-apois-yellow" size={15} fill="currentColor" />
              {ratingLabel}
            </p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-[0.15em] text-zinc-600">
              Avaliação
            </p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/40 p-3">
            <p className="text-sm font-black text-white">{center?.profile.completedRides ?? 0}</p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-[0.15em] text-zinc-600">
              Corridas concluídas
            </p>
          </div>
        </div>
      </header>

      <main className="app-scroll space-y-6 px-5 pb-8 pt-5">
        {error ? (
          <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-xs leading-5 text-amber-100">
            {error} Alguns dados básicos da sessão continuam disponíveis.
          </section>
        ) : null}

        <MenuSection title="Minha conta">
          <MenuButton
            icon={UserRound}
            title="Dados pessoais"
            description={`${formatPhone(displayPhone)}${center?.profile.city ? ` • ${center.profile.city}` : ""}`}
            onClick={openProfile}
          />
          <MenuButton
            icon={WalletCards}
            title="Carteira e pagamentos"
            description="Saldo, multas e formas de pagamento"
            onClick={() => void navigate({ to: "/carteira" })}
          />
          <MenuButton
            icon={Bell}
            title="Central de notificações"
            description="Atualizações das corridas e da conta"
            onClick={() => void navigate({ to: "/notificacoes" })}
          />
        </MenuSection>

        <MenuSection title="Preferências e segurança">
          <MenuButton
            icon={Bell}
            title="Preferências de comunicação"
            description="Corridas, pagamentos, segurança e promoções"
            onClick={openPreferences}
          />
          <MenuButton
            icon={UsersRound}
            title="Contatos de emergência"
            description={`${center?.emergencyContacts.length ?? 0} de 3 contatos cadastrados`}
            onClick={openContacts}
          />
          <MenuButton
            icon={LockKeyhole}
            title="Privacidade e segurança"
            description="Senha, dados da conta e exclusão"
            onClick={() => setDialog("security")}
          />
        </MenuSection>

        <MenuSection title="Suporte">
          <MenuButton
            icon={CircleHelp}
            title="Ajuda e atendimento"
            description="Abra um protocolo e acompanhe pela central"
            onClick={() => {
              setSupportDraft(emptySupportDraft);
              setDialog("support");
            }}
          />
        </MenuSection>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="app-pressable flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 text-sm font-black text-red-400"
        >
          <LogOut size={19} />
          Sair do aplicativo
        </button>

        {center?.profile.createdAt ? (
          <p className="text-center text-[10px] font-bold text-zinc-700">
            Conta criada em {formatMemberSince(center.profile.createdAt)}
          </p>
        ) : null}
      </main>

      <Dialog open={dialog === "profile"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-24px)] max-w-md overflow-y-auto rounded-3xl border-white/10 bg-zinc-950 p-0 text-white">
          <DialogHeaderBlock title="Dados pessoais" onClose={() => setDialog(null)} />
          <div className="space-y-4 p-5">
            <Field label="Nome completo">
              <input
                value={profileDraft.name}
                onChange={(event) =>
                  setProfileDraft((current) => ({ ...current, name: event.target.value }))
                }
                autoComplete="name"
                className="profile-input"
                maxLength={120}
              />
            </Field>
            <Field label="Telefone">
              <input
                value={profileDraft.phone}
                onChange={(event) =>
                  setProfileDraft((current) => ({ ...current, phone: event.target.value }))
                }
                inputMode="tel"
                autoComplete="tel"
                className="profile-input"
                maxLength={20}
              />
            </Field>
            <Field label="Cidade">
              <input
                value={profileDraft.city}
                onChange={(event) =>
                  setProfileDraft((current) => ({ ...current, city: event.target.value }))
                }
                autoComplete="address-level2"
                className="profile-input"
                maxLength={100}
              />
            </Field>
            <Field label="Data de nascimento">
              <input
                type="date"
                value={profileDraft.birthDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) =>
                  setProfileDraft((current) => ({ ...current, birthDate: event.target.value }))
                }
                className="profile-input [color-scheme:dark]"
              />
            </Field>
            <Field label="Como deseja se identificar">
              <select
                value={profileDraft.gender}
                onChange={(event) =>
                  setProfileDraft((current) => ({ ...current, gender: event.target.value }))
                }
                className="profile-input [color-scheme:dark]"
              >
                <option value="">Prefiro não informar</option>
                <option value="feminino">Feminino</option>
                <option value="masculino">Masculino</option>
                <option value="nao_binario">Não binário</option>
                <option value="outro">Outro</option>
              </select>
            </Field>

            <ReadOnlyRow icon={Mail} label="E-mail" value={displayEmail || "Não informado"} />
            <ReadOnlyRow icon={Shield} label="CPF" value={formatCpf(center?.profile.cpf ?? null)} />
            <p className="text-[10px] leading-5 text-zinc-600">
              E-mail e CPF não são alterados diretamente pelo aplicativo para proteger sua conta.
            </p>

            <PrimaryAction onClick={() => void saveProfile()} loading={isSaving}>
              Salvar alterações
            </PrimaryAction>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "preferences"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-3xl border-white/10 bg-zinc-950 p-0 text-white">
          <DialogHeaderBlock title="Preferências" onClose={() => setDialog(null)} />
          <div className="space-y-3 p-5">
            <PreferenceRow
              title="Atualizações de corrida"
              description="Aceite, chegada, início, conclusão e cancelamentos"
              checked={preferencesDraft.rideUpdates}
              onCheckedChange={(checked) =>
                setPreferencesDraft((current) => ({ ...current, rideUpdates: checked }))
              }
            />
            <PreferenceRow
              title="Segurança"
              description="Alertas importantes durante a corrida"
              checked={preferencesDraft.safetyAlerts}
              onCheckedChange={(checked) =>
                setPreferencesDraft((current) => ({ ...current, safetyAlerts: checked }))
              }
            />
            <PreferenceRow
              title="Pagamentos"
              description="Confirmações de Pix, multas e carteira"
              checked={preferencesDraft.paymentUpdates}
              onCheckedChange={(checked) =>
                setPreferencesDraft((current) => ({ ...current, paymentUpdates: checked }))
              }
            />
            <PreferenceRow
              title="Novidades e promoções"
              description="Comunicações comerciais opcionais"
              checked={preferencesDraft.promotions}
              onCheckedChange={(checked) =>
                setPreferencesDraft((current) => ({ ...current, promotions: checked }))
              }
            />
            <PreferenceRow
              title="Texto maior"
              description="Aumenta a leitura dos textos principais do aplicativo"
              checked={preferencesDraft.accessibilityLargeText}
              onCheckedChange={(checked) =>
                setPreferencesDraft((current) => ({
                  ...current,
                  accessibilityLargeText: checked,
                }))
              }
            />
            <PrimaryAction onClick={() => void savePreferences()} loading={isSaving}>
              Salvar preferências
            </PrimaryAction>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "contacts"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-24px)] max-w-md overflow-y-auto rounded-3xl border-white/10 bg-zinc-950 p-0 text-white">
          <DialogHeaderBlock title="Contatos de emergência" onClose={() => setDialog(null)} />
          <div className="space-y-4 p-5">
            {!isEditingContact ? (
              <>
                <p className="text-xs leading-5 text-zinc-500">
                  Cadastre até três pessoas de confiança. O contato principal aparecerá primeiro nos recursos de segurança.
                </p>
                <div className="space-y-3">
                  {(center?.emergencyContacts ?? []).map((contact) => (
                    <article
                      key={contact.id}
                      className="rounded-2xl border border-white/8 bg-black/30 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-black">{contact.name}</p>
                            {contact.isPrimary ? (
                              <span className="rounded-full bg-apois-yellow/10 px-2 py-1 text-[9px] font-black text-apois-yellow">
                                Principal
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            {formatPhone(contact.phone)}
                            {contact.relationship ? ` • ${contact.relationship}` : ""}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            aria-label={`Editar ${contact.name}`}
                            onClick={() => startEditingContact(contact)}
                            className="app-pressable flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Remover ${contact.name}`}
                            onClick={() => void deleteContact(contact)}
                            disabled={isSaving}
                            className="app-pressable flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400 disabled:opacity-50"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {(center?.emergencyContacts.length ?? 0) < 3 ? (
                  <button
                    type="button"
                    onClick={() => startEditingContact()}
                    className="app-pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-apois-yellow/30 bg-apois-yellow/5 text-xs font-black text-apois-yellow"
                  >
                    <Plus size={17} />
                    Adicionar contato
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <Field label="Nome do contato">
                  <input
                    value={contactDraft.name}
                    onChange={(event) =>
                      setContactDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    className="profile-input"
                    maxLength={100}
                  />
                </Field>
                <Field label="Telefone">
                  <input
                    value={contactDraft.phone}
                    onChange={(event) =>
                      setContactDraft((current) => ({ ...current, phone: event.target.value }))
                    }
                    inputMode="tel"
                    className="profile-input"
                    maxLength={20}
                  />
                </Field>
                <Field label="Relação com você">
                  <input
                    value={contactDraft.relationship}
                    onChange={(event) =>
                      setContactDraft((current) => ({
                        ...current,
                        relationship: event.target.value,
                      }))
                    }
                    placeholder="Ex.: mãe, irmão, amigo"
                    className="profile-input"
                    maxLength={60}
                  />
                </Field>
                <PreferenceRow
                  title="Contato principal"
                  description="Será exibido primeiro nos recursos de segurança"
                  checked={contactDraft.isPrimary}
                  onCheckedChange={(checked) =>
                    setContactDraft((current) => ({ ...current, isPrimary: checked }))
                  }
                />
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setContactDraft(emptyContactDraft);
                      setIsEditingContact(false);
                    }}
                    className="app-pressable min-h-12 rounded-2xl border border-white/10 text-xs font-black text-zinc-400"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveContact()}
                    disabled={isSaving}
                    className="app-pressable flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-apois-yellow text-xs font-black text-black disabled:opacity-60"
                  >
                    {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                    Salvar
                  </button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "security"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-3xl border-white/10 bg-zinc-950 p-0 text-white">
          <DialogHeaderBlock title="Privacidade e segurança" onClose={() => setDialog(null)} />
          <div className="space-y-4 p-5">
            <section className="rounded-2xl border border-white/8 bg-black/30 p-4">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 shrink-0 text-apois-yellow" size={19} />
                <div>
                  <p className="text-sm font-black">Alterar senha</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    As instruções serão enviadas para {displayEmail || "seu e-mail cadastrado"}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void sendPasswordReset()}
                disabled={!displayEmail || isSaving}
                className="app-pressable mt-4 min-h-11 w-full rounded-xl bg-white text-xs font-black text-black disabled:opacity-50"
              >
                Enviar instruções por e-mail
              </button>
            </section>

            <section className="rounded-2xl border border-white/8 bg-black/30 p-4 text-xs leading-5 text-zinc-500">
              <p className="font-black text-white">Proteção dos seus dados</p>
              <p className="mt-2">
                Corridas e registros financeiros necessários para segurança e obrigações legais não são alterados pelo perfil. Dados pessoais podem ser atualizados ou anonimizados na exclusão da conta.
              </p>
            </section>

            <button
              type="button"
              onClick={() => {
                setDeleteConfirmation("");
                setDialog("delete");
              }}
              className="app-pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 text-xs font-black text-red-400"
            >
              <Trash2 size={16} />
              Excluir minha conta
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "support"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-h-[92dvh] w-[calc(100vw-24px)] max-w-md overflow-y-auto rounded-3xl border-white/10 bg-zinc-950 p-0 text-white">
          <DialogHeaderBlock title="Ajuda e atendimento" onClose={() => setDialog(null)} />
          <div className="space-y-4 p-5">
            <p className="text-xs leading-5 text-zinc-500">
              Descreva o ocorrido. Você receberá um protocolo e uma confirmação na central de notificações.
            </p>
            <Field label="Categoria">
              <select
                value={supportDraft.category}
                onChange={(event) =>
                  setSupportDraft((current) => ({
                    ...current,
                    category: event.target.value as PassengerSupportCategory,
                  }))
                }
                className="profile-input [color-scheme:dark]"
              >
                <option value="ride">Corrida</option>
                <option value="payment">Pagamento ou carteira</option>
                <option value="account">Conta e cadastro</option>
                <option value="safety">Segurança</option>
                <option value="other">Outro assunto</option>
              </select>
            </Field>
            <Field label="Assunto">
              <input
                value={supportDraft.subject}
                onChange={(event) =>
                  setSupportDraft((current) => ({ ...current, subject: event.target.value }))
                }
                className="profile-input"
                maxLength={120}
              />
            </Field>
            <Field label="Código da corrida (opcional)">
              <input
                value={supportDraft.rideId}
                onChange={(event) =>
                  setSupportDraft((current) => ({ ...current, rideId: event.target.value }))
                }
                placeholder="Cole o código mostrado no comprovante"
                className="profile-input"
                maxLength={60}
              />
            </Field>
            <Field label="Conte o que aconteceu">
              <textarea
                value={supportDraft.message}
                onChange={(event) =>
                  setSupportDraft((current) => ({ ...current, message: event.target.value }))
                }
                rows={5}
                className="profile-input resize-none"
                maxLength={2000}
              />
            </Field>
            <PrimaryAction onClick={() => void submitSupport()} loading={isSaving}>
              Abrir atendimento
            </PrimaryAction>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-3xl border-red-500/20 bg-zinc-950 p-0 text-white">
          <DialogHeaderBlock title="Excluir conta" onClose={() => setDialog(null)} danger />
          <div className="space-y-4 p-5">
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs leading-5 text-red-100/80">
              Esta ação encerra seu acesso e anonimiza seus dados pessoais. Uma corrida ativa precisa ser finalizada ou cancelada antes da exclusão.
            </div>
            <Field label='Digite "EXCLUIR" para confirmar'>
              <input
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value.toUpperCase())}
                autoComplete="off"
                className="profile-input border-red-500/20 focus:border-red-500/60"
              />
            </Field>
            <button
              type="button"
              onClick={() => void deleteAccount()}
              disabled={deleteConfirmation !== "EXCLUIR" || isSaving}
              className="app-pressable flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-red-500 text-sm font-black text-white disabled:bg-zinc-800 disabled:text-zinc-600"
            >
              {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
              Excluir definitivamente
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 px-1 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function MenuButton({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="app-pressable flex min-h-[72px] w-full items-center gap-4 rounded-2xl border border-white/8 bg-zinc-950 p-4 text-left"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-apois-yellow/10 text-apois-yellow">
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-white">{title}</p>
        <p className="mt-1 truncate text-[11px] text-zinc-500">{description}</p>
      </div>
      <ChevronRight className="shrink-0 text-zinc-700" size={18} />
    </button>
  );
}

function DialogHeaderBlock({
  title,
  onClose,
  danger = false,
}: {
  title: string;
  onClose: () => void;
  danger?: boolean;
}) {
  return (
    <DialogHeader className="border-b border-white/8 p-5 text-left">
      <div className="flex items-center justify-between gap-4">
        <DialogTitle className={danger ? "text-xl font-black text-red-400" : "text-xl font-black"}>
          {title}
        </DialogTitle>
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="app-pressable flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-400"
        >
          <X size={18} />
        </button>
      </div>
    </DialogHeader>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.15em] text-zinc-600">
        {label}
      </span>
      {children}
    </label>
  );
}

function ReadOnlyRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/30 p-4">
      <Icon className="shrink-0 text-zinc-600" size={18} />
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-600">{label}</p>
        <p className="mt-1 truncate text-xs font-bold text-zinc-400">{value}</p>
      </div>
    </div>
  );
}

function PreferenceRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/8 bg-black/30 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black">{title}</p>
        <p className="mt-1 text-[11px] leading-5 text-zinc-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function PrimaryAction({
  children,
  onClick,
  loading,
}: {
  children: React.ReactNode;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="app-pressable flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow text-sm font-black text-black disabled:bg-zinc-800 disabled:text-zinc-600"
    >
      {loading ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
      {children}
    </button>
  );
}
