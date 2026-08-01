"use client";

// Minimal toast system — no dependency. Provider holds a queue; useToast()
// returns push helpers. Toasts auto-dismiss and slide in from the corner.
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

type ToastCtx = {
  toast: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

const ICON: Record<ToastKind, string> = {
  success: "✅",
  error: "⚠️",
  info: "💬",
};

const ACCENT: Record<ToastKind, string> = {
  success: "border-green-500/40",
  error: "border-red-500/40",
  info: "border-accent/40",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => remove(id), 3200);
    },
    [remove]
  );

  const success = useCallback((m: string) => toast(m, "success"), [toast]);
  const error = useCallback((m: string) => toast(m, "error"), [toast]);

  return (
    <Ctx.Provider value={{ toast, success, error }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            className={`toast-in pointer-events-auto flex max-w-xs cursor-pointer items-center gap-2.5 rounded-xl border ${ACCENT[t.kind]} bg-surface/90 px-4 py-3 text-sm text-foreground shadow-2xl backdrop-blur-md`}
          >
            <span className="text-base">{ICON[t.kind]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
