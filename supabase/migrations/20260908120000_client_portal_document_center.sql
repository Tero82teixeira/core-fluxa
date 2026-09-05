-- Client Portal: searchable document center and safe version metadata.

DROP FUNCTION IF EXISTS public.client_portal_documents();
CREATE FUNCTION public.client_portal_documents()
RETURNS TABLE(
  access_id uuid,
  document_id uuid,
  title text,
  original_file_name text,
  file_path text,
  file_extension text,
  mime_type text,
  file_size bigint,
  status text,
  expiration_date date,
  created_at timestamptz,
  process_id uuid,
  process_code text,
  current_version integer,
  document_type_name text,
  category text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT access.id,
         document.id,
         document.title,
         document.original_file_name,
         document.file_path,
         document.file_extension,
         document.mime_type,
         document.file_size,
         document.status::text,
         document.expiration_date,
         document.created_at,
         document.process_id,
         process.code,
         document.current_version,
         document_type.name,
         COALESCE(document_type.category::text, 'outros')
    FROM public.client_portal_access access
    JOIN public.organizations organization
      ON organization.id = access.organization_id
     AND organization.archived_at IS NULL
    JOIN public.clients client
      ON client.organization_id = access.organization_id
     AND client.id = access.client_id
     AND client.archived_at IS NULL
    JOIN public.client_portal_document_shares share
      ON share.organization_id = access.organization_id
     AND share.client_id = access.client_id
     AND share.is_shared
    JOIN public.documents document
      ON document.organization_id = share.organization_id
     AND document.client_id = share.client_id
     AND document.id = share.document_id
     AND document.archived_at IS NULL
    LEFT JOIN public.processes process
      ON process.organization_id = document.organization_id
     AND process.id = document.process_id
    LEFT JOIN public.document_types document_type
      ON document_type.organization_id = document.organization_id
     AND document_type.id = document.document_type_id
   WHERE access.user_id = auth.uid()
     AND access.is_active
   ORDER BY document.updated_at DESC, document.id;
$function$;

CREATE OR REPLACE FUNCTION public.client_portal_document_versions(_document_id uuid)
RETURNS TABLE(
  version_id uuid,
  version_number integer,
  original_file_name text,
  file_size bigint,
  mime_type text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT version.id,
         version.version_number,
         version.original_file_name,
         version.file_size,
         version.mime_type,
         version.created_at
    FROM public.client_portal_access access
    JOIN public.organizations organization
      ON organization.id = access.organization_id
     AND organization.archived_at IS NULL
    JOIN public.clients client
      ON client.organization_id = access.organization_id
     AND client.id = access.client_id
     AND client.archived_at IS NULL
    JOIN public.client_portal_document_shares share
      ON share.organization_id = access.organization_id
     AND share.client_id = access.client_id
     AND share.document_id = _document_id
     AND share.is_shared
    JOIN public.documents document
      ON document.organization_id = share.organization_id
     AND document.client_id = share.client_id
     AND document.id = share.document_id
     AND document.archived_at IS NULL
    JOIN public.document_versions version
      ON version.organization_id = document.organization_id
     AND version.document_id = document.id
   WHERE access.user_id = auth.uid()
     AND access.is_active
   ORDER BY version.version_number DESC, version.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.client_portal_documents()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.client_portal_document_versions(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_portal_documents() TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_portal_document_versions(uuid) TO authenticated;
