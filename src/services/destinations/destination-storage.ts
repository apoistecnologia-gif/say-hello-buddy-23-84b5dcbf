import { DestinationHistoryItem } from '../../types/destinations';

const RECENT_STORAGE_KEY = 'apois_recent_destinations';
const FAVORITES_STORAGE_KEY = 'apois_favorite_destinations';

class DestinationStorage {
  public static getRecent(): DestinationHistoryItem[] {
    const data = localStorage.getItem(RECENT_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  public static saveRecent(items: DestinationHistoryItem[]): void {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(items));
  }

  public static getFavorites(): DestinationHistoryItem[] {
    const data = localStorage.getItem(FAVORITES_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  public static saveFavorites(items: DestinationHistoryItem[]): void {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(items));
  }
}

export default DestinationStorage;
