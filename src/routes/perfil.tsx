import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/perfil')({
  component: PerfilPage,
});

function PerfilPage() {
  return <div className="p-6 text-white">Seu Perfil</div>;
}
