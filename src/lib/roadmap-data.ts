import { createAdminClient } from "@/lib/supabase/admin";
import { ROADMAP_STEPS } from "@/lib/config";
import type { Database } from "@/lib/types";

type RoadmapProgress = Database["public"]["Tables"]["roadmap_progress"]["Row"];

/**
 * Loads a student's roadmap progress, backfilling any missing step rows and
 * applying `autoComplete` steps (plus unlocking the step that follows them).
 *
 * Server-only — uses the admin client.
 *
 * `student/roadmap` and `student_diy/roadmap` ran byte-identical copies of this
 * logic until 2026-07-21; the log prefix was the only difference between them.
 * Same duplication-then-drift pattern as the next-action CTA (Phase 0) and the
 * DIY hero metric (Phase 2), so it lives in one place now.
 */
export async function loadRoadmapProgress(
  userId: string,
  logPrefix: string,
): Promise<{ progress: RoadmapProgress[]; joinedAt: string }> {
  const admin = createAdminClient();

  const [progressResult, userResult] = await Promise.all([
    admin
      .from("roadmap_progress")
      .select("*")
      .eq("student_id", userId)
      .order("step_number", { ascending: true }),
    admin
      .from("users")
      .select("joined_at")
      .eq("id", userId)
      .single(),
  ]);

  const { data: progressData, error } = progressResult;
  const joinedAt = userResult.data?.joined_at ?? new Date().toISOString();

  if (error) {
    console.error(`${logPrefix} Failed to fetch progress:`, error);
  }

  let progress: RoadmapProgress[] = progressData ?? [];

  const reloadProgress = async () => {
    const { data } = await admin
      .from("roadmap_progress")
      .select("*")
      .eq("student_id", userId)
      .order("step_number", { ascending: true });
    progress = data ?? [];
  };

  if (!error && progress.length < ROADMAP_STEPS.length) {
    const existingSteps = new Set(progress.map((p) => p.step_number));
    const missingSteps = ROADMAP_STEPS.filter((s) => !existingSteps.has(s.step));

    if (missingSteps.length > 0) {
      const rows = missingSteps.map((step) => ({
        student_id: userId,
        step_number: step.step,
        step_name: step.title,
        status: "locked" as const,
        completed_at: null,
      }));

      const { error: upsertError } = await admin
        .from("roadmap_progress")
        .upsert(rows, { onConflict: "student_id,step_number", ignoreDuplicates: true });

      if (upsertError) {
        console.error(`${logPrefix} Failed to add missing roadmap steps:`, upsertError);
      }

      await reloadProgress();
    }
  }

  const autoSteps = ROADMAP_STEPS.filter(
    (s): s is (typeof ROADMAP_STEPS)[number] & { autoComplete: true } =>
      "autoComplete" in s && s.autoComplete === true
  );

  for (const autoStep of autoSteps) {
    const row = progress.find((p) => p.step_number === autoStep.step);
    if (row && (row.status === "locked" || row.status === "active")) {
      const { error: completeErr } = await admin
        .from("roadmap_progress")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("student_id", userId)
        .eq("step_number", autoStep.step);

      if (completeErr) {
        console.error(`${logPrefix} Failed to auto-complete step ${autoStep.step}:`, completeErr);
      }

      const nextRow = progress.find((p) => p.step_number === autoStep.step + 1);
      if (nextRow && nextRow.status === "locked") {
        const { error: unlockErr } = await admin
          .from("roadmap_progress")
          .update({ status: "active" })
          .eq("student_id", userId)
          .eq("step_number", autoStep.step + 1);

        if (unlockErr) {
          console.error(`${logPrefix} Failed to unlock step ${autoStep.step + 1}:`, unlockErr);
        }
      }

      await reloadProgress();
    }
  }

  return { progress, joinedAt };
}
