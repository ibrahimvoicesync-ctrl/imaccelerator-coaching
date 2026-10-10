import { z } from "zod";
import { WORK_TRACKER } from "@/lib/config";

/**
 * Day-planner blocks (migration 00051). A block lives on a local calendar date
 * at `start_minute` minutes after local midnight. Duration shares the work
 * timer's bounds so every block can be started as a session as-is.
 */
export const MINUTES_PER_DAY = 1440;
export const BLOCK_TITLE_MAX = 80;
/** Widest range one GET may ask for — a 6-week month grid. */
export const MAX_RANGE_DAYS = 42;
/** Most blocks one bulk POST may create — a copied week of busy days. */
export const MAX_BULK_BLOCKS = 100;

export const blockDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const titleSchema = z.string().trim().min(1, "Give the block a name").max(BLOCK_TITLE_MAX);
const startMinuteSchema = z.number().int().min(0).max(MINUTES_PER_DAY - 1);
const durationSchema = z
  .number()
  .int()
  .min(WORK_TRACKER.minSessionMinutes)
  .max(WORK_TRACKER.maxSessionMinutes);

const endsBeforeMidnight = (d: { start_minute: number; duration_minutes: number }) =>
  d.start_minute + d.duration_minutes <= MINUTES_PER_DAY;

export const createBlockSchema = z
  .object({
    date: blockDateSchema,
    title: titleSchema,
    start_minute: startMinuteSchema,
    duration_minutes: durationSchema,
  })
  .refine(endsBeforeMidnight, { message: "Block must end by midnight" });

/** POST body: one block, or `{ blocks: [...] }` to create several at once. */
export const createBlocksBodySchema = z.union([
  createBlockSchema,
  z.object({ blocks: z.array(createBlockSchema).min(1).max(MAX_BULK_BLOCKS) }),
]);

export const updateBlockSchema = z
  .object({
    date: blockDateSchema.optional(),
    title: titleSchema.optional(),
    start_minute: startMinuteSchema.optional(),
    duration_minutes: durationSchema.optional(),
    session_id: z.string().uuid().nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "Nothing to update",
  });
