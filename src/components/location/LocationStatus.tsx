import React from 'react';
import { useLocation } from '@/hooks/use-location';
import { Shield, MapPin, AlertCircle, Settings } from 'lucide-react';

export const LocationStatus: React.FC = () => {
  const { 
    permissionStatus, 
    accuracyQuality, 
    isLoading, 
    error, 
    requestPermission, 
    refreshPosition 
  } = useLocation();

  if (permissionStatus === 'prompt') {
    return (
      <div className="bg-surface p-4 rounded-xl mb-4 border border-yellow-500/20">
        <div className="flex items-start gap-3">
          <div className="bg-yellow-500/10 p-2 rounded-full mt-1">
            <Shield className="w-5 h-5 text-yellow-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-white">Sua localização</h3>
            <p className="text-sm text-gray-400 mt-1">
              A APOIS usa sua localização enquanto o aplicativo está em uso para identificar seu ponto de partida e oferecer serviços próximos.
            </p>
            <button 
              onClick={requestPermission}
              className="mt-3 bg-yellow-500 text-black text-sm font-bold py-2 px-4 rounded-lg hover:bg-yellow-400 transition-colors"
            >
              Permitir localização
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 p-4 rounded-xl mb-4 border border-red-500/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-1" />
          <div className="flex-1">
            <p className="text-sm text-red-200">{error.message}</p>
            <div className="flex gap-3 mt-2">
              <button 
                onClick={refreshPosition}
                disabled={isLoading}
                className="text-xs font-bold text-red-500 hover:text-red-400 disabled:opacity-50"
              >
                Tentar novamente
              </button>
              {error.code === 'permission_denied' && (
                <button 
                  onClick={() => console.log('Abrir configurações')}
                  className="flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-white"
                >
                  <Settings className="w-3 h-3" />
                  Abrir configurações
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mb-4 px-1">
      <div className={`w-2 h-2 rounded-full ${
        accuracyQuality === 'high' ? 'bg-green-500' : 
        accuracyQuality === 'medium' ? 'bg-yellow-500' : 
        'bg-red-500'
      } animate-pulse`} />
      <span className="text-xs text-gray-400">
        {isLoading ? 'Localizando...' : 
         accuracyQuality === 'none' ? 'Precisamos da sua localização' :
         accuracyQuality === 'high' ? 'Localização precisa identificada' : 
         'Localização aproximada'}
      </span>
    </div>
  );
};
