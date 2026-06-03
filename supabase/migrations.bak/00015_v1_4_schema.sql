-- ============================================================================
-- Phase 30: Database Migration — v1.4 Schema Foundation
-- Migration: 00015_v1_4_schema.sql
--
-- Creates 4 new tables for v1.4 features:
--   report_comments: one coach comment per daily report (upsert-friendly unique)
--   messages:        coach-student messaging with broadcast support (D-01, D-02)
--   resources:       shared links/documents added by owner/coach
--   glossary_terms:  shared terminology with case-insensitive unique terms (RES-09)
--
-- Also expands role CHECK constraints on users, invites, magic_links to accept
-- the new 'student_diy' role value (SCHEMA-02).
--
-- Requires: get_user_id(), get_user_role(), handle_updated_at() from 00001
-- ============================================================================


-- ============================================================================
-- Section 1: report_comments table
--
-- One comment per report (COMMENT-02). UNIQUE index on report_id serves both
-- the uniqueness constraint and the hot query path for looking up a comment
-- by report_id. Phase 34 API uses ON CONFLICT (report_id) DO UPDATE for upsert.
-- ============================================================================

CREATE TABLE public.report_comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid        NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  coach_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  comment     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_report_comments_report_id ON public.report_comments(report_id);


-- ============================================================================
-- Section 2: messages table
--
-- Single-table design per D-01: is_broadcast boolean flag; recipient_id is
-- NULL for broadcast messages. read_at per D-02: per-message read tracking,
-- NULL = unread. coach_id is the conversation anchor (room key).
-- No updated_at column — messages are immutable (no edit feature in v1).
-- ============================================================================

CREATE TABLE public.messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id  uuid        REFERENCES public.users(id) ON DELETE CASCADE,
  is_broadcast  boolean     NOT NULL DEFAULT false,
  content       text        NOT NULL,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Conversation thread lookup: coach_id + recipient_id (CHAT-06)
CREATE INDEX idx_messages_coach_recipient ON public.messages(coach_id, recipient_id);

-- Unread count query: partial index on unread messages only (CHAT-07, D-02)
CREATE INDEX idx_messages_recipient_read ON public.messages(recipient_id, read_at) WHERE read_at IS NULL;

-- Cursor-based pagination (CHAT-08)
CREATE INDEX idx_messages_created_at ON public.messages(created_at);


-- ============================================================================
-- Section 3: resources table
--
-- Add/delete only — no edit (RES-04). No updated_at column.
-- owner or coach can create. All authenticated roles can read.
-- ============================================================================

CREATE TABLE public.resources (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  title       varchar(255) NOT NULL,
  url         text         NOT NULL,
  comment     text,
  created_by  uuid         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at  timestamptz  NOT NULL DEFAULT now()
);


-- ============================================================================
-- Section 4: glossary_terms table
--
-- Functional unique index on lower(term) for case-insensitive uniqueness
-- per RES-09. Supports queries with WHERE lower(term) = lower(:search).
-- updated_at for coach/owner edit support (RES-07).
-- ============================================================================

CREATE TABLE public.glossary_terms (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  term        varchar(255) NOT NULL,
  definition  text         NOT NULL,
  created_by  uuid         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Case-insensitive unique constraint on term name (RES-09)
CREATE UNIQUE INDEX idx_glossary_terms_term_lower ON public.glossary_terms(lower(term));


-- ============================================================================
-- Section 5: updated_at triggers
--
-- Register handle_updated_at() (defined in 00001) for tables with updated_at.
-- Only report_comments and glossary_terms have updated_at columns.
-- messages and resources do NOT get this trigger (no updated_at column).
-- ============================================================================

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.report_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.glossary_terms
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================================
-- Section 6: Role CHECK constraint ALTERs
--
-- Expand role CHECK constraints on users, invites, and magic_links to accept
-- the new 'student_diy' role value (SCHEMA-02). Postgres requires DROP + ADD
-- to modify a CHECK constraint predicate.
--
-- users includes 'owner'; invites and magic_links do NOT (owners are created
-- directly, not via invites or magic_links).
--
-- IF EXISTS guard makes the DROP safe even if auto-generated constraint name
-- differs from expected.
-- ============================================================================

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'coach', 'student', 'student_diy'));

ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS invites_role_check;
ALTER TABLE public.invites ADD CONSTRAINT invites_role_check
  CHECK (role IN ('coach', 'student', 'student_diy'));

ALTER TABLE public.magic_links DROP CONSTRAINT IF EXISTS magic_links_role_check;
ALTER TABLE public.magic_links ADD CONSTRAINT magic_links_role_check
  CHECK (role IN ('coach', 'student', 'student_diy'));


-- ============================================================================
-- Section 7: Enable RLS on all 4 new tables
-- ============================================================================

ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glossary_terms ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- Section 8: RLS policies — report_comments
--
-- Per D-04: RLS is defense-in-depth. App layer (proxy + API role checks +
-- admin client) handles primary access control.
--
-- SELECT: owner reads all; coach reads comments on their assigned students'
--   reports; student reads comments on their own reports.
-- INSERT: owner can insert; coach can insert on their assigned students' reports.
-- UPDATE: owner can update any; coach can update their own comments.
-- No DELETE policies — comments are upserted, never deleted.
-- ============================================================================

CREATE POLICY "owner_select_report_comments" ON public.report_comments
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_report_comments" ON public.report_comments
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND report_id IN (
      SELECT dr.id FROM public.daily_reports dr
      JOIN public.users s ON s.id = dr.student_id
      WHERE s.coach_id = (select get_user_id())
    )
  );

CREATE POLICY "student_select_report_comments" ON public.report_comments
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'student'
    AND report_id IN (
      SELECT dr.id FROM public.daily_reports dr
      WHERE dr.student_id = (select get_user_id())
    )
  );

CREATE POLICY "owner_insert_report_comments" ON public.report_comments
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'owner');

CREATE POLICY "coach_insert_report_comments" ON public.report_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    (select get_user_role()) = 'coach'
    AND coach_id = (select get_user_id())
    AND report_id IN (
      SELECT dr.id FROM public.daily_reports dr
      JOIN public.users s ON s.id = dr.student_id
      WHERE s.coach_id = (select get_user_id())
    )
  );

CREATE POLICY "owner_update_report_comments" ON public.report_comments
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_update_report_comments" ON public.report_comments
  FOR UPDATE TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND coach_id = (select get_user_id())
  );


-- ============================================================================
-- Section 9: RLS policies — messages
--
-- SELECT: owner reads all; coach reads messages where they are coach_id;
--   student reads messages where they are the recipient OR broadcasts from
--   their coach OR messages they sent.
-- INSERT: coach inserts messages (coach_id = self, sender_id = self);
--   student inserts DMs only (sender_id = self, recipient_id NOT NULL,
--   is_broadcast = false).
-- UPDATE: coach and student can update read_at on messages sent to them.
-- No DELETE policies — messages are never deleted in v1.
-- ============================================================================

CREATE POLICY "owner_select_messages" ON public.messages
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND coach_id = (select get_user_id())
  );

CREATE POLICY "student_select_messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    (select get_user_role()) = 'student'
    AND (
      recipient_id = (select get_user_id())
      OR sender_id = (select get_user_id())
      OR (
        is_broadcast = true
        AND coach_id = (SELECT coach_id FROM public.users WHERE id = (select get_user_id()))
      )
    )
  );

CREATE POLICY "coach_insert_messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (select get_user_role()) = 'coach'
    AND coach_id = (select get_user_id())
    AND sender_id = (select get_user_id())
  );

CREATE POLICY "student_insert_messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (select get_user_role()) = 'student'
    AND sender_id = (select get_user_id())
    AND recipient_id IS NOT NULL
    AND is_broadcast = false
  );

CREATE POLICY "coach_update_messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND recipient_id = (select get_user_id())
  );

CREATE POLICY "student_update_messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    (select get_user_role()) = 'student'
    AND (
      recipient_id = (select get_user_id())
      OR (
        is_broadcast = true
        AND coach_id = (SELECT coach_id FROM public.users WHERE id = (select get_user_id()))
      )
    )
  );


-- ============================================================================
-- Section 10: RLS policies — resources
--
-- SELECT: owner, coach, and student can all read resources.
-- INSERT: owner and coach can add resources.
-- DELETE: owner can delete any; coach can delete their own.
-- No UPDATE policies — resources are add/delete only, not editable (RES-04).
-- ============================================================================

CREATE POLICY "owner_select_resources" ON public.resources
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_resources" ON public.resources
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'coach');

CREATE POLICY "student_select_resources" ON public.resources
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'student');

CREATE POLICY "owner_insert_resources" ON public.resources
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'owner');

CREATE POLICY "coach_insert_resources" ON public.resources
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'coach');

CREATE POLICY "owner_delete_resources" ON public.resources
  FOR DELETE TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_delete_resources" ON public.resources
  FOR DELETE TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND created_by = (select get_user_id())
  );


-- ============================================================================
-- Section 11: RLS policies — glossary_terms
--
-- SELECT: owner, coach, and student can all read glossary terms.
-- INSERT: owner and coach can add terms.
-- UPDATE: owner can update any; coach can update their own.
-- DELETE: owner can delete any; coach can delete their own.
-- ============================================================================

CREATE POLICY "owner_select_glossary_terms" ON public.glossary_terms
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_select_glossary_terms" ON public.glossary_terms
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'coach');

CREATE POLICY "student_select_glossary_terms" ON public.glossary_terms
  FOR SELECT TO authenticated
  USING ((select get_user_role()) = 'student');

CREATE POLICY "owner_insert_glossary_terms" ON public.glossary_terms
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'owner');

CREATE POLICY "coach_insert_glossary_terms" ON public.glossary_terms
  FOR INSERT TO authenticated
  WITH CHECK ((select get_user_role()) = 'coach');

CREATE POLICY "owner_update_glossary_terms" ON public.glossary_terms
  FOR UPDATE TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_update_glossary_terms" ON public.glossary_terms
  FOR UPDATE TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND created_by = (select get_user_id())
  );

CREATE POLICY "owner_delete_glossary_terms" ON public.glossary_terms
  FOR DELETE TO authenticated
  USING ((select get_user_role()) = 'owner');

CREATE POLICY "coach_delete_glossary_terms" ON public.glossary_terms
  FOR DELETE TO authenticated
  USING (
    (select get_user_role()) = 'coach'
    AND created_by = (select get_user_id())
  );
