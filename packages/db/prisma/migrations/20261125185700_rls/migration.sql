-- Row-level security: database-level tenant isolation (backstop for the app-level scoping
-- in src/tenancy.ts). Each query runs in a transaction that sets either:
--   app.gym_id     = '<gym id>'  -> only that gym's rows are visible/writable
--   app.bypass_rls = 'on'        -> platform-level access (asSystem / systemTransaction)
-- With neither set, tenant tables return no rows (fails closed).
--
-- RLS does not apply to superusers or BYPASSRLS roles: connect as the `fitflow` role.

CREATE OR REPLACE FUNCTION app_current_gym_id() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.gym_id', true), '') $$;

CREATE OR REPLACE FUNCTION app_rls_bypassed() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT COALESCE(current_setting('app.bypass_rls', true), '') = 'on' $$;

-- Keep this list in sync with TENANT_MODELS in src/tenancy.ts.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Branch', 'Role', 'User', 'Member', 'Plan', 'Membership', 'AuditLog']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE: also apply to the table owner, which is the role the app connects as.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (app_rls_bypassed() OR "gymId" = app_current_gym_id())
         WITH CHECK (app_rls_bypassed() OR "gymId" = app_current_gym_id())',
      t
    );
  END LOOP;
END $$;

-- Super-admins have no gym, and Postgres treats NULLs as distinct in (gymId, email), so
-- enforce unique super-admin emails separately.
CREATE UNIQUE INDEX "User_platform_email_key" ON "User" ("email") WHERE "gymId" IS NULL;
