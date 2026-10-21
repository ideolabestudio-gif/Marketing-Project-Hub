import { formatPeriod, utcToWallTime } from "@/lib/time";
import { createZip, type ZipEntry } from "@/lib/zip";
import { authorize, type ProjectContext } from "@/modules/access/context";
import { recordAudit } from "@/modules/audit/service";
import { BRAND_FIELDS } from "@/modules/brand/service";
import { getAssetFile } from "@/modules/content/service";
import * as repo from "./repo";

// Copia de un proyecto para cuando se termina con un cliente (decisión D-09: archivar +
// exportar). Solo lee: no cambia nada del proyecto. Incluye los datos completos en JSON y,
// para leer sin herramientas, los textos de cada pieza, el brief, el informe y los archivos.

type Data = Awaited<ReturnType<typeof repo.loadProjectData>>;

/** Nombre de archivo o carpeta sin caracteres problemáticos en Windows, macOS o Linux. */
function safeName(text: string, max = 60): string {
  const clean = text
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .replace(/[. ]+$/, "");
  return clean || "sin-nombre";
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV con «;» (lo abre bien Excel en español) y BOM para que respete los acentos. */
function toCsv(header: string[], rows: unknown[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

function buildReadme(data: Data, generatedAt: string): string {
  return [
    `Copia del proyecto «${data.project.name}» (cliente: ${data.clientName})`,
    `Generada el ${generatedAt} desde el Marketing Project Hub de Ideolab.`,
    "",
    "Qué hay:",
    "- ficha-del-cliente.txt: la ficha vigente (contexto de marca).",
    "- biblioteca/: logos, guías y demás materiales subidos como archivo (los enlaces están en datos/library_items.json y datos/assets.json).",
    "- meses/AAAA-MM/brief.txt: objetivos, fechas clave, notas y aprendizajes del mes.",
    "- meses/AAAA-MM/piezas/: una carpeta por pieza con el texto de cada versión (v1.txt, v2.txt…), su historial de revisión y sus archivos.",
    "- meses/AAAA-MM/metricas.csv: todas las métricas registradas o importadas, con su fuente y las correcciones.",
    "- meses/AAAA-MM/importaciones/: los CSV originales tal como se subieron.",
    "- meses/AAAA-MM/informe.txt: el texto del informe (las tablas de datos salen de metricas.csv).",
    "- actividad.csv: el registro de auditoría (quién hizo qué y cuándo).",
    "- datos/: todas las tablas del proyecto en JSON, para volver a importarlas o consultarlas.",
    "",
    `Las horas están en la zona del proyecto (${data.project.timezone}); en datos/ van en UTC (ISO 8601).`,
    "",
  ].join("\n");
}

/**
 * Genera el ZIP de un proyecto. Solo la responsable, también con el proyecto archivado.
 * Queda en la auditoría (`project.exported`).
 */
export async function exportProject(ctx: ProjectContext, now = new Date()) {
  await authorize(ctx, "project.export");
  const data = await repo.loadProjectData(ctx);
  const tz = data.project.timezone;
  const locale = data.project.locale;
  // «2026-10-21 11:07», en la hora del proyecto: ordenable y sin ambigüedad.
  const when = (d: Date | null | undefined) => (d ? utcToWallTime(d, tz).replace("T", " ") : "");
  const person = new Map(data.people.map((p) => [p.id, p.name ?? p.email]));
  const who = (id: string | null | undefined) => (id ? (person.get(id) ?? id) : "");
  const channelName = new Map(data.channels.map((c) => [c.id, c.displayName]));
  const metricLabel = new Map(data.definitions.map((d) => [d.key, d.label]));
  const assetById = new Map(data.assets.map((a) => [a.id, a]));
  const entries: ZipEntry[] = [];
  const exported = new Set<string>();

  async function addFile(folder: string, assetId: string) {
    const asset = assetById.get(assetId);
    if (!asset || asset.kind !== "file" || exported.has(assetId)) return;
    exported.add(assetId);
    // Si un archivo antiguo ya no está en el disco, se avisa en lugar de fallar entero.
    const file = await getAssetFile(ctx, assetId).catch(() => null);
    const name = `${folder}/${assetId.slice(0, 8)}-${safeName(asset.filename, 100)}`;
    entries.push(
      file
        ? { name, data: file.bytes, date: asset.createdAt }
        : { name: `${name}.FALTA.txt`, data: "El contenido de este archivo no estaba disponible al exportar.\n" },
    );
  }

  const generatedAt = when(now);
  entries.push({ name: "LEEME.txt", data: buildReadme(data, generatedAt) });

  // Ficha del cliente (la versión vigente; las anteriores en datos/brand_profiles.json).
  const brand = [...data.brand_profiles].sort((a, b) => b.versionNo - a.versionNo)[0];
  if (brand) {
    entries.push({
      name: "ficha-del-cliente.txt",
      data: [
        `Ficha del cliente · versión ${brand.versionNo} · ${when(brand.createdAt)} · ${who(brand.createdBy)}`,
        "",
        ...BRAND_FIELDS.flatMap((f) => [`## ${f.label}`, brand[f.key] || "(vacío)", ""]),
      ].join("\n"),
    });
  }
  for (const li of data.library_items) await addFile("biblioteca", li.assetId);

  const versionsByItem = Map.groupBy(data.content_versions, (v) => v.contentItemId);
  const assetsByVersion = Map.groupBy(data.content_version_assets, (a) => a.contentVersionId);

  for (const cycle of [...data.cycles].sort((a, b) => a.period.localeCompare(b.period))) {
    const base = `meses/${cycle.period}`;
    entries.push({
      name: `${base}/brief.txt`,
      data: [
        `${formatPeriod(cycle.period, locale)} · fase: ${cycle.status}`,
        "",
        "## Objetivos",
        cycle.objectives || "(vacío)",
        "",
        "## Fechas clave",
        cycle.keyDates || "(vacío)",
        "",
        "## Notas",
        cycle.notes || "(vacío)",
        "",
        "## Aprendizajes",
        cycle.learnings || "(vacío)",
        "",
      ].join("\n"),
    });

    const items = data.content_items
      .filter((i) => i.cycleId === cycle.id)
      .sort((a, b) => (a.plannedAt?.getTime() ?? Infinity) - (b.plannedAt?.getTime() ?? Infinity));
    for (const item of items) {
      const day = item.plannedAt ? when(item.plannedAt).slice(0, 10) : "sin-fecha";
      const folder = `${base}/piezas/${day} ${safeName(item.title)} (${item.id.slice(0, 8)})`;
      const versions = [...(versionsByItem.get(item.id) ?? [])].sort((a, b) => a.versionNo - b.versionNo);
      for (const v of versions) {
        const files = (assetsByVersion.get(v.id) ?? [])
          .sort((a, b) => a.position - b.position)
          .map((a) => assetById.get(a.assetId))
          .filter((a) => a !== undefined);
        entries.push({
          name: `${folder}/v${v.versionNo}.txt`,
          date: v.createdAt,
          data: [
            `${item.title} · ${channelName.get(item.channelId) ?? ""} · ${item.format}`,
            `Versión ${v.versionNo} · ${when(v.createdAt)} · ${who(v.createdBy)}${v.origin === "ai_assisted" ? " · asistida por IA" : ""}`,
            v.note ? `Nota: ${v.note}` : null,
            v.emailSubject ? `Asunto: ${v.emailSubject}` : null,
            v.emailPreheader ? `Preencabezado: ${v.emailPreheader}` : null,
            v.linkUrl ? `Enlace: ${v.linkUrl}` : null,
            "",
            v.body,
            "",
            ...(files.length
              ? ["Archivos y enlaces:", ...files.map((a) => `- ${a.kind === "link" ? `${a.filename}: ${a.url}` : a.filename}`), ""]
              : []),
          ]
            .filter((l) => l !== null)
            .join("\n"),
        });
        for (const f of files) await addFile(`${folder}/archivos`, f.id);
      }

      const history = [
        ...data.approvals
          .filter((a) => a.contentItemId === item.id)
          .map((a) => ({
            at: a.createdAt,
            line: [
              `${a.stage} · ${a.decision}`,
              `v${versions.find((v) => v.id === a.contentVersionId)?.versionNo ?? "?"}`,
              who(a.decidedBy),
              a.clientApproverName && `cliente: ${a.clientApproverName}`,
              a.evidence && `evidencia: ${a.evidence}`,
              a.comment,
            ],
          })),
        ...data.publications
          .filter((p) => p.contentItemId === item.id)
          .map((p) => ({
            at: p.createdAt,
            line: [
              `publicación · ${p.status}`,
              p.scheduledAt && `programada: ${when(p.scheduledAt)}`,
              p.publishedAt && `publicada: ${when(p.publishedAt)}`,
              p.externalUrl,
              who(p.authorizedBy),
              p.note,
            ],
          })),
        ...data.comments
          .filter((c) => c.contentItemId === item.id)
          .map((c) => ({ at: c.createdAt, line: ["comentario", who(c.authorId), c.body] })),
      ].sort((a, b) => a.at.getTime() - b.at.getTime());
      if (history.length) {
        entries.push({
          name: `${folder}/historial.txt`,
          data: history.map((h) => `${when(h.at)} · ${h.line.filter(Boolean).join(" · ")}`).join("\n") + "\n",
        });
      }
      for (const a of data.approvals) {
        if (a.contentItemId === item.id && a.evidenceAssetId) await addFile(`${folder}/evidencias`, a.evidenceAssetId);
      }
    }

    const values = data.metric_values.filter((v) => v.cycleId === cycle.id);
    if (values.length) {
      const superseded = new Set(values.map((v) => v.supersedesId).filter(Boolean));
      const itemTitle = new Map(items.map((i) => [i.id, i.title]));
      entries.push({
        name: `${base}/metricas.csv`,
        data: toCsv(
          ["Canal", "Publicación", "Métrica", "Valor", "Vigente", "Fuente", "Detalle de la fuente", "Motivo", "Registrado por", "Fecha"],
          [...values]
            .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime())
            .map((v) => [
              channelName.get(v.channelId) ?? v.channelId,
              v.contentItemId ? (itemTitle.get(v.contentItemId) ?? v.contentItemId) : "",
              metricLabel.get(v.metricKey) ?? v.metricKey,
              String(v.value).replace(".", ","),
              superseded.has(v.id) ? "no" : "sí",
              v.source,
              v.sourceDetail,
              v.note,
              who(v.capturedBy),
              when(v.capturedAt),
            ]),
        ),
      });
    }
    for (const imp of data.metric_imports.filter((i) => i.cycleId === cycle.id)) {
      entries.push({
        name: `${base}/importaciones/${imp.id.slice(0, 8)}-${safeName(imp.filename, 100)}`,
        data: imp.rawCsv,
        date: imp.createdAt,
      });
    }

    const report = data.reports.find((r) => r.cycleId === cycle.id);
    if (report) {
      const sections = data.report_sections.filter((s) => s.reportId === report.id).sort((a, b) => a.position - b.position);
      entries.push({
        name: `${base}/informe.txt`,
        data: [
          `Informe de ${formatPeriod(cycle.period, locale)}${report.approvedAt ? ` · aprobado el ${when(report.approvedAt)}` : " · borrador"}`,
          "",
          ...sections.flatMap((s) => [
            `## ${s.title}`,
            s.body?.trim() || (s.kind === "human_analysis" || s.kind === "ai_interpretation" ? "(vacío)" : "(tabla de datos: ver metricas.csv)"),
            "",
          ]),
        ].join("\n"),
      });
    }
  }

  // Archivos que no están en ninguna pieza ni en la biblioteca (p. ej. quitados de la biblioteca).
  for (const a of data.assets) await addFile("otros-archivos", a.id);

  entries.push({
    name: "actividad.csv",
    data: toCsv(
      ["Fecha", "Persona", "Acción", "Tipo", "Id", "Datos"],
      [...data.audit_events]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((e) => [when(e.createdAt), who(e.actorId), e.action, e.entityType, e.entityId, e.data ? JSON.stringify(e.data) : ""]),
    ),
  });

  entries.push({
    name: "datos/project.json",
    data: json({ ...data.project, clientName: data.clientName }),
  });
  entries.push({ name: "datos/people.json", data: json(data.people) });
  entries.push({ name: "datos/metric_definitions.json", data: json(data.definitions) });
  for (const table of Object.keys(repo.EXPORTED_TABLES) as repo.ExportedTable[]) {
    entries.push({ name: `datos/${table}.json`, data: json(data[table]) });
  }

  await recordAudit({
    action: "project.exported",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "project",
    entityId: ctx.projectId,
    data: { files: exported.size, entries: entries.length },
  });

  const stamp = when(now).slice(0, 10);
  return {
    filename: `${safeName(`${data.clientName} - ${data.project.name}`, 80)} ${stamp}.zip`,
    bytes: createZip(entries),
  };
}
