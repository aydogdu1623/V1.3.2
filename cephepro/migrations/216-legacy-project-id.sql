-- Preserve legacy primary keys and data; replace only the old singleton default.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
  AND table_name='cephepro_project_state' AND column_name='id'
  AND data_type='integer' AND column_default='1' AND is_identity='NO') THEN
  LOCK TABLE cephepro_project_state IN ACCESS EXCLUSIVE MODE;
  CREATE SEQUENCE IF NOT EXISTS cephepro_project_state_legacy_id_seq;
  PERFORM setval('cephepro_project_state_legacy_id_seq',GREATEST(COALESCE((SELECT MAX(id) FROM cephepro_project_state),0)+1,1),false);
  ALTER TABLE cephepro_project_state ALTER COLUMN id SET DEFAULT nextval('cephepro_project_state_legacy_id_seq');
  ALTER SEQUENCE cephepro_project_state_legacy_id_seq OWNED BY cephepro_project_state.id;
 END IF;
END $$;
