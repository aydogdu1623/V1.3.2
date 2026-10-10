let schemaPromise;

export function ensureSchema(sql) {
  if (!schemaPromise) {
    schemaPromise = initializeSchema(sql).catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

async function initializeSchema(sql) {
  const statements=[];
  statements.push(sql`CREATE TABLE IF NOT EXISTS cephepro_migrations(name text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now())`);
  statements.push(sql`CREATE TABLE IF NOT EXISTS cephepro_claims (owner_id text PRIMARY KEY, data jsonb NOT NULL DEFAULT '{}'::jsonb, revision integer NOT NULL DEFAULT 0)`);
  statements.push(sql`ALTER TABLE cephepro_claims ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false`);
  statements.push(sql`ALTER TABLE cephepro_claims ADD COLUMN IF NOT EXISTS published_at timestamptz`);
  statements.push(sql`CREATE TABLE IF NOT EXISTS cephepro_users (
    id text PRIMARY KEY,
    name text NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    password_salt text NOT NULL,
    role text NOT NULL DEFAULT 'member',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  statements.push(sql`ALTER TABLE cephepro_users ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT true`);
  statements.push(sql`ALTER TABLE cephepro_users ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false`);
  statements.push(sql`ALTER TABLE cephepro_users ADD COLUMN IF NOT EXISTS requested_at timestamptz NOT NULL DEFAULT now()`);
  statements.push(sql`ALTER TABLE cephepro_users ADD COLUMN IF NOT EXISTS profile_data jsonb NOT NULL DEFAULT '{}'::jsonb`);
  statements.push(sql`ALTER TABLE cephepro_users ADD COLUMN IF NOT EXISTS approval_notice_pending boolean NOT NULL DEFAULT false`);
  statements.push(sql`ALTER TABLE cephepro_users ADD COLUMN IF NOT EXISTS unblock_notice_pending boolean NOT NULL DEFAULT false`);
  statements.push(sql`ALTER TABLE cephepro_users ADD COLUMN IF NOT EXISTS access_unlimited boolean NOT NULL DEFAULT true`);
  statements.push(sql`ALTER TABLE cephepro_users ADD COLUMN IF NOT EXISTS access_expires_at timestamptz`);
  statements.push(sql`ALTER TABLE cephepro_users ADD COLUMN IF NOT EXISTS approval_request_visible boolean NOT NULL DEFAULT true`);
  statements.push(sql`CREATE UNIQUE INDEX IF NOT EXISTS cephepro_users_username_lower_uq ON cephepro_users (lower(username))`);
  statements.push(sql`CREATE UNIQUE INDEX IF NOT EXISTS cephepro_users_email_lower_uq ON cephepro_users (lower(email))`);

  statements.push(sql`CREATE TABLE IF NOT EXISTS cephepro_sessions (
    token_hash text PRIMARY KEY,
    user_id text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  statements.push(sql`CREATE INDEX IF NOT EXISTS cephepro_sessions_user_idx ON cephepro_sessions(user_id)`);

  statements.push(sql`CREATE TABLE IF NOT EXISTS cephepro_auth_failures (
    failure_key text PRIMARY KEY,
    attempts integer NOT NULL DEFAULT 0,
    window_started_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  statements.push(sql`CREATE INDEX IF NOT EXISTS cephepro_auth_failures_updated_idx ON cephepro_auth_failures(updated_at)`);

  statements.push(sql`CREATE TABLE IF NOT EXISTS cephepro_project_state (
    project_key text PRIMARY KEY,
    state jsonb NOT NULL DEFAULT '{}'::jsonb,
    revision bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text
  )`);
  statements.push(sql`DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
  AND table_name='cephepro_project_state' AND column_name='id'
  AND data_type='integer' AND column_default='1' AND is_identity='NO') THEN
  LOCK TABLE cephepro_project_state IN ACCESS EXCLUSIVE MODE;
  CREATE SEQUENCE IF NOT EXISTS cephepro_project_state_legacy_id_seq;
  PERFORM setval('cephepro_project_state_legacy_id_seq',GREATEST(COALESCE((SELECT MAX(id) FROM cephepro_project_state),0)+1,1),false);
  ALTER TABLE cephepro_project_state ALTER COLUMN id SET DEFAULT nextval('cephepro_project_state_legacy_id_seq');
  ALTER SEQUENCE cephepro_project_state_legacy_id_seq OWNED BY cephepro_project_state.id;
 END IF;
END $$`);
  statements.push(sql`INSERT INTO cephepro_project_state(project_key,state,revision)
            SELECT 'main','{}'::jsonb,0 WHERE NOT EXISTS(SELECT 1 FROM cephepro_migrations WHERE name='main_project_purged_v216') ON CONFLICT (project_key) DO NOTHING`);

  // Birim fiyatlar ortak proje durumundan ayrı ve yalnız Admin API'sinden
  // erişilebilen tabloda tutulur; Üye tarayıcısına finans verisi gönderilmez.
  statements.push(sql`CREATE TABLE IF NOT EXISTS cephepro_financial_state (
    project_key text PRIMARY KEY,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    revision bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text
  )`);
  statements.push(sql`INSERT INTO cephepro_financial_state(project_key,data,revision)
            SELECT 'main','{}'::jsonb,0 WHERE NOT EXISTS(SELECT 1 FROM cephepro_migrations WHERE name='main_project_purged_v216') ON CONFLICT (project_key) DO NOTHING`);

  statements.push(sql`CREATE TABLE IF NOT EXISTS cephepro_activity_log (
    id bigserial PRIMARY KEY,
    user_id text,
    user_name text NOT NULL,
    username text,
    role text,
    action_type text NOT NULL,
    summary text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  statements.push(sql`ALTER TABLE cephepro_activity_log ADD COLUMN IF NOT EXISTS deleted_at timestamptz`);
  statements.push(sql`ALTER TABLE cephepro_activity_log ADD COLUMN IF NOT EXISTS deleted_by text`);
  statements.push(sql`CREATE INDEX IF NOT EXISTS cephepro_activity_created_idx ON cephepro_activity_log(created_at DESC)`);
  statements.push(sql`CREATE INDEX IF NOT EXISTS cephepro_activity_user_idx ON cephepro_activity_log(user_id,created_at DESC)`);
  statements.push(sql`CREATE INDEX IF NOT EXISTS cephepro_activity_daily_user_idx ON cephepro_activity_log(user_id,created_at DESC) WHERE action_type='daily_production'`);

  // Each owner/year retains the current payroll and exactly one previous copy.
  statements.push(sql`CREATE TABLE IF NOT EXISTS cephepro_puantaj (
    owner_id text NOT NULL, work_year integer NOT NULL,
    data jsonb NOT NULL DEFAULT '{}'::jsonb, revision integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,work_year)
  )`);
  statements.push(sql`ALTER TABLE cephepro_puantaj ADD COLUMN IF NOT EXISTS previous_data jsonb`);
  statements.push(sql`ALTER TABLE cephepro_puantaj ADD COLUMN IF NOT EXISTS previous_revision integer`);
  statements.push(sql`ALTER TABLE cephepro_puantaj ADD COLUMN IF NOT EXISTS previous_updated_at timestamptz`);

  statements.push(sql`CREATE TABLE IF NOT EXISTS cephepro_daily_activity_snapshots (
    user_id text NOT NULL,
    work_date date NOT NULL,
    user_name text NOT NULL,
    username text,
    role text,
    records jsonb NOT NULL DEFAULT '[]'::jsonb,
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY(user_id,work_date)
  )`);
  statements.push(sql`CREATE INDEX IF NOT EXISTS cephepro_daily_activity_expiry_idx ON cephepro_daily_activity_snapshots(expires_at)`);

  statements.push(sql`CREATE TABLE IF NOT EXISTS cephepro_photos (
    photo_id text PRIMARY KEY,
    facade_key text NOT NULL,
    owner_user_id text NOT NULL,
    owner_username text NOT NULL,
    photo jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  statements.push(sql`CREATE INDEX IF NOT EXISTS cephepro_photos_facade_idx ON cephepro_photos(facade_key,created_at DESC)`);
  statements.push(sql`CREATE TABLE IF NOT EXISTS cephepro_projects (
    project_key text PRIMARY KEY, name text NOT NULL, company_code text, project_code text,
    password_hash text, password_salt text, access_version integer NOT NULL DEFAULT 1,
    owner_id text, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  statements.push(sql`CREATE UNIQUE INDEX IF NOT EXISTS cephepro_project_codes_uq ON cephepro_projects(company_code,project_code)`);
  statements.push(sql`INSERT INTO cephepro_projects(project_key,name,owner_id)
    SELECT 'main','Mevcut Proje',(SELECT id FROM cephepro_users WHERE lower(email)='aydogdu1623@gmail.com' LIMIT 1) WHERE NOT EXISTS(SELECT 1 FROM cephepro_migrations WHERE name='main_project_purged_v216')
    ON CONFLICT(project_key) DO NOTHING`);
  statements.push(sql`CREATE TABLE IF NOT EXISTS cephepro_project_members (
    project_key text NOT NULL, user_id text NOT NULL, joined_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(project_key,user_id)
  )`);
  statements.push(sql`CREATE TABLE IF NOT EXISTS cephepro_project_sessions (
    token_hash text PRIMARY KEY, auth_token_hash text NOT NULL, user_id text NOT NULL,
    project_key text NOT NULL, access_version integer NOT NULL, expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  statements.push(sql`CREATE INDEX IF NOT EXISTS cephepro_project_sessions_auth_idx ON cephepro_project_sessions(auth_token_hash)`);
  statements.push(sql`INSERT INTO cephepro_project_members(project_key,user_id)
    SELECT 'main',id FROM cephepro_users WHERE NOT EXISTS(SELECT 1 FROM cephepro_migrations WHERE name='project_scope_v213')
    ON CONFLICT DO NOTHING`);
  statements.push(sql`ALTER TABLE cephepro_claims ADD COLUMN IF NOT EXISTS project_key text NOT NULL DEFAULT 'main'`);
  statements.push(sql`DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='cephepro_claims'::regclass AND contype='p' AND pg_get_constraintdef(oid) NOT LIKE 'PRIMARY KEY (project_key,%') THEN
      ALTER TABLE cephepro_claims DROP CONSTRAINT cephepro_claims_pkey;
      ALTER TABLE cephepro_claims ADD PRIMARY KEY(project_key,owner_id);
    END IF;
  END $$`);
  statements.push(sql`ALTER TABLE cephepro_puantaj ADD COLUMN IF NOT EXISTS project_key text NOT NULL DEFAULT 'main'`);
  statements.push(sql`DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='cephepro_puantaj'::regclass AND contype='p' AND pg_get_constraintdef(oid) NOT LIKE 'PRIMARY KEY (project_key,%') THEN
      ALTER TABLE cephepro_puantaj DROP CONSTRAINT cephepro_puantaj_pkey;
      ALTER TABLE cephepro_puantaj ADD PRIMARY KEY(project_key,owner_id,work_year);
    END IF;
  END $$`);
  statements.push(sql`ALTER TABLE cephepro_daily_activity_snapshots ADD COLUMN IF NOT EXISTS project_key text NOT NULL DEFAULT 'main'`);
  statements.push(sql`DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='cephepro_daily_activity_snapshots'::regclass AND contype='p' AND pg_get_constraintdef(oid) NOT LIKE 'PRIMARY KEY (project_key,%') THEN
      ALTER TABLE cephepro_daily_activity_snapshots DROP CONSTRAINT cephepro_daily_activity_snapshots_pkey;
      ALTER TABLE cephepro_daily_activity_snapshots ADD PRIMARY KEY(project_key,user_id,work_date);
    END IF;
  END $$`);
  statements.push(sql`ALTER TABLE cephepro_photos ADD COLUMN IF NOT EXISTS project_key text NOT NULL DEFAULT 'main'`);
  statements.push(sql`DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='cephepro_photos'::regclass AND contype='p' AND pg_get_constraintdef(oid) NOT LIKE 'PRIMARY KEY (project_key,%') THEN
      ALTER TABLE cephepro_photos DROP CONSTRAINT cephepro_photos_pkey;
      ALTER TABLE cephepro_photos ADD PRIMARY KEY(project_key,photo_id);
    END IF;
  END $$`);
  statements.push(sql`ALTER TABLE cephepro_activity_log ADD COLUMN IF NOT EXISTS project_key text DEFAULT 'main'`);
  statements.push(sql`CREATE INDEX IF NOT EXISTS cephepro_activity_project_idx ON cephepro_activity_log(project_key,user_id,id DESC)`);
  statements.push(sql`INSERT INTO cephepro_migrations(name) VALUES('project_scope_v213') ON CONFLICT DO NOTHING`);
  // Retention is isolated by project as well as payroll owner and year.
  statements.push(sql`DELETE FROM cephepro_activity_log l USING cephepro_puantaj p
    WHERE l.action_type='puantaj_upload' AND l.user_id=p.owner_id AND l.project_key=p.project_key
      AND l.details->>'year'=p.work_year::text
      AND CASE WHEN l.details->>'revision' ~ '^[0-9]{1,10}$'
        THEN (l.details->>'revision')::bigint < p.revision::bigint-1 ELSE false END`);
  await sql.transaction(statements);
}
