import { createFileRoute } from "@tanstack/react-router";
import { PublicLegalDocument } from "@/components/legal/PublicLegalDocument";
import { TERMS_VERSION, termsSections } from "@/lib/legal/legal-documents";

export const Route = createFileRoute("/_public/termos")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <PublicLegalDocument
      eyebrow="Documento contratual"
      title="Termos de Uso"
      version={TERMS_VERSION}
      description="Regras para cadastro, solicitação de serviços, pagamentos, cancelamentos, segurança e uso responsável do APOIS Passageiro."
      sections={termsSections}
      alternate={{ label: "Ler a Política de Privacidade", to: "/privacidade" }}
    />
  );
}
