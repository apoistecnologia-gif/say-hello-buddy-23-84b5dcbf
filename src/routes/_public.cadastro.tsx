import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_public/cadastro")({ component: CadastroPage });

const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, 11);

const formatPhone = (value: string) => {
  const digits = onlyDigits(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const friendlyAuthError = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return "Este e-mail já está cadastrado. Tente entrar na sua conta.";
  }
  if (normalized.includes("password")) return "A senha não atende aos requisitos de segurança.";
  if (normalized.includes("email")) return "Confira o endereço de e-mail informado.";
  if (normalized.includes("database error saving new user")) {
    return "O cadastro não pôde ser concluído no banco de dados. Tente novamente em instantes.";
  }
  if (normalized.includes("fetch") || normalized.includes("network")) {
    return "Falha de conexão com o servidor. Verifique a internet e tente novamente.";
  }
  return "Não foi possível criar a conta agora. Tente novamente em instantes.";
};

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
    if (authState === "authenticated") void navigate({ to: "/inicio", replace: true });
  }, [authState, navigate]);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    const normalizedName = name.trim().replace(/\s+/g, " ");
    const normalizedPhone = onlyDigits(phone);

    if (normalizedName.length < 3) {
      toast.error("Informe seu nome completo.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    if (normalizedPhone.length < 10) {
      toast.error("Informe um telefone válido com DDD.");
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      toast.error("Use uma senha com pelo menos 8 caracteres, letras e números.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (!acceptTerms) {
      toast.error("Você precisa aceitar os Termos de Uso e a Política de Privacidade.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            name: normalizedName,
            full_name: normalizedName,
            phone: normalizedPhone,
            role: "passenger",
          },
        },
      });

      if (error) {
        console.error("[Cadastro] signUp failed", {
          name: error.name,
          status: error.status,
          code: (error as { code?: string }).code,
          message: error.message,
        });
        toast.error(friendlyAuthError(error.message));
        return;
      }

      if (!data.user) {
        toast.error("O servidor não concluiu o cadastro. Tente novamente.");
        return;
      }

      if (data.session) {
        toast.success("Conta criada com sucesso!");
        await navigate({ to: "/inicio", replace: true });
        return;
      }

      toast.info("Conta criada. Confirme seu e-mail para entrar.");
      await navigate({ to: "/login", replace: true });
    } catch (error) {
      console.error("[Cadastro] unexpected failure", {
        message: error instanceof Error ? error.message : "unknown_error",
      });
      toast.error("Falha de conexão com o servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col overflow-y-auto bg-black p-6 pb-24 pt-8 text-white">
      <Link to="/login" className="mb-6 inline-flex items-center text-gray-400">
        <ArrowLeft size={20} className="mr-2" /> Voltar para o login
      </Link>

      <h1 className="mb-2 text-3xl font-bold">Criar conta</h1>
      <p className="mb-8 text-gray-400">Preencha os dados abaixo para começar.</p>

      <form onSubmit={handleRegister} className="space-y-4" noValidate>
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium text-gray-300">Nome completo</label>
          <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} disabled={loading} className="h-14 w-full rounded-xl border-gray-800 bg-[#1e1e1e] text-white" />
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-gray-300">E-mail</label>
          <Input id="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} className="h-14 w-full rounded-xl border-gray-800 bg-[#1e1e1e] text-white" />
        </div>

        <div className="space-y-2">
          <label htmlFor="phone" className="text-sm font-medium text-gray-300">Telefone</label>
          <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} disabled={loading} className="h-14 w-full rounded-xl border-gray-800 bg-[#1e1e1e] text-white" />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-gray-300">Senha</label>
          <div className="relative">
            <Input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} className="h-14 w-full rounded-xl border-gray-800 bg-[#1e1e1e] pr-12 text-white" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <p className="text-xs text-gray-500">Mínimo de 8 caracteres, com letras e números.</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="confirm-password" className="text-sm font-medium text-gray-300">Confirmar senha</label>
          <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={loading} className="h-14 w-full rounded-xl border-gray-800 bg-[#1e1e1e] text-white" />
        </div>

        <div className="flex items-center space-x-2 pt-2">
          <Checkbox id="terms" checked={acceptTerms} onCheckedChange={(checked) => setAcceptTerms(checked === true)} disabled={loading} className="border-gray-800 data-[state=checked]:bg-yellow-500 data-[state=checked]:text-black" />
          <label htmlFor="terms" className="text-xs leading-tight text-gray-400">
            Eu aceito os <span className="text-yellow-500">Termos de Uso</span> e a <span className="text-yellow-500">Política de Privacidade</span>.
          </label>
        </div>

        <button type="submit" disabled={loading} className="mt-6 flex h-14 w-full items-center justify-center rounded-xl bg-[#ffb800] text-base font-black uppercase tracking-widest text-black shadow-lg shadow-[#ffb800]/10 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? <Loader2 className="animate-spin" /> : "Criar minha conta"}
        </button>
      </form>
    </div>
  );
}
