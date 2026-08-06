import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, Phone, UserRound } from "lucide-react";
import { toast } from "sonner";
import { AppBrand } from "@/components/app/AppBrand";
import { PrimaryButton } from "@/components/app/PrimaryButton";
import { PublicAuthShell } from "@/components/app/PublicAuthShell";
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
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
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

const fieldClassName =
  "h-14 w-full rounded-2xl border-white/10 bg-black/45 pl-12 text-white placeholder:text-zinc-600 focus:border-apois-yellow focus:ring-1 focus:ring-apois-yellow";

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
    <PublicAuthShell contentClassName="py-6">
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

        <section className="app-surface mt-6 rounded-3xl p-5 sm:p-6" aria-labelledby="cadastro-title">
          <div className="mb-6">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-apois-yellow">Conta de passageiro</p>
            <h1 id="cadastro-title" className="mt-2 text-2xl font-black tracking-tight text-white">
              Crie sua conta
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Preencha seus dados para começar a pedir corridas.</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4" noValidate>
            <div className="space-y-2">
              <label htmlFor="name" className="ml-1 text-xs font-bold uppercase tracking-wider text-zinc-400">
                Nome completo
              </label>
              <div className="relative">
                <UserRound aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                <Input
                  id="name"
                  autoComplete="name"
                  placeholder="Seu nome completo"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={loading}
                  className={fieldClassName}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="ml-1 text-xs font-bold uppercase tracking-wider text-zinc-400">
                E-mail
              </label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                  className={fieldClassName}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="phone" className="ml-1 text-xs font-bold uppercase tracking-wider text-zinc-400">
                Telefone
              </label>
              <div className="relative">
                <Phone aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(00) 00000-0000"
                  value={phone}
                  onChange={(event) => setPhone(formatPhone(event.target.value))}
                  disabled={loading}
                  className={fieldClassName}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="ml-1 text-xs font-bold uppercase tracking-wider text-zinc-400">
                Senha
              </label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Crie uma senha segura"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  className={`${fieldClassName} pr-12`}
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
              <p className="px-1 text-xs leading-5 text-zinc-500">Use no mínimo 8 caracteres, incluindo letras e números.</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm-password" className="ml-1 text-xs font-bold uppercase tracking-wider text-zinc-400">
                Confirmar senha
              </label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Digite a senha novamente"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={loading}
                  className={fieldClassName}
                />
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/35 p-4">
              <Checkbox
                id="terms"
                checked={acceptTerms}
                onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                disabled={loading}
                className="mt-0.5 border-zinc-600 data-[state=checked]:border-apois-yellow data-[state=checked]:bg-apois-yellow data-[state=checked]:text-black"
              />
              <label htmlFor="terms" className="text-xs leading-5 text-zinc-400">
                Li e aceito os <strong className="font-bold text-zinc-200">Termos de Uso</strong> e a{" "}
                <strong className="font-bold text-zinc-200">Política de Privacidade</strong> da APOIS.
              </label>
            </div>

            <PrimaryButton type="submit" loading={loading} loadingLabel="Criando conta..." className="mt-2">
              Criar minha conta
            </PrimaryButton>
          </form>
        </section>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Já possui uma conta?{" "}
          <Link to="/login" className="font-black text-apois-yellow">
            Entrar
          </Link>
        </p>
      </div>
    </PublicAuthShell>
  );
}
