import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/recuperar-senha')({
  component: RecuperarSenhaPage,
});

function RecuperarSenhaPage() {
  return <div className="p-6 text-white">Recuperar Senha</div>;
}
