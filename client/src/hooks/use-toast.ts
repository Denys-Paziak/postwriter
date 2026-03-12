"use client";

import { useEffect, useState } from "react";

export type ToastVariant = "default" | "error" | "success" | "warning";

export interface Toast {
  id: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

const TOAST_TIMEOUT = 8000;
let observers: ((toasts: Toast[]) => void)[] = [];
let toasts: Toast[] = [];

const notify = () => {
  observers.forEach((observer) => observer([...toasts]));
};

export const toast = {
  show: (message: string, variant: ToastVariant = "default", duration = TOAST_TIMEOUT) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { id, message, variant, duration };
    toasts = [newToast, ...toasts].slice(0, 5); // Keep last 5
    notify();

    setTimeout(() => {
      toast.dismiss(id);
    }, duration);
    
    return id;
  },
  error: (message: string) => toast.show(message, "error"),
  success: (message: string) => toast.show(message, "success"),
  warning: (message: string) => toast.show(message, "warning"),
  dismiss: (id: string) => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  },
};

export function useToast() {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>(toasts);

  useEffect(() => {
    const observer = (newToasts: Toast[]) => {
      setCurrentToasts(newToasts);
    };
    observers.push(observer);
    return () => {
      observers = observers.filter((o) => o !== observer);
    };
  }, []);

  return { toasts: currentToasts, dismiss: toast.dismiss };
}
