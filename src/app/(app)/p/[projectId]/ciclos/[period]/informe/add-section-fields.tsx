"use client";

import { useState } from "react";

type Kind = "human_analysis" | "data" | "publications";

/** Campos de «Añadir sección»: solo los que usa el tipo elegido. */
export function AddSectionFields({
  kinds,
  channels,
}: {
  kinds: { value: Kind; label: string }[];
  channels: { id: string; displayName: string }[];
}) {
  const [kind, setKind] = useState<Kind>("human_analysis");
  return (
    <>
      <label className="field">
        Tipo
        <select name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Título
        <input
          name="title"
          className="input"
          required
          placeholder={kind === "publications" ? "Contenido publicado" : kind === "data" ? "Instagram" : "Resumen del mes"}
        />
      </label>
      {kind === "data" && (
        <>
          <label className="field">
            Canal
            <select name="channelId" className="input" defaultValue="">
              <option value="">Todos los canales</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="comparePrevious" defaultChecked />
            Comparar con el mes anterior
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="showEmptyMetrics" />
            Mostrar también las métricas sin dato
          </label>
        </>
      )}
      {kind === "human_analysis" && (
        <label className="field">
          Texto
          <textarea name="body" className="input min-h-32" />
        </label>
      )}
      {kind === "publications" && (
        <p className="text-sm text-muted">Lista lo publicado y programado del mes, con un resumen por formato.</p>
      )}
    </>
  );
}
