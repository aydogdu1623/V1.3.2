-- Yeni puantaj tablosu. Mevcut tablolara veya kayıtlara dokunmaz.
CREATE TABLE IF NOT EXISTS cephepro_puantaj (
 owner_id text NOT NULL,
 work_year integer NOT NULL,
 data jsonb NOT NULL DEFAULT '{}'::jsonb,
 revision integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,work_year)
);
