import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/cadastro')({
  component: CadastroPage,
});

function CadastroPage() {
  return <div className="p-6 text-white">Estrutura de Cadastro</div>;
}
