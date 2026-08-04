import { DestinationHistoryItem } from "../../types/destinations";
import { supabase } from "@/integrations/supabase/client";

const getStorageKey = (key: string) => {
  const user = supabase.auth.getUser();
  // We can't use await inside get/save synchronously, but we can try to get ID
  // For safety, let's assume session is loaded.
  const userId = "anonymous"; // Fallback
  return `apois:passageiro:${userId}:${key}`;
};

class DestinationStorage {
  private static getUserId(): string {
    const session = localStorage.getItem(`sb-zjphbuvcapwyuynadgdt-auth-token`);
    if (session) {
      try {
        const parsed = JSON.parse(session);
        return parsed.user.id;
      } catch (e) {
        return "unknown";
      }
    }
    return "anonymous";
  }

  private static getRecentKey() {
    return `apois:passageiro:${this.getUserId()}:recent-destinations`;
  }

  private static getFavoritesKey() {
    return `apois:passageiro:${this.getUserId()}:favorites`;
  }

  public static getRecent(): DestinationHistoryItem[] {
    const data = localStorage.getItem(this.getRecentKey());
    if (!data) return [];
    try {
      const parsed = JSON.parse(data);
      if (parsed.version === 1 && Array.isArray(parsed.items)) return parsed.items;
      return [];
    } catch (e) {
      return [];
    }
  }

  public static saveRecent(items: DestinationHistoryItem[]): void {
    const data = { version: 1, items };
    localStorage.setItem(this.getRecentKey(), JSON.stringify(data));
  }

  public static getFavorites(): DestinationHistoryItem[] {
    const data = localStorage.getItem(this.getFavoritesKey());
    if (!data) return [];
    try {
      const parsed = JSON.parse(data);
      if (parsed.version === 1 && Array.isArray(parsed.items)) return parsed.items;
      return [];
    } catch (e) {
      return [];
    }
  }

  public static saveFavorites(items: DestinationHistoryItem[]): void {
    const data = { version: 1, items };
    localStorage.setItem(this.getFavoritesKey(), JSON.stringify(data));
  }
}

export default DestinationStorage;
