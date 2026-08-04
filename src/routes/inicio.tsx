import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/inicio')({
  component: InicioPage,
});

function InicioPage() {
  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4">
      {/* Search/Address Area */}
      <div className="bg-[#1e1e1e] rounded-xl p-4 mb-4 shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-sm text-gray-300">Rua Exemplo, 123 - Centro</span>
        </div>
        <button className="w-full bg-[#2a2a2a] text-left px-4 py-3 rounded-lg font-semibold text-lg border border-gray-800 focus:outline-none focus:ring-2 focus:ring-yellow-500">
          Para onde vamos?
        </button>
      </div>

      {/* Categories/Map Placeholder */}
      <div className="flex-1 bg-[#121212] rounded-2xl relative overflow-hidden mb-4 border border-gray-800 flex items-center justify-center">
        <span className="text-gray-600 font-medium">Área reservada para o Mapa</span>
        
        {/* Floating buttons in map area */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2">
          <button className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center shadow-xl">
             <span className="text-xs font-bold">SOS</span>
          </button>
        </div>
      </div>

      {/* Service Categories */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {['Comum', 'Premium', 'Entrega', 'Mercado'].map((cat) => (
          <div key={cat} className="flex flex-col items-center gap-1">
            <div className="w-14 h-14 bg-[#1e1e1e] rounded-xl flex items-center justify-center border border-gray-800">
              <div className="w-8 h-4 bg-yellow-500 rounded-sm" />
            </div>
            <span className="text-xs text-gray-400">{cat}</span>
          </div>
        ))}
      </div>

      {/* Bottom Actions */}
      <div className="grid grid-cols-2 gap-4 mt-auto pb-20">
        <button className="bg-[#1e1e1e] py-4 rounded-xl font-bold border border-gray-800 active:scale-95 transition-transform">
          Agendar
        </button>
        <button className="bg-yellow-500 text-black py-4 rounded-xl font-bold active:scale-95 transition-transform">
          Segurança
        </button>
      </div>
    </div>
  );
}
