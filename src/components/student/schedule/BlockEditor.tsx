"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Play, Timer } from "lucide-react";
import { Button, Input, Modal, useToast } from "@/components/ui";
import { WORK_TRACKER } from "@/lib/config";
import { formatHoursMinutes } from "@/lib/utils";
import { BLOCK_TITLE_MAX } from "@/lib/schemas/schedule-block";
import {
  MINUTES_PER_DAY,
  fromTimeInput,
  readError,
  toTimeInput,
  type ScheduleBlock,
} from "@/lib/schedule";

const QUICK_DURATIONS = [30, 60, 90, 120] as const;
const DEFAULT_BLOCK_MINUTES = 60;

/** What the editor opens with: an existing block, or a new one at a date/time. */
export type EditorTarget =
  | { kind: "edit"; block: ScheduleBlock }
  | { kind: "create"; date: string; startMinute: number; durationMinutes?: number };

interface BlockEditorProps {
  target: EditorTarget | null;
  onClose: () => void;
  onSaved: (block: ScheduleBlock) => void;
  onDeleted: (id: string) => void;
  /**
   * Offer "Start" for this block (Work Tracker only). Resolves true once the
   * timer is running. Omit to hide the action.
   */
  onStart?: (block: ScheduleBlock) => Promise<boolean>;
  /** Where to send the student to start the timer when onStart isn't available. */
  timerHref?: string;
  /** Whether the block being edited can be started right now. */
  canStart?: boolean;
}

export function BlockEditor(props: BlockEditorProps) {
  const { target, onClose } = props;
  const [busy, setBusy] = useState(false);
  const key =
    target === null
      ? "closed"
      : target.kind === "edit"
        ? `edit:${target.block.id}`
        : `create:${target.date}:${target.startMinute}:${target.durationMinutes ?? ""}`;

  return (
    <Modal
      open={target !== null}
      onClose={() => !busy && onClose()}
      title={target?.kind === "edit" ? "Edit block" : "New block"}
      size="sm"
    >
      {target && <EditorForm key={key} {...props} target={target} busy={busy} setBusy={setBusy} />}
    </Modal>
  );
}

function EditorForm({
  target,
  onClose,
  onSaved,
  onDeleted,
  onStart,
  timerHref,
  canStart = false,
  busy,
  setBusy,
}: BlockEditorProps & {
  target: EditorTarget;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const toastRef = useRef(useToast());
  const existing = target.kind === "edit" ? target.block : null;

  const initialStart = existing ? existing.start_minute : target.kind === "create" ? target.startMinute : 0;
  const initialEnd = existing
    ? existing.start_minute + existing.duration_minutes
    : Math.min(
        initialStart +
          (target.kind === "create" ? (target.durationMinutes ?? DEFAULT_BLOCK_MINUTES) : DEFAULT_BLOCK_MINUTES),
        MINUTES_PER_DAY,
      );

  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(existing?.date ?? (target.kind === "create" ? target.date : ""));
  const [start, setStart] = useState(toTimeInput(initialStart));
  const [end, setEnd] = useState(toTimeInput(initialEnd));

  const startMin = fromTimeInput(start);
  const rawEnd = fromTimeInput(end);
  const endMin = rawEnd === 0 ? MINUTES_PER_DAY : rawEnd; // "00:00" end = midnight
  const duration = startMin !== null && endMin !== null ? endMin - startMin : null;
  const error =
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
      ? "Pick a day"
      : startMin === null || endMin === null
        ? "Pick a start and end time"
        : duration! <= 0
          ? "End time must be after the start"
          : duration! < WORK_TRACKER.minSessionMinutes
            ? `Blocks are at least ${WORK_TRACKER.minSessionMinutes} minutes`
            : duration! > WORK_TRACKER.maxSessionMinutes
              ? `Blocks are at most ${WORK_TRACKER.maxSessionMinutes / 60} hours — split it into two`
              : null;

  const status = existing?.session?.status;
  const alreadyStarted = status === "completed" || status === "in_progress" || status === "paused";

  const save = async () => {
    if (error || startMin === null || duration === null) return;
    const trimmed = title.trim();
    if (!trimmed) {
      toastRef.current.toast({ type: "error", title: "Give the block a name" });
      return;
    }
    setBusy(true);
    try {
      const payload = { date, title: trimmed, start_minute: startMin, duration_minutes: duration };
      const response = existing
        ? await fetch(`/api/schedule-blocks/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/schedule-blocks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!response.ok) {
        const message = await readError(response, "Couldn't save that block");
        console.error("[BlockEditor] Failed to save block:", message);
        toastRef.current.toast({ type: "error", title: message });
        return;
      }
      const { data } = (await response.json()) as { data: ScheduleBlock };
      onSaved(data);
      onClose();
    } catch (err) {
      console.error("[BlockEditor] save error:", err);
      toastRef.current.toast({ type: "error", title: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/schedule-blocks/${existing.id}`, { method: "DELETE" });
      if (!response.ok) {
        const message = await readError(response, "Couldn't delete that block");
        console.error("[BlockEditor] Failed to delete block:", message);
        toastRef.current.toast({ type: "error", title: message });
        return;
      }
      onDeleted(existing.id);
      onClose();
    } catch (err) {
      console.error("[BlockEditor] remove error:", err);
      toastRef.current.toast({ type: "error", title: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const start_ = async () => {
    if (!existing || !onStart) return;
    setBusy(true);
    try {
      if (await onStart(existing)) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-[14px]"
    >
      <Input
        label="What are you working on?"
        placeholder="e.g. Outreach — 50 DMs"
        value={title}
        maxLength={BLOCK_TITLE_MAX}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
      />
      <Input label="Day" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <div className="grid grid-cols-2 gap-[10px]">
        <Input
          label="Start"
          type="time"
          step={300}
          value={start}
          onChange={(e) => {
            // Moving the start keeps the block's length, like a calendar.
            const next = fromTimeInput(e.target.value);
            if (next !== null && duration !== null && duration > 0) {
              setEnd(toTimeInput(next + duration));
            }
            setStart(e.target.value);
          }}
        />
        <Input label="End" type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-[6px]" role="group" aria-label="Quick length">
        {QUICK_DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={duration === d}
            disabled={startMin === null || startMin + d > MINUTES_PER_DAY}
            onClick={() => startMin !== null && setEnd(toTimeInput(startMin + d))}
            className={`min-h-[44px] px-3 rounded-[10px] border text-[13px] font-semibold tabular-nums motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 disabled:opacity-40 ${
              duration === d
                ? "bg-ima-primary border-ima-primary text-white"
                : "border-ima-border text-ima-text-secondary hover:text-ima-text"
            }`}
          >
            {formatHoursMinutes(d)}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-ima-error">
          {error}
        </p>
      )}
      {existing && !alreadyStarted && (
        <p className="text-[12px] text-ima-text-secondary leading-snug">
          Planned blocks don&apos;t count toward your hours — only a timer you start does.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-[10px] pt-[6px]">
        <Button type="submit" loading={busy} disabled={Boolean(error) || !title.trim()}>
          {existing ? "Save" : "Add block"}
        </Button>
        {existing && canStart && !alreadyStarted && onStart && (
          <Button type="button" variant="outline" disabled={busy} onClick={start_}>
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            {`Start ${formatHoursMinutes(existing.duration_minutes)}`}
          </Button>
        )}
        {existing && canStart && !alreadyStarted && !onStart && timerHref && (
          <Link
            href={timerHref}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-lg text-sm font-medium border border-ima-primary text-ima-primary hover:bg-ima-primary/10 motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
          >
            <Timer className="h-4 w-4" aria-hidden="true" />
            Open timer
          </Link>
        )}
        {existing && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={remove}
            className="ml-auto text-ima-error hover:text-ima-error"
          >
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
