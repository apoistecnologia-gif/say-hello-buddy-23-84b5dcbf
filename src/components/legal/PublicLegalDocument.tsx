import { ArrowLeft, Building2, CalendarDays, Mail } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AppBrand } from "@/components/app/AppBrand";
import { PublicAuthShell } from "@/components/app/PublicAuthShell";
import type { LegalSection } from "@/lib/legal/legal-documents";
import { COMPANY, LEGAL_UPDATED_AT } from "@/lib/legal/legal-documents";

type PublicLegalDocumentProps = {
  eyebrow: string;
  title: string;
  version: string;
  description: string;
  sections: LegalSection[];
  alternate: {
    label: string;
    to: "/termos" | "/privacidade";
  };
};

export function PublicLegalDocument({
  eyebrow,
  title,
  version,
  description,
  sections,
  alternate,
}: PublicLegalDocumentProps) {
  const navigate = useNavigate();

  const handleBack = (): void => {
    // Termos e Privacidade são usados tanto no cadastro quanto por usuários já
    // autenticados. Respeitar o histórico evita mandar quem veio do Perfil para
    // o cadastro. Em abertura direta, o cadastro continua sendo o fallback.
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    void navigate({ to: "/cadastro", replace: true });
  };

  return (
    <PublicAuthShell contentClassName="py-5 sm:py-8">
      <article className="w-full pb-8 text-white">
        <header className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Voltar"
            className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-300"
          >
            <ArrowLeft aria-hidden="true" size={20} />
          </button>
          <AppBrand compact />
          <div className="h-11 w-11 shrink-0" aria-hidden="true" />
        </header>

        <section className="app-surface mt-6 rounded-3xl p-5 sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-apois-yellow">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p>

          <dl className="mt-5 grid gap-3 rounded-2xl border border-white/8 bg-black/35 p-4 text-xs text-zinc-400 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <CalendarDays aria-hidden="true" className="mt-0.5 shrink-0 text-apois-yellow" size={17} />
              <div>
                <dt className="font-black uppercase tracking-wider text-zinc-500">Atualização</dt>
                <dd className="mt-1 font-bold text-zinc-200">{LEGAL_UPDATED_AT} · versão {version}</dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Building2 aria-hidden="true" className="mt-0.5 shrink-0 text-apois-yellow" size={17} />
              <div>
                <dt className="font-black uppercase tracking-wider text-zinc-500">Responsável</dt>
                <dd className="mt-1 font-bold leading-5 text-zinc-200">{COMPANY.legalName}</dd>
              </div>
            </div>
          </dl>
        </section>

        <div className="mt-4 space-y-4">
          {sections.map((section) => (
            <section key={section.title} className="app-surface rounded-3xl p-5 sm:p-7">
              <h2 className="text-lg font-black tracking-tight text-white">{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-sm leading-7 text-zinc-400">
                  {paragraph}
                </p>
              ))}
              {section.bullets?.length ? (
                <ul className="mt-3 space-y-2.5 text-sm leading-6 text-zinc-400">
                  {section.bullets.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-apois-yellow" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <footer className="app-surface mt-4 rounded-3xl p-5 text-center sm:p-7">
          <Mail aria-hidden="true" className="mx-auto text-apois-yellow" size={24} />
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Dúvidas sobre este documento podem ser enviadas para{" "}
            <a className="font-black text-apois-yellow underline underline-offset-4" href={`mailto:${COMPANY.email}`}>
              {COMPANY.email}
            </a>
            .
          </p>
          <Link
            to={alternate.to}
            className="app-pressable mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-black text-zinc-200"
          >
            {alternate.label}
          </Link>
        </footer>
      </article>
    </PublicAuthShell>
  );
}
