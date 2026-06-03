-- =============================================================================
-- Migration 00008: Expand roadmap_progress CHECK constraint from 10 to 15 steps
-- and backfill steps 11-15 for existing students.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Section 1: Drop the old CHECK constraint and add the expanded one
-- ---------------------------------------------------------------------------

ALTER TABLE public.roadmap_progress
  DROP CONSTRAINT IF EXISTS roadmap_progress_step_number_check;

ALTER TABLE public.roadmap_progress
  ADD CONSTRAINT roadmap_progress_step_number_check
  CHECK (step_number BETWEEN 1 AND 15);

-- ---------------------------------------------------------------------------
-- Section 2: Backfill steps 11-15 for existing students
-- Targets students who have step 10 but NOT step 11 (old 10-step data).
-- Sets status='locked', completed_at=NULL for all backfilled rows.
-- ON CONFLICT DO NOTHING ensures idempotency.
-- ---------------------------------------------------------------------------

INSERT INTO public.roadmap_progress (student_id, step_number, step_name, status, completed_at)
SELECT
  existing.student_id,
  new_steps.step_number,
  new_steps.step_name,
  'locked',
  NULL
FROM (
  SELECT DISTINCT student_id
  FROM public.roadmap_progress rp10
  WHERE rp10.step_number = 10
    AND NOT EXISTS (
      SELECT 1 FROM public.roadmap_progress rp11
      WHERE rp11.student_id = rp10.student_id
        AND rp11.step_number = 11
    )
) existing
CROSS JOIN (
  VALUES
    (11, 'Scale Influencer Outreach'),
    (12, 'Research Brands'),
    (13, 'Send First Brand Pitch'),
    (14, 'Follow Up with Brands'),
    (15, 'Close First Brand Deal')
) AS new_steps(step_number, step_name)
ON CONFLICT (student_id, step_number) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Section 3: Update step_name for existing steps 1-10 to match config titles
-- These UPDATE statements only change step_name — not status or completed_at.
-- ---------------------------------------------------------------------------

UPDATE public.roadmap_progress
  SET step_name = 'Join the Course'
WHERE step_number = 1;

UPDATE public.roadmap_progress
  SET step_name = 'Plan Your Work'
WHERE step_number = 2;

UPDATE public.roadmap_progress
  SET step_name = 'Pick Your Niche'
WHERE step_number = 3;

UPDATE public.roadmap_progress
  SET step_name = 'Build Your Website'
WHERE step_number = 4;

UPDATE public.roadmap_progress
  SET step_name = 'Build a List of Influencers'
WHERE step_number = 5;

UPDATE public.roadmap_progress
  SET step_name = 'Send Your First Email'
WHERE step_number = 6;

UPDATE public.roadmap_progress
  SET step_name = 'Follow Up'
WHERE step_number = 7;

UPDATE public.roadmap_progress
  SET step_name = 'Get First Reply'
WHERE step_number = 8;

UPDATE public.roadmap_progress
  SET step_name = 'Close First Influencer'
WHERE step_number = 9;

UPDATE public.roadmap_progress
  SET step_name = 'Build to 5 Influencers'
WHERE step_number = 10;
