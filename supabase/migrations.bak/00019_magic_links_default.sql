-- Phase 37: Default max_uses to 10 for new magic links
-- Does NOT backfill existing rows — null means unlimited (grandfathered per D-05)
ALTER TABLE public.magic_links
  ALTER COLUMN max_uses SET DEFAULT 10;
