import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/corridas')({
  component: CorridasPage,
});

function CorridasPage() {
  return <div className="p-6 text-white">Suas Corridas</div>;
}
