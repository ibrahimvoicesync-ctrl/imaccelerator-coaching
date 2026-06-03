-- Add is_pinned column to resources table (D-02: pinned resources float to top)
ALTER TABLE public.resources
  ADD COLUMN is_pinned boolean NOT NULL DEFAULT false;
