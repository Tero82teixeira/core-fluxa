import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type HealthInsurer = {
  id: string;
  name: string;
  registration_code: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  status: "ativo" | "inativo";
  created_at?: string | null;
};

export type HealthAuthorization = {
  id: string;
  patient_profile_id: string;
  patient_name?: string;
  insurer_id: string | null;
  insurer_name?: string | null;
  authorization_number: string | null;
  service_label: string;
  requested_at: string;
  valid_until: string | null;
  status: "pendente" | "autorizado" | "negado" | "expirado" | "cancelado";
  administrative_notes: string | null;
  created_at?: string | null;
};

const rpc = supabase as unknown as {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export function useHealthInsurers(organizationId: string | null, search = "") {
  return useQuery({
    queryKey: ["health-insurers", organizationId, search],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await rpc.rpc("list_health_insurers", {
        _organization_id: organizationId,
        _search: search.trim() || null,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as HealthInsurer[];
    },
  });
}

export function useCreateHealthInsurer(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      name: string;
      registration_code?: string | null;
      contact_phone?: string | null;
      contact_email?: string | null;
    }) => {
      const { data, error } = await rpc.rpc("create_health_insurer", {
        _organization_id: organizationId,
        _name: values.name,
        _registration_code: values.registration_code || null,
        _contact_phone: values.contact_phone || null,
        _contact_email: values.contact_email || null,
      });
      if (error) throw error;
      return data as HealthInsurer;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["health-insurers", organizationId] });
    },
  });
}

export function useHealthAuthorizations(organizationId: string | null, search = "") {
  return useQuery({
    queryKey: ["health-authorizations", organizationId, search],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await rpc.rpc("list_health_authorizations", {
        _organization_id: organizationId,
        _search: search.trim() || null,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as HealthAuthorization[];
    },
  });
}

export function useCreateHealthAuthorization(organizationId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      patient_profile_id: string;
      insurer_id?: string | null;
      service_label: string;
      authorization_number?: string | null;
      requested_at?: string | null;
      valid_until?: string | null;
      status?: HealthAuthorization["status"];
      administrative_notes?: string | null;
    }) => {
      const { data, error } = await rpc.rpc("create_health_authorization", {
        _organization_id: organizationId,
        _patient_profile_id: values.patient_profile_id,
        _insurer_id: values.insurer_id || null,
        _service_label: values.service_label,
        _authorization_number: values.authorization_number || null,
        _requested_at: values.requested_at || null,
        _valid_until: values.valid_until || null,
        _status: values.status || "pendente",
        _administrative_notes: values.administrative_notes || null,
      });
      if (error) throw error;
      return data as HealthAuthorization;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["health-authorizations", organizationId] });
    },
  });
}
