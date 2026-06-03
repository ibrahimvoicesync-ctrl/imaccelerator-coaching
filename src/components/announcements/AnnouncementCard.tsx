"use client";

/**
 * Phase 56: Single announcement card.
 *
 * States:
 *  - Read mode: avatar + author + role chip + timestamp + "(edited)" + content.
 *    Owner/coach viewers additionally see Edit (Pencil) and Delete (Trash2)
 *    icon buttons in the header (44x44 touch targets, aria-labels per Hard Rule 3).
 *  - Edit mode: content area is replaced by <AnnouncementForm mode="edit" />
 *    pre-filled with the current content.
 *
 * UI gating rule (from 56-UI-SPEC.md §Role-Gated UI Rules):
 *   Show Edit/Delete when viewerRole === "owner" OR viewerRole === "coach".
 *   Owner and coach can edit/delete ANY announcement (ANNOUNCE-03 / ANNOUNCE-04).
 *   UI gating here is defense-in-depth — the API route is the security boundary.
 */

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/chat-utils";
import type { Announcement, AnnouncementsPageRole } from "./announcement-types";
import { AnnouncementForm } from "./AnnouncementForm";
import { DeleteAnnouncementDialog } from "./DeleteAnnouncementDialog";

interface AnnouncementCardProps {
  announcement: Announcement;
  viewerRole: AnnouncementsPageRole;
  /** Called when edit/delete mutates or removes this card. Parent updates list state. */
  onUpdated: (updated: Announcement) => void;
  onDeleted: (id: string) => void;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function AnnouncementCard({
  announcement,
  viewerRole,
  onUpdated,
  onDeleted,
}: AnnouncementCardProps) {
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const canMutate = viewerRole === "owner" || viewerRole === "coach";
  const authorName = announcement.author?.name ?? "Unknown";
  const authorRole = announcement.author?.role ?? "coach";
  const roleLabel = authorRole === "owner" ? "Owner" : "Coach";

  const rolePillClass =
    authorRole === "owner"
      ? "bg-ima-warning/10 text-ima-warning"
      : "bg-ima-surface-accent text-ima-primary";

  return (
    <article className="group grid grid-cols-[44px_minmax(0,1fr)] gap-5 rounded-2xl border border-ima-border bg-ima-surface p-5 md:p-6 hover:shadow-card-hover motion-safe:transition-shadow duration-200 ease-out">
      <span
        aria-hidden="true"
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-ima-primary text-white text-sm font-semibold tracking-tight ring-1 ring-ima-primary/20"
      >
        {getInitials(authorName)}
      </span>
      <div className="min-w-0">
        <header className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-sm font-semibold tracking-tight text-ima-text truncate">
              {authorName}
            </span>
            <span
              className={`inline-flex items-center text-[10px] uppercase tracking-[0.08em] font-semibold px-2 py-1 rounded-md ${rolePillClass}`}
            >
              {roleLabel}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] uppercase tracking-[0.08em] font-medium text-ima-text-muted tabular-nums flex items-center gap-1.5">
              <time dateTime={announcement.created_at}>
                {formatRelativeTime(new Date(announcement.created_at))}
              </time>
              {announcement.is_edited && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Edited</span>
                </>
              )}
            </span>
            {canMutate && !editing && (
              <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 motion-safe:transition-opacity -mr-2 ml-1">
                <button
                  type="button"
                  aria-label="Edit announcement"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-ima-text-muted hover:text-ima-primary hover:bg-ima-surface-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2 motion-safe:transition-colors"
                >
                  <Pencil className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Delete announcement"
                  onClick={() => setDeleteOpen(true)}
                  className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-ima-text-muted hover:text-ima-error hover:bg-ima-error/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-error focus-visible:ring-offset-2 motion-safe:transition-colors"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </header>

        {editing ? (
          <AnnouncementForm
            mode="edit"
            announcementId={announcement.id}
            initialContent={announcement.content}
            onSuccess={(updated) => {
              onUpdated(updated);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <p className="text-base text-ima-text whitespace-pre-wrap leading-[1.6] max-w-[56ch]">
            {announcement.content}
          </p>
        )}

        {canMutate && (
          <DeleteAnnouncementDialog
            open={deleteOpen}
            announcementId={announcement.id}
            onClose={() => setDeleteOpen(false)}
            onDeleted={() => onDeleted(announcement.id)}
          />
        )}
      </div>
    </article>
  );
}
