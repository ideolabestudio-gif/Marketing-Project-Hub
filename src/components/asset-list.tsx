import type { ReactNode } from "react";

type Asset = {
  id: string;
  kind: "file" | "link";
  filename: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Lista de activos de una versión. Los archivos se sirven solo por la ruta autorizada. */
export function AssetList({
  projectId,
  assets,
  action,
}: {
  projectId: string;
  assets: Asset[];
  action?: (asset: Asset) => ReactNode;
}) {
  if (assets.length === 0) return <p className="text-sm text-muted">Sin archivos ni enlaces.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {assets.map((a) => (
        <li key={a.id} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
          {a.kind === "file" && a.mimeType?.startsWith("image/") && (
            // eslint-disable-next-line @next/next/no-img-element -- archivo privado servido tras autorizar
            <img
              src={`/p/${projectId}/archivos/${a.id}`}
              alt={a.filename}
              className="max-h-48 w-full rounded object-contain"
            />
          )}
          {a.kind === "file" ? (
            <a href={`/p/${projectId}/archivos/${a.id}`} className="link break-all">
              {a.filename}
            </a>
          ) : (
            <a href={a.url ?? "#"} className="link break-all" target="_blank" rel="noopener noreferrer">
              🔗 {a.filename}
            </a>
          )}
          <span className="text-xs text-muted">
            {a.kind === "file" ? `${a.mimeType} · ${formatSize(a.sizeBytes)}` : "Enlace externo: su contenido puede cambiar fuera del Hub"}
          </span>
          {action?.(a)}
        </li>
      ))}
    </ul>
  );
}
