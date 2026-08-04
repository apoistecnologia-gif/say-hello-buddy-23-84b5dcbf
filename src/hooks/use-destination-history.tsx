import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { DestinationHistoryItem } from '../types/destinations';
import { recentDestinationsService } from '../services/destinations/recent-destinations-service';
import { favoritesService } from '../services/destinations/favorites-service';
import { DestinationAddress } from '../types/places';

interface DestinationHistoryContextType {
  recent: DestinationHistoryItem[];
  favorites: DestinationHistoryItem[];
  addToHistory: (destination: DestinationAddress) => void;
  toggleFavorite: (id: string) => void;
  removeRecent: (id: string) => void;
  updateFavorite: (id: string, updates: Partial<DestinationHistoryItem>) => void;
  refresh: () => void;
}

const DestinationHistoryContext = createContext<DestinationHistoryContextType | undefined>(undefined);

export const DestinationHistoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [recent, setRecent] = useState<DestinationHistoryItem[]>([]);
  const [favorites, setFavorites] = useState<DestinationHistoryItem[]>([]);

  const refresh = useCallback(() => {
    setRecent(recentDestinationsService.getRecent());
    setFavorites(favoritesService.getFavorites());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addToHistory = useCallback((destination: DestinationAddress) => {
    const newItem: DestinationHistoryItem = {
      ...destination,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      favorite: false
    };
    recentDestinationsService.addRecent(newItem);
    refresh();
  }, [refresh]);

  const toggleFavorite = useCallback((id: string) => {
    // Lógica para alternar favorito
    // Por enquanto apenas remove se for favorito ou adiciona se vier dos recentes
    const isFav = favorites.find(f => f.id === id);
    if (isFav) {
      favoritesService.removeFavorite(id);
    } else {
      const fromRecent = recent.find(r => r.id === id);
      if (fromRecent) {
        favoritesService.addFavorite({ ...fromRecent, favorite: true });
      }
    }
    refresh();
  }, [favorites, recent, refresh]);

  const removeRecent = useCallback((id: string) => {
    recentDestinationsService.removeRecent(id);
    refresh();
  }, [refresh]);

  const updateFavorite = useCallback((id: string, updates: Partial<DestinationHistoryItem>) => {
    favoritesService.updateFavorite(id, updates);
    refresh();
  }, [refresh]);

  return (
    <DestinationHistoryContext.Provider value={{ 
      recent, 
      favorites, 
      addToHistory, 
      toggleFavorite, 
      removeRecent,
      updateFavorite,
      refresh
    }}>
      {children}
    </DestinationHistoryContext.Provider>
  );
};

export const useDestinationHistory = () => {
  const context = useContext(DestinationHistoryContext);
  if (!context) {
    throw new Error('useDestinationHistory must be used within a DestinationHistoryProvider');
  }
  return context;
};
