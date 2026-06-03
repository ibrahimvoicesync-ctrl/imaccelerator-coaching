"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";

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

interface CoachAssignmentsClientProps {
  students: Student[];
  coaches: Coach[];
}

type FilterTab = "all" | "assigned" | "unassigned";

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function CoachAssignmentsClient({ students, coaches }: CoachAssignmentsClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  const routerRef = useRef(router);
  const toastRef = useRef(toast);
  routerRef.current = router;
  toastRef.current = toast;

  const [localAssignments, setLocalAssignments] = useState<Record<string, string | null>>({});
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});

  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  function getEffectiveCoachId(student: Student): string | null {
    return Object.prototype.hasOwnProperty.call(localAssignments, student.id)
      ? localAssignments[student.id]
      : student.coach_id;
  }

  const liveCoachCounts: Record<string, number> = {};
  for (const coach of coaches) {
    liveCoachCounts[coach.id] = 0;
  }
  for (const student of students) {
    const effectiveCoachId = getEffectiveCoachId(student);
    if (effectiveCoachId && Object.prototype.hasOwnProperty.call(liveCoachCounts, effectiveCoachId)) {
      liveCoachCounts[effectiveCoachId]++;
    }
  }

  const handleAssign = useCallback(
    async (studentId: string, newCoachId: string | null, prevCoachId: string | null) => {
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
            title: (json as { error?: string }).error ?? "Failed to update assignment",
          });
          setLocalAssignments((prev) => ({ ...prev, [studentId]: prevCoachId }));
          return;
        }

        toastRef.current({
          type: "success",
          title: newCoachId ? "Student assigned to coach" : "Student unassigned",
        });
        routerRef.current.refresh();
      } catch (err) {
        console.error("[CoachAssignmentsClient] assignment error:", err);
        toastRef.current({ type: "error", title: "Something went wrong" });
        setLocalAssignments((prev) => ({ ...prev, [studentId]: prevCoachId }));
      } finally {
        setSavingRows((prev) => ({ ...prev, [studentId]: false }));
      }
    },
    []
  );

  const filteredStudents = students.filter((student) => {
    const effectiveCoachId = getEffectiveCoachId(student);

    if (activeFilter === "assigned" && !effectiveCoachId) return false;
    if (activeFilter === "unassigned" && effectiveCoachId) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const nameMatch = student.name.toLowerCase().includes(q);
      const emailMatch = student.email.toLowerCase().includes(q);
      if (!nameMatch && !emailMatch) return false;
    }

    return true;
  });

  const allCount = students.length;
  const assignedCount = students.filter((s) => getEffectiveCoachId(s) !== null).length;
  const unassignedCount = students.filter((s) => getEffectiveCoachId(s) === null).length;

  return (
    <div
      className="space-y-6 motion-safe:animate-fadeIn"
      style={{ animationDelay: "50ms" }}
    >
      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-[6px]">
        {(
          [
            { key: "all", label: "All", count: allCount },
            { key: "assigned", label: "Assigned", count: assignedCount },
            { key: "unassigned", label: "Unassigned", count: unassignedCount },
          ] as { key: FilterTab; label: string; count: number }[]
        ).map(({ key, label, count }) => {
          const active = activeFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveFilter(key)}
              aria-pressed={active}
              className={[
                "min-h-[44px] px-4 rounded-[10px] text-sm font-semibold motion-safe:transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2",
                active
                  ? "bg-ima-primary text-white"
                  : "bg-white border border-ima-border text-ima-text hover:border-ima-border",
              ].join(" ")}
            >
              {label}
              <span
                className={[
                  "text-xs tabular-nums rounded-full px-[7px] py-[1px] font-semibold",
                  active ? "bg-white/20 text-white" : "bg-ima-surface-light text-ima-text-secondary",
                ].join(" ")}
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
            variant="compact"
            icon={<Users className="h-5 w-5" aria-hidden="true" />}
            title="No students found"
            description={
              activeFilter === "unassigned"
                ? "All students have been assigned a coach."
                : activeFilter === "assigned"
                  ? "No students have been assigned to this coach yet."
                  : "No students are available for assignment."
            }
          />
        </div>
      ) : (
        <div className="space-y-[10px]">
          {filteredStudents.map((student) => {
            const effectiveCoachId = getEffectiveCoachId(student);
            const isSaving = !!savingRows[student.id];
            const hasLocalChange = Object.prototype.hasOwnProperty.call(localAssignments, student.id);

            return (
              <div
                key={student.id}
                className={[
                  "border border-ima-border rounded-[14px] p-5 flex flex-col sm:flex-row sm:items-center gap-3 motion-safe:transition-colors",
                  hasLocalChange ? "bg-ima-surface" : "bg-white",
                ].join(" ")}
              >
                {/* Identity */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-ima-surface-light border border-ima-border flex items-center justify-center text-sm font-semibold text-ima-text-secondary shrink-0">
                    {initials(student.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ima-text truncate leading-tight">
                      {student.name}
                    </p>
                    <p className="mt-[3px] text-xs text-ima-text-secondary truncate">
                      {student.email}
                    </p>
                  </div>
                </div>

                {/* Coach dropdown */}
                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  <select
                    value={effectiveCoachId ?? ""}
                    onChange={(e) => {
                      const val = e.target.value === "" ? null : e.target.value;
                      handleAssign(student.id, val, effectiveCoachId);
                    }}
                    disabled={isSaving}
                    aria-label={`Assign ${student.name} to coach`}
                    className={[
                      "rounded-[10px] border bg-white px-3 text-sm text-ima-text min-h-[44px] min-w-0 w-full sm:min-w-[200px] sm:w-auto focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 disabled:opacity-50 motion-safe:transition-colors",
                      hasLocalChange
                        ? "border-ima-primary ring-1 ring-ima-primary/30"
                        : "border-ima-border hover:border-ima-border",
                    ].join(" ")}
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
                      className="text-[10px] font-semibold tracking-widest text-ima-text-secondary uppercase"
                    >
                      Saving…
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
