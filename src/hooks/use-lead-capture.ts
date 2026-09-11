import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const db = () => supabase as any;

export type LeadCaptureForm = {
  id: string;
  organization_id: string;
  public_token: string;
  title: string;
  description: string;
  success_message: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LeadCaptureFormInput = Pick<
  LeadCaptureForm,
  "title" | "description" | "success_message" | "is_active"
>;

export function useLeadCaptureForm(organizationId: string | null) {
  return useQuery({
    enabled: Boolean(organizationId),
    queryKey: ["lead-capture-form", organizationId],
    queryFn: async (): Promise<LeadCaptureForm | null> => {
      const { data, error } = await db()
        .from("lead_capture_forms")
        .select(
          "id,organization_id,public_token,title,description,success_message,is_active,created_at,updated_at",
        )
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return data as LeadCaptureForm | null;
    },
  });
}

export function useSaveLeadCaptureForm(organizationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      values,
      rotateToken = false,
    }: {
      values: LeadCaptureFormInput;
      rotateToken?: boolean;
    }) => {
      if (!organizationId) throw new Error("Selecione uma empresa antes de configurar a captação.");
      const { data, error } = await db().rpc("save_lead_capture_form", {
        _organization_id: organizationId,
        _title: values.title,
        _description: values.description,
        _success_message: values.success_message,
        _is_active: values.is_active,
        _rotate_token: rotateToken,
      });
      if (error) throw error;
      return data as LeadCaptureForm;
    },
    onSuccess: (data) => queryClient.setQueryData(["lead-capture-form", organizationId], data),
  });
}

export type PublicLeadCaptureForm = {
  title: string;
  description: string;
  success_message: string;
  organization_name: string;
};

export async function fetchPublicLeadCaptureForm(
  token: string,
): Promise<PublicLeadCaptureForm | null> {
  const { data, error } = await db().rpc("get_public_lead_capture_form", { _public_token: token });
  if (error) throw error;
  return (data?.[0] ?? null) as PublicLeadCaptureForm | null;
}

export async function submitPublicLead(
  token: string,
  values: {
    name: string;
    email: string;
    phone: string;
    company: string;
    message: string;
    source: string;
    website: string;
    consent: boolean;
  },
) {
  const { data, error } = await db().rpc("submit_public_lead", {
    _public_token: token,
    _name: values.name,
    _email: values.email || null,
    _phone: values.phone || null,
    _company: values.company || null,
    _message: values.message || null,
    _source: values.source || "link",
    _website: values.website || null,
    _consent: values.consent,
  });
  if (error) throw error;
  return data as { received: boolean };
}
