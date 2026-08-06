import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, BadgeDollarSign, Loader2, MapPinned, ShieldCheck } from "lucide-react";
import { AppBrand } from "@/components/app/AppBrand";
import { PublicAuthShell } from "@/components/app/PublicAuthShell";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_public/")({
  component: WelcomePage,
});

const benefits = [
  {
    icon: MapPinned,
    title: "Tudo em um só app",
    description: "Carro, moto, envios, fretes e outros serviços.",
  },
  {
    icon: ShieldCheck,
    title: "Sua segurança primeiro",
    description: "PIN de embarque e recursos de proteção durante a viagem.",
  },
  {
    icon: BadgeDollarSign,
    title: "Preço antes de confirmar",
    description: "Confira a estimativa e a forma de pagamento com clareza.",
  },
] as const;

function WelcomePage() {
  const { authState } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authState === "authenticated") {
      void navigate({ to: "/inicio", replace: true });
    }
  }, [authState, navigate]);

  if (authState === "initializing" || authState === "authenticated") {
    return (
      <PublicAuthShell contentClassName="items-center justify-center text-center">
        <AppBrand subtitle="Apois, vamos?" />
        <div className="mt-8 flex items-center gap-3 rounded-full border border-white/8 bg-white/5 px-5 py-3 text-xs font-bold text-zinc-400">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-apois-yellow" />
          Preparando sua experiência
        </div>
      </PublicAuthShell>
    );
  }

  return (
    <PublicAuthShell contentClassName="justify-between py-7">
      <div className="flex flex-col">
        <AppBrand subtitle="Apois, vamos?" />

        <div className="mt-8 text-center">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-apois-yellow">
            Feito para o seu caminho
          </p>
          <h1 className="mx-auto mt-3 max-w-sm text-3xl font-black leading-tight tracking-[-0.04em] text-white">
            Vá para onde precisar com praticidade e segurança.
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-400">
            Escolha seu destino, veja as opções disponíveis e acompanhe cada etapa da sua corrida.
          </p>
        </div>

        <section className="mt-7 grid gap-3" aria-label="Vantagens do APOIS Passageiro">
          {benefits.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="app-surface flex items-center gap-4 rounded-2xl px-4 py-3.5"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-apois-yellow/20 bg-apois-yellow/10 text-apois-yellow">
                <Icon aria-hidden="true" size={21} strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-black tracking-tight text-white">{title}</h2>
                <p className="mt-0.5 text-xs leading-5 text-zinc-500">{description}</p>
              </div>
            </article>
          ))}
        </section>
      </div>

      <div className="mt-8 space-y-3">
        <Link
          to="/login"
          className="app-pressable app-gold-glow ripple-effect flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow px-6 py-3 text-base font-black text-black"
        >
          Entrar na minha conta
          <ArrowRight aria-hidden="true" size={20} strokeWidth={2.8} />
        </Link>

        <Link
          to="/cadastro"
          className="app-pressable flex min-h-14 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-base font-black text-white"
        >
          Criar conta de passageiro
        </Link>

        <p className="px-4 pt-1 text-center text-[11px] leading-5 text-zinc-600">
          Ao continuar, você declara estar de acordo com os Termos de Uso e a Política de Privacidade da APOIS.
        </p>
      </div>
    </PublicAuthShell>
  );
}
