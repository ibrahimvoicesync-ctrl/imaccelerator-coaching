-- ---------------------------------------------------------------------------
-- Alert dismissals — tracks which computed alerts the owner has dismissed
-- Alerts are computed at query time; this table only stores dismissal keys.
-- ---------------------------------------------------------------------------

CREATE TABLE public.alert_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  alert_key text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, alert_key)
);

CREATE INDEX idx_alert_dismissals_owner ON public.alert_dismissals(owner_id);

-- RLS: owner can read and insert only their own dismissals
ALTER TABLE public.alert_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_dismissals" ON public.alert_dismissals
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner' AND owner_id = (select get_user_id()));

CREATE POLICY "owner_insert_dismissals" ON public.alert_dismissals
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'owner' AND owner_id = (select get_user_id()));

-- Explicit grants (defense-in-depth alongside ALTER DEFAULT PRIVILEGES in 00002)
GRANT ALL ON TABLE public.alert_dismissals TO anon, authenticated, service_role;
