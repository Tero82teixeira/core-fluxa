\set ON_ERROR_STOP on
\if :{?heloiza_email}
\else
  \echo 'ERROR: execute with -v heloiza_email=address@example.com'
  \quit 2
\endif

-- Read-only inventory for the orphan workspace incident. This script deliberately
-- has no DELETE/UPDATE/INSERT and is intended for a service-role SQL session.
BEGIN TRANSACTION READ ONLY;

\echo '1. Heloiza identity, memberships and candidate organizations'
SELECT p.id AS user_id, p.email, p.full_name,
       m.id AS membership_id, m.organization_id, m.role, m.is_active,
       o.legal_name, o.trade_name, o.created_at
FROM public.profiles p
LEFT JOIN public.organization_members m ON m.user_id = p.id
LEFT JOIN public.organizations o ON o.id = m.organization_id
WHERE lower(p.email) = lower(:'heloiza_email')
ORDER BY o.created_at, m.created_at;

\echo '2. FK map pointing directly to public.organizations(id)'
SELECT n.nspname AS table_schema, c.relname AS table_name,
       a.attname AS column_name, con.conname AS constraint_name,
       CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
         WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
         WHEN 'd' THEN 'SET DEFAULT' END AS on_delete
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN LATERAL unnest(con.conkey) WITH ORDINALITY key(attnum, ord) ON true
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = key.attnum
WHERE con.contype = 'f' AND con.confrelid = 'public.organizations'::regclass
ORDER BY 1, 2, 3;

\echo '3. Multi-tenant columns (also catches organization_id without an FK)'
SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND column_name IN ('organization_id', 'organization_ids')
ORDER BY 1, 2, 3;

\echo '4. Set orphan_organization_id from the reviewed output above, then rerun'
\if :{?orphan_organization_id}
\else
  \echo 'STOP: no organization was inventoried; rerun with -v orphan_organization_id=<reviewed UUID>'
  ROLLBACK;
  \quit 0
\endif

\echo '5. Exact target and Heloiza membership outside the target'
SELECT * FROM public.organizations WHERE id = :'orphan_organization_id'::uuid;
SELECT p.id AS user_id, p.email, m.id AS membership_id, m.organization_id,
       m.role, m.is_active, o.legal_name, o.trade_name
FROM public.profiles p
JOIN public.organization_members m ON m.user_id = p.id
JOIN public.organizations o ON o.id = m.organization_id
WHERE lower(p.email) = lower(:'heloiza_email')
  AND m.organization_id <> :'orphan_organization_id'::uuid
ORDER BY m.organization_id;

\echo '6. Counts in every physical table carrying organization_id'
SELECT format(
  'SELECT %L AS relation, count(*) AS row_count FROM %I.%I WHERE organization_id = %L::uuid;',
  table_schema || '.' || table_name, table_schema, table_name, :'orphan_organization_id'
)
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND column_name = 'organization_id'
  AND table_name <> 'organizations'
  AND table_schema || '.' || table_name <> 'storage.objects'
ORDER BY table_schema, table_name
\gexec

\echo '7. Storage objects use the organization UUID as the first path segment'
SELECT bucket_id, count(*) AS object_count
FROM storage.objects
WHERE (storage.foldername(name))[1] = :'orphan_organization_id'
GROUP BY bucket_id
ORDER BY bucket_id;

\echo '8. Cross-check active operational membership in Ronaldo (must return exactly one intended row)'
SELECT p.id AS user_id, p.email, m.id AS membership_id, m.organization_id,
       m.role, m.is_active, o.legal_name, o.trade_name
FROM public.profiles p
JOIN public.organization_members m ON m.user_id = p.id
JOIN public.organizations o ON o.id = m.organization_id
WHERE lower(p.email) = lower(:'heloiza_email')
  AND m.organization_id <> :'orphan_organization_id'::uuid
  AND m.role = 'operacional' AND m.is_active
  AND (o.trade_name ILIKE '%Ronaldo%' OR o.legal_name ILIKE '%Ronaldo%');

ROLLBACK;
