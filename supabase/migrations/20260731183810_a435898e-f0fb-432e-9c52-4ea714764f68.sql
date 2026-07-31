
-- ============ ENUM ADDITIONS ============
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'aguardando';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'arquivada';
