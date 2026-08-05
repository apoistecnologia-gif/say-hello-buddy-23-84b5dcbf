import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.jpg";

export const Route = createFileRoute("/_public/login")({
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { authState } = useAuth();

  useEffect(() => {
    if (authState === "authenticated") {
      navigate({ to: "/inicio" });
    }
  }, [authState, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      toast.error("Por favor, preencha todos os campos.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast.error("E-mail ou senha incorretos.");
        } else if (error.message.includes("Email not confirmed")) {
          toast.error("Por favor, confirme seu e-mail antes de entrar.");
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success("Login realizado com sucesso!");
        navigate({ to: "/inicio" });
      }
    } catch (err) {
      toast.error("Ocorreu um erro ao tentar entrar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-black text-white px-6 py-8 sm:py-12 items-center justify-center safe-top safe-bottom">
      <div className="w-full max-w-[400px] flex flex-col items-center">
        {/* LOGOMARCA OFICIAL */}
        <div className="mb-8 flex justify-center w-full">
          <img
            src={logo}
            alt="APOIS"
            className="w-32 h-auto object-contain max-w-[180px]"
            loading="eager"
          />
        </div>

        {/* TÍTULO E SUBTÍTULO */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">Bem-vindo ao APOIS</h1>
          <p className="text-zinc-400">Faça login para continuar sua jornada.</p>
        </div>

        {/* FORMULÁRIO */}
        <form onSubmit={handleLogin} className="w-full space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1">
              E-mail
            </label>
            <Input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="w-full bg-[#121212] border-zinc-800 text-white h-14 rounded-xl focus:border-apois-yellow focus:ring-1 focus:ring-apois-yellow"
              autoComplete="email"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1">
              Senha
            </label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full bg-[#121212] border-zinc-800 text-white h-14 rounded-xl pr-12 focus:border-apois-yellow focus:ring-1 focus:ring-apois-yellow"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-2"
                aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Link
              to="/recuperar-senha"
              className="text-sm font-semibold text-apois-yellow hover:text-apois-yellow/80 active:opacity-70 transition-colors"
            >
              Esqueci minha senha
            </Link>
          </div>

          {/* BOTÃO ENTRAR */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#ffb800] hover:bg-[#ffb800]/90 text-black h-14 rounded-xl font-black text-base uppercase tracking-widest mt-6 shadow-lg shadow-[#ffb800]/10 flex items-center justify-center transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="animate-spin" /> : "Entrar"}
          </button>
        </form>

        {/* CRIAR CONTA */}
        <div className="mt-10 text-center flex flex-col gap-1">
          <span className="text-zinc-500 text-sm">Ainda não tem uma conta?</span>
          <Link
            to="/cadastro"
            className="text-apois-yellow font-black uppercase text-sm tracking-widest hover:text-apois-yellow/80 active:opacity-70 transition-colors"
          >
            Criar minha conta
          </Link>
        </div>
      </div>
    </div>
  );
}
