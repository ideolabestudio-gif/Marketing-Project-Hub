import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetList } from "@/components/asset-list";
import { orNotFound, projectContextForPage } from "@/lib/project-page";
import { formatInZone } from "@/lib/time";
import { compareVersions, getItemDetail } from "@/modules/content/service";
import { getProject } from "@/modules/projects/service";

function toInt(value: string | string[] | undefined): number | undefined {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export default async function VersionsPage({
  params,
  searchParams,
}: PageProps<"/p/[projectId]/ciclos/[period]/piezas/[itemId]/versiones">) {
  const { projectId, period, itemId } = await params;
  const query = await searchParams;
  const ctx = await projectContextForPage(projectId);
  const { item, versions } = await orNotFound(getItemDetail(ctx, itemId));
  if (item.cyclePeriod !== period) notFound();
  const project = await getProject(ctx);
  const itemUrl = `/p/${projectId}/ciclos/${period}/piezas/${item.id}`;

  const latest = versions[0]?.versionNo;
  const toNo = toInt(query.a) ?? latest;
  const fromNo = toInt(query.de) ?? (toNo && toNo > 1 ? toNo - 1 : undefined);
  const comparison =
    fromNo && toNo && fromNo !== toNo
      ? await orNotFound(compareVersions(ctx, { itemId: item.id, fromNo, toNo }))
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={itemUrl} className="link text-sm">
          ← {item.title}
        </Link>
        <h1 className="h1 mt-1">Historial de versiones</h1>
      </div>

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Versión</th>
              <th>Fecha</th>
              <th>Autor</th>
              <th>Nota</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td>v{v.versionNo}</td>
                <td className="whitespace-nowrap">{formatInZone(v.createdAt, project.timezone)}</td>
                <td>{v.authorName ?? v.authorEmail}</td>
                <td>{v.note ?? "—"}</td>
                <td className="whitespace-nowrap">
                  {v.versionNo > 1 && (
                    <Link href={`?de=${v.versionNo - 1}&a=${v.versionNo}`} className="link">
                      Ver cambios
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {comparison && (
        <section className="card flex flex-col gap-4">
          <h2 className="h2">
            Cambios de v{comparison.from.versionNo} a v{comparison.to.versionNo}
          </h2>
          {comparison.fields
            .filter((f) => f.changed || f.key === "body")
            .map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">
                  {f.label} {!f.changed && <span className="text-muted">(sin cambios)</span>}
                </h3>
                <pre className="whitespace-pre-wrap rounded-md bg-background p-3 font-sans text-sm">
                  {f.parts.map((p, i) =>
                    p.added ? (
                      <ins key={i} className="bg-green-200 text-green-950 no-underline">
                        {p.value}
                      </ins>
                    ) : p.removed ? (
                      <del key={i} className="bg-red-200 text-red-950">
                        {p.value}
                      </del>
                    ) : (
                      <span key={i}>{p.value}</span>
                    ),
                  )}
                </pre>
              </div>
            ))}
          {comparison.assetsAdded.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium">Archivos añadidos</h3>
              <AssetList projectId={projectId} assets={comparison.assetsAdded} />
            </div>
          )}
          {comparison.assetsRemoved.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium">Archivos quitados</h3>
              <AssetList projectId={projectId} assets={comparison.assetsRemoved} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
