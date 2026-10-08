"use client";

import { useState } from "react";

/** Copia un texto al portapapeles (p. ej. el texto para pegar en un chat de Claude). */
export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary self-start"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copiado" : label}
    </button>
  );
}
