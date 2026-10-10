"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (options: { type: ToastType; title: string; description?: string }) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const iconMap = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const iconColorMap = {
  success: "text-ima-success",
  error: "text-ima-error",
  warning: "text-ima-warning",
  info: "text-ima-info",
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (options: { type: ToastType; title: string; description?: string }) => {
      const id = crypto.randomUUID();
      const newToast: Toast = { id, ...options };

      setToasts((prev) => {
        const next = [...prev, newToast];
        return next.length > 5 ? next.slice(-5) : next;
      });

      const timer = setTimeout(() => {
        dismiss(id);
      }, 5000);
      timersRef.current.set(id, timer);
    },
    [dismiss]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        role="log"
        aria-live="polite"
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] md:bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2"
      >
        {toasts.map((t) => {
          const Icon = iconMap[t.type];
          return (
            <div
              key={t.id}
              role={t.type === "error" ? "alert" : "status"}
              className="bg-ima-surface border border-ima-border rounded-lg p-4 shadow-lg sm:min-w-[300px] max-w-[400px] w-full sm:w-auto flex items-start gap-3"
            >
              <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", iconColorMap[t.type])} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ima-text">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-ima-text-secondary mt-0.5">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-ima-text-secondary hover:text-ima-text shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center -m-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
