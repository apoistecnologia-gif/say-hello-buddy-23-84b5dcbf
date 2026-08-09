import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import {
  LEGAL_UPDATED_AT,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "@/lib/legal/legal-documents";

export const Route = createFileRoute("/_authenticated/documentos-legais")({
  component: LegalDocumentsPage,
});

function LegalDocumentsPage() {
  const navigate = useNavigate();

  return (
    <div className="app-screen flex min-h-0 flex-col bg-black text-white">
      <header className="app-safe-top flex items-center gap-4 border-b border-white/8 bg-black/92 px-5 pb-4 backdrop-blur-xl">
        <button
          type="button"
          aria-label="Voltar ao perfil"
          onClick={() => void navigate({ to: "/perfil" })}
          className="app-pressable mt-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900"
        >
          <ArrowLeft size={19} />
        </button>
        <div className="mt-4 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-apois-yellow">
            Conta e transparência
          </p>
          <h1 className="truncate text-xl font-black">Documentos legais</h1>
        </div>
      </header>

      <main className="app-scroll space-y-4 px-5 pt-5">
        <section className="rounded-3xl border border-white/8 bg-zinc-950 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-apois-yellow/10 text-apois-yellow">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-sm font-black">Transparência APOIS</h2>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Consulte a versão vigente dos documentos que regulam o uso do APOIS Passageiro e o tratamento dos seus dados pessoais.
              </p>
              <p className="mt-2 text-[10px] font-bold text-zinc-600">
                Atualizados em {LEGAL_UPDATED_AT}.
              </p>
            </div>
          </div>
        </section>

        <LegalLink
          title="Termos de Uso"
          description="Cadastro, corridas, pagamentos, cancelamentos, segurança e regras de utilização."
          version={TERMS_VERSION}
          to="/termos"
        />
        <LegalLink
          title="Política de Privacidade"
          description="Dados pessoais, localização, pagamentos, compartilhamentos, segurança e direitos do titular."
          version={PRIVACY_VERSION}
          to="/privacidade"
        />

        <section className="rounded-3xl border border-white/8 bg-white/[0.03] p-5 text-xs leading-5 text-zinc-500">
          O aceite realizado no cadastro é registrado no backend com a versão dos Termos e da Política vigentes no momento da criação da conta.
        </section>
      </main>
    </div>
  );
}

function LegalLink({
  title,
  description,
  version,
  to,
}: {
  title: string;
  description: string;
  version: string;
  to: "/termos" | "/privacidade";
}) {
  return (
    <Link
      to={to}
      className="app-pressable flex min-h-24 items-center gap-4 rounded-3xl border border-white/8 bg-zinc-950 p-5"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-apois-yellow">
        <FileText size={21} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-apois-yellow">
          Versão {version}
        </p>
      </div>
    </Link>
  );
}
