import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_public/cadastro")({
  component: CadastroPage,
});

function CadastroPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { authState } = useAuth();

  useEffect(() => {
    if (authState === "authenticated") {
      navigate({ to: "/inicio" });
    }
  }, [authState, navigate]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // Logs de auditoria removidos após validação de ambiente oficial.



    if (!name || !email || !phone || !password || !confirmPassword) {
      toast.error("Por favor, preencha todos os campos.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }

    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (!acceptTerms) {
      toast.error("Você precisa aceitar os termos e condições.");
      return;
    }

    setLoading(true);
    try {
      // 2. CAPTURAR O RETORNO REAL DO SIGNUP
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: name,
            phone: phone,
            role: 'passenger',
          },
        },
      });

      if (error) {
        console.log("[DEBUG] signUp Error Detail:", {
          error,
          message: error.message,
          name: error.name,
          status: error.status,
          code: (error as any).code,
          cause: (error as any).cause,
          json: JSON.stringify(error, null, 2)
        });
        
        if (!(error as any).status) {
          console.error("[DEBUG] Non-AuthApiError detected:", error);
        }
      } else {
        console.log("[DEBUG] signUp Success:", {
          userPresent: !!data.user,
          sessionPresent: !!data.session,
          userId: data.user?.id
        });
      }

      // 3. NÃO MOSTRAR SUCESSO QUANDO HOUVER ERRO
      if (error) {
        if (error.message.includes("User already registered")) {
          toast.error("Este e-mail já está cadastrado.");
        } else {
          // Formatador de erro seguro conforme requisito 9
          const errorMessage = error.message || "Erro desconhecido";
          const errorCode = (error as any).code ? ` (${(error as any).code})` : "";
          toast.error(`Erro no cadastro: ${errorMessage}${errorCode}`);
        }
      } else if (!data.user) {
        toast.error("Falha no cadastro: o servidor não retornou um usuário.");
      } else if (data.session) {
        toast.success("Cadastro realizado com sucesso!");
        navigate({ to: "/inicio" });
      } else {
        // Se ainda não houver sessão, avisar sobre confirmação de e-mail (requisito 6)
        toast.error("A confirmação de e-mail ainda está ativada no projeto backend.");
        navigate({ to: "/login" });
      }
    } catch (err: any) {
      console.error("[DEBUG] signUp Exception:", err);
      toast.error("Ocorreu um erro inesperado ao realizar o cadastro.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-6 pt-8 pb-24 overflow-y-auto">
      <Link to="/login" className="mb-6 inline-flex items-center text-gray-400">
        <ArrowLeft size={20} className="mr-2" />
        Voltar para o login
      </Link>

      <h1 className="text-3xl font-bold mb-2">Criar conta</h1>
      <p className="text-gray-400 mb-8">Preencha os dados abaixo para começar.</p>

      <form onSubmit={handleRegister} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Nome completo</label>
          <Input
            placeholder="Seu nome completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            className="w-full bg-[#1e1e1e] border-gray-800 text-white h-14 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">E-mail</label>
          <Input
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            disabled={loading}
            className="w-full bg-[#1e1e1e] border-gray-800 text-white h-14 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Telefone</label>
          <Input
            type="tel"
            placeholder="(00) 00000-0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={loading}
            className="w-full bg-[#1e1e1e] border-gray-800 text-white h-14 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Senha</label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Crie uma senha segura"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="w-full bg-[#1e1e1e] border-gray-800 text-white h-14 rounded-xl pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Confirmar senha</label>
          <Input
            type="password"
            placeholder="Repita sua senha"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            className="w-full bg-[#1e1e1e] border-gray-800 text-white h-14 rounded-xl"
          />
        </div>

        <div className="flex items-center space-x-2 pt-2">
          <Checkbox
            id="terms"
            checked={acceptTerms}
            onCheckedChange={(checked) => setAcceptTerms(!!checked)}
            className="border-gray-800 data-[state=checked]:bg-yellow-500 data-[state=checked]:text-black"
          />
          <label htmlFor="terms" className="text-xs text-gray-400 leading-tight">
            Eu aceito os <span className="text-yellow-500">Termos de Uso</span> e a{" "}
            <span className="text-yellow-500">Política de Privacidade</span>.
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#ffb800] hover:bg-[#ffb800]/90 text-black h-14 rounded-xl font-black text-base uppercase tracking-widest mt-6 shadow-lg shadow-[#ffb800]/10 flex items-center justify-center transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="animate-spin" /> : "Criar minha conta"}
        </button>
      </form>
    </div>
  );
}
