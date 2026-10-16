"use client";

import { useEffect, useRef, useState } from "react";

type Props = { name: string; accept?: string; required?: boolean };

/**
 * Selector de archivo con los textos en español («Elegir archivo», «Ningún archivo elegido»):
 * el del navegador sale en su idioma. Va dentro de un <label class="field">, que abre el selector.
 */
export function FileInput({ name, accept, required }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(null);

  // Tras enviar, React vacía el formulario: el nombre mostrado también.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onReset = () => setFilename(null);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  return (
    <span className="input file-picker">
      <input
        ref={ref}
        type="file"
        name={name}
        accept={accept}
        required={required}
        className="sr-only"
        onChange={(e) => setFilename(e.currentTarget.files?.[0]?.name ?? null)}
      />
      <span aria-hidden className="file-picker-button">
        Elegir archivo
      </span>
      <span aria-hidden className={`truncate ${filename ? "text-foreground" : ""}`}>
        {filename ?? "Ningún archivo elegido"}
      </span>
    </span>
  );
}
