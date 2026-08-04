import { DestinationHistoryItem } from "../../types/destinations";
import DestinationStorage from "./destination-storage";

class RecentDestinationsService {
  private static MAX_ITEMS = 20;

  public getRecent(): DestinationHistoryItem[] {
    return DestinationStorage.getRecent();
  }

  public addRecent(destination: DestinationHistoryItem): void {
    const recent = this.getRecent();

    // Evitar duplicidade
    const filtered = recent.filter((item) => {
      if (item.placeId && destination.placeId) {
        return item.placeId !== destination.placeId;
      }
      // Comparação por coordenadas se placeId não existir
      const dist = Math.sqrt(
        Math.pow(item.latitude - destination.latitude, 2) +
          Math.pow(item.longitude - destination.longitude, 2),
      );
      return dist > 0.0001; // aprox 10m
    });

    // Adicionar no início (mais recente primeiro)
    const updated = [{ ...destination, updatedAt: new Date().toISOString() }, ...filtered].slice(
      0,
      RecentDestinationsService.MAX_ITEMS,
    );

    DestinationStorage.saveRecent(updated);
  }

  public removeRecent(id: string): void {
    const recent = this.getRecent();
    const updated = recent.filter((item) => item.id !== id);
    DestinationStorage.saveRecent(updated);
  }

  public clearRecent(): void {
    DestinationStorage.saveRecent([]);
  }
}

export const recentDestinationsService = new RecentDestinationsService();
