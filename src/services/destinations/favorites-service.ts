import { DestinationHistoryItem, FavoriteIconType } from "../../types/destinations";
import DestinationStorage from "./destination-storage";

class FavoritesService {
  public getFavorites(): DestinationHistoryItem[] {
    return DestinationStorage.getFavorites();
  }

  public addFavorite(destination: DestinationHistoryItem): void {
    const favorites = this.getFavorites();

    // Se for um tipo reservado (casa/trabalho), substitui o anterior se houver
    if (destination.icon === "home" || destination.icon === "briefcase") {
      const filtered = favorites.filter((item) => item.icon !== destination.icon);
      const updated = [
        ...filtered,
        { ...destination, favorite: true, updatedAt: new Date().toISOString() },
      ];
      DestinationStorage.saveFavorites(updated);
      return;
    }

    // Evitar duplicidade por placeId para favoritos normais
    if (favorites.some((item) => item.placeId === destination.placeId)) {
      return;
    }

    const updated = [
      ...favorites,
      { ...destination, favorite: true, updatedAt: new Date().toISOString() },
    ];

    DestinationStorage.saveFavorites(updated);
  }

  public updateFavorite(id: string, updates: Partial<DestinationHistoryItem>): void {
    const favorites = this.getFavorites();
    const updated = favorites.map((item) =>
      item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item,
    );
    DestinationStorage.saveFavorites(updated);
  }

  public removeFavorite(id: string): void {
    const favorites = this.getFavorites();
    const updated = favorites.filter((item) => item.id !== id);
    DestinationStorage.saveFavorites(updated);
  }
}

export const favoritesService = new FavoritesService();
