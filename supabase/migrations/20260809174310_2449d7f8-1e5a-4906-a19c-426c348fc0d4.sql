REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.monitoring_state_history FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.operational_monitoring_alerts FROM authenticated;
REVOKE ALL ON public.operational_monitoring_alerts FROM PUBLIC, anon;
REVOKE TRUNCATE ON public.monitoring_states FROM authenticated;
GRANT SELECT ON public.monitoring_state_history TO authenticated;
GRANT SELECT ON public.operational_monitoring_alerts TO authenticated;