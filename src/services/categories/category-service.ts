import { RideCategory } from "@/types/pricing";

class CategoryService {
  async getCategories(): Promise<RideCategory[]> {
    return [
      { key: "carros", label: "Carros", description: "Viagens confortáveis" },
      { key: "motos", label: "Motos", description: "Mais rápido no trânsito" },
      { key: "fretes", label: "Fretes", description: "Mudanças e transportes" },
      { key: "guincho", label: "Guincho", description: "Resgate de veículos" },
      { key: "envios", label: "Envios", description: "Entregas rápidas" },
    ];
  }
}

export const categoryService = new CategoryService();
