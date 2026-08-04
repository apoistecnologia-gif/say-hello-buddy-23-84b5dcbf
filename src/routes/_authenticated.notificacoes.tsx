import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  component: NotificacoesPage,
});

function NotificacoesPage() {
  return <div className="p-6 text-white">Notificações</div>;
}
