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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          metadata: Json | null
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_addresses: {
        Row: {
          city: string | null
          client_id: string
          complement: string | null
          created_at: string
          district: string | null
          id: string
          is_primary: boolean
          label: string | null
          number: string | null
          organization_id: string
          state: string | null
          street: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          client_id: string
          complement?: string | null
          created_at?: string
          district?: string | null
          id?: string
          is_primary?: boolean
          label?: string | null
          number?: string | null
          organization_id: string
          state?: string | null
          street?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          client_id?: string
          complement?: string | null
          created_at?: string
          district?: string | null
          id?: string
          is_primary?: boolean
          label?: string | null
          number?: string | null
          organization_id?: string
          state?: string | null
          street?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_addresses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_addresses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          organization_id: string
          phone: string | null
          role: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          organization_id: string
          phone?: string | null
          role?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          organization_id?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          archived_at: string | null
          birth_date: string | null
          city: string | null
          complement: string | null
          created_at: string
          created_by: string | null
          district: string | null
          document: string | null
          document_digits: string | null
          email: string | null
          id: string
          last_interaction_at: string | null
          legal_rep_name: string | null
          name: string
          notes: string | null
          number: string | null
          organization_id: string
          owner_id: string | null
          owner_name: string | null
          person_type: Database["public"]["Enums"]["person_type"]
          phone: string | null
          state: string | null
          status: Database["public"]["Enums"]["client_status"]
          street: string | null
          trade_name: string | null
          updated_at: string
          updated_by: string | null
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          archived_at?: string | null
          birth_date?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          created_by?: string | null
          district?: string | null
          document?: string | null
          document_digits?: string | null
          email?: string | null
          id?: string
          last_interaction_at?: string | null
          legal_rep_name?: string | null
          name: string
          notes?: string | null
          number?: string | null
          organization_id: string
          owner_id?: string | null
          owner_name?: string | null
          person_type?: Database["public"]["Enums"]["person_type"]
          phone?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          street?: string | null
          trade_name?: string | null
          updated_at?: string
          updated_by?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          archived_at?: string | null
          birth_date?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          created_by?: string | null
          district?: string | null
          document?: string | null
          document_digits?: string | null
          email?: string | null
          id?: string
          last_interaction_at?: string | null
          legal_rep_name?: string | null
          name?: string
          notes?: string | null
          number?: string | null
          organization_id?: string
          owner_id?: string | null
          owner_name?: string | null
          person_type?: Database["public"]["Enums"]["person_type"]
          phone?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          street?: string | null
          trade_name?: string | null
          updated_at?: string
          updated_by?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          active: boolean
          archived_at: string | null
          category: Database["public"]["Enums"]["document_category"]
          created_at: string
          created_by: string | null
          default_validity_days: number | null
          description: string | null
          id: string
          name: string
          organization_id: string
          requires_expiration_date: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          created_by?: string | null
          default_validity_days?: number | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          requires_expiration_date?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          created_by?: string | null
          default_validity_days?: number | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          requires_expiration_date?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          created_at: string
          document_id: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          notes: string | null
          organization_id: string
          original_file_name: string
          stored_file_name: string
          uploaded_by: string | null
          uploaded_by_name: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          document_id: string
          file_path: string
          file_size: number
          id?: string
          mime_type: string
          notes?: string | null
          organization_id: string
          original_file_name: string
          stored_file_name: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
          version_number: number
        }
        Update: {
          created_at?: string
          document_id?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          notes?: string | null
          organization_id?: string
          original_file_name?: string
          stored_file_name?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          archived_at: string | null
          checklist_item_id: string | null
          client_id: string | null
          created_at: string
          current_version: number
          description: string | null
          document_number: string | null
          document_type_id: string | null
          expiration_date: string | null
          file_extension: string
          file_path: string
          file_size: number
          id: string
          issue_date: string | null
          issuer: string | null
          mime_type: string
          notes: string | null
          organization_id: string
          original_file_name: string
          process_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          status: Database["public"]["Enums"]["document_status"]
          stored_file_name: string
          title: string
          updated_at: string
          uploaded_by: string | null
          uploaded_by_name: string | null
        }
        Insert: {
          archived_at?: string | null
          checklist_item_id?: string | null
          client_id?: string | null
          created_at?: string
          current_version?: number
          description?: string | null
          document_number?: string | null
          document_type_id?: string | null
          expiration_date?: string | null
          file_extension: string
          file_path: string
          file_size: number
          id?: string
          issue_date?: string | null
          issuer?: string | null
          mime_type: string
          notes?: string | null
          organization_id: string
          original_file_name: string
          process_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          stored_file_name: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Update: {
          archived_at?: string | null
          checklist_item_id?: string | null
          client_id?: string | null
          created_at?: string
          current_version?: number
          description?: string | null
          document_number?: string | null
          document_type_id?: string | null
          expiration_date?: string | null
          file_extension?: string
          file_path?: string
          file_size?: number
          id?: string
          issue_date?: string | null
          issuer?: string | null
          mime_type?: string
          notes?: string | null
          organization_id?: string
          original_file_name?: string
          process_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          stored_file_name?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "process_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_history: {
        Row: {
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          id: string
          monitoring_item_id: string
          new_document_id: string | null
          new_expiration_date: string | null
          new_issue_date: string | null
          notes: string | null
          organization_id: string
          previous_document_id: string | null
          previous_expiration_date: string | null
          previous_issue_date: string | null
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          monitoring_item_id: string
          new_document_id?: string | null
          new_expiration_date?: string | null
          new_issue_date?: string | null
          notes?: string | null
          organization_id: string
          previous_document_id?: string | null
          previous_expiration_date?: string | null
          previous_issue_date?: string | null
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          id?: string
          monitoring_item_id?: string
          new_document_id?: string | null
          new_expiration_date?: string | null
          new_issue_date?: string | null
          notes?: string | null
          organization_id?: string
          previous_document_id?: string | null
          previous_expiration_date?: string | null
          previous_issue_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_history_monitoring_item_id_fkey"
            columns: ["monitoring_item_id"]
            isOneToOne: false
            referencedRelation: "monitoring_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoring_history_monitoring_item_id_fkey"
            columns: ["monitoring_item_id"]
            isOneToOne: false
            referencedRelation: "monitoring_items_status_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoring_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_items: {
        Row: {
          archived_at: string | null
          auto_generated: boolean
          client_id: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          expiration_date: string | null
          id: string
          issue_date: string | null
          notes: string | null
          organization_id: string
          process_id: string | null
          reference_number: string | null
          responsible_name: string | null
          responsible_user_id: string | null
          status: Database["public"]["Enums"]["monitoring_status"]
          title: string
          type: Database["public"]["Enums"]["document_category"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          auto_generated?: boolean
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          expiration_date?: string | null
          id?: string
          issue_date?: string | null
          notes?: string | null
          organization_id: string
          process_id?: string | null
          reference_number?: string | null
          responsible_name?: string | null
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["monitoring_status"]
          title: string
          type?: Database["public"]["Enums"]["document_category"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          auto_generated?: boolean
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          expiration_date?: string | null
          id?: string
          issue_date?: string | null
          notes?: string | null
          organization_id?: string
          process_id?: string | null
          reference_number?: string | null
          responsible_name?: string | null
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["monitoring_status"]
          title?: string
          type?: Database["public"]["Enums"]["document_category"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoring_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoring_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoring_items_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          organization_id: string
          read_at: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: string
          organization_id: string
          read_at?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: string
          organization_id?: string
          read_at?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_counters: {
        Row: {
          created_at: string
          organization_id: string
          process_seq: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          process_seq?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          process_seq?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          cancelled_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          invited_by_name: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_by_name?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_by_name?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          city: string | null
          clients_range: string | null
          complement: string | null
          created_at: string
          current_control: string | null
          district: string | null
          employees_range: string | null
          logo_url: string | null
          main_services: string | null
          number: string | null
          organization_id: string
          portal_name: string | null
          primary_color: string | null
          state: string | null
          street: string | null
          theme_preference: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          clients_range?: string | null
          complement?: string | null
          created_at?: string
          current_control?: string | null
          district?: string | null
          employees_range?: string | null
          logo_url?: string | null
          main_services?: string | null
          number?: string | null
          organization_id: string
          portal_name?: string | null
          primary_color?: string | null
          state?: string | null
          street?: string | null
          theme_preference?: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          clients_range?: string | null
          complement?: string | null
          created_at?: string
          current_control?: string | null
          district?: string | null
          employees_range?: string | null
          logo_url?: string | null
          main_services?: string | null
          number?: string | null
          organization_id?: string
          portal_name?: string | null
          primary_color?: string | null
          state?: string | null
          street?: string | null
          theme_preference?: string
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          document: string | null
          document_digits: string | null
          email: string | null
          id: string
          legal_name: string
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          onboarding_step: number
          phone: string | null
          sample_data_at: string | null
          slug: string | null
          trade_name: string | null
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          document_digits?: string | null
          email?: string | null
          id?: string
          legal_name: string
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: number
          phone?: string | null
          sample_data_at?: string | null
          slug?: string | null
          trade_name?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          document_digits?: string | null
          email?: string | null
          id?: string
          legal_name?: string
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: number
          phone?: string | null
          sample_data_at?: string | null
          slug?: string | null
          trade_name?: string | null
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      permissions: {
        Row: {
          key: string
          label: string
          module: string
        }
        Insert: {
          key: string
          label: string
          module: string
        }
        Update: {
          key?: string
          label?: string
          module?: string
        }
        Relationships: []
      }
      process_checklist_items: {
        Row: {
          assignee_name: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          organization_id: string
          position: number
          process_id: string
          required: boolean
          status: Database["public"]["Enums"]["checklist_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assignee_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id: string
          position?: number
          process_id: string
          required?: boolean
          status?: Database["public"]["Enums"]["checklist_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assignee_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string
          position?: number
          process_id?: string
          required?: boolean
          status?: Database["public"]["Enums"]["checklist_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_checklist_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_checklist_items_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      process_movements: {
        Row: {
          actor_name: string | null
          created_at: string
          created_by: string | null
          description: string
          from_stage: Database["public"]["Enums"]["process_stage"] | null
          id: string
          organization_id: string
          process_id: string
          to_stage: Database["public"]["Enums"]["process_stage"] | null
        }
        Insert: {
          actor_name?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          from_stage?: Database["public"]["Enums"]["process_stage"] | null
          id?: string
          organization_id: string
          process_id: string
          to_stage?: Database["public"]["Enums"]["process_stage"] | null
        }
        Update: {
          actor_name?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          from_stage?: Database["public"]["Enums"]["process_stage"] | null
          id?: string
          organization_id?: string
          process_id?: string
          to_stage?: Database["public"]["Enums"]["process_stage"] | null
        }
        Relationships: [
          {
            foreignKeyName: "process_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_movements_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      process_stages: {
        Row: {
          created_at: string
          id: string
          key: Database["public"]["Enums"]["process_stage"]
          label: string
          organization_id: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          key: Database["public"]["Enums"]["process_stage"]
          label: string
          organization_id: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          key?: Database["public"]["Enums"]["process_stage"]
          label?: string
          organization_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "process_stages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      processes: {
        Row: {
          archived_at: string | null
          client_id: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          documents_received: number
          documents_total: number
          due_date: string | null
          financial_status: Database["public"]["Enums"]["financial_status"]
          id: string
          last_movement_at: string | null
          notes: string | null
          opened_at: string
          organization_id: string
          owner_id: string | null
          owner_name: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          protocol: string | null
          service_type_id: string | null
          stage: Database["public"]["Enums"]["process_stage"]
          title: string | null
          updated_at: string
          updated_by: string | null
          value: number | null
        }
        Insert: {
          archived_at?: string | null
          client_id: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          documents_received?: number
          documents_total?: number
          due_date?: string | null
          financial_status?: Database["public"]["Enums"]["financial_status"]
          id?: string
          last_movement_at?: string | null
          notes?: string | null
          opened_at?: string
          organization_id: string
          owner_id?: string | null
          owner_name?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          protocol?: string | null
          service_type_id?: string | null
          stage?: Database["public"]["Enums"]["process_stage"]
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: number | null
        }
        Update: {
          archived_at?: string | null
          client_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          documents_received?: number
          documents_total?: number
          due_date?: string | null
          financial_status?: Database["public"]["Enums"]["financial_status"]
          id?: string
          last_movement_at?: string | null
          notes?: string | null
          opened_at?: string
          organization_id?: string
          owner_id?: string | null
          owner_name?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          protocol?: string | null
          service_type_id?: string | null
          stage?: Database["public"]["Enums"]["process_stage"]
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "processes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processes_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      service_types: {
        Row: {
          created_at: string
          default_checklist: Json
          default_days: number | null
          default_value: number | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          suggested_stages: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_checklist?: Json
          default_days?: number | null
          default_value?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          suggested_stages?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_checklist?: Json
          default_days?: number | null
          default_value?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          suggested_stages?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          archived_at: string | null
          comment: string
          created_at: string
          id: string
          organization_id: string
          task_id: string
          updated_at: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          archived_at?: string | null
          comment: string
          created_at?: string
          id?: string
          organization_id: string
          task_id: string
          updated_at?: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          archived_at?: string | null
          comment?: string
          created_at?: string
          id?: string
          organization_id?: string
          task_id?: string
          updated_at?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          action: string
          created_at: string
          id: string
          new_value: string | null
          old_value: string | null
          organization_id: string
          task_id: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          organization_id: string
          task_id: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          organization_id?: string
          task_id?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          archived_at: string | null
          assignee_id: string | null
          assignee_name: string | null
          client_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          document_id: string | null
          due_at: string | null
          due_time: string | null
          id: string
          monitoring_item_id: string | null
          notes: string | null
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          process_id: string | null
          recurrence_end_date: string | null
          recurrence_type: string
          reminder_at: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          assignee_id?: string | null
          assignee_name?: string | null
          client_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_id?: string | null
          due_at?: string | null
          due_time?: string | null
          id?: string
          monitoring_item_id?: string | null
          notes?: string | null
          organization_id: string
          priority?: Database["public"]["Enums"]["priority_level"]
          process_id?: string | null
          recurrence_end_date?: string | null
          recurrence_type?: string
          reminder_at?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          assignee_id?: string | null
          assignee_name?: string | null
          client_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_id?: string | null
          due_at?: string | null
          due_time?: string | null
          id?: string
          monitoring_item_id?: string | null
          notes?: string | null
          organization_id?: string
          priority?: Database["public"]["Enums"]["priority_level"]
          process_id?: string | null
          recurrence_end_date?: string | null
          recurrence_type?: string
          reminder_at?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_monitoring_item_id_fkey"
            columns: ["monitoring_item_id"]
            isOneToOne: false
            referencedRelation: "monitoring_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_monitoring_item_id_fkey"
            columns: ["monitoring_item_id"]
            isOneToOne: false
            referencedRelation: "monitoring_items_status_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      monitoring_items_status_view: {
        Row: {
          archived_at: string | null
          auto_generated: boolean | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          days_remaining: number | null
          document_id: string | null
          expiration_date: string | null
          id: string | null
          is_expired: boolean | null
          is_expiring_soon: boolean | null
          issue_date: string | null
          notes: string | null
          organization_id: string | null
          process_id: string | null
          reference_number: string | null
          responsible_name: string | null
          responsible_user_id: string | null
          situation: string | null
          status: Database["public"]["Enums"]["monitoring_status"] | null
          title: string | null
          type: Database["public"]["Enums"]["document_category"] | null
          updated_at: string | null
          urgency: number | null
        }
        Insert: {
          archived_at?: string | null
          auto_generated?: boolean | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          days_remaining?: never
          document_id?: string | null
          expiration_date?: string | null
          id?: string | null
          is_expired?: never
          is_expiring_soon?: never
          issue_date?: string | null
          notes?: string | null
          organization_id?: string | null
          process_id?: string | null
          reference_number?: string | null
          responsible_name?: string | null
          responsible_user_id?: string | null
          situation?: never
          status?: Database["public"]["Enums"]["monitoring_status"] | null
          title?: string | null
          type?: Database["public"]["Enums"]["document_category"] | null
          updated_at?: string | null
          urgency?: never
        }
        Update: {
          archived_at?: string | null
          auto_generated?: boolean | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          days_remaining?: never
          document_id?: string | null
          expiration_date?: string | null
          id?: string | null
          is_expired?: never
          is_expiring_soon?: never
          issue_date?: string | null
          notes?: string | null
          organization_id?: string | null
          process_id?: string | null
          reference_number?: string | null
          responsible_name?: string | null
          responsible_user_id?: string | null
          situation?: never
          status?: Database["public"]["Enums"]["monitoring_status"] | null
          title?: string | null
          type?: Database["public"]["Enums"]["document_category"] | null
          updated_at?: string | null
          urgency?: never
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoring_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoring_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoring_items_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: {
        Args: { _token: string }
        Returns: {
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      bootstrap_organization: {
        Args: never
        Returns: {
          is_active: boolean
          membership_id: string
          membership_status: string
          onboarding_completed_at: string
          onboarding_step: number
          organization_id: string
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      cancel_invitation: { Args: { _invitation: string }; Returns: undefined }
      change_member_role: {
        Args: {
          _member: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      create_invitation: {
        Args: {
          _email: string
          _org: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: {
          expires_at: string
          invitation_id: string
          token: string
        }[]
      }
      has_org_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["app_role"][]
        }
        Returns: boolean
      }
      invitation_preview: {
        Args: { _token: string }
        Returns: {
          email: string
          expires_at: string
          organization_name: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
        }[]
      }
      is_org_member: { Args: { _org: string }; Returns: boolean }
      next_process_code: { Args: { _org: string }; Returns: string }
      seed_default_document_types: {
        Args: { _org: string }
        Returns: undefined
      }
      set_member_active: {
        Args: { _active: boolean; _member: string }
        Returns: undefined
      }
      storage_path_org: { Args: { _name: string }; Returns: string }
      transfer_member_responsibilities: {
        Args: { _from: string; _org: string; _to: string }
        Returns: {
          monitoring_moved: number
          processes_moved: number
          tasks_moved: number
        }[]
      }
    }
    Enums: {
      app_role:
        | "superadmin"
        | "proprietario"
        | "administrador"
        | "gestor"
        | "operacional"
        | "atendimento"
        | "financeiro"
        | "visualizador"
        | "cliente_externo"
      checklist_status:
        | "pendente"
        | "recebido"
        | "em_analise"
        | "aprovado"
        | "rejeitado"
      client_status:
        | "lead"
        | "em_cadastro"
        | "ativo"
        | "com_pendencia"
        | "inativo"
        | "arquivado"
      document_category:
        | "identificacao"
        | "certidao"
        | "comprovante"
        | "contrato"
        | "formulario"
        | "autorizacao"
        | "registro"
        | "licenca"
        | "financeiro"
        | "outros"
      document_status:
        | "pendente"
        | "recebido"
        | "em_analise"
        | "aprovado"
        | "rejeitado"
        | "vencido"
        | "arquivado"
      financial_status:
        | "nao_aplicavel"
        | "pendente"
        | "parcial"
        | "pago"
        | "atrasado"
      monitoring_status: "ativo" | "em_renovacao" | "renovado" | "arquivado"
      person_type: "pf" | "pj"
      priority_level: "baixa" | "media" | "alta" | "critica"
      process_stage:
        | "novo"
        | "aguardando_documentos"
        | "documentos_conferencia"
        | "montagem"
        | "pronto_protocolo"
        | "protocolado"
        | "em_analise"
        | "exigencia"
        | "deferido"
        | "finalizado"
        | "arquivado"
        | "cancelado"
      task_status:
        | "pendente"
        | "em_andamento"
        | "concluida"
        | "cancelada"
        | "aguardando"
        | "arquivada"
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
      app_role: [
        "superadmin",
        "proprietario",
        "administrador",
        "gestor",
        "operacional",
        "atendimento",
        "financeiro",
        "visualizador",
        "cliente_externo",
      ],
      checklist_status: [
        "pendente",
        "recebido",
        "em_analise",
        "aprovado",
        "rejeitado",
      ],
      client_status: [
        "lead",
        "em_cadastro",
        "ativo",
        "com_pendencia",
        "inativo",
        "arquivado",
      ],
      document_category: [
        "identificacao",
        "certidao",
        "comprovante",
        "contrato",
        "formulario",
        "autorizacao",
        "registro",
        "licenca",
        "financeiro",
        "outros",
      ],
      document_status: [
        "pendente",
        "recebido",
        "em_analise",
        "aprovado",
        "rejeitado",
        "vencido",
        "arquivado",
      ],
      financial_status: [
        "nao_aplicavel",
        "pendente",
        "parcial",
        "pago",
        "atrasado",
      ],
      monitoring_status: ["ativo", "em_renovacao", "renovado", "arquivado"],
      person_type: ["pf", "pj"],
      priority_level: ["baixa", "media", "alta", "critica"],
      process_stage: [
        "novo",
        "aguardando_documentos",
        "documentos_conferencia",
        "montagem",
        "pronto_protocolo",
        "protocolado",
        "em_analise",
        "exigencia",
        "deferido",
        "finalizado",
        "arquivado",
        "cancelado",
      ],
      task_status: [
        "pendente",
        "em_andamento",
        "concluida",
        "cancelada",
        "aguardando",
        "arquivada",
      ],
    },
  },
} as const
