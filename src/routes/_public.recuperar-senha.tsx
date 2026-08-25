import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, Mail } from "lucide-react";
import { toast } from "sonner";
import { AppBrand } from "@/components/app/AppBrand";
import { PrimaryButton } from "@/components/app/PrimaryButton";
import { PublicAuthShell } from "@/components/app/PublicAuthShell";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getPasswordRecoveryRedirectTo } from "@/lib/auth/password-recovery";

export const Route = createFileRoute("/_public/recuperar-senha")({
  component: RecuperarSenhaPage,
});

function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  const handleRecover = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      toast.error("Informe um e-mail válido.");
      return;
    }

    setLoading(true);
    try {
      const redirectTo = getPasswordRecoveryRedirectTo();
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        redirectTo ? { redirectTo } : undefined,
      );

      if (error) {
        const normalizedMessage = error.message.toLowerCase();
        if (normalizedMessage.includes("rate") || normalizedMessage.includes("too many")) {
          toast.error("Muitas solicitações seguidas. Aguarde um pouco e tente novamente.");
        } else if (normalizedMessage.includes("fetch") || normalizedMessage.includes("network")) {
          toast.error("Falha de conexão. Verifique sua internet e tente novamente.");
        } else {
          toast.error("Não foi possível enviar as instruções agora.");
        }
        return;
      }

      setSent(true);
      toast.success("Instruções enviadas para o seu e-mail.");
    } catch (error) {
      console.error("[PasswordRecovery] request failed", {
        message: error instanceof Error ? error.message : "unknown_error",
      });
      toast.error("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

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

        <section className="app-surface mt-7 rounded-3xl p-5 sm:p-6" aria-live="polite">
          {!sent ? (
            <>
              <div className="mb-6">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-apois-yellow">Segurança da conta</p>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-white">Recuperar senha</h1>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Digite seu e-mail. Enviaremos um link para você criar uma nova senha.
                </p>
              </div>

              <form onSubmit={handleRecover} method="post" className="space-y-5" noValidate>
                <div className="space-y-2">
                  <label htmlFor="recovery-email" className="ml-1 text-xs font-bold uppercase tracking-wider text-zinc-400">
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                    <Input
                      id="recovery-email"
                      type="email"
                      inputMode="email"
                      autoCapitalize="none"
                      autoComplete="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={loading}
                      className="h-14 w-full rounded-2xl border-white/10 bg-black/45 pl-12 text-white placeholder:text-zinc-600 focus:border-apois-yellow focus:ring-1 focus:ring-apois-yellow"
                    />
                  </div>
                </div>

                <PrimaryButton type="submit" loading={loading} loadingLabel="Enviando...">
                  Enviar instruções
                </PrimaryButton>
              </form>
            </>
          ) : (
            <div className="py-4 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-apois-success/30 bg-apois-success/10">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-apois-success text-black">
                  <Check size={24} strokeWidth={3.5} />
                </div>
              </div>
              <h1 className="mt-6 text-2xl font-black tracking-tight text-white">E-mail enviado</h1>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Confira sua caixa de entrada e também a pasta de spam. O link será usado para definir uma nova senha.
              </p>
              <Link
                to="/login"
                className="app-pressable mt-7 inline-flex min-h-12 items-center justify-center rounded-2xl border border-apois-yellow/25 bg-apois-yellow/10 px-5 font-black text-apois-yellow"
              >
                Voltar para o login
              </Link>
            </div>
          )}
        </section>
      </div>
    </PublicAuthShell>
  );
}
