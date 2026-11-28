import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import { toast } from "sonner";
import { AppBrand } from "@/components/app/AppBrand";
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
    <div className="relative min-h-[100dvh] flex-1 overflow-y-auto bg-[#F7F7F8] px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(22px,env(safe-area-inset-top))] text-[#111]">
      <div className="pointer-events-none absolute -right-20 -top-16 h-52 w-64 rotate-12 rounded-[45%] bg-[#E51B23]" />
      <div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-96 -rotate-12 rounded-[45%] bg-[#E51B23]" />
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-[430px] flex-col">
        <div className="mb-5 mt-4 flex justify-center"><AppBrand compact /></div>
        <div className="mb-6 text-center">
          <h1 data-apois-client-login-title-v2 data-apois-hml-official-brand="v1" className="mx-auto max-w-[290px] pr-9 text-[30px] font-black leading-tight tracking-[-.04em] sm:max-w-none sm:pr-0 sm:text-[34px]">Entrar na sua <span className="text-[#E51B23]">conta</span></h1>
          <p className="mx-auto mt-2 max-w-[330px] text-[16px] font-medium leading-snug text-[#666B73]">Acesse com seu e-mail e senha.</p>
        </div>
        <div className="rounded-[30px] border border-white/70 bg-white/90 p-5 shadow-[0_18px_55px_rgba(17,17,17,.10)] backdrop-blur">
          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            <div>
              <label htmlFor="login-email" className="mb-2 block text-[15px] font-extrabold">E-mail</label>
              <div className="relative"><Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#666B73]" /><Input id="login-email" type="email" inputMode="email" autoCapitalize="none" placeholder="seu@email.com" value={email} onChange={(e)=>setEmail(e.target.value)} disabled={loading} autoComplete="email" className="h-14 rounded-2xl border-[#E2E4E8] bg-white pl-12 text-[#111] placeholder:text-[#596372] focus:border-[#E51B23] focus:ring-[#E51B23]" /></div>
            </div>
            <div>
              <label htmlFor="login-password" className="mb-2 block text-[15px] font-extrabold">Senha</label>
              <div className="relative"><LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#666B73]" /><Input id="login-password" type={showPassword?"text":"password"} placeholder="Digite sua senha" value={password} onChange={(e)=>setPassword(e.target.value)} disabled={loading} autoComplete="current-password" className="h-14 rounded-2xl border-[#E2E4E8] bg-white pl-12 pr-12 text-[#111] placeholder:text-[#596372] focus:border-[#E51B23] focus:ring-[#E51B23]" /><button type="button" onClick={()=>setShowPassword(v=>!v)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-[#666B73]" aria-label={showPassword?"Esconder senha":"Mostrar senha"}>{showPassword?<EyeOff size={20}/>:<Eye size={20}/>}</button></div>
            </div>
            <div className="text-right"><Link to="/recuperar-senha" className="text-sm font-bold text-[#E51B23]">Esqueci minha senha</Link></div>
            <button type="submit" disabled={loading} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#E51B23] text-base font-black text-white shadow-[0_12px_28px_rgba(229,27,35,.22)] active:bg-[#C9141B] disabled:opacity-50">{loading?<Loader2 className="animate-spin"/>:<><span>Entrar</span><ChevronRight size={22}/></>}</button>
          </form>
          <div className="mt-5 text-center text-sm text-[#666B73]">Ainda não tem uma conta? <Link to="/cadastro" className="font-extrabold text-[#E51B23]">Criar conta</Link></div>
        </div>
        <div className="mt-auto min-h-24" />
      </div>
    </div>
  );
}
