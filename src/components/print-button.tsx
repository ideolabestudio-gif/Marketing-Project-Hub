"use client";

/** Abre el diálogo de impresión del navegador (desde ahí se guarda como PDF). */
export function PrintButton() {
  return (
    <button type="button" className="btn btn-primary no-print" onClick={() => window.print()}>
      Descargar PDF / Imprimir
    </button>
  );
}
