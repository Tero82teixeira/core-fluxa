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
          city: string | null
          created_at: string
          created_by: string | null
          document: string | null
          document_digits: string | null
          email: string | null
          id: string
          last_interaction_at: string | null
          name: string
          notes: string | null
          organization_id: string
          owner_id: string | null
          owner_name: string | null
          person_type: Database["public"]["Enums"]["person_type"]
          phone: string | null
          state: string | null
          status: Database["public"]["Enums"]["client_status"]
          trade_name: string | null
          updated_at: string
          updated_by: string | null
          whatsapp: string | null
        }
        Insert: {
          archived_at?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          document_digits?: string | null
          email?: string | null
          id?: string
          last_interaction_at?: string | null
          name: string
          notes?: string | null
          organization_id: string
          owner_id?: string | null
          owner_name?: string | null
          person_type?: Database["public"]["Enums"]["person_type"]
          phone?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          trade_name?: string | null
          updated_at?: string
          updated_by?: string | null
          whatsapp?: string | null
        }
        Update: {
          archived_at?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          document_digits?: string | null
          email?: string | null
          id?: string
          last_interaction_at?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          owner_id?: string | null
          owner_name?: string | null
          person_type?: Database["public"]["Enums"]["person_type"]
          phone?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          trade_name?: string | null
          updated_at?: string
          updated_by?: string | null
          whatsapp?: string | null
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
      notifications: {
        Row: {
          body: string | null
          created_at: string
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
          default_days: number | null
          default_value: number | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_days?: number | null
          default_value?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_days?: number | null
          default_value?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
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
      tasks: {
        Row: {
          assignee_id: string | null
          assignee_name: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_at: string | null
          id: string
          organization_id: string
          priority: Database["public"]["Enums"]["priority_level"]
          process_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assignee_id?: string | null
          assignee_name?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          organization_id: string
          priority?: Database["public"]["Enums"]["priority_level"]
          process_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assignee_id?: string | null
          assignee_name?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          organization_id?: string
          priority?: Database["public"]["Enums"]["priority_level"]
          process_id?: string | null
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
      [_ in never]: never
    }
    Functions: {
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
      has_org_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["app_role"][]
        }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string }; Returns: boolean }
      next_process_code: { Args: { _org: string }; Returns: string }
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
      client_status:
        | "lead"
        | "em_cadastro"
        | "ativo"
        | "com_pendencia"
        | "inativo"
        | "arquivado"
      financial_status:
        | "nao_aplicavel"
        | "pendente"
        | "parcial"
        | "pago"
        | "atrasado"
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
      task_status: "pendente" | "em_andamento" | "concluida" | "cancelada"
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
      client_status: [
        "lead",
        "em_cadastro",
        "ativo",
        "com_pendencia",
        "inativo",
        "arquivado",
      ],
      financial_status: [
        "nao_aplicavel",
        "pendente",
        "parcial",
        "pago",
        "atrasado",
      ],
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
      task_status: ["pendente", "em_andamento", "concluida", "cancelada"],
    },
  },
} as const
