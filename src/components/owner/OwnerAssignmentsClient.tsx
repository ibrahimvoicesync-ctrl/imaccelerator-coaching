"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui";
import { COACH_CONFIG } from "@/lib/config";
import { cn } from "@/lib/utils";

interface Student {
  id: string;
  name: string;
  email: string;
  status: string;
  coach_id: string | null;
}

interface Coach {
  id: string;
  name: string;
  studentCount: number;
}

interface OwnerAssignmentsClientProps {
  students: Student[];
  coaches: Coach[];
}

type FilterTab = "all" | "assigned" | "unassigned";

export function OwnerAssignmentsClient({
  students,
  coaches,
}: OwnerAssignmentsClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  // Stable refs — prevent dep churn in callbacks
  const routerRef = useRef(router);
  const toastRef = useRef(toast);
  routerRef.current = router;
  toastRef.current = toast;

  // Local assignment overrides — key: studentId, value: coachId | null
  const [localAssignments, setLocalAssignments] = useState<
    Record<string, string | null>
  >({});
  // Per-row saving state
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});

  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  // Compute effective coach_id for a student (local override takes precedence)
  function getEffectiveCoachId(student: Student): string | null {
    return Object.prototype.hasOwnProperty.call(localAssignments, student.id)
      ? localAssignments[student.id]
      : student.coach_id;
  }

  // Live coach student counts based on local overrides
  const liveCoachCounts: Record<string, number> = {};
  for (const coach of coaches) {
    liveCoachCounts[coach.id] = 0;
  }
  for (const student of students) {
    const effectiveCoachId = getEffectiveCoachId(student);
    if (
      effectiveCoachId &&
      Object.prototype.hasOwnProperty.call(liveCoachCounts, effectiveCoachId)
    ) {
      liveCoachCounts[effectiveCoachId]++;
    }
  }

  const handleAssign = useCallback(
    async (
      studentId: string,
      newCoachId: string | null,
      prevCoachId: string | null,
    ) => {
      setSavingRows((prev) => ({ ...prev, [studentId]: true }));
      setLocalAssignments((prev) => ({ ...prev, [studentId]: newCoachId }));

      try {
        const res = await fetch(`/api/assignments?studentId=${studentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coach_id: newCoachId }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          toastRef.current({
            type: "error",
            title:
              (json as { error?: string }).error ??
              "Failed to update assignment",
          });
          // Revert local override
          setLocalAssignments((prev) => ({ ...prev, [studentId]: prevCoachId }));
          return;
        }

        toastRef.current({
          type: "success",
          title: newCoachId ? "Student assigned to coach" : "Student unassigned",
        });
        routerRef.current.refresh();
      } catch (err) {
        console.error("[OwnerAssignmentsClient] assignment error:", err);
        toastRef.current({ type: "error", title: "Something went wrong" });
        // Revert local override
        setLocalAssignments((prev) => ({ ...prev, [studentId]: prevCoachId }));
      } finally {
        setSavingRows((prev) => ({ ...prev, [studentId]: false }));
      }
    },
    [],
  );

  // Filter logic
  const filteredStudents = students.filter((student) => {
    const effectiveCoachId = getEffectiveCoachId(student);

    // Filter tab
    if (activeFilter === "assigned" && !effectiveCoachId) return false;
    if (activeFilter === "unassigned" && effectiveCoachId) return false;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      const nameMatch = student.name.toLowerCase().includes(q);
      const emailMatch = student.email.toLowerCase().includes(q);
      if (!nameMatch && !emailMatch) return false;
    }

    return true;
  });

  // Tab counts (not affected by search)
  const allCount = students.length;
  const assignedCount = students.filter(
    (s) => getEffectiveCoachId(s) !== null,
  ).length;
  const unassignedCount = students.filter(
    (s) => getEffectiveCoachId(s) === null,
  ).length;

  const max = COACH_CONFIG.maxStudentsPerCoach;

  function getProgressColor(count: number): string {
    const ratio = count / max;
    if (ratio > 0.95) return "bg-ima-error";
    if (ratio >= 0.8) return "bg-ima-warning";
    return "bg-ima-primary";
  }

  function initials(name: string): string {
    return name
      .split(" ")
      .map((n) => n[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    <div className="space-y-8">
      {/* Coach Capacity Cards */}
      {coaches.length > 0 && (
        <div>
          <p
            className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
          >
            Coach Capacity
          </p>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-[14px]">
            {coaches.map((coach) => {
              const count = liveCoachCounts[coach.id] ?? 0;
              const pct = Math.min(100, Math.round((count / max) * 100));
              return (
                <div
                  key={coach.id}
                  className="bg-white border border-ima-border rounded-[12px] p-4"
                >
                  <p className="text-[13px] font-semibold tracking-[-0.005em] text-ima-text truncate leading-tight">
                    {coach.name}
                  </p>
                  <p
                    className="mt-[6px] text-[10px] font-semibold tracking-[0.08em] uppercase text-ima-text-secondary tabular-nums slashed-zero"
                  >
                    {count} / {max} students
                  </p>
                  <div className="mt-3 h-[6px] rounded-full bg-ima-surface-light overflow-hidden">
                    <div
                      role="progressbar"
                      aria-valuenow={count}
                      aria-valuemin={0}
                      aria-valuemax={max}
                      aria-label={`${coach.name}: ${count} of ${max} students`}
                      className={cn(
                        "h-full rounded-full motion-safe:transition-all",
                        getProgressColor(count),
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Filter students by assignment status"
      >
        {(
          [
            { key: "all", label: "All", count: allCount },
            { key: "assigned", label: "Assigned", count: assignedCount },
            { key: "unassigned", label: "Unassigned", count: unassignedCount },
          ] as { key: FilterTab; label: string; count: number }[]
        ).map(({ key, label, count }) => {
          const isActive = activeFilter === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveFilter(key)}
              className={cn(
                "min-h-[44px] px-4 rounded-[10px] text-[13px] font-medium motion-safe:transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2",
                isActive
                  ? "bg-ima-primary text-white"
                  : "bg-white text-ima-text border border-ima-border hover:border-ima-border",
              )}
            >
              {label}
              <span
                className={cn(
                  "text-[11px] tabular-nums slashed-zero rounded-full px-[7px] py-[1px]",
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-ima-surface-light text-ima-text-secondary",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <Input
        label="Search students"
        placeholder="Search by name or email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Student Assignment Rows */}
      {filteredStudents.length === 0 ? (
        <div className="bg-white border border-ima-border rounded-[14px] p-6">
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No students found"
            description={
              activeFilter === "unassigned"
                ? "All students have been assigned a coach."
                : activeFilter === "assigned"
                  ? "No students have been assigned to this coach yet."
                  : "No students have joined the platform yet."
            }
            action={
              !search.trim() &&
              activeFilter !== "assigned" &&
              activeFilter !== "unassigned" ? (
                <Link
                  href="/owner/invites"
                  className={buttonVariants({ variant: "primary" })}
                >
                  Invite Students
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="space-y-3" role="list">
          {filteredStudents.map((student) => {
            const effectiveCoachId = getEffectiveCoachId(student);
            const isSaving = !!savingRows[student.id];
            const hasLocalChange = Object.prototype.hasOwnProperty.call(
              localAssignments,
              student.id,
            );

            return (
              <li
                key={student.id}
                className="bg-white border border-ima-border rounded-[14px] p-5 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                {/* Left: Avatar + info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-ima-surface-light border border-ima-border flex items-center justify-center text-[12px] font-semibold text-ima-text-secondary shrink-0">
                    {initials(student.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold tracking-[-0.005em] text-ima-text truncate leading-tight">
                      {student.name}
                    </p>
                    <p className="text-[12px] text-ima-text-secondary truncate mt-[2px]">
                      {student.email}
                    </p>
                  </div>
                </div>

                {/* Right: Coach dropdown */}
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={effectiveCoachId ?? ""}
                    onChange={(e) => {
                      const val = e.target.value === "" ? null : e.target.value;
                      const prev = effectiveCoachId;
                      handleAssign(student.id, val, prev);
                    }}
                    disabled={isSaving}
                    aria-label={`Assign ${student.name} to coach`}
                    className={cn(
                      "rounded-[10px] bg-white px-3 py-2 text-[13px] text-ima-text min-h-[44px] min-w-0 w-full sm:min-w-[200px] sm:w-auto focus:outline-none focus:ring-2 focus:ring-ima-primary focus:ring-offset-1 disabled:opacity-50 motion-safe:transition-colors border",
                      hasLocalChange
                        ? "border-ima-primary ring-1 ring-ima-primary/30"
                        : "border-ima-border hover:border-ima-border",
                    )}
                  >
                    <option value="">Unassigned</option>
                    {coaches.map((c) => {
                      const cnt = liveCoachCounts[c.id] ?? 0;
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} ({cnt} student{cnt !== 1 ? "s" : ""})
                        </option>
                      );
                    })}
                  </select>
                  {isSaving && (
                    <span
                      className="text-[10px] font-semibold tracking-[0.08em] uppercase text-ima-text-secondary"
                    >
                      Saving…
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
