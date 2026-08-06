export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      cancellation_fees: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          passenger_id: string
          reason: string | null
          ride_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          passenger_id: string
          reason?: string | null
          ride_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          passenger_id?: string
          reason?: string | null
          ride_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_fees_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          approval_status: Database["public"]["Enums"]["driver_approval_status"]
          category: string
          created_at: string
          current_lat: number | null
          current_lng: number | null
          email: string
          id: string
          is_online: boolean
          last_location_at: string | null
          name: string
          phone: string
          rating: number
          subscription_status: Database["public"]["Enums"]["driver_subscription_status"]
          updated_at: string
          user_id: string
          vehicle_color: string
          vehicle_model: string
          vehicle_plate: string
        }
        Insert: {
          approval_status?: Database["public"]["Enums"]["driver_approval_status"]
          category: string
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          email: string
          id?: string
          is_online?: boolean
          last_location_at?: string | null
          name: string
          phone: string
          rating?: number
          subscription_status?: Database["public"]["Enums"]["driver_subscription_status"]
          updated_at?: string
          user_id: string
          vehicle_color: string
          vehicle_model: string
          vehicle_plate: string
        }
        Update: {
          approval_status?: Database["public"]["Enums"]["driver_approval_status"]
          category?: string
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          email?: string
          id?: string
          is_online?: boolean
          last_location_at?: string | null
          name?: string
          phone?: string
          rating?: number
          subscription_status?: Database["public"]["Enums"]["driver_subscription_status"]
          updated_at?: string
          user_id?: string
          vehicle_color?: string
          vehicle_model?: string
          vehicle_plate?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          data: Json
          error: string | null
          event: string
          id: string
          ride_id: string | null
          status: string
          title: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          data?: Json
          error?: string | null
          event: string
          id?: string
          ride_id?: string | null
          status?: string
          title?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          data?: Json
          error?: string | null
          event?: string
          id?: string
          ride_id?: string | null
          status?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      passenger_wallets: {
        Row: {
          balance: number | null
          blocked_reason: string | null
          created_at: string | null
          currency: string | null
          id: string
          is_blocked: boolean | null
          passenger_id: string
          updated_at: string | null
        }
        Insert: {
          balance?: number | null
          blocked_reason?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          is_blocked?: boolean | null
          passenger_id: string
          updated_at?: string | null
        }
        Update: {
          balance?: number | null
          blocked_reason?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          is_blocked?: boolean | null
          passenger_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "passenger_wallets_passenger_id_fkey"
            columns: ["passenger_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          requires_balance: boolean | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          requires_balance?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          requires_balance?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ride_categories: {
        Row: {
          capacity_label: string | null
          code: string
          created_at: string | null
          description: string | null
          eta_label: string | null
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          capacity_label?: string | null
          code: string
          created_at?: string | null
          description?: string | null
          eta_label?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          capacity_label?: string | null
          code?: string
          created_at?: string | null
          description?: string | null
          eta_label?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rides: {
        Row: {
          accepted_at: string | null
          cancellation_fee: number | null
          cancellation_reason: string | null
          cancelled_by: string | null
          category: string
          completed_at: string | null
          created_at: string
          destination: Json
          destination_lat: number
          destination_lng: number
          destination_name: string
          distance_km: number | null
          driver_arrived_at: string | null
          driver_heading: number | null
          driver_id: string | null
          driver_latitude: number | null
          driver_longitude: number | null
          driver_name: string | null
          driver_phone: string | null
          driver_photo: string | null
          driver_rating: number | null
          driver_vehicle_color: string | null
          driver_vehicle_model: string | null
          driver_vehicle_plate: string | null
          duration_min: number | null
          encoded_polyline: string | null
          estimated_price: number | null
          final_price: number | null
          id: string
          intermediates: Json | null
          origin: Json
          origin_lat: number
          origin_lng: number
          origin_name: string
          passenger_id: string
          passenger_rating: number | null
          passenger_rating_comment: string | null
          payment_method: string
          security_code: string | null
          service_details: Json | null
          share_token: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["ride_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          cancellation_fee?: number | null
          cancellation_reason?: string | null
          cancelled_by?: string | null
          category: string
          completed_at?: string | null
          created_at?: string
          destination: Json
          destination_lat: number
          destination_lng: number
          destination_name: string
          distance_km?: number | null
          driver_arrived_at?: string | null
          driver_heading?: number | null
          driver_id?: string | null
          driver_latitude?: number | null
          driver_longitude?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          driver_photo?: string | null
          driver_rating?: number | null
          driver_vehicle_color?: string | null
          driver_vehicle_model?: string | null
          driver_vehicle_plate?: string | null
          duration_min?: number | null
          encoded_polyline?: string | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          intermediates?: Json | null
          origin: Json
          origin_lat: number
          origin_lng: number
          origin_name: string
          passenger_id: string
          passenger_rating?: number | null
          passenger_rating_comment?: string | null
          payment_method: string
          security_code?: string | null
          service_details?: Json | null
          share_token?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ride_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          cancellation_fee?: number | null
          cancellation_reason?: string | null
          cancelled_by?: string | null
          category?: string
          completed_at?: string | null
          created_at?: string
          destination?: Json
          destination_lat?: number
          destination_lng?: number
          destination_name?: string
          distance_km?: number | null
          driver_arrived_at?: string | null
          driver_heading?: number | null
          driver_id?: string | null
          driver_latitude?: number | null
          driver_longitude?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          driver_photo?: string | null
          driver_rating?: number | null
          driver_vehicle_color?: string | null
          driver_vehicle_model?: string | null
          driver_vehicle_plate?: string | null
          duration_min?: number | null
          encoded_polyline?: string | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          intermediates?: Json | null
          origin?: Json
          origin_lat?: number
          origin_lng?: number
          origin_name?: string
          passenger_id?: string
          passenger_rating?: number | null
          passenger_rating_comment?: string | null
          payment_method?: string
          security_code?: string | null
          service_details?: Json | null
          share_token?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ride_status"]
          updated_at?: string
        }
        Relationships: []
      }
      tariff_rules: {
        Row: {
          base_fare: number
          category_id: string | null
          city: string | null
          created_at: string | null
          dynamic_multiplier: number | null
          fixed_fee: number
          id: string
          is_active: boolean | null
          min_fare: number
          per_km: number
          per_min: number
          stop_fee: number
          updated_at: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          base_fare?: number
          category_id?: string | null
          city?: string | null
          created_at?: string | null
          dynamic_multiplier?: number | null
          fixed_fee?: number
          id?: string
          is_active?: boolean | null
          min_fare?: number
          per_km?: number
          per_min?: number
          stop_fee?: number
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          base_fare?: number
          category_id?: string | null
          city?: string | null
          created_at?: string | null
          dynamic_multiplier?: number | null
          fixed_fee?: number
          id?: string
          is_active?: boolean | null
          min_fare?: number
          per_km?: number
          per_min?: number
          stop_fee?: number
          updated_at?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tariff_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ride_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          created_at: string
          promotions: boolean
          ride_requests: boolean
          ride_updates: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          promotions?: boolean
          ride_requests?: boolean
          ride_updates?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          promotions?: boolean
          ride_requests?: boolean
          ride_updates?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notification_tokens: {
        Row: {
          created_at: string
          device_id: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          permission_status: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          permission_status?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          permission_status?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string | null
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id?: string | null
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          average_rating: number | null
          block_reason: string | null
          blocked_at: string | null
          city: string | null
          completed_rides: number | null
          created_at: string | null
          email: string | null
          id: string
          last_login_at: string | null
          name: string | null
          phone: string | null
          suspended_at: string | null
          total_ratings: number | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          average_rating?: number | null
          block_reason?: string | null
          blocked_at?: string | null
          city?: string | null
          completed_rides?: number | null
          created_at?: string | null
          email?: string | null
          id?: string
          last_login_at?: string | null
          name?: string | null
          phone?: string | null
          suspended_at?: string | null
          total_ratings?: number | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          average_rating?: number | null
          block_reason?: string | null
          blocked_at?: string | null
          city?: string | null
          completed_rides?: number | null
          created_at?: string | null
          email?: string | null
          id?: string
          last_login_at?: string | null
          name?: string | null
          phone?: string | null
          suspended_at?: string | null
          total_ratings?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      deactivate_notification_token: {
        Args: { _token: string }
        Returns: boolean
      }
      get_my_notification_preferences: {
        Args: never
        Returns: {
          created_at: string
          promotions: boolean
          ride_requests: boolean
          ride_updates: boolean
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_notification_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_notification_delivery: {
        Args: {
          _body?: string
          _data?: Json
          _error?: string
          _event: string
          _ride_id?: string
          _status: string
          _title?: string
          _user_id: string
        }
        Returns: string
      }
      register_notification_token: {
        Args: {
          _device_id?: string
          _permission_status?: string
          _platform?: string
          _token: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "passenger" | "driver"
      driver_approval_status:
        | "pendente"
        | "em_analise"
        | "aprovado"
        | "rejeitado"
        | "bloqueado"
      driver_subscription_status: "ativa" | "vencida" | "cancelada" | "teste"
      payment_status: "pendente" | "pago" | "falhou" | "estornado"
      ride_status:
        | "agendada"
        | "procurar_motorista"
        | "motorista_a_caminho"
        | "motorista_chegou"
        | "em_viagem"
        | "finalizada"
        | "cancelada_passageiro"
        | "cancelada_motorista"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user", "passenger", "driver"],
      driver_approval_status: [
        "pendente",
        "em_analise",
        "aprovado",
        "rejeitado",
        "bloqueado",
      ],
      driver_subscription_status: ["ativa", "vencida", "cancelada", "teste"],
      payment_status: ["pendente", "pago", "falhou", "estornado"],
      ride_status: [
        "agendada",
        "procurar_motorista",
        "motorista_a_caminho",
        "motorista_chegou",
        "em_viagem",
        "finalizada",
        "cancelada_passageiro",
        "cancelada_motorista",
      ],
    },
  },
} as const
