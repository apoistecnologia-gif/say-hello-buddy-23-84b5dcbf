import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Por favor, preencha todos os campos.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
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
    <div className="flex flex-col min-h-screen bg-black text-white p-6 pt-12">
      <div className="mb-12 flex justify-center">
        {/* Placeholder para o logo real */}
        <div className="w-24 h-24 bg-yellow-500 rounded-full flex items-center justify-center">
          <span className="text-black font-bold text-4xl">A</span>
        </div>
      </div>

      <h1 className="text-3xl font-bold mb-2">Bem-vindo ao APOIS</h1>
      <p className="text-gray-400 mb-8">Faça login para continuar sua jornada.</p>

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <Input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="w-full bg-[#1e1e1e] border-gray-800 text-white h-14 rounded-xl"
            autoComplete="email"
          />
        </div>

        <div className="relative space-y-2">
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className="w-full bg-[#1e1e1e] border-gray-800 text-white h-14 rounded-xl pr-12"
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        <div className="flex justify-end">
          <Link to="/recuperar-senha" className="text-sm text-yellow-500 hover:underline">
            Esqueci minha senha
          </Link>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-yellow-500 hover:bg-yellow-600 text-black h-14 rounded-xl font-bold text-lg mt-4"
        >
          {loading ? <Loader2 className="animate-spin" /> : "Entrar"}
        </Button>
      </form>

      <div className="mt-8 text-center text-gray-400">
        Não tem uma conta?{" "}
        <Link to="/cadastro" className="text-yellow-500 font-bold hover:underline">
          Criar minha conta
        </Link>
      </div>
    </div>
  );
}
