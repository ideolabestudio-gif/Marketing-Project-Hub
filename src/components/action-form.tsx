"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  variant?: "primary" | "secondary" | "danger";
};

/** Formulario que llama a una acción de servidor y muestra el resultado. */
export function ActionForm({ action, children, submitLabel, className, variant = "primary" }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "flex flex-wrap items-end gap-3"}>
      {children}
      <button type="submit" disabled={pending} className={`btn btn-${variant}`}>
        {pending ? "…" : submitLabel}
      </button>
      {state?.message && (
        <p role="status" className={state.ok ? "text-sm text-green-700" : "text-sm text-red-700"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
