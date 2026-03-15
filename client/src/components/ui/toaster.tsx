"use client";

import { useToast, ToastVariant } from "@/hooks/use-toast";
import { X, AlertCircle, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

const variantStyles: Record<ToastVariant, string> = {
  default: "bg-card border-border text-foreground",
  error:   "bg-card border-destructive/30   text-foreground shadow-[0_0_20px_rgba(239,68,68,0.1)]",
  success: "bg-card border-emerald-500/30 text-foreground shadow-[0_0_20px_rgba(16,185,129,0.1)]",
  warning: "bg-card border-amber-500/30  text-foreground shadow-[0_0_20px_rgba(245,158,11,0.1)]",
};

const iconStyles: Record<ToastVariant, string> = {
  default: "text-muted-foreground",
  error:   "text-destructive",
  success: "text-emerald-400",
  warning: "text-amber-400",
};

const variantIcons: Record<ToastVariant, typeof Info> = {
  default: Info,
  error:   AlertCircle,
  success: CheckCircle2,
  warning: AlertTriangle,
};

const variantLabel: Record<ToastVariant, string> = {
  default: "Повідомлення",
  error:   "Помилка",
  success: "Виконано",
  warning: "Увага",
};

const progressColor: Record<ToastVariant, string> = {
  default: "#a1a1aa",
  error:   "#f87171",
  success: "#34d399",
  warning: "#fbbf24",
};

function ToastItem({ toast: t, onDismiss }: { toast: ReturnType<typeof useToast>["toasts"][0]; onDismiss: () => void }) {
  const variant = t.variant || "default";
  const Icon = variantIcons[variant];
  const duration = t.duration || 8000;
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;
    // animate width from 100% to 0% over duration
    el.style.transition = "none";
    el.style.width = "100%";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `width ${duration}ms linear`;
        el.style.width = "0%";
      });
    });
  }, [duration]);

  return (
    <div
      className={cn(
        "pointer-events-auto group relative flex items-start gap-4 px-5 pt-5 pb-6 rounded-2xl border",
        "backdrop-blur-2xl shadow-[0_24px_48px_rgba(0,0,0,0.35)]",
        "animate-in fade-in slide-in-from-right-32 zoom-in-95 duration-300",
        variantStyles[variant]
      )}
    >
      {/* Icon */}
      <div className={cn(
        "shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-white/5 border border-white/8 mt-0.5",
        iconStyles[variant]
      )}>
        <Icon className="w-5 h-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pr-7">
        <div className="text-[10px] font-bold tracking-[0.12em] uppercase opacity-35 mb-1 select-none">
          {variantLabel[variant]}
        </div>
        <div className="text-[15px] font-semibold leading-snug tracking-tight break-words">
          {t.message}
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={onDismiss}
        className="absolute top-3.5 right-3.5 rounded-full p-1.5 opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all duration-200 focus:opacity-100 focus:outline-none"
        aria-label="Закрити"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Progress bar */}
      <div
        className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full overflow-hidden"
        style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
      >
        <div
          ref={progressRef}
          className="h-full rounded-full"
          style={{ backgroundColor: progressColor[variant], width: "100%" }}
        />
      </div>
    </div>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  return (
    <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-3 w-full max-w-[400px] pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
