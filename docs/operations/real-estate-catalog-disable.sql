-- Suspensão global e reversível das vitrines deste banco. Preserva todos os dados.
BEGIN;
UPDATE fluxa_catalog_private.storefronts SET is_enabled=false,updated_at=clock_timestamp();
COMMIT;
