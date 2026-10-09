import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { AssetList } from "@/components/asset-list";
import { projectContextForPage } from "@/lib/project-page";
import { formatInZone } from "@/lib/time";
import { hasPermission } from "@/modules/access/context";
import { BRAND_FIELDS, getBrandProfile } from "@/modules/brand/service";
import { ALLOWED_DESCRIPTION } from "@/modules/content/files";
import { LIBRARY_CATEGORIES, listLibrary } from "@/modules/content/service";
import { getProject } from "@/modules/projects/service";
import {
  addLibraryFileAction,
  addLibraryLinkAction,
  removeLibraryItemAction,
  saveBrandProfileAction,
} from "./actions";

const CATEGORY_KEYS = Object.keys(LIBRARY_CATEGORIES) as (keyof typeof LIBRARY_CATEGORIES)[];

function CategoryFields() {
  return (
    <>
      <label className="field">
        Categoría
        <select name="category" className="input" required>
          {CATEGORY_KEYS.map((k) => (
            <option key={k} value={k}>
              {LIBRARY_CATEGORIES[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Título
        <input name="title" className="input" placeholder="Logo en blanco" />
      </label>
      <label className="field">
        Descripción (opcional)
        <input name="description" className="input" placeholder="Para fondos oscuros" />
      </label>
    </>
  );
}

export default async function BrandPage({ params }: PageProps<"/p/[projectId]/ficha">) {
  const { projectId } = await params;
  const ctx = await projectContextForPage(projectId);
  const [project, brand, library] = await Promise.all([getProject(ctx), getBrandProfile(ctx), listLibrary(ctx)]);
  const profile = brand.current;
  const latest = brand.versions[0];
  const canEditProfile = hasPermission(ctx, "project.settings");
  const canEditLibrary = hasPermission(ctx, "content.write");
  const libraryByCategory = CATEGORY_KEYS.map((k) => ({ key: k, entries: library.filter((m) => m.category === k) })).filter(
    (g) => g.entries.length > 0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/p/${projectId}`} className="link text-sm">
          ← {project.name}
        </Link>
        <h1 className="h1 mt-1">Ficha del cliente</h1>
        <p className="mt-1 text-sm text-muted">
          Lo que no cambia cada mes. La IA lo recibe siempre junto al brief del mes, y también Claude cuando lo
          consultas desde el conector.
        </p>
      </div>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Contexto de marca</h2>
        <p className="text-sm text-muted">
          {latest
            ? `Versión ${latest.versionNo}, guardada por ${latest.authorName ?? latest.authorEmail} el ${formatInZone(latest.createdAt, project.timezone, project.locale)}.`
            : "Todavía no se ha rellenado."}{" "}
          Cada vez que guardas se crea una versión nueva; las anteriores se conservan.
        </p>
        {canEditProfile ? (
          <ActionForm action={saveBrandProfileAction.bind(null, projectId)} submitLabel="Guardar ficha" className="grid gap-3">
            {BRAND_FIELDS.map((f) => (
              <label key={f.key} className="field">
                {f.label}
                <span className="text-xs text-muted">{f.hint}</span>
                <textarea name={f.key} className="input min-h-20" defaultValue={profile?.[f.key] ?? ""} />
              </label>
            ))}
          </ActionForm>
        ) : (
          <dl className="grid gap-2 text-sm">
            {BRAND_FIELDS.map((f) => (
              <div key={f.key}>
                <dt className="font-medium">{f.label}</dt>
                <dd className="whitespace-pre-wrap">{profile?.[f.key] || "—"}</dd>
              </div>
            ))}
          </dl>
        )}
        {brand.versions.length > 1 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Historial ({brand.versions.length} versiones)</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {brand.versions.map((v) => (
                <li key={v.id}>
                  v{v.versionNo} · {v.authorName ?? v.authorEmail} · {formatInZone(v.createdAt, project.timezone, project.locale)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">Biblioteca de materiales</h2>
        <p className="text-sm text-muted">
          Logos, manual de marca, fotos y plantillas del cliente. Desde cada pieza puedes añadirlos sin volver a subirlos.
        </p>
        {libraryByCategory.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay materiales.</p>
        ) : (
          libraryByCategory.map((g) => (
            <div key={g.key} className="flex flex-col gap-2">
              <h3 className="font-medium">{LIBRARY_CATEGORIES[g.key]}</h3>
              <AssetList
                projectId={projectId}
                assets={g.entries.map((m) => ({ ...m.asset, filename: m.title }))}
                action={(a) => {
                  const entry = g.entries.find((m) => m.asset.id === a.id)!;
                  return (
                    <>
                      {entry.description && <span className="text-sm">{entry.description}</span>}
                      {canEditLibrary && (
                        <ActionForm
                          action={removeLibraryItemAction.bind(null, projectId, entry.id)}
                          submitLabel="Quitar"
                          variant="danger"
                        >
                          {null}
                        </ActionForm>
                      )}
                    </>
                  );
                }}
              />
            </div>
          ))
        )}
        {canEditLibrary && (
          <div className="grid gap-4 md:grid-cols-2">
            <ActionForm action={addLibraryFileAction.bind(null, projectId)} submitLabel="Subir" className="grid gap-3">
              <h3 className="font-medium">Subir archivo</h3>
              <label className="field">
                Archivo ({ALLOWED_DESCRIPTION})
                <input
                  type="file"
                  name="file"
                  className="input"
                  accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,video/mp4,video/quicktime"
                  required
                />
              </label>
              <CategoryFields />
            </ActionForm>
            <ActionForm action={addLibraryLinkAction.bind(null, projectId)} submitLabel="Añadir enlace" className="grid gap-3">
              <h3 className="font-medium">Añadir enlace (Drive, Canva…)</h3>
              <label className="field">
                Enlace
                <input type="url" name="url" className="input" required />
              </label>
              <CategoryFields />
            </ActionForm>
          </div>
        )}
        <p className="text-xs text-muted">
          Quitar un material de la biblioteca no lo borra de las piezas que ya lo usan.
        </p>
      </section>
    </div>
  );
}
