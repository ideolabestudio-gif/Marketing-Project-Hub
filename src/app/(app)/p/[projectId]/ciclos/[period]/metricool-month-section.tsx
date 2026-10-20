import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import type { ProjectContext } from "@/modules/access/context";
import { buildMetricoolBulkHandoff, type MetricoolBulkPost } from "@/modules/content/metricool-handoff";
import { getItemDetail } from "@/modules/content/service";

/**
 * Mensaje para llevar a Metricool, de una vez, todas las piezas aprobadas y aún sin programar
 * del mes. Igual que en cada pieza: el Hub no llama a Metricool, la persona pega el mensaje en
 * Claude y luego registra aquí la programación de cada pieza.
 */
export async function MetricoolMonthSection({
  ctx,
  base,
  brand,
  tz,
  itemIds,
}: {
  ctx: ProjectContext;
  base: string;
  brand: string;
  tz: string;
  /** Piezas de redes aprobadas (no programadas ni publicadas), en orden de fecha. */
  itemIds: string[];
}) {
  if (itemIds.length === 0) return null;
  const details = await Promise.all(itemIds.map((id) => getItemDetail(ctx, id)));
  const posts: (MetricoolBulkPost & { id: string })[] = details.flatMap(({ item, current, currentAssets }) =>
    current
      ? [
          {
            id: item.id,
            title: item.title,
            channelName: item.channelName,
            format: item.format,
            plannedAt: item.plannedAt,
            versionNo: current.versionNo,
            body: current.body,
            linkUrl: current.linkUrl,
            assets: currentAssets,
          },
        ]
      : [],
  );
  if (posts.length === 0) return null;
  const text = buildMetricoolBulkHandoff({ brand, timeZone: tz, posts });
  const undated = posts.filter((p) => !p.plannedAt).length;

  return (
    <section id="metricool" className="card flex scroll-mt-20 flex-col gap-3">
      <div>
        <h2 className="h2">Llevar el mes a Metricool con Claude</h2>
        <p className="mt-1 text-sm">
          {posts.length === 1 ? "Hay 1 pieza aprobada" : `Hay ${posts.length} piezas aprobadas`} sin programar. Copia
          el mensaje y pégalo en un chat de Claude con el conector de Metricool: las dejará todas en Metricool como
          pendientes de revisión. Revísalas allí, añade las imágenes o vídeos, prográmalas y registra aquí la
          programación de cada pieza.
        </p>
      </div>
      {undated > 0 && (
        <p className="notice">
          {undated === 1 ? "Una pieza no tiene fecha" : `${undated} piezas no tienen fecha`}: Claude te la preguntará
          antes de crearla.
        </p>
      )}
      <ul className="flex flex-col gap-1 text-sm">
        {posts.map((p) => (
          <li key={p.id} className="min-w-0 truncate">
            <Link href={`${base}/piezas/${p.id}`} className="link">
              {p.title}
            </Link>{" "}
            <span className="text-muted">· {p.channelName}</span>
          </li>
        ))}
      </ul>
      <details className="collapsible">
        <summary className="link cursor-pointer self-start text-sm">Ver el mensaje</summary>
        <pre className="tile mt-2 max-h-80 overflow-auto text-xs whitespace-pre-wrap">{text}</pre>
      </details>
      <CopyButton text={text} label={posts.length === 1 ? "Copiar para Metricool" : `Copiar las ${posts.length} para Metricool`} />
    </section>
  );
}
