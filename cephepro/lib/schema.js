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
  statements.push(sql`INSERT INTO cephepro_project_state(project_key,state,revision)
            VALUES('main','{}'::jsonb,0) ON CONFLICT (project_key) DO NOTHING`);

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
            VALUES('main','{}'::jsonb,0) ON CONFLICT (project_key) DO NOTHING`);

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
  // Apply the same two-version limit to legacy upload summaries. Historical
  // payloads that were never stored cannot be reconstructed from these summaries.
  statements.push(sql`DELETE FROM cephepro_activity_log l USING cephepro_puantaj p
    WHERE l.action_type='puantaj_upload' AND l.user_id=p.owner_id
      AND l.details->>'year'=p.work_year::text
      AND CASE WHEN l.details->>'revision' ~ '^[0-9]{1,10}$'
        THEN (l.details->>'revision')::bigint < p.revision::bigint-1 ELSE false END`);

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
  await sql.transaction(statements);
}
