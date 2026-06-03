"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Link as LinkIcon, Plus, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { ResourceLinkCard } from "./ResourceLinkCard";
import { AddResourceModal } from "./AddResourceModal";
import { DiscordEmbed } from "./DiscordEmbed";
import { GlossaryList, type GlossaryTerm } from "./GlossaryList";
import { AddGlossaryModal } from "./AddGlossaryModal";

interface Resource {
  id: string;
  title: string;
  url: string;
  comment: string | null;
  is_pinned: boolean;
  created_at: string;
  created_by: string;
  created_by_user: { name: string } | null;
}

type Tab = "links" | "community" | "glossary";

interface ResourcesClientProps {
  role: "owner" | "coach" | "student" | "student_diy";
  coachEditorial?: boolean;
}

export function ResourcesClient({ role, coachEditorial = false }: ResourcesClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>("links");
  const [resources, setResources] = useState<Resource[]>([]);
  const [glossaryTerms, setGlossaryTerms] = useState<GlossaryTerm[]>([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [loadingGlossary, setLoadingGlossary] = useState(true);
  const [showAddResource, setShowAddResource] = useState(false);
  const [showAddGlossary, setShowAddGlossary] = useState(false);
  const [editingTerm, setEditingTerm] = useState<GlossaryTerm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "resource" | "glossary"; id: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const canManage = role === "owner" || role === "coach";

  const fetchResources = useCallback(async () => {
    try {
      const res = await fetch("/api/resources");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        console.error("[ResourcesClient] Failed to fetch resources:", (json as { error?: string }).error ?? res.status);
        toastRef.current({ type: "error", title: "Failed to load resources" });
        return;
      }
      const data = (await res.json()) as { resources: Resource[] };
      setResources(data.resources ?? []);
    } catch (err) {
      console.error("[ResourcesClient] Network error fetching resources:", err);
      toastRef.current({ type: "error", title: "Network error loading resources" });
    } finally {
      setLoadingResources(false);
    }
  }, []);

  const fetchGlossary = useCallback(async () => {
    try {
      const res = await fetch("/api/glossary");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        console.error("[ResourcesClient] Failed to fetch glossary:", (json as { error?: string }).error ?? res.status);
        toastRef.current({ type: "error", title: "Failed to load glossary" });
        return;
      }
      const data = (await res.json()) as { glossary_terms: GlossaryTerm[] };
      setGlossaryTerms(data.glossary_terms ?? []);
    } catch (err) {
      console.error("[ResourcesClient] Network error fetching glossary:", err);
      toastRef.current({ type: "error", title: "Network error loading glossary" });
    } finally {
      setLoadingGlossary(false);
    }
  }, []);

  useEffect(() => {
    void fetchResources();
    void fetchGlossary();
  }, [fetchResources, fetchGlossary]);

  const refreshResources = useCallback(() => {
    void fetchResources();
  }, [fetchResources]);

  const refreshGlossary = useCallback(() => {
    void fetchGlossary();
  }, [fetchGlossary]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);

    try {
      let res: Response;
      if (deleteTarget.type === "resource") {
        res = await fetch("/api/resources", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "x-origin": window.location.origin,
          },
          body: JSON.stringify({ id: deleteTarget.id }),
        });
      } else {
        res = await fetch(`/api/glossary/${deleteTarget.id}`, {
          method: "DELETE",
          headers: {
            "x-origin": window.location.origin,
          },
        });
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const errMsg = (json as { error?: string }).error ?? "Failed to delete";
        console.error("[ResourcesClient] Delete failed:", errMsg);
        toastRef.current({ type: "error", title: errMsg });
        return;
      }

      toastRef.current({
        type: "success",
        title: deleteTarget.type === "resource" ? "Resource deleted" : "Glossary term deleted",
      });
      setDeleteTarget(null);

      if (deleteTarget.type === "resource") {
        void fetchResources();
      } else {
        void fetchGlossary();
      }
    } catch (err) {
      console.error("[ResourcesClient] Network error during delete:", err);
      toastRef.current({ type: "error", title: "Network error — please try again" });
    } finally {
      setIsDeleting(false);
    }
  };

  const tabMeta: Record<Tab, { label: string }> = {
    links: { label: "Links" },
    community: { label: "Community" },
    glossary: { label: "Glossary" },
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Editorial tab bar */}
      {coachEditorial ? (
        <div className="flex gap-[6px] flex-wrap" role="tablist">
          {(["links", "community", "glossary"] as Tab[]).map((tab) => {
            const meta = tabMeta[tab];
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "min-h-[44px] px-4 text-[13px] font-semibold rounded-[10px] border motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 whitespace-nowrap",
                  active
                    ? "bg-ima-primary text-white border-ima-primary"
                    : "bg-white border-ima-border text-ima-text hover:border-ima-border"
                )}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-1 border-b border-ima-border overflow-x-auto" role="tablist">
          {(["links", "community", "glossary"] as Tab[]).map((tab) => {
            const meta = tabMeta[tab];
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "relative inline-flex items-center gap-2 min-h-[52px] px-5 text-xs uppercase tracking-[0.08em] font-semibold border-b-2 motion-safe:transition-colors whitespace-nowrap",
                  active
                    ? "border-ima-primary text-ima-primary"
                    : "border-transparent text-ima-text-muted hover:text-ima-text"
                )}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Links tab */}
      <div className={activeTab === "links" ? "block" : "hidden"}>
        <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
          <div className="flex items-baseline gap-3">
            <p className="text-xs uppercase tracking-[0.08em] font-semibold text-ima-text">
              Resource links
            </p>
            {!loadingResources && resources.length > 0 && (
              <p className="text-[10px] uppercase tracking-[0.08em] font-medium text-ima-text-muted tabular-nums">
                {`${resources.length} saved`}
              </p>
            )}
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowAddResource(true)}
              className={cn(
                "inline-flex items-center gap-2 text-sm font-semibold tracking-tight px-5 min-h-[44px] motion-safe:transition-all duration-200 ease-out focus-visible:outline-none",
                coachEditorial
                  ? "bg-ima-primary text-white rounded-[10px] hover:bg-ima-primary-hover focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2"
                  : "bg-ima-primary text-white rounded-xl hover:bg-ima-primary-hover hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2"
              )}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
              Add resource
            </button>
          )}
        </div>

        {loadingResources ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : resources.length === 0 ? (
          <div
            className={cn(
              "p-8 md:p-10",
              coachEditorial
                ? "rounded-[14px] border border-ima-border bg-white"
                : "rounded-2xl border border-ima-border bg-ima-bg/60"
            )}
          >
            <div className="flex flex-col items-center gap-4 text-center max-w-md mx-auto">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full bg-ima-surface-accent text-ima-primary"
                aria-hidden="true"
              >
                <LinkIcon className="h-6 w-6" strokeWidth={2.25} />
              </span>
              <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-ima-text-muted">
                Empty library
              </p>
              <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-ima-text leading-tight">
                No resources yet
              </h3>
              <p className="text-sm text-ima-text-secondary leading-relaxed">
                {canManage
                  ? "Drop the first link — templates, sheets, playbooks, anything your students should bookmark."
                  : "When your coaches share links, they will appear here."}
              </p>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setShowAddResource(true)}
                  className={cn(
                    "mt-2 inline-flex items-center justify-center gap-2 text-base font-semibold tracking-tight px-6 min-h-[56px] motion-safe:transition-all duration-200 ease-out focus-visible:outline-none",
                    coachEditorial
                      ? "bg-ima-primary text-white rounded-[12px] hover:bg-ima-primary-hover focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2"
                      : "bg-ima-primary text-white rounded-2xl hover:bg-ima-primary-hover hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2"
                  )}
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                  Add first resource
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {resources.map((resource) => (
              <ResourceLinkCard
                key={resource.id}
                resource={resource}
                canManage={canManage}
                onDelete={(id) => setDeleteTarget({ type: "resource", id })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Community tab — CSS hidden to avoid iframe remount */}
      <div className={activeTab === "community" ? "block" : "hidden"}>
        <div className="mb-5">
          <div className="flex items-baseline gap-3">
            <p className="text-xs uppercase tracking-[0.08em] font-semibold text-ima-text">
              Community
            </p>
            <p className="text-[10px] uppercase tracking-[0.08em] font-medium text-ima-text-muted">
              Discord · live
            </p>
          </div>
          <p className="mt-2 text-sm text-ima-text-secondary leading-relaxed max-w-xl">
            Step into the conversation — coaches, peers, and live Q&amp;A in one channel.
          </p>
        </div>
        <div
          className={cn(
            "p-3 md:p-4",
            coachEditorial
              ? "rounded-[14px] border border-ima-border bg-white"
              : "rounded-2xl border border-ima-border bg-ima-bg/60"
          )}
        >
          <DiscordEmbed />
        </div>
      </div>

      {/* Glossary tab */}
      <div className={activeTab === "glossary" ? "block" : "hidden"}>
        <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
          <div className="flex items-baseline gap-3">
            <p className="text-xs uppercase tracking-[0.08em] font-semibold text-ima-text">
              Glossary
            </p>
            {!loadingGlossary && glossaryTerms.length > 0 && (
              <p className="text-[10px] uppercase tracking-[0.08em] font-medium text-ima-text-muted tabular-nums">
                {`${glossaryTerms.length} term${glossaryTerms.length !== 1 ? "s" : ""}`}
              </p>
            )}
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setEditingTerm(null);
                setShowAddGlossary(true);
              }}
              className={cn(
                "inline-flex items-center gap-2 text-sm font-semibold tracking-tight px-5 min-h-[44px] motion-safe:transition-all duration-200 ease-out focus-visible:outline-none",
                coachEditorial
                  ? "bg-ima-primary text-white rounded-[10px] hover:bg-ima-primary-hover focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2"
                  : "bg-ima-primary text-white rounded-xl hover:bg-ima-primary-hover hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2"
              )}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
              Add term
            </button>
          )}
        </div>

        {loadingGlossary ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : glossaryTerms.length === 0 && !canManage ? (
          <div
            className={cn(
              "p-8 md:p-10",
              coachEditorial
                ? "rounded-[14px] border border-ima-border bg-white"
                : "rounded-2xl border border-ima-border bg-ima-bg/60"
            )}
          >
            <div className="flex flex-col items-center gap-4 text-center max-w-md mx-auto">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full bg-ima-surface-accent text-ima-primary"
                aria-hidden="true"
              >
                <BookOpen className="h-6 w-6" strokeWidth={2.25} />
              </span>
              <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-ima-text-muted">
                Coming soon
              </p>
              <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-ima-text leading-tight">
                No terms yet
              </h3>
              <p className="text-sm text-ima-text-secondary leading-relaxed">
                Your coaches will add definitions here. Check back soon.
              </p>
            </div>
          </div>
        ) : (
          <GlossaryList
            terms={glossaryTerms}
            canManage={canManage}
            onEdit={(term) => {
              setEditingTerm(term);
              setShowAddGlossary(true);
            }}
            onDelete={(id) => setDeleteTarget({ type: "glossary", id })}
          />
        )}
      </div>

      {/* Add Resource Modal */}
      <AddResourceModal
        open={showAddResource}
        onClose={() => setShowAddResource(false)}
        onSuccess={refreshResources}
      />

      {/* Add/Edit Glossary Modal */}
      <AddGlossaryModal
        open={showAddGlossary}
        onClose={() => {
          setShowAddGlossary(false);
          setEditingTerm(null);
        }}
        onSuccess={refreshGlossary}
        editingTerm={editingTerm}
      />

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.type === "resource" ? "Delete Resource" : "Delete Glossary Term"}
      >
        <p className="text-sm text-ima-text-secondary">
          Are you sure you want to delete this{" "}
          {deleteTarget?.type === "resource" ? "resource" : "glossary term"}? This cannot be undone.
        </p>
        <div className="flex gap-3 mt-4 justify-end">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="danger" loading={isDeleting} onClick={handleConfirmDelete}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
