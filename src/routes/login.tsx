import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-6 justify-center">
      <h1 className="text-3xl font-bold mb-8">Bem-vindo ao APOIS</h1>
      <div className="space-y-4">
        <input 
          type="email" 
          placeholder="E-mail" 
          className="w-full bg-[#1e1e1e] p-4 rounded-xl border border-gray-800 focus:border-yellow-500 outline-none"
        />
        <input 
          type="password" 
          placeholder="Senha" 
          className="w-full bg-[#1e1e1e] p-4 rounded-xl border border-gray-800 focus:border-yellow-500 outline-none"
        />
        <button className="w-full bg-yellow-500 text-black py-4 rounded-xl font-bold text-lg mt-4">
          Entrar
        </button>
      </div>
    </div>
  );
}
