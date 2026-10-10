"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

type CommentFormProps = {
  reportId: string;
  initialComment: string | null;
};

export function CommentForm({ reportId, initialComment }: CommentFormProps) {
  const [value, setValue] = useState(initialComment ?? "");
  const [isSaving, setIsSaving] = useState(false);

  // Resync the editable draft when the target report changes so a form reused
  // across reports (e.g. switching calendar days) never carries a stale draft
  // into the wrong report. Keyed on reportId only — resyncing on initialComment
  // would clobber an in-progress edit after a refresh of the same report.
  useEffect(() => {
    setValue(initialComment ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: value }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toastRef.current({ type: "error", title: (json as { error?: string }).error ?? "Failed to save comment" });
        return;
      }
      toastRef.current({ type: "success", title: "Comment saved" });
    } catch {
      toastRef.current({ type: "error", title: "Network error" });
    } finally {
      setIsSaving(false);
    }
  }, [reportId, value]);

  const isNew = !initialComment || initialComment.trim().length === 0;

  return (
    <div className="space-y-2 pt-3">
      <Textarea
        label="Coach Comment"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="Leave feedback for this student..."
      />
      <p className="text-xs text-ima-text-secondary text-right">{value.length}/1000</p>
      <Button
        variant="primary"
        size="sm"
        onClick={handleSave}
        loading={isSaving}
        disabled={isSaving || value.trim().length === 0}
        aria-label="Save comment"
      >
        {isNew ? "Save Comment" : "Update Comment"}
      </Button>
    </div>
  );
}
