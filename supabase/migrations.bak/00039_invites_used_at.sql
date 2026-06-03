-- Track when invites are consumed so the invites list can hide "used"
-- rows 24 hours after consumption. Existing used rows remain NULL and
-- are hidden immediately by the 24h filter.

ALTER TABLE public.invites
  ADD COLUMN used_at timestamptz;

CREATE INDEX idx_invites_used_at ON public.invites(used_at);
