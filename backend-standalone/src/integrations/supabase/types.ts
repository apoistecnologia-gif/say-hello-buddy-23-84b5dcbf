export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          after: Json | null;
          before: Json | null;
          created_at: string;
          entity: string;
          entity_id: string | null;
          id: string;
          ip: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity: string;
          entity_id?: string | null;
          id?: string;
          ip?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity?: string;
          entity_id?: string | null;
          id?: string;
          ip?: string | null;
        };
        Relationships: [];
      };
      admin_driver_notes: {
        Row: {
          admin_id: string;
          created_at: string;
          driver_id: string;
          id: string;
          note: string;
        };
        Insert: {
          admin_id: string;
          created_at?: string;
          driver_id: string;
          id?: string;
          note: string;
        };
        Update: {
          admin_id?: string;
          created_at?: string;
          driver_id?: string;
          id?: string;
          note?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_driver_notes_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_login_history: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          ip: string | null;
          success: boolean;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          ip?: string | null;
          success?: boolean;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          ip?: string | null;
          success?: boolean;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      admin_passenger_notes: {
        Row: {
          admin_id: string;
          created_at: string;
          id: string;
          note: string;
          passenger_id: string;
        };
        Insert: {
          admin_id: string;
          created_at?: string;
          id?: string;
          note: string;
          passenger_id: string;
        };
        Update: {
          admin_id?: string;
          created_at?: string;
          id?: string;
          note?: string;
          passenger_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_passenger_notes_passenger_id_fkey";
            columns: ["passenger_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_settings: {
        Row: {
          description: string | null;
          id: string;
          key: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          description?: string | null;
          id?: string;
          key: string;
          updated_at?: string;
          value?: Json;
        };
        Update: {
          description?: string | null;
          id?: string;
          key?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [];
      };
      admin_subscription_notes: {
        Row: {
          admin_user_id: string;
          created_at: string;
          id: string;
          note: string;
          subscription_id: string;
        };
        Insert: {
          admin_user_id: string;
          created_at?: string;
          id?: string;
          note: string;
          subscription_id: string;
        };
        Update: {
          admin_user_id?: string;
          created_at?: string;
          id?: string;
          note?: string;
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_subscription_notes_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_users_meta: {
        Row: {
          created_at: string;
          display_name: string | null;
          last_login_at: string | null;
          phone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          last_login_at?: string | null;
          phone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          last_login_at?: string | null;
          phone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          category: string;
          description: string | null;
          is_public: boolean;
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: Json;
        };
        Insert: {
          category?: string;
          description?: string | null;
          is_public?: boolean;
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value: Json;
        };
        Update: {
          category?: string;
          description?: string | null;
          is_public?: boolean;
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Relationships: [];
      };
      backups: {
        Row: {
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          error: string | null;
          file_path: string | null;
          id: string;
          size_bytes: number | null;
          status: string;
          tables: Json | null;
          type: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          file_path?: string | null;
          id?: string;
          size_bytes?: number | null;
          status?: string;
          tables?: Json | null;
          type?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          file_path?: string | null;
          id?: string;
          size_bytes?: number | null;
          status?: string;
          tables?: Json | null;
          type?: string;
        };
        Relationships: [];
      };
      cancellation_fees: {
        Row: {
          cancelled_by: string;
          created_at: string;
          driver_credit: number;
          driver_id: string | null;
          fee_amount: number;
          id: string;
          is_paid: boolean;
          mp_expires_at: string | null;
          mp_payment_id: string | null;
          mp_qr_code: string | null;
          mp_qr_code_base64: string | null;
          mp_ticket_url: string | null;
          paid_at: string | null;
          passenger_id: string;
          platform_fee: number;
          ride_id: string;
          ride_status_at_cancel: string;
          seconds_since_accept: number | null;
          updated_at: string;
        };
        Insert: {
          cancelled_by: string;
          created_at?: string;
          driver_credit?: number;
          driver_id?: string | null;
          fee_amount?: number;
          id?: string;
          is_paid?: boolean;
          mp_expires_at?: string | null;
          mp_payment_id?: string | null;
          mp_qr_code?: string | null;
          mp_qr_code_base64?: string | null;
          mp_ticket_url?: string | null;
          paid_at?: string | null;
          passenger_id: string;
          platform_fee?: number;
          ride_id: string;
          ride_status_at_cancel: string;
          seconds_since_accept?: number | null;
          updated_at?: string;
        };
        Update: {
          cancelled_by?: string;
          created_at?: string;
          driver_credit?: number;
          driver_id?: string | null;
          fee_amount?: number;
          id?: string;
          is_paid?: boolean;
          mp_expires_at?: string | null;
          mp_payment_id?: string | null;
          mp_qr_code?: string | null;
          mp_qr_code_base64?: string | null;
          mp_ticket_url?: string | null;
          paid_at?: string | null;
          passenger_id?: string;
          platform_fee?: number;
          ride_id?: string;
          ride_status_at_cancel?: string;
          seconds_since_accept?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cancellation_fees_ride_id_fkey";
            columns: ["ride_id"];
            isOneToOne: false;
            referencedRelation: "rides";
            referencedColumns: ["id"];
          },
        ];
      };
      coupon_redemptions: {
        Row: {
          amount: number;
          coupon_id: string;
          created_at: string;
          id: string;
          ride_id: string | null;
          user_id: string;
        };
        Insert: {
          amount?: number;
          coupon_id: string;
          created_at?: string;
          id?: string;
          ride_id?: string | null;
          user_id: string;
        };
        Update: {
          amount?: number;
          coupon_id?: string;
          created_at?: string;
          id?: string;
          ride_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
        ];
      };
      coupons: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          enabled: boolean;
          id: string;
          max_discount: number | null;
          scope_category: string | null;
          type: string;
          updated_at: string;
          usage_limit: number | null;
          used_count: number;
          valid_from: string | null;
          valid_to: string | null;
          value: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          enabled?: boolean;
          id?: string;
          max_discount?: number | null;
          scope_category?: string | null;
          type: string;
          updated_at?: string;
          usage_limit?: number | null;
          used_count?: number;
          valid_from?: string | null;
          valid_to?: string | null;
          value?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          enabled?: boolean;
          id?: string;
          max_discount?: number | null;
          scope_category?: string | null;
          type?: string;
          updated_at?: string;
          usage_limit?: number | null;
          used_count?: number;
          valid_from?: string | null;
          valid_to?: string | null;
          value?: number;
        };
        Relationships: [];
      };
      driver_amenities: {
        Row: {
          air_conditioning: boolean;
          candy: boolean;
          charger: boolean;
          child_seat: boolean;
          created_at: string;
          large_luggage: boolean;
          music_on_demand: boolean;
          pet_friendly: boolean;
          quiet_ride: boolean;
          updated_at: string;
          user_id: string;
          water: boolean;
          wifi: boolean;
        };
        Insert: {
          air_conditioning?: boolean;
          candy?: boolean;
          charger?: boolean;
          child_seat?: boolean;
          created_at?: string;
          large_luggage?: boolean;
          music_on_demand?: boolean;
          pet_friendly?: boolean;
          quiet_ride?: boolean;
          updated_at?: string;
          user_id: string;
          water?: boolean;
          wifi?: boolean;
        };
        Update: {
          air_conditioning?: boolean;
          candy?: boolean;
          charger?: boolean;
          child_seat?: boolean;
          created_at?: string;
          large_luggage?: boolean;
          music_on_demand?: boolean;
          pet_friendly?: boolean;
          quiet_ride?: boolean;
          updated_at?: string;
          user_id?: string;
          water?: boolean;
          wifi?: boolean;
        };
        Relationships: [];
      };
      driver_announcements: {
        Row: {
          active: boolean;
          audience: string;
          body: string;
          created_at: string;
          ends_at: string | null;
          id: string;
          starts_at: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          audience?: string;
          body: string;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          starts_at?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          audience?: string;
          body?: string;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          starts_at?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      driver_documents: {
        Row: {
          created_at: string;
          driver_id: string;
          expires_at: string | null;
          file_url: string | null;
          id: string;
          rejected_reason: string | null;
          status: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          driver_id: string;
          expires_at?: string | null;
          file_url?: string | null;
          id?: string;
          rejected_reason?: string | null;
          status?: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          driver_id?: string;
          expires_at?: string | null;
          file_url?: string | null;
          id?: string;
          rejected_reason?: string | null;
          status?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "driver_documents_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
        ];
      };
      driver_emergency_contacts: {
        Row: {
          created_at: string;
          driver_user_id: string;
          id: string;
          is_primary: boolean;
          name: string;
          phone: string;
          relation: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          driver_user_id: string;
          id?: string;
          is_primary?: boolean;
          name: string;
          phone: string;
          relation?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          driver_user_id?: string;
          id?: string;
          is_primary?: boolean;
          name?: string;
          phone?: string;
          relation?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      driver_payment_events: {
        Row: {
          asaas_event: string | null;
          asaas_payment_id: string | null;
          asaas_subscription_id: string | null;
          created_at: string;
          driver_id: string | null;
          due_date: string | null;
          event_type: string | null;
          id: string;
          invoice_url: string | null;
          mp_payment_id: string | null;
          mp_preapproval_id: string | null;
          paid_at: string | null;
          provider: string;
          raw_payload: Json;
          status: string | null;
          value: number | null;
        };
        Insert: {
          asaas_event?: string | null;
          asaas_payment_id?: string | null;
          asaas_subscription_id?: string | null;
          created_at?: string;
          driver_id?: string | null;
          due_date?: string | null;
          event_type?: string | null;
          id?: string;
          invoice_url?: string | null;
          mp_payment_id?: string | null;
          mp_preapproval_id?: string | null;
          paid_at?: string | null;
          provider?: string;
          raw_payload: Json;
          status?: string | null;
          value?: number | null;
        };
        Update: {
          asaas_event?: string | null;
          asaas_payment_id?: string | null;
          asaas_subscription_id?: string | null;
          created_at?: string;
          driver_id?: string | null;
          due_date?: string | null;
          event_type?: string | null;
          id?: string;
          invoice_url?: string | null;
          mp_payment_id?: string | null;
          mp_preapproval_id?: string | null;
          paid_at?: string | null;
          provider?: string;
          raw_payload?: Json;
          status?: string | null;
          value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "driver_payment_events_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["id"];
          },
        ];
      };
      driver_preferences: {
        Row: {
          accept_card: boolean;
          accept_cash: boolean;
          accept_long: boolean;
          accept_pix: boolean;
          accept_short: boolean;
          created_at: string;
          language: string;
          max_radius_km: number;
          navigation_app: string;
          push: boolean;
          ride_alerts: boolean;
          sound: boolean;
          theme: string;
          updated_at: string;
          user_id: string;
          vibration: boolean;
        };
        Insert: {
          accept_card?: boolean;
          accept_cash?: boolean;
          accept_long?: boolean;
          accept_pix?: boolean;
          accept_short?: boolean;
          created_at?: string;
          language?: string;
          max_radius_km?: number;
          navigation_app?: string;
          push?: boolean;
          ride_alerts?: boolean;
          sound?: boolean;
          theme?: string;
          updated_at?: string;
          user_id: string;
          vibration?: boolean;
        };
        Update: {
          accept_card?: boolean;
          accept_cash?: boolean;
          accept_long?: boolean;
          accept_pix?: boolean;
          accept_short?: boolean;
          created_at?: string;
          language?: string;
          max_radius_km?: number;
          navigation_app?: string;
          push?: boolean;
          ride_alerts?: boolean;
          sound?: boolean;
          theme?: string;
          updated_at?: string;
          user_id?: string;
          vibration?: boolean;
        };
        Relationships: [];
      };
      driver_public_locations: {
        Row: {
          category: string | null;
          current_heading: number | null;
          current_lat: number | null;
          current_lng: number | null;
          current_speed: number | null;
          is_online: boolean;
          last_location_at: string | null;
          name: string | null;
          photo_url: string | null;
          rating: number | null;
          updated_at: string;
          user_id: string;
          vehicle_color: string | null;
          vehicle_model: string | null;
        };
        Insert: {
          category?: string | null;
          current_heading?: number | null;
          current_lat?: number | null;
          current_lng?: number | null;
          current_speed?: number | null;
          is_online?: boolean;
          last_location_at?: string | null;
          name?: string | null;
          photo_url?: string | null;
          rating?: number | null;
          updated_at?: string;
          user_id: string;
          vehicle_color?: string | null;
          vehicle_model?: string | null;
        };
        Update: {
          category?: string | null;
          current_heading?: number | null;
          current_lat?: number | null;
          current_lng?: number | null;
          current_speed?: number | null;
          is_online?: boolean;
          last_location_at?: string | null;
          name?: string | null;
          photo_url?: string | null;
          rating?: number | null;
          updated_at?: string;
          user_id?: string;
          vehicle_color?: string | null;
          vehicle_model?: string | null;
        };
        Relationships: [];
      };
      driver_reports: {
        Row: {
          created_at: string;
          details: string | null;
          driver_id: string;
          id: string;
          passenger_id: string;
          reason: string;
          ride_id: string | null;
        };
        Insert: {
          created_at?: string;
          details?: string | null;
          driver_id: string;
          id?: string;
          passenger_id: string;
          reason: string;
          ride_id?: string | null;
        };
        Update: {
          created_at?: string;
          details?: string | null;
          driver_id?: string;
          id?: string;
          passenger_id?: string;
          reason?: string;
          ride_id?: string | null;
        };
        Relationships: [];
      };
      driver_wallet_transactions: {
        Row: {
          amount: number;
          available_at: string | null;
          created_at: string;
          description: string | null;
          driver_id: string;
          id: string;
          metadata: Json;
          source: Database["public"]["Enums"]["driver_wallet_tx_source"];
          source_ride_id: string | null;
          status: Database["public"]["Enums"]["driver_wallet_tx_status"];
          updated_at: string;
          withdrawn_at: string | null;
        };
        Insert: {
          amount: number;
          available_at?: string | null;
          created_at?: string;
          description?: string | null;
          driver_id: string;
          id?: string;
          metadata?: Json;
          source: Database["public"]["Enums"]["driver_wallet_tx_source"];
          source_ride_id?: string | null;
          status?: Database["public"]["Enums"]["driver_wallet_tx_status"];
          updated_at?: string;
          withdrawn_at?: string | null;
        };
        Update: {
          amount?: number;
          available_at?: string | null;
          created_at?: string;
          description?: string | null;
          driver_id?: string;
          id?: string;
          metadata?: Json;
          source?: Database["public"]["Enums"]["driver_wallet_tx_source"];
          source_ride_id?: string | null;
          status?: Database["public"]["Enums"]["driver_wallet_tx_status"];
          updated_at?: string;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "driver_wallet_transactions_source_ride_id_fkey";
            columns: ["source_ride_id"];
            isOneToOne: false;
            referencedRelation: "rides";
            referencedColumns: ["id"];
          },
        ];
      };
      driver_wallets: {
        Row: {
          available_balance: number;
          created_at: string;
          currency: string;
          driver_id: string;
          id: string;
          last_transaction_at: string | null;
          pending_balance: number;
          updated_at: string;
          wallet_balance: number;
          wallet_status: Database["public"]["Enums"]["wallet_status"];
        };
        Insert: {
          available_balance?: number;
          created_at?: string;
          currency?: string;
          driver_id: string;
          id?: string;
          last_transaction_at?: string | null;
          pending_balance?: number;
          updated_at?: string;
          wallet_balance?: number;
          wallet_status?: Database["public"]["Enums"]["wallet_status"];
        };
        Update: {
          available_balance?: number;
          created_at?: string;
          currency?: string;
          driver_id?: string;
          id?: string;
          last_transaction_at?: string | null;
          pending_balance?: number;
          updated_at?: string;
          wallet_balance?: number;
          wallet_status?: Database["public"]["Enums"]["wallet_status"];
        };
        Relationships: [];
      };
      driver_withdrawals: {
        Row: {
          amount: number;
          created_at: string;
          driver_id: string;
          failure_reason: string | null;
          id: string;
          mp_end_to_end_id: string | null;
          mp_response: Json | null;
          mp_transfer_id: string | null;
          paid_at: string | null;
          pix_holder_name: string | null;
          pix_key: string;
          pix_key_type: Database["public"]["Enums"]["pix_key_type"];
          processed_at: string | null;
          requested_at: string;
          status: string;
          updated_at: string;
          wallet_tx_id: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string;
          driver_id: string;
          failure_reason?: string | null;
          id?: string;
          mp_end_to_end_id?: string | null;
          mp_response?: Json | null;
          mp_transfer_id?: string | null;
          paid_at?: string | null;
          pix_holder_name?: string | null;
          pix_key: string;
          pix_key_type: Database["public"]["Enums"]["pix_key_type"];
          processed_at?: string | null;
          requested_at?: string;
          status?: string;
          updated_at?: string;
          wallet_tx_id?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          driver_id?: string;
          failure_reason?: string | null;
          id?: string;
          mp_end_to_end_id?: string | null;
          mp_response?: Json | null;
          mp_transfer_id?: string | null;
          paid_at?: string | null;
          pix_holder_name?: string | null;
          pix_key?: string;
          pix_key_type?: Database["public"]["Enums"]["pix_key_type"];
          processed_at?: string | null;
          requested_at?: string;
          status?: string;
          updated_at?: string;
          wallet_tx_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "driver_withdrawals_wallet_tx_id_fkey";
            columns: ["wallet_tx_id"];
            isOneToOne: false;
            referencedRelation: "driver_wallet_transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      drivers: {
        Row: {
          approval_status: Database["public"]["Enums"]["driver_approval_status"];
          approved_at: string | null;
          asaas_customer_id: string | null;
          asaas_subscription_id: string | null;
          average_rating: number;
          birth_date: string | null;
          blocked_at: string | null;
          category: Database["public"]["Enums"]["ride_category"];
          city: string;
          cnh_back_url: string | null;
          cnh_url: string | null;
          completed_rides: number;
          cpf: string;
          created_at: string;
          current_heading: number | null;
          current_lat: number | null;
          current_lng: number | null;
          current_speed: number | null;
          documents_status: string;
          email: string;
          financial_status: Database["public"]["Enums"]["driver_financial_status"];
          id: string;
          insurance_url: string | null;
          is_online: boolean;
          last_invoice_url: string | null;
          last_location_at: string | null;
          last_payment_id: string | null;
          last_payment_status: string | null;
          mercadopago_init_point: string | null;
          mercadopago_payer_id: string | null;
          mercadopago_preapproval_id: string | null;
          motivo_reprovacao: string | null;
          name: string;
          next_due_date: string | null;
          payment_status: string;
          phone: string;
          photo_url: string | null;
          pix_holder_name: string | null;
          pix_key: string | null;
          pix_key_type: Database["public"]["Enums"]["pix_key_type"] | null;
          rating: number;
          selfie_url: string | null;
          state: string;
          subscription_admin_note: string | null;
          subscription_expires_at: string | null;
          subscription_grace_days: number;
          subscription_status: Database["public"]["Enums"]["driver_subscription_status"];
          subscription_value: number | null;
          suspended_at: string | null;
          total_ratings: number;
          updated_at: string;
          user_id: string;
          vehicle_color: string;
          vehicle_document_url: string | null;
          vehicle_model: string;
          vehicle_photo_url: string | null;
          vehicle_plate: string;
          vehicle_year: number;
        };
        Insert: {
          approval_status?: Database["public"]["Enums"]["driver_approval_status"];
          approved_at?: string | null;
          asaas_customer_id?: string | null;
          asaas_subscription_id?: string | null;
          average_rating?: number;
          birth_date?: string | null;
          blocked_at?: string | null;
          category: Database["public"]["Enums"]["ride_category"];
          city: string;
          cnh_back_url?: string | null;
          cnh_url?: string | null;
          completed_rides?: number;
          cpf: string;
          created_at?: string;
          current_heading?: number | null;
          current_lat?: number | null;
          current_lng?: number | null;
          current_speed?: number | null;
          documents_status?: string;
          email: string;
          financial_status?: Database["public"]["Enums"]["driver_financial_status"];
          id?: string;
          insurance_url?: string | null;
          is_online?: boolean;
          last_invoice_url?: string | null;
          last_location_at?: string | null;
          last_payment_id?: string | null;
          last_payment_status?: string | null;
          mercadopago_init_point?: string | null;
          mercadopago_payer_id?: string | null;
          mercadopago_preapproval_id?: string | null;
          motivo_reprovacao?: string | null;
          name: string;
          next_due_date?: string | null;
          payment_status?: string;
          phone: string;
          photo_url?: string | null;
          pix_holder_name?: string | null;
          pix_key?: string | null;
          pix_key_type?: Database["public"]["Enums"]["pix_key_type"] | null;
          rating?: number;
          selfie_url?: string | null;
          state: string;
          subscription_admin_note?: string | null;
          subscription_expires_at?: string | null;
          subscription_grace_days?: number;
          subscription_status?: Database["public"]["Enums"]["driver_subscription_status"];
          subscription_value?: number | null;
          suspended_at?: string | null;
          total_ratings?: number;
          updated_at?: string;
          user_id: string;
          vehicle_color: string;
          vehicle_document_url?: string | null;
          vehicle_model: string;
          vehicle_photo_url?: string | null;
          vehicle_plate: string;
          vehicle_year: number;
        };
        Update: {
          approval_status?: Database["public"]["Enums"]["driver_approval_status"];
          approved_at?: string | null;
          asaas_customer_id?: string | null;
          asaas_subscription_id?: string | null;
          average_rating?: number;
          birth_date?: string | null;
          blocked_at?: string | null;
          category?: Database["public"]["Enums"]["ride_category"];
          city?: string;
          cnh_back_url?: string | null;
          cnh_url?: string | null;
          completed_rides?: number;
          cpf?: string;
          created_at?: string;
          current_heading?: number | null;
          current_lat?: number | null;
          current_lng?: number | null;
          current_speed?: number | null;
          documents_status?: string;
          email?: string;
          financial_status?: Database["public"]["Enums"]["driver_financial_status"];
          id?: string;
          insurance_url?: string | null;
          is_online?: boolean;
          last_invoice_url?: string | null;
          last_location_at?: string | null;
          last_payment_id?: string | null;
          last_payment_status?: string | null;
          mercadopago_init_point?: string | null;
          mercadopago_payer_id?: string | null;
          mercadopago_preapproval_id?: string | null;
          motivo_reprovacao?: string | null;
          name?: string;
          next_due_date?: string | null;
          payment_status?: string;
          phone?: string;
          photo_url?: string | null;
          pix_holder_name?: string | null;
          pix_key?: string | null;
          pix_key_type?: Database["public"]["Enums"]["pix_key_type"] | null;
          rating?: number;
          selfie_url?: string | null;
          state?: string;
          subscription_admin_note?: string | null;
          subscription_expires_at?: string | null;
          subscription_grace_days?: number;
          subscription_status?: Database["public"]["Enums"]["driver_subscription_status"];
          subscription_value?: number | null;
          suspended_at?: string | null;
          total_ratings?: number;
          updated_at?: string;
          user_id?: string;
          vehicle_color?: string;
          vehicle_document_url?: string | null;
          vehicle_model?: string;
          vehicle_photo_url?: string | null;
          vehicle_plate?: string;
          vehicle_year?: number;
        };
        Relationships: [];
      };
      favorite_drivers: {
        Row: {
          created_at: string;
          driver_id: string;
          id: string;
          passenger_id: string;
        };
        Insert: {
          created_at?: string;
          driver_id: string;
          id?: string;
          passenger_id: string;
        };
        Update: {
          created_at?: string;
          driver_id?: string;
          id?: string;
          passenger_id?: string;
        };
        Relationships: [];
      };
      favorite_places: {
        Row: {
          address: string;
          created_at: string;
          icon: string | null;
          id: string;
          kind: string;
          label: string;
          lat: number;
          lng: number;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          address: string;
          created_at?: string;
          icon?: string | null;
          id?: string;
          kind?: string;
          label: string;
          lat: number;
          lng: number;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          address?: string;
          created_at?: string;
          icon?: string | null;
          id?: string;
          kind?: string;
          label?: string;
          lat?: number;
          lng?: number;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      financial_transactions: {
        Row: {
          amount: number;
          created_at: string;
          currency: string;
          description: string | null;
          driver_id: string | null;
          id: string;
          metadata: Json;
          method: Database["public"]["Enums"]["payment_method_kind"] | null;
          passenger_id: string | null;
          reference_id: string | null;
          status: Database["public"]["Enums"]["financial_txn_status"];
          type: Database["public"]["Enums"]["financial_txn_type"];
          updated_at: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          currency?: string;
          description?: string | null;
          driver_id?: string | null;
          id?: string;
          metadata?: Json;
          method?: Database["public"]["Enums"]["payment_method_kind"] | null;
          passenger_id?: string | null;
          reference_id?: string | null;
          status?: Database["public"]["Enums"]["financial_txn_status"];
          type: Database["public"]["Enums"]["financial_txn_type"];
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          currency?: string;
          description?: string | null;
          driver_id?: string | null;
          id?: string;
          metadata?: Json;
          method?: Database["public"]["Enums"]["payment_method_kind"] | null;
          passenger_id?: string | null;
          reference_id?: string | null;
          status?: Database["public"]["Enums"]["financial_txn_status"];
          type?: Database["public"]["Enums"]["financial_txn_type"];
          updated_at?: string;
        };
        Relationships: [];
      };
      gps_diagnostics: {
        Row: {
          code: string | null;
          created_at: string;
          event: string;
          extra: Json | null;
          id: string;
          message: string | null;
          url: string | null;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          code?: string | null;
          created_at?: string;
          event: string;
          extra?: Json | null;
          id?: string;
          message?: string | null;
          url?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          code?: string | null;
          created_at?: string;
          event?: string;
          extra?: Json | null;
          id?: string;
          message?: string | null;
          url?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      incident_reports: {
        Row: {
          category: string;
          created_at: string;
          description: string | null;
          id: string;
          ride_id: string | null;
          role: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          ride_id?: string | null;
          role: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          ride_id?: string | null;
          role?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incident_reports_ride_id_fkey";
            columns: ["ride_id"];
            isOneToOne: false;
            referencedRelation: "rides";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_channels: {
        Row: {
          channel: string;
          created_at: string;
          credentials_secret_name: string | null;
          display_name: string;
          enabled: boolean;
          extra: Json;
          from_address: string | null;
          id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          channel: string;
          created_at?: string;
          credentials_secret_name?: string | null;
          display_name: string;
          enabled?: boolean;
          extra?: Json;
          from_address?: string | null;
          id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          channel?: string;
          created_at?: string;
          credentials_secret_name?: string | null;
          display_name?: string;
          enabled?: boolean;
          extra?: Json;
          from_address?: string | null;
          id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      notification_inbox: {
        Row: {
          body: string | null;
          category: string;
          created_at: string;
          data: Json;
          id: string;
          read_at: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          category?: string;
          created_at?: string;
          data?: Json;
          id?: string;
          read_at?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          category?: string;
          created_at?: string;
          data?: Json;
          id?: string;
          read_at?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      notification_logs: {
        Row: {
          body: string | null;
          channel: string;
          created_at: string;
          data: Json | null;
          error: string | null;
          event: string;
          id: string;
          status: string;
          title: string | null;
          user_id: string | null;
        };
        Insert: {
          body?: string | null;
          channel?: string;
          created_at?: string;
          data?: Json | null;
          error?: string | null;
          event: string;
          id?: string;
          status?: string;
          title?: string | null;
          user_id?: string | null;
        };
        Update: {
          body?: string | null;
          channel?: string;
          created_at?: string;
          data?: Json | null;
          error?: string | null;
          event?: string;
          id?: string;
          status?: string;
          title?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          data: Json;
          id: string;
          read_at: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          read_at?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          read_at?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      notifications_broadcast: {
        Row: {
          audience_filter: Json | null;
          audience_type: string;
          body: string;
          delivery_count: number;
          id: string;
          sent_at: string;
          sent_by: string | null;
          title: string;
        };
        Insert: {
          audience_filter?: Json | null;
          audience_type: string;
          body: string;
          delivery_count?: number;
          id?: string;
          sent_at?: string;
          sent_by?: string | null;
          title: string;
        };
        Update: {
          audience_filter?: Json | null;
          audience_type?: string;
          body?: string;
          delivery_count?: number;
          id?: string;
          sent_at?: string;
          sent_by?: string | null;
          title?: string;
        };
        Relationships: [];
      };
      passenger_emergency_contacts: {
        Row: {
          created_at: string;
          id: string;
          is_primary: boolean;
          name: string;
          passenger_user_id: string;
          phone: string;
          relation: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          name: string;
          passenger_user_id: string;
          phone: string;
          relation?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          name?: string;
          passenger_user_id?: string;
          phone?: string;
          relation?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      passenger_wallets: {
        Row: {
          balance: number;
          blocked_reason: string | null;
          created_at: string;
          currency: string;
          id: string;
          is_blocked: boolean;
          passenger_id: string;
          updated_at: string;
        };
        Insert: {
          balance?: number;
          blocked_reason?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          is_blocked?: boolean;
          passenger_id: string;
          updated_at?: string;
        };
        Update: {
          balance?: number;
          blocked_reason?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          is_blocked?: boolean;
          passenger_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_gateways: {
        Row: {
          api_key_secret_name: string | null;
          created_at: string;
          display_name: string;
          enabled: boolean;
          extra: Json;
          id: string;
          mode: string;
          pix_key: string | null;
          pix_key_type: string | null;
          provider: string;
          updated_at: string;
          updated_by: string | null;
          webhook_url: string | null;
        };
        Insert: {
          api_key_secret_name?: string | null;
          created_at?: string;
          display_name: string;
          enabled?: boolean;
          extra?: Json;
          id?: string;
          mode?: string;
          pix_key?: string | null;
          pix_key_type?: string | null;
          provider: string;
          updated_at?: string;
          updated_by?: string | null;
          webhook_url?: string | null;
        };
        Update: {
          api_key_secret_name?: string | null;
          created_at?: string;
          display_name?: string;
          enabled?: boolean;
          extra?: Json;
          id?: string;
          mode?: string;
          pix_key?: string | null;
          pix_key_type?: string | null;
          provider?: string;
          updated_at?: string;
          updated_by?: string | null;
          webhook_url?: string | null;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          method: string | null;
          provider_reference: string | null;
          ride_id: string;
          status: Database["public"]["Enums"]["payment_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          method?: string | null;
          provider_reference?: string | null;
          ride_id: string;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          method?: string | null;
          provider_reference?: string | null;
          ride_id?: string;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_ride_id_fkey";
            columns: ["ride_id"];
            isOneToOne: false;
            referencedRelation: "rides";
            referencedColumns: ["id"];
          },
        ];
      };
      recent_places: {
        Row: {
          address: string;
          created_at: string;
          id: string;
          last_used_at: string;
          lat: number;
          lng: number;
          place_id: string | null;
          use_count: number;
          user_id: string;
        };
        Insert: {
          address: string;
          created_at?: string;
          id?: string;
          last_used_at?: string;
          lat: number;
          lng: number;
          place_id?: string | null;
          use_count?: number;
          user_id: string;
        };
        Update: {
          address?: string;
          created_at?: string;
          id?: string;
          last_used_at?: string;
          lat?: number;
          lng?: number;
          place_id?: string | null;
          use_count?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      ride_categories: {
        Row: {
          color: string;
          created_at: string;
          enabled: boolean;
          icon: string;
          id: string;
          key: string;
          label: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          enabled?: boolean;
          icon?: string;
          id?: string;
          key: string;
          label: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          enabled?: boolean;
          icon?: string;
          id?: string;
          key?: string;
          label?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      ride_ratings: {
        Row: {
          created_at: string;
          driver_comment: string | null;
          driver_id: string | null;
          driver_rated_at: string | null;
          driver_rating: number | null;
          id: string;
          passenger_comment: string | null;
          passenger_id: string | null;
          passenger_rated_at: string | null;
          passenger_rating: number | null;
          ride_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          driver_comment?: string | null;
          driver_id?: string | null;
          driver_rated_at?: string | null;
          driver_rating?: number | null;
          id?: string;
          passenger_comment?: string | null;
          passenger_id?: string | null;
          passenger_rated_at?: string | null;
          passenger_rating?: number | null;
          ride_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          driver_comment?: string | null;
          driver_id?: string | null;
          driver_rated_at?: string | null;
          driver_rating?: number | null;
          id?: string;
          passenger_comment?: string | null;
          passenger_id?: string | null;
          passenger_rated_at?: string | null;
          passenger_rating?: number | null;
          ride_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ride_ratings_ride_id_fkey";
            columns: ["ride_id"];
            isOneToOne: true;
            referencedRelation: "rides";
            referencedColumns: ["id"];
          },
        ];
      };
      ride_tips: {
        Row: {
          amount: number;
          created_at: string;
          driver_id: string | null;
          id: string;
          passenger_id: string;
          ride_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          driver_id?: string | null;
          id?: string;
          passenger_id: string;
          ride_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          driver_id?: string | null;
          id?: string;
          passenger_id?: string;
          ride_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ride_tips_ride_id_fkey";
            columns: ["ride_id"];
            isOneToOne: false;
            referencedRelation: "rides";
            referencedColumns: ["id"];
          },
        ];
      };
      rides: {
        Row: {
          accepted_at: string | null;
          accepted_driver_id: string | null;
          cancel_reason: string | null;
          cancellation_fee_eligible: boolean;
          cancelled_at: string | null;
          cancelled_by: string | null;
          candidate_driver_ids: string[];
          category: Database["public"]["Enums"]["ride_category"];
          completed_at: string | null;
          coupon_id: string | null;
          created_at: string;
          current_offer_driver_id: string | null;
          destination_lat: number;
          destination_lng: number;
          destination_name: string;
          distance_km: number | null;
          driver_distance_to_pickup_at_cancel: number | null;
          driver_id: string | null;
          driver_lat: number | null;
          driver_lng: number | null;
          driver_name: string | null;
          driver_phone: string | null;
          driver_photo_url: string | null;
          driver_rated_at: string | null;
          driver_rating: number | null;
          driver_rating_comment: string | null;
          driver_vehicle: string | null;
          duration_min: number | null;
          estimated_price: number | null;
          fare_breakdown: Json | null;
          final_price: number | null;
          id: string;
          night_multiplier: number;
          offered_driver_ids: string[];
          origin_lat: number;
          origin_lng: number;
          origin_name: string;
          passenger_id: string;
          passenger_photo_url: string | null;
          passenger_rated_at: string | null;
          passenger_rating: number | null;
          passenger_rating_comment: string | null;
          payment_method: string | null;
          payment_received_at: string | null;
          payment_received_by: string | null;
          pickup_address: string | null;
          pickup_label: string | null;
          pickup_place_id: string | null;
          pickup_short_label: string | null;
          pickup_source: string | null;
          rejected_driver_ids: string[];
          queued_after_ride_id: string | null;
          queued_at: string | null;
          request_expires_at: string | null;
          search_expires_at: string | null;
          service_details: Json | null;
          dispatch_attempts: number;
          route_polyline: string | null;
          safety_code: string | null;
          scheduled_for: string | null;
          share_token: string | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["ride_status"];
          surge_multiplier: number;
          updated_at: string;
          waypoints: Json | null;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_driver_id?: string | null;
          cancel_reason?: string | null;
          cancellation_fee_eligible?: boolean;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          candidate_driver_ids?: string[];
          category: Database["public"]["Enums"]["ride_category"];
          completed_at?: string | null;
          coupon_id?: string | null;
          created_at?: string;
          current_offer_driver_id?: string | null;
          destination_lat: number;
          destination_lng: number;
          destination_name: string;
          distance_km?: number | null;
          driver_distance_to_pickup_at_cancel?: number | null;
          driver_id?: string | null;
          driver_lat?: number | null;
          driver_lng?: number | null;
          driver_name?: string | null;
          driver_phone?: string | null;
          driver_photo_url?: string | null;
          driver_rated_at?: string | null;
          driver_rating?: number | null;
          driver_rating_comment?: string | null;
          driver_vehicle?: string | null;
          duration_min?: number | null;
          estimated_price?: number | null;
          fare_breakdown?: Json | null;
          final_price?: number | null;
          id?: string;
          night_multiplier?: number;
          offered_driver_ids?: string[];
          origin_lat: number;
          origin_lng: number;
          origin_name: string;
          passenger_id: string;
          passenger_photo_url?: string | null;
          passenger_rated_at?: string | null;
          passenger_rating?: number | null;
          passenger_rating_comment?: string | null;
          payment_method?: string | null;
          payment_received_at?: string | null;
          payment_received_by?: string | null;
          pickup_address?: string | null;
          pickup_label?: string | null;
          pickup_place_id?: string | null;
          pickup_short_label?: string | null;
          pickup_source?: string | null;
          rejected_driver_ids?: string[];
          queued_after_ride_id?: string | null;
          queued_at?: string | null;
          request_expires_at?: string | null;
          search_expires_at?: string | null;
          service_details?: Json | null;
          dispatch_attempts?: number;
          route_polyline?: string | null;
          safety_code?: string | null;
          scheduled_for?: string | null;
          share_token?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["ride_status"];
          surge_multiplier?: number;
          updated_at?: string;
          waypoints?: Json | null;
        };
        Update: {
          accepted_at?: string | null;
          accepted_driver_id?: string | null;
          cancel_reason?: string | null;
          cancellation_fee_eligible?: boolean;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          candidate_driver_ids?: string[];
          category?: Database["public"]["Enums"]["ride_category"];
          completed_at?: string | null;
          coupon_id?: string | null;
          created_at?: string;
          current_offer_driver_id?: string | null;
          destination_lat?: number;
          destination_lng?: number;
          destination_name?: string;
          distance_km?: number | null;
          driver_distance_to_pickup_at_cancel?: number | null;
          driver_id?: string | null;
          driver_lat?: number | null;
          driver_lng?: number | null;
          driver_name?: string | null;
          driver_phone?: string | null;
          driver_photo_url?: string | null;
          driver_rated_at?: string | null;
          driver_rating?: number | null;
          driver_rating_comment?: string | null;
          driver_vehicle?: string | null;
          duration_min?: number | null;
          estimated_price?: number | null;
          fare_breakdown?: Json | null;
          final_price?: number | null;
          id?: string;
          night_multiplier?: number;
          offered_driver_ids?: string[];
          origin_lat?: number;
          origin_lng?: number;
          origin_name?: string;
          passenger_id?: string;
          passenger_photo_url?: string | null;
          passenger_rated_at?: string | null;
          passenger_rating?: number | null;
          passenger_rating_comment?: string | null;
          payment_method?: string | null;
          payment_received_at?: string | null;
          payment_received_by?: string | null;
          pickup_address?: string | null;
          pickup_label?: string | null;
          pickup_place_id?: string | null;
          pickup_short_label?: string | null;
          pickup_source?: string | null;
          rejected_driver_ids?: string[];
          queued_after_ride_id?: string | null;
          queued_at?: string | null;
          request_expires_at?: string | null;
          search_expires_at?: string | null;
          service_details?: Json | null;
          dispatch_attempts?: number;
          route_polyline?: string | null;
          safety_code?: string | null;
          scheduled_for?: string | null;
          share_token?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["ride_status"];
          surge_multiplier?: number;
          updated_at?: string;
          waypoints?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "rides_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          },
        ];
      };
      security_settings: {
        Row: {
          audit_logs_enabled: boolean;
          id: number;
          max_login_attempts: number;
          password_policy: Json;
          require_2fa: boolean;
          session_timeout_minutes: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          audit_logs_enabled?: boolean;
          id?: number;
          max_login_attempts?: number;
          password_policy?: Json;
          require_2fa?: boolean;
          session_timeout_minutes?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          audit_logs_enabled?: boolean;
          id?: number;
          max_login_attempts?: number;
          password_policy?: Json;
          require_2fa?: boolean;
          session_timeout_minutes?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      sos_alerts: {
        Row: {
          created_at: string;
          id: string;
          lat: number | null;
          lng: number | null;
          message: string | null;
          resolved_at: string | null;
          ride_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          message?: string | null;
          resolved_at?: string | null;
          ride_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          message?: string | null;
          resolved_at?: string | null;
          ride_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sos_alerts_ride_id_fkey";
            columns: ["ride_id"];
            isOneToOne: false;
            referencedRelation: "rides";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_plans: {
        Row: {
          billing_cycle_days: number;
          created_at: string;
          enabled: boolean;
          grace_period_days: number;
          id: string;
          name: string;
          price: number;
          promotional_price: number | null;
          updated_at: string;
        };
        Insert: {
          billing_cycle_days?: number;
          created_at?: string;
          enabled?: boolean;
          grace_period_days?: number;
          id?: string;
          name: string;
          price: number;
          promotional_price?: number | null;
          updated_at?: string;
        };
        Update: {
          billing_cycle_days?: number;
          created_at?: string;
          enabled?: boolean;
          grace_period_days?: number;
          id?: string;
          name?: string;
          price?: number;
          promotional_price?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          amount: number;
          asaas_payment_id: string | null;
          auto_suspend: boolean;
          created_at: string;
          driver_id: string;
          grace_until: string | null;
          id: string;
          invoice_url: string | null;
          paid_at: string | null;
          payment_method: string | null;
          period_end: string | null;
          period_start: string | null;
          pix_copy_paste: string | null;
          pix_qr_code: string | null;
          plan_id: string | null;
          provider_reference: string | null;
          status: Database["public"]["Enums"]["driver_subscription_status"];
          updated_at: string;
        };
        Insert: {
          amount?: number;
          asaas_payment_id?: string | null;
          auto_suspend?: boolean;
          created_at?: string;
          driver_id: string;
          grace_until?: string | null;
          id?: string;
          invoice_url?: string | null;
          paid_at?: string | null;
          payment_method?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          pix_copy_paste?: string | null;
          pix_qr_code?: string | null;
          plan_id?: string | null;
          provider_reference?: string | null;
          status?: Database["public"]["Enums"]["driver_subscription_status"];
          updated_at?: string;
        };
        Update: {
          amount?: number;
          asaas_payment_id?: string | null;
          auto_suspend?: boolean;
          created_at?: string;
          driver_id?: string;
          grace_until?: string | null;
          id?: string;
          invoice_url?: string | null;
          paid_at?: string | null;
          payment_method?: string | null;
          period_end?: string | null;
          period_start?: string | null;
          pix_copy_paste?: string | null;
          pix_qr_code?: string | null;
          plan_id?: string | null;
          provider_reference?: string | null;
          status?: Database["public"]["Enums"]["driver_subscription_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "subscription_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      support_ticket_attachments: {
        Row: {
          created_at: string;
          file_name: string | null;
          file_path: string;
          id: string;
          mime_type: string | null;
          size_bytes: number | null;
          ticket_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          file_name?: string | null;
          file_path: string;
          id?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          ticket_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          file_name?: string | null;
          file_path?: string;
          id?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          ticket_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_ticket_attachments_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "support_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      support_ticket_notes: {
        Row: {
          admin_id: string;
          created_at: string;
          id: string;
          note: string;
          ticket_id: string;
        };
        Insert: {
          admin_id: string;
          created_at?: string;
          id?: string;
          note: string;
          ticket_id: string;
        };
        Update: {
          admin_id?: string;
          created_at?: string;
          id?: string;
          note?: string;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_ticket_notes_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "support_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      support_tickets: {
        Row: {
          admin_status_note: string | null;
          category: string;
          created_at: string;
          description: string;
          id: string;
          priority: string;
          ride_id: string | null;
          status: string;
          subject: string;
          updated_at: string;
          user_id: string;
          user_type: string;
        };
        Insert: {
          admin_status_note?: string | null;
          category?: string;
          created_at?: string;
          description: string;
          id?: string;
          priority?: string;
          ride_id?: string | null;
          status?: string;
          subject: string;
          updated_at?: string;
          user_id: string;
          user_type?: string;
        };
        Update: {
          admin_status_note?: string | null;
          category?: string;
          created_at?: string;
          description?: string;
          id?: string;
          priority?: string;
          ride_id?: string | null;
          status?: string;
          subject?: string;
          updated_at?: string;
          user_id?: string;
          user_type?: string;
        };
        Relationships: [];
      };
      tariff_rules: {
        Row: {
          category_key: string;
          created_at: string;
          field_key: string;
          id: string;
          updated_at: string;
          updated_by: string | null;
          value: number;
        };
        Insert: {
          category_key: string;
          created_at?: string;
          field_key: string;
          id?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: number;
        };
        Update: {
          category_key?: string;
          created_at?: string;
          field_key?: string;
          id?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tariff_rules_category_key_fkey";
            columns: ["category_key"];
            isOneToOne: false;
            referencedRelation: "ride_categories";
            referencedColumns: ["key"];
          },
        ];
      };
      user_notification_preferences: {
        Row: {
          created_at: string;
          payment_reminders: boolean;
          promotions: boolean;
          ride_requests: boolean;
          ride_updates: boolean;
          sound: boolean;
          updated_at: string;
          user_id: string;
          vibration: boolean;
        };
        Insert: {
          created_at?: string;
          payment_reminders?: boolean;
          promotions?: boolean;
          ride_requests?: boolean;
          ride_updates?: boolean;
          sound?: boolean;
          updated_at?: string;
          user_id: string;
          vibration?: boolean;
        };
        Update: {
          created_at?: string;
          payment_reminders?: boolean;
          promotions?: boolean;
          ride_requests?: boolean;
          ride_updates?: boolean;
          sound?: boolean;
          updated_at?: string;
          user_id?: string;
          vibration?: boolean;
        };
        Relationships: [];
      };
      user_notification_tokens: {
        Row: {
          auth_key: string | null;
          created_at: string;
          endpoint: string | null;
          id: string;
          last_seen_at: string;
          p256dh: string | null;
          platform: string;
          token: string;
          updated_at: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          auth_key?: string | null;
          created_at?: string;
          endpoint?: string | null;
          id?: string;
          last_seen_at?: string;
          p256dh?: string | null;
          platform: string;
          token: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth_key?: string | null;
          created_at?: string;
          endpoint?: string | null;
          id?: string;
          last_seen_at?: string;
          p256dh?: string | null;
          platform?: string;
          token?: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          auth_user_id: string;
          avatar_url: string | null;
          average_rating: number;
          birth_date: string | null;
          block_reason: string | null;
          blocked_at: string | null;
          cancel_score_30d: number;
          city: string | null;
          completed_rides: number;
          cpf: string | null;
          created_at: string;
          deleted_at: string | null;
          email: string;
          email_verified_at: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          gender: string | null;
          id: string;
          last_login_at: string | null;
          name: string;
          phone: string | null;
          phone_verified_at: string | null;
          preferences: Json;
          suspended_at: string | null;
          suspended_until: string | null;
          total_ratings: number;
          updated_at: string;
        };
        Insert: {
          auth_user_id: string;
          avatar_url?: string | null;
          average_rating?: number;
          birth_date?: string | null;
          block_reason?: string | null;
          blocked_at?: string | null;
          cancel_score_30d?: number;
          city?: string | null;
          completed_rides?: number;
          cpf?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email: string;
          email_verified_at?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          gender?: string | null;
          id?: string;
          last_login_at?: string | null;
          name: string;
          phone?: string | null;
          phone_verified_at?: string | null;
          preferences?: Json;
          suspended_at?: string | null;
          suspended_until?: string | null;
          total_ratings?: number;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string;
          avatar_url?: string | null;
          average_rating?: number;
          birth_date?: string | null;
          block_reason?: string | null;
          blocked_at?: string | null;
          cancel_score_30d?: number;
          city?: string | null;
          completed_rides?: number;
          cpf?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email?: string;
          email_verified_at?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          gender?: string | null;
          id?: string;
          last_login_at?: string | null;
          name?: string;
          phone?: string | null;
          phone_verified_at?: string | null;
          preferences?: Json;
          suspended_at?: string | null;
          suspended_until?: string | null;
          total_ratings?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      activate_due_scheduled_rides: {
        Args: never;
        Returns: {
          activated_ride_id: string;
        }[];
      };
      admin_analytics_financial: { Args: never; Returns: Json };
      admin_analytics_new_users_timeseries: {
        Args: { _bucket?: string; _from: string; _to: string };
        Returns: {
          bucket: string;
          new_drivers: number;
          new_passengers: number;
        }[];
      };
      admin_analytics_overview: { Args: never; Returns: Json };
      admin_analytics_rides_timeseries: {
        Args: { _bucket?: string; _from: string; _to: string };
        Returns: {
          bucket: string;
          cancelled: number;
          completed: number;
          total: number;
        }[];
      };
      admin_analytics_subscription_growth: {
        Args: { _bucket?: string; _from: string; _to: string };
        Returns: {
          bucket: string;
          paid_count: number;
          revenue: number;
        }[];
      };
      admin_analytics_top_cities: {
        Args: { _limit?: number };
        Returns: {
          city: string;
          rides: number;
        }[];
      };
      admin_analytics_top_drivers: {
        Args: { _kind?: string; _limit?: number };
        Returns: {
          city: string;
          driver_id: string;
          name: string;
          rating: number;
          rides_total: number;
          value: number;
        }[];
      };
      admin_analytics_top_passengers: {
        Args: { _kind?: string; _limit?: number };
        Returns: {
          city: string;
          name: string;
          rating: number;
          rides_total: number;
          user_id: string;
          value: number;
        }[];
      };
      admin_analytics_top_places: {
        Args: { _kind?: string; _limit?: number };
        Returns: {
          place: string;
          rides: number;
        }[];
      };
      auto_suspend_overdue_subscriptions: { Args: never; Returns: undefined };
      generate_share_token: { Args: never; Returns: string };
      get_driver_amenities_public: {
        Args: { target_user_id: string };
        Returns: {
          air_conditioning: boolean;
          candy: boolean;
          charger: boolean;
          child_seat: boolean;
          large_luggage: boolean;
          music_on_demand: boolean;
          pet_friendly: boolean;
          quiet_ride: boolean;
          user_id: string;
          water: boolean;
          wifi: boolean;
        }[];
      };
      get_driver_home_kpis: {
        Args: { _user_id: string };
        Returns: {
          acceptance_rate: number;
          cancellation_rate: number;
          distance_today: number;
          earnings_today: number;
          rating: number;
          total_trips: number;
          trips_today: number;
        }[];
      };
      get_driver_public_profile: {
        Args: { target_user_id: string };
        Returns: {
          approval_status: string;
          average_rating: number;
          category: string;
          city: string;
          completed_rides: number;
          is_online: boolean;
          member_since: string;
          name: string;
          photo_url: string;
          state: string;
          total_ratings: number;
          user_id: string;
          vehicle_color: string;
          vehicle_model: string;
          vehicle_plate: string;
          vehicle_year: number;
        }[];
      };
      get_driver_public_stats: {
        Args: { p_user_id: string };
        Returns: {
          completed_rides: number;
          rating: number;
          total_ratings: number;
        }[];
      };
      get_driver_stats: {
        Args: { _from: string; _to: string; _user_id: string };
        Returns: {
          acceptance_rate: number;
          avg_fare: number;
          avg_per_km: number;
          cancellation_rate: number;
          cancelled: number;
          distance_km: number;
          earnings: number;
          ride_minutes: number;
          trips: number;
        }[];
      };
      get_passenger_public_profile: {
        Args: { target_user_id: string };
        Returns: {
          average_rating: number;
          city: string;
          completed_rides: number;
          member_since: string;
          name: string;
          photo_url: string;
          total_ratings: number;
          user_id: string;
        }[];
      };
      get_passenger_stats: {
        Args: { _user_id: string };
        Returns: {
          avg_rating: number;
          cancelled_rides: number;
          completed_rides: number;
          total_rides: number;
          total_spent: number;
        }[];
      };
      get_ride_by_share_token: {
        Args: { _token: string };
        Returns: {
          category: string;
          destination_lat: number;
          destination_lng: number;
          destination_name: string;
          driver_first_name: string;
          driver_lat: number;
          driver_lng: number;
          driver_photo_url: string;
          is_live: boolean;
          origin_lat: number;
          origin_lng: number;
          origin_name: string;
          status: string;
          updated_at: string;
          vehicle_color: string;
          vehicle_model: string;
          vehicle_plate_masked: string;
        }[];
      };
      mark_driver_withdrawal_failed: {
        Args: { _reason: string; _response: Json; _withdrawal_id: string };
        Returns: undefined;
      };
      mark_driver_withdrawal_paid: {
        Args: {
          _end_to_end_id: string;
          _response: Json;
          _transfer_id: string;
          _withdrawal_id: string;
        };
        Returns: undefined;
      };
      recompute_driver_rating: {
        Args: { _driver_id: string };
        Returns: undefined;
      };
      recompute_passenger_rating: {
        Args: { _passenger_id: string };
        Returns: undefined;
      };
      request_driver_withdrawal: { Args: { _amount: number }; Returns: string };
      settle_cancellation_fee: { Args: { _fee_id: string }; Returns: undefined };
    };
    Enums: {
      app_role:
        | "passenger"
        | "driver"
        | "admin"
        | "super_admin"
        | "financial"
        | "support"
        | "operations"
        | "readonly";
      driver_approval_status: "em_analise" | "aprovado" | "reprovado" | "bloqueado";
      driver_financial_status: "inactive" | "pending" | "active" | "overdue" | "cancelled";
      driver_subscription_status:
        | "active"
        | "inactive"
        | "overdue"
        | "pending"
        | "suspended"
        | "expired"
        | "blocked"
        | "cancelled";
      driver_wallet_tx_source: "cancellation_fee" | "manual_credit" | "withdrawal" | "adjustment";
      driver_wallet_tx_status: "pending" | "available" | "withdrawn" | "cancelled";
      financial_txn_status:
        "pending" | "processing" | "completed" | "failed" | "cancelled" | "refunded";
      financial_txn_type:
        | "subscription"
        | "ride_payment"
        | "refund"
        | "bonus"
        | "adjustment"
        | "withdrawal"
        | "promotion"
        | "future_pix"
        | "future_card";
      payment_method_kind: "pix" | "credit_card" | "debit_card" | "cash" | "wallet" | "corporate";
      payment_status: "pending" | "paid" | "failed" | "refunded";
      pix_key_type: "cpf" | "cnpj" | "email" | "phone" | "random";
      ride_category: "carros" | "motos" | "fretes" | "guincho" | "envios";
      ride_status:
        | "agendada"
        | "procurar_motorista"
        | "motorista_a_caminho"
        | "motorista_chegou"
        | "em_viagem"
        | "finalizada"
        | "cancelada_passageiro"
        | "cancelada_motorista";
      wallet_status: "active" | "frozen" | "closed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "passenger",
        "driver",
        "admin",
        "super_admin",
        "financial",
        "support",
        "operations",
        "readonly",
      ],
      driver_approval_status: ["em_analise", "aprovado", "reprovado", "bloqueado"],
      driver_financial_status: ["inactive", "pending", "active", "overdue", "cancelled"],
      driver_subscription_status: [
        "active",
        "inactive",
        "overdue",
        "pending",
        "suspended",
        "expired",
        "blocked",
        "cancelled",
      ],
      driver_wallet_tx_source: ["cancellation_fee", "manual_credit", "withdrawal", "adjustment"],
      driver_wallet_tx_status: ["pending", "available", "withdrawn", "cancelled"],
      financial_txn_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
        "refunded",
      ],
      financial_txn_type: [
        "subscription",
        "ride_payment",
        "refund",
        "bonus",
        "adjustment",
        "withdrawal",
        "promotion",
        "future_pix",
        "future_card",
      ],
      payment_method_kind: ["pix", "credit_card", "debit_card", "cash", "wallet", "corporate"],
      payment_status: ["pending", "paid", "failed", "refunded"],
      pix_key_type: ["cpf", "cnpj", "email", "phone", "random"],
      ride_category: ["carros", "motos", "fretes", "guincho", "envios"],
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
      wallet_status: ["active", "frozen", "closed"],
    },
  },
} as const;
