"use client";

import { useEffect, useRef, useCallback, useId, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
} as const;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: keyof typeof sizeMap;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const elements = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(elements);
}

export function Modal({ open, onClose, title, description, children, size = "md" }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const autoId = useId();
  const titleId = title ? `modal-title-${autoId}` : undefined;

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const handleEscape = useCallback(
    (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    },
    []
  );

  const handleFocusTrap = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !dialogRef.current) return;

    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    previousActiveElement.current = document.activeElement;

    // Scrollbar gutter is reserved globally via `scrollbar-gutter: stable` +
    // `overflow-y: scroll` on html/body (see globals.css), so locking body
    // overflow does NOT remove scrollbar space. Adding padding-right here
    // would double-compensate and shift centered content left.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    document.addEventListener("keydown", handleEscape);
    setTimeout(() => closeButtonRef.current?.focus(), 0);

    // Mark the rest of the page as inert for screen readers. The modal is
    // portaled to document.body, so #main-content is a sibling — making it
    // inert removes the page from the a11y tree without touching the modal.
    const mainContent = document.getElementById("main-content");
    if (mainContent) mainContent.setAttribute("inert", "");

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleEscape);
      if (mainContent) mainContent.removeAttribute("inert");
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [open]); // handleEscape is stable (uses ref) — no dep needed

  if (!open) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-ima-overlay z-50"
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onKeyDown={handleFocusTrap}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "bg-ima-surface border border-ima-border rounded-xl p-6 w-full shadow-xl",
            sizeMap[size]
          )}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              {title && (
                <h2 id={titleId} className="text-lg font-semibold text-ima-text">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-sm text-ima-text-secondary mt-1">{description}</p>
              )}
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="text-ima-text-secondary hover:text-ima-text motion-safe:transition-colors -mt-1 -mr-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="overflow-y-auto max-h-[85vh]">{children}</div>
        </div>
      </div>
    </>,
    document.body
  );
}
