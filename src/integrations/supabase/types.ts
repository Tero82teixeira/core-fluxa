Warning: truncated output (original token count: 33899)
Total output lines: 4321

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
      automation_executions: {
        Row: {
          automation_rule_id: string
          automation_schedule_id: string | null
          created_at: string
          dedupe_key: string
          entity_id: string | null
          entity_type: string
          error_code: string | null
          error_message: string | null
          event_type: string
          execution_depth: number
          finished_at: string | null
          id: string
          input_payload: Json
          organization_id: string
          output_payload: Json | null
          scheduled_for: string | null
          source_automation_rule_id: string | null
          started_at: string
          status: string
        }
        Insert: {
          automation_rule_id: string
          automation_schedule_id?: string | null
          created_at?: string
          dedupe_key: string
          entity_id?: string | null
          entity_type: string
          error_code?: string | null
          error_message?: string | null
          event_type: string
          execution_depth?: number
          finished_at?: string | null
          id?: string
          input_payload?: Json
          organization_id: string
          output_payload?: Json | null
          scheduled_for?: string | null
          source_automation_rule_id?: string | null
          started_at?: string
          status: string
        }
        Update: {
          automation_rule_id?: string
          automation_schedule_id?: string | null
          created_at?: string
          dedupe_key?: string
          entity_id?: string | null
          entity_type?: string
          error_code?: string | null
          error_message?: string | null
          event_type?: string
          execution_depth?: number
          finished_at?: string | null
          id?: string
          input_payload?: Json
          organization_id?: string
          output_payload?: Json | null
          scheduled_for?: string | null
          source_automation_rule_id?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_executions_automation_rule_id_fkey"
            columns: ["automation_rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_automation_schedule_id_fkey"
            columns: ["automation_schedule_id"]
            isOneToOne: false
            referencedRelation: "automation_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_source_automation_rule_id_fkey"
            columns: ["source_automation_rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          action_config: Json
          action_type: string
          archived_at: string | null
          conditions: Json
          created_at: string
          created_by: string
          creator_name: string | null
          description: string | null
          execution_count: number
          failure_count: number
          id: string
          is_active: boolean
          last_executed_at: string | null
          name: string
          organization_id: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          archived_at?: string | null
          conditions?: Json
          created_at?: string
          created_by: string
          creator_name?: string | null
          description?: string | null
          execution_count?: number
          failure_count?: number
          id?: string
          is_active?: boolean
          last_executed_at?: string | null
          name: string
          organization_id: string
          trigger_type: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          archived_at?: string | null
          conditions?: Json
          created_at?: string
          created_by?: string
          creator_name?: string | null
          description?: string | null
          execution_count?: number
          failure_count?: number
          id?: string
          is_active?: boolean
          last_executed_at?: string | null
          name?: string
          organization_id?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_schedules: {
        Row: {
          automation_rule_id: string
          created_at: string
          id: string
          interval_days: number | null
          is_active: boolean
          last_executed_at: string | null
          last_scheduled_for: string | null
          next_execution_at: string
          organization_id: string
          run_at: string | null
          schedule_type: string
          timezone: string
          updated_at: string
        }
        Insert: {
          automation_rule_id: string
          created_at?: string
          id?: string
          interval_days?: number | null
          is_active?: boolean
          last_executed_at?: string | null
          last_scheduled_for?: string | null
          next_execution_at: string
          organization_id: string
          run_at?: string | null
          schedule_type: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          automation_rule_id?: string
          created_at?: string
          id?: string
          interval_days?: number | null
          is_active?: boolean
          last_executed_at?: string | null
          last_scheduled_for?: string | null
          next_execution_at?: string
          organization_id?: string
          run_at?: string | null
          schedule_type?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_schedules_rule_organization_fkey"
            columns: ["automation_rule_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id", "organization_id"]
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
            foreignKeyName: "client_addresses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
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
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
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
      communication_entries: {
        Row: {
          contact_made: boolean
          content: string
          created_at: string
          created_by: string
          entry_type: Database["public"]["Enums"]["communication_entry_type"]
          id: string
          is_internal: boolean
          metadata: Json
          occurred_at: string
          organization_id: string
          thread_id: string
        }
        Insert: {
          contact_made?: boolean
          content: string
          created_at?: string
          created_by: string
          entry_type: Database["public"]["Enums"]["communication_entry_type"]
          id?: string
          is_internal?: boolean
          metadata?: Json
          occurred_at?: string
          organization_id: string
          thread_id: string
        }
        Update: {
          contact_made?: boolean
          content?: string
          created_at?: string
          created_by?: string
          entry_type?: Database["public"]["Enums"]["communication_entry_type"]
          id?: string
          is_internal?: boolean
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_entries_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communication_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_threads: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          channel: Database["public"]["Enums"]["communication_channel"]
          client_id: string
          created_at: string
          created_by: string
          follow_up_at: string | null
          id: string
          organization_id: string
          priority: Database["public"]["Enums"]["communication_priority"]
          process_id: string | null
          status: Database["public"]["Enums"]["communication_status"]
          subject: string
          task_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          channel?: Database["public"]["Enums"]["communication_channel"]
          client_id: string
          created_at?: string
          created_by: string
          follow_up_at?: string | null
          id?: string
          organization_id: string
          priority?: Database["public"]["Enums"]["communication_priority"]
          process_id?: string | null
          status?: Database["public"]["Enums"]["communication_status"]
          subject: string
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          channel?: Database["public"]["Enums"]["communication_channel"]
          client_id?: string
          created_at?: string
          created_by?: string
          follow_up_at?: string | null
          id?: string
          organization_id?: string
          priority?: Database["public"]["Enums"]["communication_priority"]
          process_id?: string | null
          status?: Database["public"]["Enums"]["communication_status"]
          subject?: string
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      document_code_counters: {
        Row: {
          code_year: number
          last_value: number
          organization_id: string
        }
        Insert: {
          code_year: number
          last_value?: number
          organization_id: string
        }
        Update: {
          code_year?: number
          last_value?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_code_counters_organization_id_fkey"
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
          internal_code: string
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
          internal_code?: string
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
          internal_code?: string
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
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
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
      financial_account_movements: {
        Row: {
          account_id: string
          amount: number
          balance_after: number
          created_at: string
          created_by: string
          description: string
          id: string
          organization_id: string
          payment_id: string | null
          transaction_id: string | null
          type: string
        }
        Insert: {
          account_id: string
          amount: number
          balance_after: number
          created_at?: string
          created_by: string
          description: string
          id?: string
          organization_id: string
          payment_id?: string | null
          transaction_id?: string | null
          type: string
        }
        Update: {
          account_id?: string
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          organization_id?: string
          payment_id?: string | null
          transaction_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_account_movements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_account_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_account_movements_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "financial_transaction_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_account_movements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_accounts: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          current_balance: number
          description: string | null
          id: string
          initial_balance: number
          is_active: boolean
          name: string
          organization_id: string
          type: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          current_balance?: number
          description?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean
          name: string
          organization_id: string
          type: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          current_balance?: number
          description?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean
          name?: string
          organization_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_categories: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          type: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          type: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_recurrences: {
        Row: {
          account_id: string | null
          amount: number
          archived_at: string | null
          category_id: string | null
          client_id: string | null
          created_at: string
          created_by: string
          end_date: string | null
          frequency: string
          id: string
          interval_count: number
          name: string
          next_run_date: string
          notes: string | null
          organization_id: string
          process_id: string | null
          start_date: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          archived_at?: string | null
          category_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by: string
          end_date?: string | null
          frequency: string
          id?: string
          interval_count?: number
          name: string
          next_run_date: string
          notes?: string | null
          organization_id: string
          process_id?: string | null
          start_date: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          archived_at?: string | null
          category_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          end_date?: string | null
          frequency?: string
          id?: string
          interval_count?: number
          name?: string
          next_run_date?: string
          notes?: string | null
          organization_id?: string
          process_id?: string | null
          start_date?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_recurrences_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_recurrences_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_recurrences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_recurrences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_recurrences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_recurrences_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transaction_payments: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          created_by: string
          id: string
          notes: string | null
          organization_id: string
          paid_at: string
          payment_method: string | null
          reversal_notes: string | null
          reversed_at: string | null
          transaction_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          organization_id: string
          paid_at?: string
          payment_method?: string | null
          reversal_notes?: string | null
          reversed_at?: string | null
          transaction_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string
          payment_method?: string | null
          reversal_notes?: string | null
          reversed_at?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transaction_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transaction_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transaction_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          account_id: string | null
          amount: number
          archived_at: string | null
          category_id: string | null
          client_id: string | null
          competence_date: string | null
          created_at: string
          created_by: string
          description: string
          document_id: string | null
          due_date: string
          id: string
          notes: string | null
          organization_id: string
          paid_at: string | null
          payment_method: string | null
          process_id: string | null
          recurrence_due_date: string | null
          recurrence_id: string | null
          reference: string | null
          responsible_user_id: string | null
          status: string
          task_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          archived_at?: string | null
          category_id?: string | null
          client_id?: string | null
          competence_date?: string | null
          created_at?: string
          created_by: string
          description: string
          document_id?: string | null
          due_date: string
          id?: string
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          payment_method?: string | null
          process_id?: string | null
          recurrence_due_date?: string | null
          recurrence_id?: string | null
          reference?: string | null
          responsible_user_id?: string | null
          status?: string
          task_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          archived_at?: string | null
          category_id?: string | null
          client_id?: string | null
          competence_date?: string | null
          created_at?: string
          created_by?: string
          description?: string
          document_id?: string | null
          due_date?: string
          id?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          payment_method?: string | null
          process_id?: string | null
          recurrence_due_date?: string | null
          recurrence_id?: string | null
          reference?: string | null
          responsible_user_id?: string | null
          status?: string
          task_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_recurrence_id_fkey"
            columns: ["recurrence_id"]
            isOneToOne: false
            referencedRelation: "financial_recurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      kiwify_webhook_events: {
        Row: {
          event_key: string
          event_type: string
          organization_id: string | null
          processed_at: string | null
          processing_error: string | null
          provider_order_id: string | null
          provider_subscription_id: string | null
          received_at: string
        }
        Insert: {
          event_key: string
          event_type: string
          organization_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          provider_order_id?: string | null
          provider_subscription_id?: string | null
          received_at?: string
        }
        Update: {
          event_key?: string
          event_type?: string
          organization_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          provider_order_id?: string | null
          provider_subscription_id?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kiwify_webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_acceptances: {
        Row: {
          acceptance_source: string
          accepted_at: string
          document_type: string
          document_version: string
          id: string
          user_id: string
        }
        Insert: {
          acceptance_source: string
          accepted_at?: string
          document_type: string
          document_version: string
          id?: string
          user_id: string
        }
        Update: {
          acceptance_source?: string
          accepted_at?: string
          document_type?: string
          document_version?: string
          id?: string
          user_id?: string
        }
        Relationships: []
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
            foreignKeyName: "monitoring_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
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
      monitoring_state_history: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          monitoring_state_id: string
          note: string | null
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          monitoring_state_id: string
          note?: string | null
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          monitoring_state_id?: string
          note?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_state_history_monitoring_state_id_fkey"
            columns: ["monitoring_state_id"]
            isOneToOne: false
            referencedRelation: "monitoring_states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitoring_state_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_states: {
        Row: {
          alert_kind: string
          assigned_to: string | null
          created_at: string
          created_by: string | null
          id: string
          ignored_at: string | null
          monitoring_status: string
          notes: string | null
          organization_id: string
          priority_override: string | null
          resolved_at: string | null
          source_id: string
          source_type: string
          updated_at: string
        }
        Insert: {
          alert_kind: string
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ignored_at?: string | null
          monitoring_status?: string
          notes?: string | null
          organization_id: string
          priority_override?: string | null
          resolved_at?: string | null
          source_id: string
          source_type: string
          updated_at?: string
        }
        Update: {
          alert_kind?: string
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          ignored_at?: string | null
          monitoring_status?: string
          notes?: string | null
          organization_id?: string
          priority_override?: string | null
          resolved_at?: string | null
          source_id?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_states_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          archived_at: string | null
          body: string | null
          created_at: string
          dedupe_key: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          organization_id: string
          read_at: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          archived_at?: string | null
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          organization_id: string
          read_at?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          archived_at?: string | null
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
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
          accepted_by: string | null
          cancelled_at: string | null
…3899 tokens truncated…   Insert: {
          created_at?: string
          created_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          user_id?: string
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
            foreignKeyName: "processes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
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
      support_request_messages: {
        Row: {
          author_id: string | null
          author_kind: string
          created_at: string
          id: string
          message: string
          organization_id: string
          request_id: string
        }
        Insert: {
          author_id?: string | null
          author_kind: string
          created_at?: string
          id?: string
          message: string
          organization_id: string
          request_id: string
        }
        Update: {
          author_id?: string | null
          author_kind?: string
          created_at?: string
          id?: string
          message?: string
          organization_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_request_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_request_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_request_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "support_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          category: string
          created_at: string
          created_by: string
          description: string
          id: string
          organization_id: string
          priority: string
          related_module: string | null
          related_route: string | null
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          category: string
          created_at?: string
          created_by: string
          description: string
          id?: string
          organization_id: string
          priority?: string
          related_module?: string | null
          related_route?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          category?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          organization_id?: string
          priority?: string
          related_module?: string | null
          related_route?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_organization_id_fkey"
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
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
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
      clients_secure: {
        Row: {
          archived_at: string | null
          birth_date: string | null
          city: string | null
          complement: string | null
          created_at: string | null
          district: string | null
          document: string | null
          document_digits: string | null
          email: string | null
          id: string | null
          last_interaction_at: string | null
          legal_rep_name: string | null
          name: string | null
          notes: string | null
          number: string | null
          organization_id: string | null
          owner_id: string | null
          owner_name: string | null
          person_type: Database["public"]["Enums"]["person_type"] | null
          phone: string | null
          state: string | null
          status: Database["public"]["Enums"]["client_status"] | null
          street: string | null
          trade_name: string | null
          updated_at: string | null
          whatsapp: string | null
          zip_code: string | null
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
            foreignKeyName: "monitoring_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
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
      operational_monitoring_alerts: {
        Row: {
          alert_kind: string | null
          assigned_name: string | null
          assigned_to: string | null
          client_id: string | null
          client_name: string | null
          days_delta: number | null
          description: string | null
          last_movement_at: string | null
          monitoring_status: string | null
          notes: string | null
          organization_id: string | null
          priority_override: string | null
          process_code: string | null
          process_id: string | null
          reason: string | null
          relevant_at: string | null
          responsible_id: string | null
          responsible_name: string | null
          source_id: string | null
          source_priority: string | null
          source_status: string | null
          source_type: string | null
          state_updated_at: string | null
          suggested_priority: string | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invitation: {
        Args: { _token: string }
        Returns: {
          membership_id: string
          organization_id: string
          organization_name: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      add_communication_entry: {
        Args: {
          _contact_made?: boolean
          _content: string
          _entry_type: Database["public"]["Enums"]["communication_entry_type"]
          _is_internal?: boolean
          _metadata?: Json
          _occurred_at?: string
          _thread_id: string
        }
        Returns: string
      }
      add_monitoring_note: {
        Args: {
          _alert_kind: string
          _note: string
          _organization_id: string
          _source_id: string
          _source_type: string
        }
        Returns: string
      }
      apply_kiwify_subscription_event: {
        Args: {
          _access_until?: string
          _event_at?: string
          _event_key: string
          _event_type: string
          _organization: string
          _next_payment_at?: string
          _provider_order_id?: string
          _provider_subscription_id?: string
          _subscription_status: string
        }
        Returns: boolean
      }
      archive_automation_rule: {
        Args: { _rule_id: string }
        Returns: undefined
      }
      archive_communication_thread: {
        Args: { _thread_id: string }
        Returns: undefined
      }
      archive_financial_account: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      archive_financial_category: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      archive_financial_transaction: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      archive_notification: {
        Args: { _notification: string }
        Returns: undefined
      }
      archive_scheduled_automation: {
        Args: { _rule_id: string }
        Returns: undefined
      }
      archive_support_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      assign_communication_thread: {
        Args: { _assigned_to: string; _thread_id: string }
        Returns: undefined
      }
      assign_monitoring_item: {
        Args: {
          _alert_kind: string
          _assigned_to: string
          _organization_id: string
          _source_id: string
          _source_type: string
        }
        Returns: string
      }
      assign_support_request: {
        Args: { _assigned_to: string; _request_id: string }
        Returns: undefined
      }
      automation_can_manage: { Args: { _org: string }; Returns: boolean }
      automation_conditions_match: {
        Args: { _conditions: Json; _payload: Json }
        Returns: boolean
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
      cancel_financial_transaction: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      cancel_invitation: { Args: { _invitation: string }; Returns: undefined }
      change_communication_thread_status: {
        Args: {
          _status: Database["public"]["Enums"]["communication_status"]
          _thread_id: string
        }
        Returns: undefined
      }
      change_member_role: {
        Args: {
          _member: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      change_monitoring_status: {
        Args: {
          _alert_kind: string
          _organization_id: string
          _source_id: string
          _source_type: string
          _status: string
        }
        Returns: string
      }
      client_sensitive: {
        Args: { _client: string }
        Returns: {
          birth_date: string
          complement: string
          district: string
          document: string
          document_digits: string
          email: string
          legal_rep_name: string
          notes: string
          number: string
          phone: string
          street: string
          whatsapp: string
          zip_code: string
        }[]
      }
      communication_assert_role: {
        Args: { _administrative?: boolean; _org: string }
        Returns: undefined
      }
      create_automation_rule: {
        Args: {
          _organization_id: string
          action_config: Json
          action_type: string
          conditions: Json
          description: string
          is_active: boolean
          name: string
          trigger_type: string
        }
        Returns: string
      }
      create_client_birthday_notifications: {
        Args: { _as_of?: string }
        Returns: number
      }
      create_communication_thread: {
        Args: {
          _assigned_to?: string
          _channel?: Database["public"]["Enums"]["communication_channel"]
          _client_id: string
          _first_content?: string
          _follow_up_at?: string
          _organization_id: string
          _priority?: Database["public"]["Enums"]["communication_priority"]
          _process_id?: string
          _subject: string
          _task_id?: string
        }
        Returns: string
      }
      create_critical_monitoring_notifications: { Args: never; Returns: number }
      create_daily_operational_close_notifications: {
        Args: { _as_of?: string }
        Returns: number
      }
      create_deadline_reminder_notifications: { Args: never; Returns: number }
      create_expired_document_notifications: { Args: never; Returns: number }
      create_financial_account: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      create_financial_category: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      create_financial_recurrence: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      create_financial_transaction: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
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
      create_operational_close_for_organization: {
        Args: {
          _as_of: string
          _dedupe_prefix: string
          _organization_id: string
          _title_prefix: string
        }
        Returns: number
      }
      create_operational_summary_notifications: {
        Args: {
          _automation_schedule_id: string
          _organization_id: string
          _scheduled_for: string
        }
        Returns: number
      }
      create_overdue_communication_notifications: {
        Args: never
        Returns: number
      }
      create_overdue_financial_notifications: { Args: never; Returns: number }
      create_overdue_task_escalation_notifications: {
        Args: never
        Returns: number
      }
      create_scheduled_automation: {
        Args: {
          _action_config: Json
          _action_type: string
          _description: string
          _interval_days: number
          _is_active?: boolean
          _name: string
          _next_execution_at: string
          _organization_id: string
          _run_at: string
          _schedule_type: string
          _timezone: string
        }
        Returns: string
      }
      create_stale_client_notifications: {
        Args: { _as_of?: string }
        Returns: number
      }
      create_stale_lead_notifications: {
        Args: { _as_of?: string }
        Returns: number
      }
      create_stale_process_notifications: { Args: never; Returns: number }
      create_stale_task_notifications: {
        Args: { _as_of?: string }
        Returns: number
      }
      create_support_request: {
        Args: {
          _category: string
          _description: string
          _organization_id: string
          _priority?: string
          _related_module?: string
          _related_route?: string
          _subject: string
        }
        Returns: string
      }
      create_test_notification: {
        Args: { _organization: string }
        Returns: {
          notification_id: string
        }[]
      }
      create_unassigned_monitoring_notifications: {
        Args: never
        Returns: number
      }
      create_weekly_data_quality_notifications: {
        Args: { _as_of?: string }
        Returns: number
      }
      create_weekly_financial_summary_notifications: {
        Args: { _as_of?: string }
        Returns: number
      }
      create_weekly_productivity_report_notifications: {
        Args: { _as_of?: string }
        Returns: number
      }
      duplicate_automation_rule: { Args: { _rule_id: string }; Returns: string }
      duplicate_financial_transaction: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      financial_assert_editor: { Args: { _org: string }; Returns: undefined }
      financial_audit: {
        Args: {
          _action: string
          _entity: string
          _id: string
          _meta?: Json
          _org: string
        }
        Returns: undefined
      }
      generate_recurrence_transactions: {
        Args: { _organization_id: string; _payload: Json }
        Returns: number
      }
      get_organization_settings: {
        Args: { _organization_id: string }
        Returns: Json
      }
      has_org_membership: { Args: { _org: string }; Returns: boolean }
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
      is_platform_admin: { Args: never; Returns: boolean }
      mark_all_notifications_read: {
        Args: { _organization: string }
        Returns: number
      }
      mark_financial_transaction_paid: {
        Args: {
          _account_id: string
          _organization_id: string
          _payment_method?: string
          _transaction_id: string
        }
        Returns: string
      }
      mark_notification_read: {
        Args: { _notification: string }
        Returns: undefined
      }
      monitoring_assert_admin: { Args: { _org: string }; Returns: undefined }
      monitoring_assert_source: {
        Args: { _id: string; _org: string; _type: string }
        Returns: undefined
      }
      next_process_code: { Args: { _org: string }; Returns: string }
      organization_has_commercial_access: {
        Args: { _org: string }
        Returns: boolean
      }
      platform_organizations: {
        Args: never
        Returns: {
          archived_at: string
          commercial_status: string
          created_at: string
          days_remaining: number
          effective_status: string
          legal_name: string
          onboarding_completed: boolean
          organization_id: string
          owner_email: string
          owner_name: string
          trade_name: string
          trial_ends_at: string
          trial_started_at: string
        }[]
      }
      platform_kiwify_event_health: {
        Args: { _limit?: number }
        Returns: {
          diagnostic_code: string
          event_key: string
          event_type: string
          organization_id: string
          organization_name: string
          outcome: string
          processed_at: string
          received_at: string
        }[]
      }
      platform_support_open_count: { Args: never; Returns: number }
      platform_support_requests: {
        Args: { _limit?: number; _status?: string }
        Returns: {
          category: string
          created_at: string
          created_by: string
          description: string
          id: string
          last_reply_at: string
          organization_id: string
          organization_name: string
          priority: string
          related_module: string
          related_route: string
          reply_count: number
          requester_email: string
          requester_name: string
          resolved_at: string
          status: string
          subject: string
          updated_at: string
        }[]
      }
      prepare_kiwify_checkout: {
        Args: { _organization: string }
        Returns: undefined
      }
      process_automation_event: {
        Args: {
          _entity_id: string
          _entity_type: string
          _event_type: string
          _event_version?: string
          _execution_depth?: number
          _organization_id: string
          _payload: Json
          _source_automation_rule_id?: string
        }
        Returns: number
      }
      process_due_financial_recurrences: { Args: never; Returns: number }
      process_due_scheduled_automations: {
        Args: { _as_of?: string; _batch_size?: number }
        Returns: number
      }
      record_audit_event: {
        Args: {
          _action: string
          _entity: string
          _entity_id?: string
          _metadata?: Json
          _organization_id: string
        }
        Returns: string
      }
      record_kiwify_webhook_failure: {
        Args: {
          _diagnostic_code: string
          _event_key: string
          _event_type: string
          _organization?: string
          _provider_order_id?: string
          _provider_subscription_id?: string
        }
        Returns: undefined
      }
      record_process_movement: {
        Args: {
          _description: string
          _from_stage?: Database["public"]["Enums"]["process_stage"]
          _organization_id: string
          _process_id: string
          _to_stage?: Database["public"]["Enums"]["process_stage"]
        }
        Returns: string
      }
      register_partial_payment: {
        Args: {
          _account_id: string
          _amount: number
          _notes?: string
          _organization_id: string
          _payment_method?: string
          _transaction_id: string
        }
        Returns: string
      }
      reply_support_request: {
        Args: { _message: string; _next_status?: string; _request_id: string }
        Returns: string
      }
      restore_financial_account: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      restore_financial_category: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      restore_financial_transaction: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      reverse_financial_payment: {
        Args: { _notes: string; _organization_id: string; _payment_id: string }
        Returns: string
      }
      resolve_kiwify_webhook_failure: {
        Args: { _event_key: string }
        Returns: undefined
      }
      run_temporal_automation_cycle: { Args: never; Returns: Json }
      seed_default_document_types: {
        Args: { _org: string }
        Returns: undefined
      }
      select_task_distribution_assignee: {
        Args: { _function: string; _organization_id: string; _sector: string }
        Returns: string
      }
      set_automation_rule_active: {
        Args: { _is_active: boolean; _rule_id: string }
        Returns: undefined
      }
      set_financial_account_active: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      set_financial_category_active: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      set_member_active: {
        Args: { _active: boolean; _member: string }
        Returns: undefined
      }
      set_scheduled_automation_active: {
        Args: { _is_active: boolean; _rule_id: string }
        Returns: undefined
      }
      storage_path_org: { Args: { _name: string }; Returns: string }
      support_assert_admin: { Args: { _org: string }; Returns: undefined }
      support_request_thread: {
        Args: { _request_id: string }
        Returns: {
          author_kind: string
          author_name: string
          created_at: string
          id: string
          message: string
        }[]
      }
      suspend_expired_kiwify_subscriptions: {
        Args: { _limit?: number; _now?: string }
        Returns: number
      }
      transfer_member_responsibilities: {
        Args: { _from: string; _org: string; _to: string }
        Returns: {
          monitoring_moved: number
          processes_moved: number
          tasks_moved: number
        }[]
      }
      update_automation_rule: {
        Args: {
          _rule_id: string
          action_config: Json
          action_type: string
          conditions: Json
          description: string
          is_active: boolean
          name: string
          trigger_type: string
        }
        Returns: undefined
      }
      update_communication_thread: {
        Args: {
          _channel?: Database["public"]["Enums"]["communication_channel"]
          _clear_follow_up?: boolean
          _follow_up_at?: string
          _priority?: Database["public"]["Enums"]["communication_priority"]
          _process_id?: string
          _process_id_provided?: boolean
          _subject?: string
          _task_id?: string
          _task_id_provided?: boolean
          _thread_id: string
        }
        Returns: undefined
      }
      update_financial_account: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      update_financial_category: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      update_financial_recurrence: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      update_financial_transaction: {
        Args: { _organization_id: string; _payload: Json }
        Returns: string
      }
      update_member_task_distribution: {
        Args: {
          _capacity: number
          _function: string
          _member: string
          _receives_automatic_tasks: boolean
          _sector: string
        }
        Returns: undefined
      }
      set_platform_organization_archived: {
        Args: { _archived: boolean; _organization_id: string }
        Returns: undefined
      }
      update_organization_commercial_status: {
        Args: { _action: string; _days?: number; _organization_id: string }
        Returns: undefined
      }
      update_organization_onboarding: {
        Args: {
          _company?: Json
          _complete?: boolean
          _organization_id: string
          _settings?: Json
          _step: number
        }
        Returns: Json
      }
      update_organization_settings: {
        Args: { _changes: Json; _organization_id: string }
        Returns: Json
      }
      update_scheduled_automation: {
        Args: {
          _action_config: Json
          _action_type: string
          _description: string
          _interval_days: number
          _is_active: boolean
          _name: string
          _next_execution_at: string
          _rule_id: string
          _run_at: string
          _schedule_type: string
          _timezone: string
        }
        Returns: undefined
      }
      update_support_request_status: {
        Args: { _request_id: string; _status: string }
        Returns: undefined
      }
      upsert_monitoring_state: {
        Args: {
          _alert_kind: string
          _organization_id: string
          _priority_override?: string
          _source_id: string
          _source_type: string
        }
        Returns: string
      }
      validate_automation: {
        Args: {
          _action: string
          _conditions: Json
          _config: Json
          _trigger: string
        }
        Returns: undefined
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
      communication_channel:
        | "whatsapp"
        | "telefone"
        | "email"
        | "presencial"
        | "interno"
        | "outro"
      communication_entry_type:
        | "mensagem"
        | "nota_interna"
        | "ligacao"
        | "email"
        | "whatsapp"
        | "reuniao"
        | "outro"
        | "status"
        | "lembrete"
        | "anexo"
      communication_priority: "baixa" | "normal" | "alta" | "urgente"
      communication_status:
        | "aberta"
        | "aguardando_cliente"
        | "aguardando_equipe"
        | "resolvida"
        | "arquivada"
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
      communication_channel: [
        "whatsapp",
        "telefone",
        "email",
        "presencial",
        "interno",
        "outro",
      ],
      communication_entry_type: [
        "mensagem",
        "nota_interna",
        "ligacao",
        "email",
        "whatsapp",
        "reuniao",
        "outro",
        "status",
        "lembrete",
        "anexo",
      ],
      communication_priority: ["baixa", "normal", "alta", "urgente"],
      communication_status: [
        "aberta",
        "aguardando_cliente",
        "aguardando_equipe",
        "resolvida",
        "arquivada",
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
