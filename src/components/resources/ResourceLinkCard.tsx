"use client";

import { Pin, Trash2, ArrowUpRight } from "lucide-react";

interface ResourceLinkCardProps {
  resource: {
    id: string;
    title: string;
    url: string;
    comment: string | null;
    is_pinned: boolean;
    created_at: string;
    created_by_user: { name: string } | null;
  };
  canManage: boolean;
  onDelete: (id: string) => void;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ResourceLinkCard({ resource, canManage, onDelete }: ResourceLinkCardProps) {
  const pinned = resource.is_pinned;
  const host = hostnameOf(resource.url);

  return (
    <article
      className={
        pinned
          ? "group rounded-2xl border border-ima-primary/25 bg-ima-surface-accent p-5 md:p-6 hover:border-ima-primary/55 hover:shadow-card-hover motion-safe:transition-all duration-200 ease-out"
          : "group rounded-2xl border border-ima-border bg-ima-surface p-5 md:p-6 hover:shadow-card-hover motion-safe:transition-all duration-200 ease-out"
      }
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className={
            pinned
              ? "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-ima-primary text-white"
              : "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-ima-surface-accent text-ima-primary"
          }
        >
          {pinned ? (
            <Pin className="h-5 w-5" strokeWidth={2.5} fill="currentColor" />
          ) : (
            <ArrowUpRight
              className="h-5 w-5 motion-safe:transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={2.5}
            />
          )}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {pinned && (
              <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-ima-primary leading-none">
                Pinned
              </p>
            )}
            <p className="text-[10px] uppercase tracking-[0.08em] font-medium text-ima-text-muted tabular-nums leading-none truncate">
              {host}
            </p>
          </div>

          <h3 className="mt-2 text-lg md:text-xl font-semibold tracking-tight leading-tight break-words">
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ima-text hover:text-ima-primary focus-visible:outline-none focus-visible:text-ima-primary focus-visible:underline underline-offset-4 motion-safe:transition-colors"
            >
              {resource.title}
            </a>
          </h3>

          {resource.comment && (
            <p className="mt-2 text-sm text-ima-text-secondary leading-relaxed">
              {resource.comment}
            </p>
          )}

          <div className="mt-3 flex items-center gap-3 text-[10px] uppercase tracking-[0.08em] font-medium text-ima-text-muted">
            <span className="truncate">
              {resource.created_by_user?.name ?? "Unknown"}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums flex-shrink-0">
              {formatRelativeDate(resource.created_at)}
            </span>
          </div>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => onDelete(resource.id)}
            aria-label={"Delete " + resource.title}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] flex-shrink-0 -mr-2 -mt-1 rounded-lg text-ima-text-muted hover:text-ima-error hover:bg-ima-error/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-error focus-visible:ring-offset-2 motion-safe:transition-colors"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}
