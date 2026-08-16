export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: { completed_at: string | null; created_at: string; id: string; reason: string | null; role: string; status: string; updated_at: string; user_id: string }
        Insert: { completed_at?: string | null; created_at?: string; id?: string; reason?: string | null; role?: string; status?: string; updated_at?: string; user_id: string }
        Update: { completed_at?: string | null; created_at?: string; id?: string; reason?: string | null; role?: string; status?: string; updated_at?: string; user_id?: string }
        Relationships: [{ foreignKeyName: "account_deletion_requests_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
      }
      admin_driver_notes: {
        Row: { admin_id: string; created_at: string; driver_id: string; id: string; note: string }
        Insert: { admin_id: string; created_at?: string; driver_id: string; id?: string; note: string }
        Update: { admin_id?: string; created_at?: string; driver_id?: string; id?: string; note?: string }
        Relationships: [{ foreignKeyName: "admin_driver_notes_driver_id_fkey"; columns: ["driver_id"]; isOneToOne: false; referencedRelation: "drivers"; referencedColumns: ["id"] }]
      }
      app_settings: {
        Row: { description: string | null; key: string; updated_at: string; value: Json }
        Insert: { description?: string | null; key: string; updated_at?: string; value: Json }
        Update: { description?: string | null; key?: string; updated_at?: string; value?: Json }
        Relationships: []
      }
      audit_logs: {
        Row: { action: string; actor_id: string | null; created_at: string; entity_id: string | null; entity_type: string; id: number; metadata: Json }
        Insert: { action: string; actor_id?: string | null; created_at?: string; entity_id?: string | null; entity_type: string; id?: never; metadata?: Json }
        Update: { action?: string; actor_id?: string | null; created_at?: string; entity_id?: string | null; entity_type?: string; id?: never; metadata?: Json }
        Relationships: []
      }
      cancellation_fees: {
        Row: { amount: number; created_at: string; expires_at: string | null; fee_amount: number | null; id: string; is_paid: boolean; mp_expires_at: string | null; mp_order_id: string | null; mp_order_status: string | null; mp_order_status_detail: string | null; mp_payment_id: string | null; mp_payment_status: string | null; mp_qr_code: string | null; mp_qr_code_base64: string | null; mp_ticket_url: string | null; paid_at: string | null; passenger_id: string; provider: string | null; provider_payment_id: string | null; qr_code: string | null; qr_code_base64: string | null; reason: string | null; ride_id: string | null; status: string; ticket_url: string | null; updated_at: string; value: number | null }
        Insert: { amount: number; created_at?: string; expires_at?: string | null; fee_amount?: number | null; id?: string; is_paid?: boolean; mp_expires_at?: string | null; mp_order_id?: string | null; mp_order_status?: string | null; mp_order_status_detail?: string | null; mp_payment_id?: string | null; mp_payment_status?: string | null; mp_qr_code?: string | null; mp_qr_code_base64?: string | null; mp_ticket_url?: string | null; paid_at?: string | null; passenger_id: string; provider?: string | null; provider_payment_id?: string | null; qr_code?: string | null; qr_code_base64?: string | null; reason?: string | null; ride_id?: string | null; status?: string; ticket_url?: string | null; updated_at?: string; value?: number | null }
        Update: { amount?: number; created_at?: string; expires_at?: string | null; fee_amount?: number | null; id?: string; is_paid?: boolean; mp_expires_at?: string | null; mp_order_id?: string | null; mp_order_status?: string | null; mp_order_status_detail?: string | null; mp_payment_id?: string | null; mp_payment_status?: string | null; mp_qr_code?: string | null; mp_qr_code_base64?: string | null; mp_ticket_url?: string | null; paid_at?: string | null; passenger_id?: string; provider?: string | null; provider_payment_id?: string | null; qr_code?: string | null; qr_code_base64?: string | null; reason?: string | null; ride_id?: string | null; status?: string; ticket_url?: string | null; updated_at?: string; value?: number | null }
        Relationships: [{ foreignKeyName: "cancellation_fees_passenger_id_fkey"; columns: ["passenger_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }, { foreignKeyName: "cancellation_fees_ride_id_fkey"; columns: ["ride_id"]; isOneToOne: false; referencedRelation: "rides"; referencedColumns: ["id"] }]
      }
      content_documents: {
        Row: { created_at: string; created_by: string | null; domain: string; id: string; locale: string; payload: Json; published_at: string | null; scheduled_at: string | null; slug: string; sort_order: number; status: Database["public"]["Enums"]["content_status"]; title: string; updated_at: string; updated_by: string | null }
        Insert: { created_at?: string; created_by?: string | null; domain: string; id?: string; locale?: string; payload?: Json; published_at?: string | null; scheduled_at?: string | null; slug: string; sort_order?: number; status?: Database["public"]["Enums"]["content_status"]; title: string; updated_at?: string; updated_by?: string | null }
        Update: { created_at?: string; created_by?: string | null; domain?: string; id?: string; locale?: string; payload?: Json; published_at?: string | null; scheduled_at?: string | null; slug?: string; sort_order?: number; status?: Database["public"]["Enums"]["content_status"]; title?: string; updated_at?: string; updated_by?: string | null }
        Relationships: []
      }
      content_versions: {
        Row: { actor_id: string | null; change_kind: string; created_at: string; document_id: string; id: number; snapshot: Json; version_number: number }
        Insert: { actor_id?: string | null; change_kind: string; created_at?: string; document_id: string; id?: never; snapshot: Json; version_number: number }
        Update: { actor_id?: string | null; change_kind?: string; created_at?: string; document_id?: string; id?: never; snapshot?: Json; version_number?: number }
        Relationships: [{ foreignKeyName: "content_versions_document_id_fkey"; columns: ["document_id"]; isOneToOne: false; referencedRelation: "content_documents"; referencedColumns: ["id"] }]
      }
      driver_emergency_contacts: {
        Row: { created_at: string; driver_id: string; id: string; is_primary: boolean; name: string; phone: string; relation: string | null; updated_at: string }
        Insert: { created_at?: string; driver_id: string; id?: string; is_primary?: boolean; name: string; phone: string; relation?: string | null; updated_at?: string }
        Update: { created_at?: string; driver_id?: string; id?: string; is_primary?: boolean; name?: string; phone?: string; relation?: string | null; updated_at?: string }
        Relationships: [{ foreignKeyName: "driver_emergency_contacts_driver_id_fkey"; columns: ["driver_id"]; isOneToOne: false; referencedRelation: "drivers"; referencedColumns: ["id"] }]
      }
      driver_wallet_transactions: {
        Row: { amount: number; created_at: string; description: string | null; direction: string; driver_id: string; id: string; source: string; source_id: string | null }
        Insert: { amount: number; created_at?: string; description?: string | null; direction: string; driver_id: string; id?: string; source: string; source_id?: string | null }
        Update: { amount?: number; created_at?: string; description?: string | null; direction?: string; driver_id?: string; id?: string; source?: string; source_id?: string | null }
        Relationships: [{ foreignKeyName: "driver_wallet_transactions_driver_id_fkey"; columns: ["driver_id"]; isOneToOne: false; referencedRelation: "drivers"; referencedColumns: ["id"] }]
      }
      driver_wallets: {
        Row: { available_balance: number; balance: number; created_at: string; driver_id: string; updated_at: string }
        Insert: { available_balance?: number; balance?: number; created_at?: string; driver_id: string; updated_at?: string }
        Update: { available_balance?: number; balance?: number; created_at?: string; driver_id?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: "driver_wallets_driver_id_fkey"; columns: ["driver_id"]; isOneToOne: true; referencedRelation: "drivers"; referencedColumns: ["id"] }]
      }
      driver_withdrawals: {
        Row: { amount: number; driver_id: string; failure_reason: string | null; id: string; processed_at: string | null; provider: string | null; provider_transfer_id: string | null; requested_at: string; status: string; updated_at: string }
        Insert: { amount: number; driver_id: string; failure_reason?: string | null; id?: string; processed_at?: string | null; provider?: string | null; provider_transfer_id?: string | null; requested_at?: string; status?: string; updated_at?: string }
        Update: { amount?: number; driver_id?: string; failure_reason?: string | null; id?: string; processed_at?: string | null; provider?: string | null; provider_transfer_id?: string | null; requested_at?: string; status?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: "driver_withdrawals_driver_id_fkey"; columns: ["driver_id"]; isOneToOne: false; referencedRelation: "drivers"; referencedColumns: ["id"] }]
      }
      drivers: {
        Row: { approval_status: string; approved_at: string | null; birth_date: string | null; blocked_at: string | null; category: string | null; city: string | null; cnh_back_url: string | null; cnh_url: string | null; cpf: string | null; created_at: string; current_heading: number | null; current_lat: number | null; current_lng: number | null; current_speed: number | null; documents_status: string | null; email: string | null; id: string; is_online: boolean; last_location_at: string | null; motivo_reprovacao: string | null; name: string | null; phone: string | null; photo_url: string | null; rating: number | null; selfie_url: string | null; state: string | null; subscription_status: string; suspended_at: string | null; total_ratings: number; updated_at: string; user_id: string; vehicle_color: string | null; vehicle_document_url: string | null; vehicle_model: string | null; vehicle_photo_url: string | null; vehicle_plate: string | null; vehicle_year: number | null }
        Insert: { approval_status?: string; approved_at?: string | null; birth_date?: string | null; blocked_at?: string | null; category?: string | null; city?: string | null; cnh_back_url?: string | null; cnh_url?: string | null; cpf?: string | null; created_at?: string; current_heading?: number | null; current_lat?: number | null; current_lng?: number | null; current_speed?: number | null; documents_status?: string | null; email?: string | null; id?: string; is_online?: boolean; last_location_at?: string | null; motivo_reprovacao?: string | null; name?: string | null; phone?: string | null; photo_url?: string | null; rating?: number | null; selfie_url?: string | null; state?: string | null; subscription_status?: string; suspended_at?: string | null; total_ratings?: number; updated_at?: string; user_id: string; vehicle_color?: string | null; vehicle_document_url?: string | null; vehicle_model?: string | null; vehicle_photo_url?: string | null; vehicle_plate?: string | null; vehicle_year?: number | null }
        Update: { approval_status?: string; approved_at?: string | null; birth_date?: string | null; blocked_at?: string | null; category?: string | null; city?: string | null; cnh_back_url?: string | null; cnh_url?: string | null; cpf?: string | null; created_at?: string; current_heading?: number | null; current_lat?: number | null; current_lng?: number | null; current_speed?: number | null; documents_status?: string | null; email?: string | null; id?: string; is_online?: boolean; last_location_at?: string | null; motivo_reprovacao?: string | null; name?: string | null; phone?: string | null; photo_url?: string | null; rating?: number | null; selfie_url?: string | null; state?: string | null; subscription_status?: string; suspended_at?: string | null; total_ratings?: number; updated_at?: string; user_id?: string; vehicle_color?: string | null; vehicle_document_url?: string | null; vehicle_model?: string | null; vehicle_photo_url?: string | null; vehicle_plate?: string | null; vehicle_year?: number | null }
        Relationships: [{ foreignKeyName: "drivers_user_id_fkey"; columns: ["user_id"]; isOneToOne: true; referencedRelation: "users"; referencedColumns: ["id"] }]
      }
      form_submissions: {
        Row: { assigned_to: string | null; consent: boolean; created_at: string; id: string; kind: Database["public"]["Enums"]["submission_kind"]; payload: Json; source: string | null; status: Database["public"]["Enums"]["submission_status"]; updated_at: string }
        Insert: { assigned_to?: string | null; consent?: boolean; created_at?: string; id?: string; kind: Database["public"]["Enums"]["submission_kind"]; payload: Json; source?: string | null; status?: Database["public"]["Enums"]["submission_status"]; updated_at?: string }
        Update: { assigned_to?: string | null; consent?: boolean; created_at?: string; id?: string; kind?: Database["public"]["Enums"]["submission_kind"]; payload?: Json; source?: string | null; status?: Database["public"]["Enums"]["submission_status"]; updated_at?: string }
        Relationships: []
      }
      media_assets: {
        Row: { alt_text: string; bucket: string; category: string | null; created_at: string; id: string; kind: Database["public"]["Enums"]["asset_kind"]; mime_type: string; owner_id: string | null; path: string; size_bytes: number; status: Database["public"]["Enums"]["content_status"]; tags: string[]; title: string; updated_at: string }
        Insert: { alt_text?: string; bucket: string; category?: string | null; created_at?: string; id?: string; kind: Database["public"]["Enums"]["asset_kind"]; mime_type: string; owner_id?: string | null; path: string; size_bytes: number; status?: Database["public"]["Enums"]["content_status"]; tags?: string[]; title: string; updated_at?: string }
        Update: { alt_text?: string; bucket?: string; category?: string | null; created_at?: string; id?: string; kind?: Database["public"]["Enums"]["asset_kind"]; mime_type?: string; owner_id?: string | null; path?: string; size_bytes?: number; status?: Database["public"]["Enums"]["content_status"]; tags?: string[]; title?: string; updated_at?: string }
        Relationships: []
      }
      notification_logs: {
        Row: { body: string | null; channel: string; created_at: string; data: Json; event: string; id: string; ride_id: string | null; status: string; title: string; user_id: string }
        Insert: { body?: string | null; channel?: string; created_at?: string; data?: Json; event: string; id?: string; ride_id?: string | null; status: string; title: string; user_id: string }
        Update: { body?: string | null; channel?: string; created_at?: string; data?: Json; event?: string; id?: string; ride_id?: string | null; status?: string; title?: string; user_id?: string }
        Relationships: [{ foreignKeyName: "notification_logs_ride_id_fkey"; columns: ["ride_id"]; isOneToOne: false; referencedRelation: "rides"; referencedColumns: ["id"] }, { foreignKeyName: "notification_logs_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
      }
      notifications: {
        Row: { body: string | null; created_at: string; data: Json; id: string; read_at: string | null; title: string; user_id: string }
        Insert: { body?: string | null; created_at?: string; data?: Json; id?: string; read_at?: string | null; title: string; user_id: string }
        Update: { body?: string | null; created_at?: string; data?: Json; id?: string; read_at?: string | null; title?: string; user_id?: string }
        Relationships: [{ foreignKeyName: "notifications_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
      }
      passenger_emergency_contacts: {
        Row: { created_at: string; id: string; is_primary: boolean; name: string; passenger_id: string; phone: string; relationship: string | null; updated_at: string }
        Insert: { created_at?: string; id?: string; is_primary?: boolean; name: string; passenger_id: string; phone: string; relationship?: string | null; updated_at?: string }
        Update: { created_at?: string; id?: string; is_primary?: boolean; name?: string; passenger_id?: string; phone?: string; relationship?: string | null; updated_at?: string }
        Relationships: [{ foreignKeyName: "passenger_emergency_contacts_passenger_id_fkey"; columns: ["passenger_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
      }
      passenger_support_tickets: {
        Row: { category: string; created_at: string; id: string; message: string; passenger_id: string; priority: string; protocol: string; ride_id: string | null; status: string; subject: string; updated_at: string }
        Insert: { category: string; created_at?: string; id?: string; message: string; passenger_id: string; priority?: string; protocol: string; ride_id?: string | null; status?: string; subject: string; updated_at?: string }
        Update: { category?: string; created_at?: string; id?: string; message?: string; passenger_id?: string; priority?: string; protocol?: string; ride_id?: string | null; status?: string; subject?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: "passenger_support_tickets_passenger_id_fkey"; columns: ["passenger_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }, { foreignKeyName: "passenger_support_tickets_ride_id_fkey"; columns: ["ride_id"]; isOneToOne: false; referencedRelation: "rides"; referencedColumns: ["id"] }]
      }
      passenger_wallets: {
        Row: { balance: number; blocked_reason: string | null; created_at: string; currency: string; id: string; is_blocked: boolean; passenger_id: string; updated_at: string }
        Insert: { balance?: number; blocked_reason?: string | null; created_at?: string; currency?: string; id?: string; is_blocked?: boolean; passenger_id: string; updated_at?: string }
        Update: { balance?: number; blocked_reason?: string | null; created_at?: string; currency?: string; id?: string; is_blocked?: boolean; passenger_id?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: "passenger_wallets_passenger_id_fkey"; columns: ["passenger_id"]; isOneToOne: true; referencedRelation: "users"; referencedColumns: ["id"] }]
      }
      payment_methods: {
        Row: { code: string; created_at: string; description: string | null; icon: string | null; id: string; is_active: boolean; name: string; requires_balance: boolean; sort_order: number; updated_at: string }
        Insert: { code: string; created_at?: string; description?: string | null; icon?: string | null; id?: string; is_active?: boolean; name: string; requires_balance?: boolean; sort_order?: number; updated_at?: string }
        Update: { code?: string; created_at?: string; description?: string | null; icon?: string | null; id?: string; is_active?: boolean; name?: string; requires_balance?: boolean; sort_order?: number; updated_at?: string }
        Relationships: []
      }
      payment_webhook_receipts: {
        Row: { created_at: string; detail: string | null; event_key: string; id: string; processed_at: string | null; provider: string; raw_payload: Json; request_id: string | null; status: string }
        Insert: { created_at?: string; detail?: string | null; event_key: string; id?: string; processed_at?: string | null; provider: string; raw_payload?: Json; request_id?: string | null; status?: string }
        Update: { created_at?: string; detail?: string | null; event_key?: string; id?: string; processed_at?: string | null; provider?: string; raw_payload?: Json; request_id?: string | null; status?: string }
        Relationships: []
      }
      profiles: {
        Row: { active: boolean; created_at: string; display_name: string | null; email: string; role: Database["public"]["Enums"]["app_role"]; updated_at: string; user_id: string }
        Insert: { active?: boolean; created_at?: string; display_name?: string | null; email: string; role?: Database["public"]["Enums"]["app_role"]; updated_at?: string; user_id: string }
        Update: { active?: boolean; created_at?: string; display_name?: string | null; email?: string; role?: Database["public"]["Enums"]["app_role"]; updated_at?: string; user_id?: string }
        Relationships: []
      }
      ride_categories: {
        Row: { capacity_label: string | null; code: string; created_at: string; description: string | null; eta_label: string | null; icon: string | null; id: string; image_url: string | null; is_active: boolean; name: string; sort_order: number; updated_at: string }
        Insert: { capacity_label?: string | null; code: string; created_at?: string; description?: string | null; eta_label?: string | null; icon?: string | null; id?: string; image_url?: string | null; is_active?: boolean; name: string; sort_order?: number; updated_at?: string }
        Update: { capacity_label?: string | null; code?: string; created_at?: string; description?: string | null; eta_label?: string | null; icon?: string | null; id?: string; image_url?: string | null; is_active?: boolean; name?: string; sort_order?: number; updated_at?: string }
        Relationships: []
      }
      rides: {
        Row: { accepted_at: string | null; accepted_driver_id: string | null; cancellation_fee: number | null; cancellation_reason: string | null; cancelled_at: string | null; cancelled_by: string | null; candidate_driver_ids: string[]; category: string; completed_at: string | null; created_at: string; current_offer_driver_id: string | null; destination: Json; destination_lat: number; destination_lng: number; destination_name: string; dispatch_attempts: number; distance_km: number | null; driver_arrived_at: string | null; driver_heading: number | null; driver_id: string | null; driver_latitude: number | null; driver_longitude: number | null; driver_name: string | null; driver_phone: string | null; driver_photo: string | null; driver_rated_at: string | null; driver_rating: number | null; driver_vehicle_color: string | null; driver_vehicle_model: string | null; driver_vehicle_plate: string | null; duration_min: number | null; encoded_polyline: string | null; estimated_price: number; final_price: number | null; id: string; intermediates: Json; offered_driver_ids: string[]; origin: Json; origin_lat: number; origin_lng: number; origin_name: string; passenger_id: string; passenger_rated_at: string | null; passenger_rating: number | null; passenger_rating_comment: string | null; payment_method: string; pickup_address: string | null; pickup_label: string | null; pickup_place_id: string | null; pickup_short_label: string | null; pickup_source: string | null; queued_after_ride_id: string | null; queued_at: string | null; rejected_driver_ids: string[]; request_expires_at: string | null; request_key: string; scheduled_for: string | null; search_expires_at: string | null; security_code: string | null; service_details: Json | null; share_token: string | null; started_at: string | null; status: string; updated_at: string }
        Insert: { accepted_at?: string | null; accepted_driver_id?: string | null; cancellation_fee?: number | null; cancellation_reason?: string | null; cancelled_at?: string | null; cancelled_by?: string | null; candidate_driver_ids?: string[]; category: string; completed_at?: string | null; created_at?: string; current_offer_driver_id?: string | null; destination: Json; destination_lat: number; destination_lng: number; destination_name: string; dispatch_attempts?: number; distance_km?: number | null; driver_arrived_at?: string | null; driver_heading?: number | null; driver_id?: string | null; driver_latitude?: number | null; driver_longitude?: number | null; driver_name?: string | null; driver_phone?: string | null; driver_photo?: string | null; driver_rated_at?: string | null; driver_rating?: number | null; driver_vehicle_color?: string | null; driver_vehicle_model?: string | null; driver_vehicle_plate?: string | null; duration_min?: number | null; encoded_polyline?: string | null; estimated_price: number; final_price?: number | null; id?: string; intermediates?: Json; offered_driver_ids?: string[]; origin: Json; origin_lat: number; origin_lng: number; origin_name: string; passenger_id: string; passenger_rated_at?: string | null; passenger_rating?: number | null; passenger_rating_comment?: string | null; payment_method: string; pickup_address?: string | null; pickup_label?: string | null; pickup_place_id?: string | null; pickup_short_label?: string | null; pickup_source?: string | null; queued_after_ride_id?: string | null; queued_at?: string | null; rejected_driver_ids?: string[]; request_expires_at?: string | null; request_key: string; scheduled_for?: string | null; search_expires_at?: string | null; security_code?: string | null; service_details?: Json | null; share_token?: string | null; started_at?: string | null; status?: string; updated_at?: string }
        Update: { accepted_at?: string | null; accepted_driver_id?: string | null; cancellation_fee?: number | null; cancellation_reason?: string | null; cancelled_at?: string | null; cancelled_by?: string | null; candidate_driver_ids?: string[]; category?: string; completed_at?: string | null; created_at?: string; current_offer_driver_id?: string | null; destination?: Json; destination_lat?: number; destination_lng?: number; destination_name?: string; dispatch_attempts?: number; distance_km?: number | null; driver_arrived_at?: string | null; driver_heading?: number | null; driver_id?: string | null; driver_latitude?: number | null; driver_longitude?: number | null; driver_name?: string | null; driver_phone?: string | null; driver_photo?: string | null; driver_rated_at?: string | null; driver_rating?: number | null; driver_vehicle_color?: string | null; driver_vehicle_model?: string | null; driver_vehicle_plate?: string | null; duration_min?: number | null; encoded_polyline?: string | null; estimated_price?: number; final_price?: number | null; id?: string; intermediates?: Json; offered_driver_ids?: string[]; origin?: Json; origin_lat?: number; origin_lng?: number; origin_name?: string; passenger_id?: string; passenger_rated_at?: string | null; passenger_rating?: number | null; passenger_rating_comment?: string | null; payment_method?: string; pickup_address?: string | null; pickup_label?: string | null; pickup_place_id?: string | null; pickup_short_label?: string | null; pickup_source?: string | null; queued_after_ride_id?: string | null; queued_at?: string | null; rejected_driver_ids?: string[]; request_expires_at?: string | null; request_key?: string; scheduled_for?: string | null; search_expires_at?: string | null; security_code?: string | null; service_details?: Json | null; share_token?: string | null; started_at?: string | null; status?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: "rides_accepted_driver_id_fkey"; columns: ["accepted_driver_id"]; isOneToOne: false; referencedRelation: "drivers"; referencedColumns: ["id"] }, { foreignKeyName: "rides_driver_id_fkey"; columns: ["driver_id"]; isOneToOne: false; referencedRelation: "drivers"; referencedColumns: ["id"] }, { foreignKeyName: "rides_passenger_id_fkey"; columns: ["passenger_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }, { foreignKeyName: "rides_queued_after_ride_id_fkey"; columns: ["queued_after_ride_id"]; isOneToOne: false; referencedRelation: "rides"; referencedColumns: ["id"] }]
      }
      role_permissions: {
        Row: { permission: string; role: Database["public"]["Enums"]["app_role"] }
        Insert: { permission: string; role: Database["public"]["Enums"]["app_role"] }
        Update: { permission?: string; role?: Database["public"]["Enums"]["app_role"] }
        Relationships: []
      }
      sos_alerts: {
        Row: { created_at: string; driver_id: string | null; id: string; lat: number | null; lng: number | null; message: string | null; status: string; updated_at: string; user_id: string }
        Insert: { created_at?: string; driver_id?: string | null; id?: string; lat?: number | null; lng?: number | null; message?: string | null; status?: string; updated_at?: string; user_id: string }
        Update: { created_at?: string; driver_id?: string | null; id?: string; lat?: number | null; lng?: number | null; message?: string | null; status?: string; updated_at?: string; user_id?: string }
        Relationships: [{ foreignKeyName: "sos_alerts_driver_id_fkey"; columns: ["driver_id"]; isOneToOne: false; referencedRelation: "drivers"; referencedColumns: ["id"] }, { foreignKeyName: "sos_alerts_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
      }
      tariff_rules: {
        Row: { accident_fee: number; assembly_fee: number; base_fare: number; category_id: string; city: string; created_at: string; difficult_access_fee: number; dynamic_multiplier: number; fixed_fee: number; garage_fee: number; heavy_furniture_fee: number; heavy_vehicle_fee: number; helper1_fee: number; helper2_fee: number; id: string; is_active: boolean; locked_wheels_fee: number; max_weight_kg: number; min_fare: number; packing_fee: number; per_kg: number; per_km: number; per_min: number; platform_fee: number; stair_fee: number; stop_fee: number; updated_at: string; valid_from: string | null; valid_to: string | null }
        Insert: { accident_fee?: number; assembly_fee?: number; base_fare?: number; category_id: string; city?: string; created_at?: string; difficult_access_fee?: number; dynamic_multiplier?: number; fixed_fee?: number; garage_fee?: number; heavy_furniture_fee?: number; heavy_vehicle_fee?: number; helper1_fee?: number; helper2_fee?: number; id?: string; is_active?: boolean; locked_wheels_fee?: number; max_weight_kg?: number; min_fare?: number; packing_fee?: number; per_kg?: number; per_km?: number; per_min?: number; platform_fee?: number; stair_fee?: number; stop_fee?: number; updated_at?: string; valid_from?: string | null; valid_to?: string | null }
        Update: { accident_fee?: number; assembly_fee?: number; base_fare?: number; category_id?: string; city?: string; created_at?: string; difficult_access_fee?: number; dynamic_multiplier?: number; fixed_fee?: number; garage_fee?: number; heavy_furniture_fee?: number; heavy_vehicle_fee?: number; helper1_fee?: number; helper2_fee?: number; id?: string; is_active?: boolean; locked_wheels_fee?: number; max_weight_kg?: number; min_fare?: number; packing_fee?: number; per_kg?: number; per_km?: number; per_min?: number; platform_fee?: number; stair_fee?: number; stop_fee?: number; updated_at?: string; valid_from?: string | null; valid_to?: string | null }
        Relationships: [{ foreignKeyName: "tariff_rules_category_id_fkey"; columns: ["category_id"]; isOneToOne: false; referencedRelation: "ride_categories"; referencedColumns: ["id"] }]
      }
      user_notification_preferences: {
        Row: { accessibility_large_text: boolean; created_at: string; payment_updates: boolean; promotions: boolean; ride_requests: boolean; ride_updates: boolean; safety_alerts: boolean; updated_at: string; user_id: string }
        Insert: { accessibility_large_text?: boolean; created_at?: string; payment_updates?: boolean; promotions?: boolean; ride_requests?: boolean; ride_updates?: boolean; safety_alerts?: boolean; updated_at?: string; user_id: string }
        Update: { accessibility_large_text?: boolean; created_at?: string; payment_updates?: boolean; promotions?: boolean; ride_requests?: boolean; ride_updates?: boolean; safety_alerts?: boolean; updated_at?: string; user_id?: string }
        Relationships: [{ foreignKeyName: "user_notification_preferences_user_id_fkey"; columns: ["user_id"]; isOneToOne: true; referencedRelation: "users"; referencedColumns: ["id"] }]
      }
      user_notification_tokens: {
        Row: { created_at: string; device_id: string | null; id: string; is_active: boolean; last_used_at: string | null; permission_status: string; platform: string; token: string; updated_at: string; user_id: string }
        Insert: { created_at?: string; device_id?: string | null; id?: string; is_active?: boolean; last_used_at?: string | null; permission_status?: string; platform: string; token: string; updated_at?: string; user_id: string }
        Update: { created_at?: string; device_id?: string | null; id?: string; is_active?: boolean; last_used_at?: string | null; permission_status?: string; platform?: string; token?: string; updated_at?: string; user_id?: string }
        Relationships: [{ foreignKeyName: "user_notification_tokens_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
      }
      user_roles: {
        Row: { created_at: string; id: string; role: string; user_id: string }
        Insert: { created_at?: string; id?: string; role: string; user_id: string }
        Update: { created_at?: string; id?: string; role?: string; user_id?: string }
        Relationships: [{ foreignKeyName: "user_roles_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }]
      }
      users: {
        Row: { auth_user_id: string; avatar_url: string | null; average_rating: number | null; birth_date: string | null; block_reason: string | null; blocked_at: string | null; city: string | null; completed_rides: number; cpf: string | null; created_at: string; deleted_at: string | null; email: string | null; gender: string | null; id: string; legal_acceptance_source: string | null; name: string | null; phone: string | null; preferences: Json; privacy_accepted_at: string | null; privacy_version: string | null; suspended_at: string | null; suspended_until: string | null; terms_accepted_at: string | null; terms_version: string | null; total_ratings: number; updated_at: string }
        Insert: { auth_user_id: string; avatar_url?: string | null; average_rating?: number | null; birth_date?: string | null; block_reason?: string | null; blocked_at?: string | null; city?: string | null; completed_rides?: number; cpf?: string | null; created_at?: string; deleted_at?: string | null; email?: string | null; gender?: string | null; id?: string; legal_acceptance_source?: string | null; name?: string | null; phone?: string | null; preferences?: Json; privacy_accepted_at?: string | null; privacy_version?: string | null; suspended_at?: string | null; suspended_until?: string | null; terms_accepted_at?: string | null; terms_version?: string | null; total_ratings?: number; updated_at?: string }
        Update: { auth_user_id?: string; avatar_url?: string | null; average_rating?: number | null; birth_date?: string | null; block_reason?: string | null; blocked_at?: string | null; city?: string | null; completed_rides?: number; cpf?: string | null; created_at?: string; deleted_at?: string | null; email?: string | null; gender?: string | null; id?: string; legal_acceptance_source?: string | null; name?: string | null; phone?: string | null; preferences?: Json; privacy_accepted_at?: string | null; privacy_version?: string | null; suspended_at?: string | null; suspended_until?: string | null; terms_accepted_at?: string | null; terms_version?: string | null; total_ratings?: number; updated_at?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      admin_is_authorized: { Args: never; Returns: boolean }
      admin_set_driver_approval: { Args: { _driver_id: string; _reason?: string; _status: string }; Returns: Json }
      deactivate_notification_token: { Args: { _token: string }; Returns: boolean }
      driver_accept_ride: { Args: { _ride_id: string }; Returns: Json }
      driver_bootstrap_profile: { Args: { _category: string; _vehicle_color: string; _vehicle_model: string; _vehicle_plate: string }; Returns: Json }
      driver_cancel_ride: { Args: { _reason?: string; _ride_id: string }; Returns: Json }
      driver_complete_registration: { Args: { _birth_date: string; _category: string; _city: string; _cnh_back_path: string; _cnh_path: string; _cpf: string; _name: string; _phone: string; _photo_path?: string; _selfie_path: string; _state: string; _vehicle_color: string; _vehicle_document_path: string; _vehicle_model: string; _vehicle_plate: string; _vehicle_year: number }; Returns: Json }
      driver_complete_registration_v2: { Args: { _birth_date: string; _category: string; _city: string; _cnh_back_path: string; _cnh_path: string; _cpf: string; _name: string; _phone: string; _photo_path?: string; _selfie_path: string; _state: string; _vehicle_color: string; _vehicle_document_path: string; _vehicle_model: string; _vehicle_photo_path: string; _vehicle_plate: string; _vehicle_year: number }; Returns: Json }
      driver_finish_ride: { Args: { _ride_id: string }; Returns: Json }
      driver_get_profile: { Args: never; Returns: Json }
      driver_mark_arrived: { Args: { _ride_id: string }; Returns: Json }
      driver_rate_passenger: { Args: { _comment?: string; _ride_id: string; _stars: number }; Returns: Json }
      driver_reject_ride: { Args: { _ride_id: string }; Returns: Json }
      driver_set_presence: { Args: { _heading?: number; _lat?: number; _lng?: number; _online: boolean; _speed?: number }; Returns: Json }
      driver_start_ride: { Args: { _ride_id: string; _security_code: string }; Returns: Json }
      get_ride_cancellation_policy: { Args: never; Returns: Json }
      mobility_user_id: { Args: never; Returns: string }
      register_notification_token: { Args: { _device_id?: string; _permission_status?: string; _platform: string; _token: string }; Returns: string }
      reverse_cancellation_fee_settlement: { Args: { _fee_id: string }; Returns: Json }
      settle_cancellation_fee: { Args: { _fee_id: string }; Returns: Json }
    }
    Enums: {
      app_role: "administrator" | "editor" | "marketing" | "support" | "reader"
      asset_kind: "image" | "video" | "pdf" | "logo" | "icon" | "banner" | "document"
      content_status: "draft" | "scheduled" | "published" | "archived"
      submission_kind: "company" | "contact" | "newsletter" | "download"
      submission_status: "new" | "in_progress" | "completed" | "spam" | "archived"
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends { Row: infer R } ? R : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends { Row: infer R } ? R : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Insert: infer I } ? I : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I } ? I : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Update: infer U } ? U : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U } ? U : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions] : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions] : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["administrator", "editor", "marketing", "support", "reader"],
      asset_kind: ["image", "video", "pdf", "logo", "icon", "banner", "document"],
      content_status: ["draft", "scheduled", "published", "archived"],
      submission_kind: ["company", "contact", "newsletter", "download"],
      submission_status: ["new", "in_progress", "completed", "spam", "archived"],
    },
  },
} as const
