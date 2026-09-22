import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type HealthAppointmentStatus =
  | "agendado"
  | "confirmado"
  | "concluido"
  | "faltou"
  | "cancelado";

export type HealthAppointmentProfessional = {
  user_id: string;
  name: string | null;
  email: string | null;
};

export type HealthAppointment = {
  id: string;
  patient_profile_id: string;
  patient_name: string;
  professional_user_id: string | null;
  professional_name: string | null;
  service_label: string;
  starts_at: string;
  ends_at: string;
  status: HealthAppointmentStatus;
  location: string | null;
  administrative_notes: string | null;
};

const rpc = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export function useHealthAppointmentProfessionals(
  organizationId: string | null,
) {
  return useQuery({
    queryKey: ["health-appointment-professionals", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await rpc.rpc(
        "list_health_appointment_professionals",
        { _organization_id: organizationId },
      );
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as HealthAppointmentProfessional[];
    },
  });
}

export function useHealthAppointments(
  organizationId: string | null,
  date: string,
) {
  return useQuery({
    queryKey: ["health-appointments", organizationId, date],
    enabled: Boolean(organizationId && date),
    queryFn: async () => {
      const { data, error } = await rpc.rpc("list_health_appointments", {
        _organization_id: organizationId,
        _date: date,
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
      professional_user_id?: string | null;
      service_label: string;
      starts_at: string;
      ends_at: string;
      location?: string | null;
      administrative_notes?: string | null;
    }) => {
      const { data, error } = await rpc.rpc("create_health_appointment", {
        _organization_id: organizationId,
        _patient_profile_id: values.patient_profile_id,
        _professional_user_id: values.professional_user_id || null,
        _service_label: values.service_label,
        _starts_at: values.starts_at,
        _ends_at: values.ends_at,
        _location: values.location || null,
        _administrative_notes: values.administrative_notes || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["health-appointments", organizationId],
      });
    },
  });
}

export function useUpdateHealthAppointmentStatus(
  organizationId: string | null,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      appointmentId,
      status,
    }: {
      appointmentId: string;
      status: HealthAppointmentStatus;
    }) => {
      const { data, error } = await rpc.rpc(
        "update_health_appointment_status",
        {
          _organization_id: organizationId,
          _appointment_id: appointmentId,
          _status: status,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["health-appointments", organizationId],
      });
    },
  });
}
