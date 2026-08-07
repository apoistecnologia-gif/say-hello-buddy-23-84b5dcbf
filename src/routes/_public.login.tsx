import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { toast } from "sonner";
import { AppBrand } from "@/components/app/AppBrand";
import { PrimaryButton } from "@/components/app/PrimaryButton";
import { PublicAuthShell } from "@/components/app/PublicAuthShell";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_public/login")({ component: LoginPage });

const friendlyLoginError = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (normalized.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (normalized.includes("fetch") || normalized.includes("network")) {
    return "Falha de conexão com o servidor. Verifique a internet e tente novamente.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Muitas tentativas seguidas. Aguarde um pouco e tente novamente.";
  }
  return "Não foi possível entrar agora. Tente novamente em instantes.";
};

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { authState, refreshSession } = useAuth();
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  useEffect(() => {
    if (authState === "authenticated") void navigate({ to: "/inicio", replace: true });
  }, [authState, navigate]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || !password) {
      toast.error("Preencha um e-mail válido e sua senha.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        console.error("[Login] signIn failed", {
          name: error.name,
          status: error.status,
          code: (error as { code?: string }).code,
          message: error.message,
        });
        toast.error(friendlyLoginError(error.message));
        return;
      }

      if (!data.session?.user) {
        toast.error("O servidor não iniciou sua sessão. Tente novamente.");
        return;
      }

      await refreshSession();
      toast.success("Login realizado com sucesso!");
      await navigate({ to: "/inicio", replace: true });
    } catch (error) {
      console.error("[Login] unexpected failure", {
        message: error instanceof Error ? error.message : "unknown_error",
      });
      toast.error("Falha de conexão com o servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicAuthShell contentClassName="justify-center">
      <div className="flex w-full flex-col">
        <AppBrand subtitle="Sua corrida, do seu jeito." />

        <section className="app-surface mt-7 rounded-3xl p-5 sm:p-6" aria-labelledby="login-title">
          <div className="mb-6">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-apois-yellow">Passageiro</p>
            <h1 id="login-title" className="mt-2 text-2xl font-black tracking-tight text-white">
              Entre na sua conta
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Use seu e-mail e senha para continuar.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            <div className="space-y-2">
              <label htmlFor="login-email" className="ml-1 text-xs font-bold uppercase tracking-wider text-zinc-400">
                E-mail
              </label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                <Input
                  id="login-email"
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

            <div className="space-y-2">
              <label htmlFor="login-password" className="ml-1 text-xs font-bold uppercase tracking-wider text-zinc-400">
                Senha
              </label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
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
                  aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Link
                to="/recuperar-senha"
                className="app-pressable rounded-lg px-1 py-2 text-sm font-bold text-apois-yellow hover:text-yellow-300"
              >
                Esqueci minha senha
              </Link>
            </div>

            <PrimaryButton type="submit" loading={loading} loadingLabel="Entrando..." className="mt-2">
              Entrar
            </PrimaryButton>
          </form>
        </section>

        <div className="mt-6 text-center">
          <p className="text-sm text-zinc-500">Ainda não tem uma conta?</p>
          <Link
            to="/cadastro"
            className="app-pressable mt-2 inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-black uppercase tracking-[0.16em] text-apois-yellow"
          >
            Criar minha conta
          </Link>
        </div>
      </div>
    </PublicAuthShell>
  );
}
