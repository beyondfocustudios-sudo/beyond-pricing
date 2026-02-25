-- 031_drop_debug_introspection_helpers.sql
-- Cleanup temporary introspection helpers used during troubleshooting.

DROP FUNCTION IF EXISTS app_debug_policies(text);
DROP FUNCTION IF EXISTS app_debug_triggers(text);
