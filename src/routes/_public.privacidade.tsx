import { createFileRoute } from "@tanstack/react-router";
import { PublicLegalDocument } from "@/components/legal/PublicLegalDocument";
import { PRIVACY_VERSION, privacySections } from "@/lib/legal/legal-documents";

export const Route = createFileRoute("/_public/privacidade")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PublicLegalDocument
      eyebrow="Proteção de dados"
      title="Política de Privacidade"
      version={PRIVACY_VERSION}
      description="Informações sobre dados pessoais, localização, pagamentos, compartilhamentos, segurança e direitos dos titulares no APOIS Passageiro."
      sections={privacySections}
      alternate={{ label: "Ler os Termos de Uso", to: "/termos" }}
    />
  );
}
