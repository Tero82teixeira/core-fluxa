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
  appointment_date?: string;
  status: HealthAppointmentStatus;
  location: string | null;
  administrative_notes: string | null;
  billing_item_id: string | null;
  billing_status: string | null;
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
  enabled = true,
) {
  return useQuery({
    queryKey: ["health-appointments", organizationId, date],
    enabled: Boolean(organizationId && date && enabled),
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

export function useHealthAppointmentsRange(
  organizationId: string | null,
  startDate: string,
  endDate: string,
  enabled = true,
) {
  return useQuery({
    queryKey: ["health-appointments", organizationId, "range", startDate, endDate],
    enabled: Boolean(organizationId && startDate && endDate && enabled),
    queryFn: async () => {
      const { data, error } = await rpc.rpc(
        "list_health_appointments_range",
        {
          _organization_id: organizationId,
          _start_date: startDate,
          _end_date: endDate,
        },
      );
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

export function useRescheduleHealthAppointment(
  organizationId: string | null,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      appointment_id: string;
      professional_user_id?: string | null;
      starts_at: string;
      ends_at: string;
      location?: string | null;
    }) => {
      const { data, error } = await rpc.rpc(
        "reschedule_health_appointment",
        {
          _organization_id: organizationId,
          _appointment_id: values.appointment_id,
          _professional_user_id: values.professional_user_id || null,
          _starts_at: values.starts_at,
          _ends_at: values.ends_at,
          _location: values.location || null,
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

export function useCompleteHealthAppointmentAndCreateBilling(
  organizationId: string | null,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      appointment_id: string;
      amount: number;
      insurer_id?: string | null;
      authorization_id?: string | null;
      due_date?: string | null;
      administrative_notes?: string | null;
    }) => {
      const { data, error } = await rpc.rpc(
        "complete_health_appointment_and_create_billing",
        {
          _organization_id: organizationId,
          _appointment_id: values.appointment_id,
          _amount: values.amount,
          _insurer_id: values.insurer_id || null,
          _authorization_id: values.authorization_id || null,
          _due_date: values.due_date || null,
          _administrative_notes: values.administrative_notes || null,
        },
      );
      if (error) throw error;
      return data as {
        appointment_id: string;
        appointment_status: "concluido";
        billing_item_id: string;
        billing_status: "rascunho";
      };
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["health-appointments", organizationId],
        }),
        client.invalidateQueries({
          queryKey: ["health-billing-items", organizationId],
        }),
      ]);
    },
  });
}
