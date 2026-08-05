import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.jpg";

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
  const { authState } = useAuth();
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
    <div className="safe-bottom safe-top flex flex-1 flex-col items-center justify-center bg-black px-6 py-8 text-white sm:py-12">
      <div className="flex w-full max-w-[400px] flex-col items-center">
        <div className="mb-8 flex w-full justify-center">
          <img src={logo} alt="APOIS" className="h-auto w-32 max-w-[180px] object-contain" loading="eager" />
        </div>

        <div className="mb-8 text-center">
          <h1 className="mb-2 text-2xl font-bold">Bem-vindo ao APOIS</h1>
          <p className="text-zinc-400">Faça login para continuar sua jornada.</p>
        </div>

        <form onSubmit={handleLogin} className="w-full space-y-4" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="login-email" className="ml-1 text-xs font-bold uppercase tracking-wider text-zinc-500">E-mail</label>
            <Input id="login-email" type="email" inputMode="email" autoCapitalize="none" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} className="h-14 w-full rounded-xl border-zinc-800 bg-[#121212] text-white focus:border-apois-yellow focus:ring-1 focus:ring-apois-yellow" autoComplete="email" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="login-password" className="ml-1 text-xs font-bold uppercase tracking-wider text-zinc-500">Senha</label>
            <div className="relative">
              <Input id="login-password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} className="h-14 w-full rounded-xl border-zinc-800 bg-[#121212] pr-12 text-white focus:border-apois-yellow focus:ring-1 focus:ring-apois-yellow" autoComplete="current-password" />
              <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-zinc-500 hover:text-white" aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}>
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Link to="/recuperar-senha" className="text-sm font-semibold text-apois-yellow transition-colors hover:text-apois-yellow/80 active:opacity-70">Esqueci minha senha</Link>
          </div>

          <button type="submit" disabled={loading} className="mt-6 flex h-14 w-full items-center justify-center rounded-xl bg-[#ffb800] text-base font-black uppercase tracking-widest text-black shadow-lg shadow-[#ffb800]/10 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? <Loader2 className="animate-spin" /> : "Entrar"}
          </button>
        </form>

        <div className="mt-10 flex flex-col gap-1 text-center">
          <span className="text-sm text-zinc-500">Ainda não tem uma conta?</span>
          <Link to="/cadastro" className="text-sm font-black uppercase tracking-widest text-apois-yellow transition-colors hover:text-apois-yellow/80 active:opacity-70">Criar minha conta</Link>
        </div>
      </div>
    </div>
  );
}
