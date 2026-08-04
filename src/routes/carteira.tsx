import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/carteira')({
  component: CarteiraPage,
});

function CarteiraPage() {
  return <div className="p-6 text-white">Sua Carteira</div>;
}
