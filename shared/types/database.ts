export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  app_private: {
    Tables: {
      abuse_events: {
        Row: {
          block_code: string | null;
          created_at: string;
          event_type: string;
          id: string;
          route: string;
          subject_hash: string | null;
        };
        Insert: {
          block_code?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          route: string;
          subject_hash?: string | null;
        };
        Update: {
          block_code?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          route?: string;
          subject_hash?: string | null;
        };
        Relationships: [];
      };
      activity_rsvps: {
        Row: {
          activity_id: string;
          anonymous_subject_hash: string | null;
          created_at: string;
          id: string;
          idempotency_key_hash: string | null;
          source: string;
          status: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          activity_id: string;
          anonymous_subject_hash?: string | null;
          created_at?: string;
          id?: string;
          idempotency_key_hash?: string | null;
          source?: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          activity_id?: string;
          anonymous_subject_hash?: string | null;
          created_at?: string;
          id?: string;
          idempotency_key_hash?: string | null;
          source?: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      admins: {
        Row: {
          created_at: string;
          created_by: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      audit_events: {
        Row: {
          action: string;
          actor_user_id: string | null;
          after_hash: string | null;
          before_hash: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          reason: string | null;
          request_id: string | null;
          retention_class: string;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          after_hash?: string | null;
          before_hash?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          reason?: string | null;
          request_id?: string | null;
          retention_class?: string;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          after_hash?: string | null;
          before_hash?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          reason?: string | null;
          request_id?: string | null;
          retention_class?: string;
        };
        Relationships: [];
      };
      group_managers: {
        Row: {
          created_at: string;
          created_by: string | null;
          email: string | null;
          group_id: string;
          id: string;
          name: string;
          phone: string | null;
          role_label: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          group_id: string;
          id?: string;
          name: string;
          phone?: string | null;
          role_label?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          group_id?: string;
          id?: string;
          name?: string;
          phone?: string | null;
          role_label?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      group_proposals: {
        Row: {
          consent_version: string;
          created_at: string;
          fingerprint_expires_at: string | null;
          fingerprint_hash: string | null;
          group_id: string | null;
          id: string;
          idempotency_expires_at: string | null;
          idempotency_key_hash: string | null;
          join_url_proposed: string;
          name_proposed: string;
          proposer_email: string;
          proposer_name: string;
          proposer_phone: string;
          proposer_user_id: string | null;
          review_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          territory_id: string;
          updated_at: string;
        };
        Insert: {
          consent_version: string;
          created_at?: string;
          fingerprint_expires_at?: string | null;
          fingerprint_hash?: string | null;
          group_id?: string | null;
          id?: string;
          idempotency_expires_at?: string | null;
          idempotency_key_hash?: string | null;
          join_url_proposed: string;
          name_proposed: string;
          proposer_email: string;
          proposer_name: string;
          proposer_phone: string;
          proposer_user_id?: string | null;
          review_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          territory_id: string;
          updated_at?: string;
        };
        Update: {
          consent_version?: string;
          created_at?: string;
          fingerprint_expires_at?: string | null;
          fingerprint_hash?: string | null;
          group_id?: string | null;
          id?: string;
          idempotency_expires_at?: string | null;
          idempotency_key_hash?: string | null;
          join_url_proposed?: string;
          name_proposed?: string;
          proposer_email?: string;
          proposer_name?: string;
          proposer_phone?: string;
          proposer_user_id?: string | null;
          review_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          territory_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          account_state: string;
          consent_version: string;
          contact_opt_in_at: string | null;
          created_at: string;
          display_name: string;
          email_contact: string;
          email_verification_state: string;
          phone_e164: string | null;
          review_required_at: string | null;
          selected_territory_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_state?: string;
          consent_version: string;
          contact_opt_in_at?: string | null;
          created_at?: string;
          display_name: string;
          email_contact: string;
          email_verification_state?: string;
          phone_e164?: string | null;
          review_required_at?: string | null;
          selected_territory_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_state?: string;
          consent_version?: string;
          contact_opt_in_at?: string | null;
          created_at?: string;
          display_name?: string;
          email_contact?: string;
          email_verification_state?: string;
          phone_e164?: string | null;
          review_required_at?: string | null;
          selected_territory_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      turnstile_tokens_used: {
        Row: {
          created_at: string;
          expires_at: string;
          token_hash: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          token_hash: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          token_hash?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      approve_activity: {
        Args: {
          p_admin: string;
          p_id: string;
          p_reason?: string;
          p_request_id?: string;
        };
        Returns: number;
      };
      approve_group_proposal: {
        Args: {
          p_admin: string;
          p_id: string;
          p_reason: string;
          p_request_id?: string;
        };
        Returns: string;
      };
      consume_turnstile_token: {
        Args: { p_hash: string; p_ttl_seconds?: number };
        Returns: boolean;
      };
      email_in_use: {
        Args: { p_email: string; p_exclude: string };
        Returns: boolean;
      };
      is_admin: { Args: { uid: string }; Returns: boolean };
      is_email_verified: { Args: { uid: string }; Returns: boolean };
      purge_expired: { Args: never; Returns: Json };
      reject_activity: {
        Args: {
          p_admin: string;
          p_id: string;
          p_reason: string;
          p_request_id?: string;
        };
        Returns: number;
      };
      reject_group_proposal: {
        Args: {
          p_admin: string;
          p_id: string;
          p_reason: string;
          p_request_id?: string;
        };
        Returns: undefined;
      };
      set_activity_suspension: {
        Args: {
          p_admin: string;
          p_id: string;
          p_reason: string;
          p_request_id: string;
          p_suspend: boolean;
        };
        Returns: number;
      };
      set_group_suspension: {
        Args: {
          p_admin: string;
          p_id: string;
          p_reason: string;
          p_request_id: string;
          p_suspend: boolean;
        };
        Returns: Json;
      };
      upsert_rsvp: {
        Args: {
          p_activity: string;
          p_going: boolean;
          p_idempotency_hash?: string;
          p_subject_hash: string;
          p_user: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      activities: {
        Row: {
          cancelled_at: string | null;
          contact_public_type: string | null;
          contact_public_value: string | null;
          created_at: string;
          creator_user_id: string;
          description: string;
          description_sanitized: string;
          ends_at: string | null;
          id: string;
          location_lat: number;
          location_lon: number;
          location_precision: string;
          public_address: string;
          public_contact_opt_in: boolean;
          public_contact_type: string | null;
          public_contact_value: string | null;
          review_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          starts_at: string;
          status: string;
          status_before_suspension: string | null;
          territory_id: string;
          timezone: string;
          title: string;
          type: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          cancelled_at?: string | null;
          contact_public_type?: string | null;
          contact_public_value?: string | null;
          created_at?: string;
          creator_user_id: string;
          description: string;
          description_sanitized: string;
          ends_at?: string | null;
          id?: string;
          location_lat: number;
          location_lon: number;
          location_precision?: string;
          public_address: string;
          public_contact_opt_in?: boolean;
          public_contact_type?: string | null;
          public_contact_value?: string | null;
          review_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          starts_at: string;
          status?: string;
          status_before_suspension?: string | null;
          territory_id: string;
          timezone?: string;
          title: string;
          type: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          cancelled_at?: string | null;
          contact_public_type?: string | null;
          contact_public_value?: string | null;
          created_at?: string;
          creator_user_id?: string;
          description?: string;
          description_sanitized?: string;
          ends_at?: string | null;
          id?: string;
          location_lat?: number;
          location_lon?: number;
          location_precision?: string;
          public_address?: string;
          public_contact_opt_in?: boolean;
          public_contact_type?: string | null;
          public_contact_value?: string | null;
          review_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          starts_at?: string;
          status?: string;
          status_before_suspension?: string | null;
          territory_id?: string;
          timezone?: string;
          title?: string;
          type?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'activities_territory_id_fkey';
            columns: ['territory_id'];
            isOneToOne: false;
            referencedRelation: 'territories';
            referencedColumns: ['id'];
          },
        ];
      };
      territories: {
        Row: {
          centroid_lat: number | null;
          centroid_lon: number | null;
          created_at: string;
          data_quality: string;
          ibge_code: string | null;
          id: string;
          municipality_name: string | null;
          name: string;
          normalized_name: string;
          parent_id: string | null;
          slug: string;
          state_code: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          centroid_lat?: number | null;
          centroid_lon?: number | null;
          created_at?: string;
          data_quality?: string;
          ibge_code?: string | null;
          id: string;
          municipality_name?: string | null;
          name: string;
          normalized_name: string;
          parent_id?: string | null;
          slug: string;
          state_code?: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          centroid_lat?: number | null;
          centroid_lon?: number | null;
          created_at?: string;
          data_quality?: string;
          ibge_code?: string | null;
          id?: string;
          municipality_name?: string | null;
          name?: string;
          normalized_name?: string;
          parent_id?: string | null;
          slug?: string;
          state_code?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'territories_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'territories';
            referencedColumns: ['id'];
          },
        ];
      };
      whatsapp_groups: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          created_by: string | null;
          display_name: string;
          id: string;
          join_url: string;
          last_checked_at: string | null;
          source_proposal_id: string | null;
          status: string;
          status_before_suspension: string | null;
          territory_id: string;
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          display_name: string;
          id?: string;
          join_url: string;
          last_checked_at?: string | null;
          source_proposal_id?: string | null;
          status?: string;
          status_before_suspension?: string | null;
          territory_id: string;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          display_name?: string;
          id?: string;
          join_url?: string;
          last_checked_at?: string | null;
          source_proposal_id?: string | null;
          status?: string;
          status_before_suspension?: string | null;
          territory_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'whatsapp_groups_territory_id_fkey';
            columns: ['territory_id'];
            isOneToOne: false;
            referencedRelation: 'territories';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      activities_public: {
        Row: {
          contact_public_type: string | null;
          contact_public_value: string | null;
          description_sanitized: string | null;
          ends_at: string | null;
          id: string | null;
          location_lat: number | null;
          location_lon: number | null;
          location_public: string | null;
          rsvp_count: number | null;
          starts_at: string | null;
          status: string | null;
          territory_id: string | null;
          timezone: string | null;
          title: string | null;
          type: string | null;
          updated_at: string | null;
        };
        Insert: {
          contact_public_type?: string | null;
          contact_public_value?: string | null;
          description_sanitized?: string | null;
          ends_at?: string | null;
          id?: string | null;
          location_lat?: number | null;
          location_lon?: number | null;
          location_public?: string | null;
          rsvp_count?: never;
          starts_at?: string | null;
          status?: string | null;
          territory_id?: string | null;
          timezone?: string | null;
          title?: string | null;
          type?: string | null;
          updated_at?: string | null;
        };
        Update: {
          contact_public_type?: string | null;
          contact_public_value?: string | null;
          description_sanitized?: string | null;
          ends_at?: string | null;
          id?: string | null;
          location_lat?: number | null;
          location_lon?: number | null;
          location_public?: string | null;
          rsvp_count?: never;
          starts_at?: string | null;
          status?: string | null;
          territory_id?: string | null;
          timezone?: string | null;
          title?: string | null;
          type?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'activities_territory_id_fkey';
            columns: ['territory_id'];
            isOneToOne: false;
            referencedRelation: 'territories';
            referencedColumns: ['id'];
          },
        ];
      };
      whatsapp_groups_public: {
        Row: {
          display_name: string | null;
          id: string | null;
          join_url: string | null;
          status: string | null;
          territory_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          display_name?: string | null;
          id?: string | null;
          join_url?: string | null;
          status?: string | null;
          territory_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          display_name?: string | null;
          id?: string | null;
          join_url?: string | null;
          status?: string | null;
          territory_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'whatsapp_groups_territory_id_fkey';
            columns: ['territory_id'];
            isOneToOne: false;
            referencedRelation: 'territories';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      activity_rsvp_count: { Args: { p_activity: string }; Returns: number };
      svc_add_group_manager: {
        Args: {
          p_admin: string;
          p_email: string;
          p_group_id: string;
          p_name: string;
          p_phone: string;
          p_request_id?: string;
          p_role_label: string;
        };
        Returns: string;
      };
      svc_approve_activity: {
        Args: {
          p_admin: string;
          p_id: string;
          p_reason?: string;
          p_request_id?: string;
        };
        Returns: number;
      };
      svc_approve_group_proposal: {
        Args: {
          p_admin: string;
          p_id: string;
          p_reason: string;
          p_request_id?: string;
        };
        Returns: Json;
      };
      svc_consume_turnstile_token: {
        Args: { p_hash: string; p_ttl_seconds?: number };
        Returns: boolean;
      };
      svc_create_group_proposal: {
        Args: {
          p_consent_version: string;
          p_fingerprint_hash: string;
          p_idempotency_hash: string;
          p_idempotency_ttl_seconds?: number;
          p_join_url: string;
          p_name: string;
          p_proposer_email: string;
          p_proposer_name: string;
          p_proposer_phone: string;
          p_proposer_user_id: string;
          p_territory_id: string;
        };
        Returns: Json;
      };
      svc_create_profile: {
        Args: {
          p_consent_version: string;
          p_contact_opt_in: boolean;
          p_display_name: string;
          p_email: string;
          p_email_state: string;
          p_phone: string;
          p_territory_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      svc_delete_profile: { Args: { p_user: string }; Returns: undefined };
      svc_dev_wipe_identities: {
        Args: { p_request_id?: string };
        Returns: Json;
      };
      svc_email_in_use: {
        Args: { p_email: string; p_exclude: string };
        Returns: boolean;
      };
      svc_erase_group_proposals: {
        Args: { p_admin?: string; p_ids: string[]; p_request_id?: string };
        Returns: number;
      };
      svc_erase_user_data: {
        Args: { p_request_id?: string; p_user: string };
        Returns: Json;
      };
      svc_get_profile: { Args: { p_user: string }; Returns: Json };
      svc_grant_admin: {
        Args: { p_created_by?: string; p_user: string };
        Returns: undefined;
      };
      svc_is_admin: { Args: { p_user: string }; Returns: boolean };
      svc_is_email_verified: { Args: { p_user: string }; Returns: boolean };
      svc_list_group_proposals: {
        Args: {
          p_cursor_created?: string;
          p_cursor_id?: string;
          p_limit: number;
          p_status: string;
        };
        Returns: Json;
      };
      svc_list_security_events: {
        Args: {
          p_cursor_created?: string;
          p_cursor_id?: string;
          p_limit: number;
        };
        Returns: Json;
      };
      svc_purge_expired: { Args: never; Returns: Json };
      svc_record_abuse: {
        Args: {
          p_block_code?: string;
          p_event_type: string;
          p_route: string;
          p_subject_hash: string;
        };
        Returns: undefined;
      };
      svc_record_audit: {
        Args: {
          p_action: string;
          p_actor: string;
          p_entity_id: string;
          p_entity_type: string;
          p_reason?: string;
          p_request_id: string;
        };
        Returns: undefined;
      };
      svc_reject_activity: {
        Args: {
          p_admin: string;
          p_id: string;
          p_reason: string;
          p_request_id?: string;
        };
        Returns: number;
      };
      svc_reject_group_proposal: {
        Args: {
          p_admin: string;
          p_id: string;
          p_reason: string;
          p_request_id?: string;
        };
        Returns: Json;
      };
      svc_reveal_proposal_contact: {
        Args: {
          p_admin: string;
          p_id: string;
          p_reason?: string;
          p_request_id?: string;
        };
        Returns: Json;
      };
      svc_suspend_activity: {
        Args: {
          p_admin: string;
          p_id: string;
          p_reason: string;
          p_request_id?: string;
        };
        Returns: number;
      };
      svc_suspend_group: {
        Args: {
          p_admin: string;
          p_id: string;
          p_reason: string;
          p_request_id?: string;
        };
        Returns: Json;
      };
      svc_unsuspend_activity: {
        Args: {
          p_admin: string;
          p_id: string;
          p_reason: string;
          p_request_id?: string;
        };
        Returns: Json;
      };
      svc_unsuspend_group: {
        Args: {
          p_admin: string;
          p_id: string;
          p_reason: string;
          p_request_id?: string;
        };
        Returns: Json;
      };
      svc_update_profile: {
        Args: {
          p_contact_opt_in?: boolean;
          p_display_name?: string;
          p_email_contact?: string;
          p_email_state?: string;
          p_phone?: string;
          p_territory_id?: string;
          p_user: string;
        };
        Returns: Json;
      };
      svc_upsert_rsvp: {
        Args: {
          p_activity: string;
          p_going: boolean;
          p_idempotency_hash?: string;
          p_subject_hash: string;
          p_user: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  app_private: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
