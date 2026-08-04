import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { DestinationHistoryItem, FavoriteIconType } from '../types/destinations';
import { recentDestinationsService } from '../services/destinations/recent-destinations-service';
import { favoritesService } from '../services/destinations/favorites-service';
import { DestinationAddress } from '../types/places';
import { useAuth } from './use-auth';

interface DestinationHistoryContextType {
  recent: DestinationHistoryItem[];
  favorites: DestinationHistoryItem[];
  addToHistory: (destination: DestinationAddress) => void;
  toggleFavorite: (id: string) => void;
  removeRecent: (id: string) => void;
  clearAllRecent: () => Promise<void>;
  updateFavorite: (id: string, updates: Partial<DestinationHistoryItem>) => void;
  addFavorite: (destination: DestinationAddress, nickname?: string, icon?: FavoriteIconType) => void;
  removeFavorite: (id: string) => void;
  refresh: () => void;
}

const DestinationHistoryContext = createContext<DestinationHistoryContextType | undefined>(undefined);

export const DestinationHistoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [recent, setRecent] = useState<DestinationHistoryItem[]>([]);
  const [favorites, setFavorites] = useState<DestinationHistoryItem[]>([]);
  const lastUserId = useRef<string | null>(null);

  const refresh = useCallback(() => {
    if (!user) {
      setRecent([]);
      setFavorites([]);
      return;
    }
    setRecent(recentDestinationsService.getRecent());
    setFavorites(favoritesService.getFavorites());
  }, [user]);

  // Handle account change
  useEffect(() => {
    if (user?.id !== lastUserId.current) {
      lastUserId.current = user?.id || null;
      refresh();
    }
  }, [user, refresh]);

  const addToHistory = useCallback((destination: DestinationAddress) => {
    if (!user) return;
    const newItem: DestinationHistoryItem = {
      ...destination,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      favorite: false
    };
    recentDestinationsService.addRecent(newItem);
    refresh();
  }, [user, refresh]);

  const toggleFavorite = useCallback((id: string) => {
    if (!user) return;
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
  }, [user, favorites, recent, refresh]);

  const addFavorite = useCallback((destination: DestinationAddress, nickname?: string, icon?: FavoriteIconType) => {
    if (!user) return;
    const newItem: any = {
      ...destination,
      id: crypto.randomUUID(),
      nickname: nickname,
      icon: icon,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      favorite: true
    };
    favoritesService.addFavorite(newItem as DestinationHistoryItem);
    refresh();
  }, [user, refresh]);

  const removeFavorite = useCallback((id: string) => {
    if (!user) return;
    favoritesService.removeFavorite(id);
    refresh();
  }, [user, refresh]);

  const removeRecent = useCallback((id: string) => {
    if (!user) return;
    recentDestinationsService.removeRecent(id);
    refresh();
  }, [user, refresh]);

  const clearAllRecent = useCallback(async () => {
    if (!user) return;
    recentDestinationsService.clearRecent();
    refresh();
  }, [user, refresh]);

  const updateFavorite = useCallback((id: string, updates: Partial<DestinationHistoryItem>) => {
    if (!user) return;
    favoritesService.updateFavorite(id, updates);
    refresh();
  }, [user, refresh]);

  return (
    <DestinationHistoryContext.Provider value={{ 
      recent, 
      favorites, 
      addToHistory, 
      toggleFavorite, 
      removeRecent,
      clearAllRecent,
      updateFavorite,
      addFavorite,
      removeFavorite,
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
