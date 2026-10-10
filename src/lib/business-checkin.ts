import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUSINESS_CHECKIN } from "@/lib/config";
import type { Database } from "@/lib/types";

export type BusinessCheckin = Database["public"]["Tables"]["business_checkins"]["Row"];

export type CheckinStatus = {
  latest: BusinessCheckin | null;
  /** True while the latest check-in is younger than refreshDays. */
  unlocked: boolean;
  /** Whole days until it lapses (0 or less once lapsed / never done). */
  daysLeft: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Latest business check-in and whether it still unlocks the AI. Server-only. */
export async function getCheckinStatus(studentId: string): Promise<CheckinStatus> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("business_checkins")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[business-checkin] failed to load latest check-in:", error);
  }
  if (!data) return { latest: null, unlocked: false, daysLeft: 0 };

  const expiresAt = new Date(data.created_at).getTime() + BUSINESS_CHECKIN.refreshDays * DAY_MS;
  const daysLeft = Math.ceil((expiresAt - Date.now()) / DAY_MS);
  return { latest: data, unlocked: daysLeft > 0, daysLeft };
}
