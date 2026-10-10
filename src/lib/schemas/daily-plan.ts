import { z } from "zod";
import { WORK_TRACKER } from "@/lib/config";

/**
 * Zod schema for a single session entry within a daily plan.
 * session_minutes accepts any duration between the configured min and max,
 * so the preset buttons (30/45/60/90/120) and custom durations both validate.
 * break_type is "short", "long", or "none" (last session has no break).
 * break_minutes is validated against config presets per break_type.
 */
export const sessionEntrySchema = z.object({
  session_minutes: z
    .number()
    .int()
    .min(WORK_TRACKER.minSessionMinutes)
    .max(WORK_TRACKER.maxSessionMinutes),
  break_type: z.enum(["short", "long", "none"]),
  break_minutes: z.number().int().min(0),
});

/**
 * Zod schema for the full plan_json object stored in daily_plans.plan_json.
 * Per D-07: version: 1 is required for schema evolution safety.
 * total_work_minutes is the sum of all session_minutes, capped at the daily
 * cap (dailyCapHours = 8h). sessions array must have at least 1 entry, and is
 * capped at 50 to bound payload size — a realistic day can't have hundreds of
 * planned sessions.
 */
export const planJsonSchema = z.object({
  version: z.literal(1),
  total_work_minutes: z.number().int().min(1).max(WORK_TRACKER.dailyCapHours * 60),
  sessions: z.array(sessionEntrySchema).min(1).max(50),
});

/** TypeScript type inferred from planJsonSchema */
export type PlanJson = z.infer<typeof planJsonSchema>;
