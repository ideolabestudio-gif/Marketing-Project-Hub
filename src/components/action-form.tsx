"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  variant?: "primary" | "secondary" | "danger";
  /**
   * Para acciones que no se pueden deshacer (eliminar, quitar, descartar): el primer clic
   * solo pide confirmación con este texto («¿Eliminar la sección?») y el segundo envía.
   */
  confirm?: string;
  /** Nombre del botón para lectores de pantalla cuando la etiqueta es un símbolo (↑, ↓). */
  submitAriaLabel?: string;
  buttonClassName?: string;
};

/** Formulario que llama a una acción de servidor y muestra el resultado. */
export function ActionForm({ action, children, submitLabel, className, variant = "primary", confirm, submitAriaLabel, buttonClassName }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [armed, setArmed] = useState(false);
  const message = useRef<HTMLParagraphElement>(null);

  // Si algo falla, el foco va al mensaje para que se lea (y se anuncie) en el acto.
  useEffect(() => {
    if (state?.message && !state.ok) message.current?.focus();
  }, [state]);

  return (
    <form
      action={formAction}
      aria-busy={pending || undefined}
      className={className ?? "flex flex-wrap items-end gap-3"}
      onSubmit={(e) => {
        if (confirm && !armed) {
          e.preventDefault();
          setArmed(true);
        } else {
          setArmed(false);
        }
      }}
    >
      {children}
      {armed && <span className="self-center text-sm font-medium text-danger">{confirm}</span>}
      <button
        type="submit"
        disabled={pending}
        aria-label={pending ? undefined : submitAriaLabel}
        title={submitAriaLabel}
        className={`btn btn-${variant} justify-self-start ${buttonClassName ?? ""}`}
      >
        {pending ? "Un momento…" : armed ? `Sí, ${submitLabel.toLocaleLowerCase("es-ES")}` : submitLabel}
      </button>
      {armed && (
        <button type="button" className="btn btn-secondary justify-self-start" onClick={() => setArmed(false)}>
          No
        </button>
      )}
      <p
        ref={message}
        role="status"
        tabIndex={-1}
        className={`outline-none ${state?.message ? (state.ok ? "text-sm text-success" : "text-sm text-danger") : "sr-only"}`}
      >
        {state?.message}
      </p>
    </form>
  );
}
