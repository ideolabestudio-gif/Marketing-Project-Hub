import Link from "next/link";
import { ClaudeHandoff } from "@/components/claude-handoff";
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
    <ClaudeHandoff
      id="metricool"
      title="Programar el mes en Metricool"
      intro={`${posts.length === 1 ? "Hay 1 pieza de redes aprobada" : `Hay ${posts.length} piezas de redes aprobadas`} sin programar. Claude las deja todas en Metricool como pendientes de revisión; nunca las publica.`}
      connector="Metricool"
      after="Revísalas en Metricool, añade las imágenes o vídeos, prográmalas allí y registra aquí la programación de cada pieza."
      text={text}
      copyLabel={posts.length === 1 ? "Copiar para Metricool" : `Copiar las ${posts.length} para Metricool`}
    >
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
    </ClaudeHandoff>
  );
}
