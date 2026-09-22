import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type HealthAppointmentStatus =
  | "agendado"
  | "confirmado"
  | "em_atendimento"
  | "concluido"
  | "faltou"
  | "cancelado";

export type HealthAppointmentModality = "presencial" | "remoto" | "domiciliar" | "outro";

export type HealthAppointment = {
  id: string;
  patient_profile_id: string;
  patient_name: string;
  patient_phone: string | null;
  authorization_id: string | null;
  authorization_number: string | null;
  responsible_user_id: string | null;
  responsible_name: string | null;
  service_label: string;
  starts_at: string;
  ends_at: string;
  modality: HealthAppointmentModality;
  location: string | null;
  status: HealthAppointmentStatus;
  administrative_notes: string | null;
  created_at: string;
};

const rpc = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export function useHealthAppointments(
  organizationId: string | null,
  filters: {
    startsFrom: string;
    startsUntil: string;
    search?: string;
    status?: HealthAppointmentStatus | null;
  },
) {
  return useQuery({
    queryKey: [
      "health-appointments",
      organizationId,
      filters.startsFrom,
      filters.startsUntil,
      filters.search,
      filters.status,
    ],
    enabled: Boolean(organizationId && filters.startsFrom && filters.startsUntil),
    queryFn: async () => {
      const { data, error } = await rpc.rpc("list_health_appointments", {
        _organization_id: organizationId,
        _starts_from: filters.startsFrom,
        _starts_until: filters.startsUntil,
        _search: filters.search?.trim() || null,
        _status: filters.status || null,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as HealthAppointment[];
    },
  });
}

export function useCreateHealthAppointment(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      patient_profile_id: string;
      service_label: string;
      starts_at: string;
      ends_at: string;
      responsible_user_id?: string | null;
      authorization_id?: string | null;
      modality: HealthAppointmentModality;
      location?: string | null;
      status?: HealthAppointmentStatus;
      administrative_notes?: string | null;
    }) => {
      const { data, error } = await rpc.rpc("create_health_appointment", {
        _organization_id: organizationId,
        _patient_profile_id: values.patient_profile_id,
        _service_label: values.service_label,
        _starts_at: values.starts_at,
        _ends_at: values.ends_at,
        _responsible_user_id: values.responsible_user_id || null,
        _authorization_id: values.authorization_id || null,
        _modality: values.modality,
        _location: values.location || null,
        _status: values.status || "agendado",
        _administrative_notes: values.administrative_notes || null,
      });
      if (error) throw error;
      return data as HealthAppointment;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["health-appointments", organizationId] });
    },
  });
}

export function useUpdateHealthAppointmentStatus(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: { id: string; status: HealthAppointmentStatus }) => {
      const { data, error } = await rpc.rpc("update_health_appointment_status", {
        _organization_id: organizationId,
        _appointment_id: values.id,
        _status: values.status,
      });
      if (error) throw error;
      return data as HealthAppointment;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["health-appointments", organizationId] });
    },
  });
}
