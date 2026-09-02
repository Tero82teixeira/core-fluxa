-- Inventário somente leitura para acompanhar uma cópia do FLUXA.
-- Não expõe linhas, e-mails, documentos, chaves ou conteúdo de arquivos.

WITH metrics AS (
  SELECT 10 AS position, 'checked_at_utc'::text AS metric,
         to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS value
  UNION ALL
  SELECT 20, 'database_size_bytes', pg_database_size(current_database())::text
  UNION ALL
  SELECT 30, 'organizations', count(*)::text FROM public.organizations
  UNION ALL
  SELECT 40, 'organization_members', count(*)::text FROM public.organization_members
  UNION ALL
  SELECT 50, 'auth_users', count(*)::text FROM auth.users
  UNION ALL
  SELECT 60, 'documents', count(*)::text FROM public.documents
  UNION ALL
  SELECT 70, 'document_versions', count(*)::text FROM public.document_versions
  UNION ALL
  SELECT 80, 'storage_objects', count(*)::text
    FROM storage.objects
   WHERE bucket_id = 'organization-documents'
  UNION ALL
  SELECT 90, 'storage_bytes', COALESCE(sum((metadata ->> 'size')::bigint), 0)::text
    FROM storage.objects
   WHERE bucket_id = 'organization-documents'
  UNION ALL
  SELECT 100, 'applied_migrations', count(*)::text FROM supabase_migrations.schema_migrations
  UNION ALL
  SELECT 110, 'latest_migration', COALESCE(max(version)::text, 'none')
    FROM supabase_migrations.schema_migrations
  UNION ALL
  SELECT 120, 'installed_extensions', count(*)::text FROM pg_extension
  UNION ALL
  SELECT 130, 'scheduled_jobs', count(*)::text FROM cron.job
)
SELECT metric, value
  FROM metrics
 ORDER BY position;
