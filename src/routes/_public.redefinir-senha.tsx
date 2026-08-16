import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, LockKeyhole, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppBrand } from "@/components/app/AppBrand";
import { PrimaryButton } from "@/components/app/PrimaryButton";
import { PublicAuthShell } from "@/components/app/PublicAuthShell";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_public/redefinir-senha")({
  component: RedefinirSenhaPage,
});

function RedefinirSenhaPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionState, setSessionState] = useState<"checking" | "valid" | "invalid">("checking");
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    const validateRecoverySession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;

      if (error) {
        console.error("[PasswordReset] session validation failed", { message: error.message });
        setSessionState("invalid");
        return;
      }

      setSessionState(data.session ? "valid" : "invalid");
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) setSessionState("valid");
    });

    void validateRecoverySession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      toast.error("Use uma senha com pelo menos 8 caracteres, letras e números.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        const normalizedMessage = error.message.toLowerCase();
        if (normalizedMessage.includes("same password")) {
          toast.error("A nova senha deve ser diferente da senha anterior.");
        } else if (normalizedMessage.includes("session") || normalizedMessage.includes("expired")) {
          setSessionState("invalid");
          toast.error("O link expirou. Solicite uma nova recuperação.");
        } else {
          toast.error("Não foi possível atualizar a senha agora.");
        }
        return;
      }

      toast.success("Senha atualizada com sucesso!");
      await navigate({ to: "/inicio", replace: true });
    } catch (error) {
      console.error("[PasswordReset] update failed", {
        message: error instanceof Error ? error.message : "unknown_error",
      });
      toast.error("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (sessionState === "checking") {
    return (
      <PublicAuthShell contentClassName="items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-apois-yellow/20 bg-apois-yellow/10">
          <Loader2 className="animate-spin text-apois-yellow" size={28} />
        </div>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-zinc-500">Validando link seguro</p>
      </PublicAuthShell>
    );
  }

  if (sessionState === "invalid") {
    return (
      <PublicAuthShell contentClassName="justify-center">
        <div className="flex w-full flex-col items-center text-center">
          <AppBrand compact />
          <section className="app-surface mt-7 w-full rounded-3xl p-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-apois-danger/30 bg-apois-danger/10 text-apois-danger">
              <AlertTriangle size={28} />
            </div>
            <h1 className="mt-5 text-2xl font-black text-white">Link inválido ou expirado</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Por segurança, solicite um novo link para redefinir sua senha.
            </p>
            <Link
              to="/recuperar-senha"
              className="app-pressable mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-apois-yellow px-5 font-black text-black"
            >
              Solicitar novo link
            </Link>
          </section>
        </div>
      </PublicAuthShell>
    );
  }

  return (
    <PublicAuthShell contentClassName="justify-center">
      <div className="flex w-full flex-col">
        <div className="flex items-center justify-between">
          <Link
            to="/login"
            aria-label="Voltar para o login"
            className="app-pressable flex h-11 w-11 items-center justify-center rounded-2xl border border-white/8 bg-white/5 text-zinc-300"
          >
            <ArrowLeft size={20} />
          </Link>
          <AppBrand compact />
          <div className="h-11 w-11" aria-hidden="true" />
        </div>

        <section className="app-surface mt-7 rounded-3xl p-5 sm:p-6" aria-labelledby="reset-title">
          <div className="mb-6">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-apois-yellow">Link confirmado</p>
            <h1 id="reset-title" className="mt-2 text-2xl font-black tracking-tight text-white">
              Crie uma nova senha
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Ela deve ter no mínimo 8 caracteres, letras e números.</p>
          </div>

          <form onSubmit={handleReset} className="space-y-4" noValidate>
            <div className="space-y-2">
              <label htmlFor="new-password" className="ml-1 text-xs font-bold uppercase tracking-wider text-zinc-400">
                Nova senha
              </label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Digite sua nova senha"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  className="h-14 w-full rounded-2xl border-white/10 bg-black/45 pl-12 pr-12 text-white placeholder:text-zinc-600 focus:border-apois-yellow focus:ring-1 focus:ring-apois-yellow"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  disabled={loading}
                  className="app-pressable absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-zinc-500 hover:bg-white/5 hover:text-white disabled:opacity-50"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm-new-password" className="ml-1 text-xs font-bold uppercase tracking-wider text-zinc-400">
                Confirmar nova senha
              </label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                <Input
                  id="confirm-new-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Digite novamente"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={loading}
                  className="h-14 w-full rounded-2xl border-white/10 bg-black/45 pl-12 text-white placeholder:text-zinc-600 focus:border-apois-yellow focus:ring-1 focus:ring-apois-yellow"
                />
              </div>
            </div>

            <PrimaryButton type="submit" loading={loading} loadingLabel="Salvando..." className="mt-2">
              Salvar nova senha
            </PrimaryButton>
          </form>
        </section>
      </div>
    </PublicAuthShell>
  );
}
