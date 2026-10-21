"use client";

import { useState } from "react";

/** Copia un texto al portapapeles (p. ej. el texto para pegar en un chat de Claude). */
export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 self-start">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setResult("copied");
          } catch {
            // Sin permiso o sin HTTPS: el texto sigue visible para copiarlo a mano.
            setResult("failed");
          }
          setTimeout(() => setResult(null), 4000);
        }}
      >
        {result === "copied" ? "Copiado" : label}
      </button>
      <span role="status" className={result === "failed" ? "text-sm text-danger" : "sr-only"}>
        {result === "copied"
          ? "Copiado al portapapeles"
          : result === "failed"
            ? "El navegador no deja copiar: selecciona el texto y cópialo a mano."
            : ""}
      </span>
    </div>
  );
}
