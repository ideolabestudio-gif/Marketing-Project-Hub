import { createHash, randomUUID } from "node:crypto";
import { diffWords } from "diff";
import { z } from "zod";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { assetStorageKey, getStorage } from "@/lib/storage";
import { periodOfWallTime, wallTimeToUtc } from "@/lib/time";
import { isUniqueViolation, isUuid, parseInput } from "@/lib/validation";
import { authorize, type ProjectContext } from "@/modules/access/context";
import { recordAudit } from "@/modules/audit/service";
import { assertCycleWritable, getCycle } from "@/modules/cycles/service";
import { getProject, listChannels } from "@/modules/projects/service";
import { assertContentEditable } from "@/modules/review/service";
import { ALLOWED_DESCRIPTION, detectMimeType, MAX_UPLOAD_BYTES } from "./files";
import { isValidFormat } from "./formats";
import * as repo from "./repo";

export type { VersionContent } from "./repo";

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export async function listItems(ctx: ProjectContext, cycleId: string) {
  await authorize(ctx, "project.read");
  const cycle = await getCycle(ctx, cycleId);
  return repo.listItemsForCycle(ctx, cycle.id);
}

async function loadItem(ctx: ProjectContext, itemId: string) {
  const item = isUuid(itemId) ? await repo.findItem(ctx, itemId) : undefined;
  if (!item) throw new NotFoundError();
  return item;
}

/** Pieza con su versión vigente (la última), sus activos, el historial y los comentarios. */
export async function getItemDetail(ctx: ProjectContext, itemId: string) {
  await authorize(ctx, "project.read");
  const item = await loadItem(ctx, itemId);
  const [current, versions, comments] = await Promise.all([
    repo.findVersion(ctx, item.id),
    repo.listVersions(ctx, item.id),
    repo.listComments(ctx, item.id),
  ]);
  const currentAssets = current ? await repo.listVersionAssets(ctx, current.id) : [];
  return { item, current: current ?? null, currentAssets, versions, comments };
}

export async function getVersion(ctx: ProjectContext, input: { itemId: string; versionNo: number }) {
  await authorize(ctx, "project.read");
  const item = await loadItem(ctx, input.itemId);
  if (!Number.isInteger(input.versionNo) || input.versionNo < 1) throw new NotFoundError();
  const version = await repo.findVersion(ctx, item.id, input.versionNo);
  if (!version) throw new NotFoundError();
  return { version, assets: await repo.listVersionAssets(ctx, version.id) };
}

const FIELD_LABELS: Record<keyof repo.VersionContent, string> = {
  body: "Texto",
  emailSubject: "Asunto",
  emailPreheader: "Preencabezado",
  linkUrl: "Enlace",
};

/** Compara dos versiones de la misma pieza: diferencias de texto y de activos. */
export async function compareVersions(ctx: ProjectContext, input: { itemId: string; fromNo: number; toNo: number }) {
  const from = await getVersion(ctx, { itemId: input.itemId, versionNo: input.fromNo });
  const to = await getVersion(ctx, { itemId: input.itemId, versionNo: input.toNo });
  const fields = (Object.keys(FIELD_LABELS) as (keyof repo.VersionContent)[]).map((key) => ({
    key,
    label: FIELD_LABELS[key],
    changed: (from.version[key] ?? "") !== (to.version[key] ?? ""),
    parts: diffWords(from.version[key] ?? "", to.version[key] ?? "").map((p) => ({
      value: p.value,
      added: Boolean(p.added),
      removed: Boolean(p.removed),
    })),
  }));
  const fromIds = new Set(from.assets.map((a) => a.id));
  const toIds = new Set(to.assets.map((a) => a.id));
  return {
    from: from.version,
    to: to.version,
    fields,
    assetsAdded: to.assets.filter((a) => !fromIds.has(a.id)),
    assetsRemoved: from.assets.filter((a) => !toIds.has(a.id)),
  };
}

/** Archivo para descargar. Solo tras autorizar; nunca hay URLs públicas. */
export async function getAssetFile(ctx: ProjectContext, assetId: string) {
  await authorize(ctx, "project.read");
  const asset = isUuid(assetId) ? await repo.findAsset(ctx, assetId) : undefined;
  if (!asset || asset.kind !== "file" || !asset.storageKey) throw new NotFoundError();
  const bytes = await getStorage().get(asset.storageKey);
  return { filename: asset.filename, mimeType: asset.mimeType ?? "application/octet-stream", bytes };
}

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

const plannedAtSchema = z.string().trim().optional();

/** Convierte la fecha de la UI (hora del proyecto) a UTC y exige que caiga en el mes del ciclo. */
async function resolvePlannedAt(ctx: ProjectContext, wall: string | undefined, period: string): Promise<Date | null> {
  if (!wall) return null;
  const project = await getProject(ctx);
  const date = wallTimeToUtc(wall, project.timezone);
  if (!date) throw new ValidationError("Fecha no válida");
  if (periodOfWallTime(wall) !== period) throw new ValidationError("La fecha debe estar dentro del mes del ciclo");
  return date;
}

async function resolveChannel(ctx: ProjectContext, channelId: string, format: string) {
  const channel = (await listChannels(ctx)).find((c) => c.id === channelId);
  if (!channel) throw new NotFoundError("Canal no encontrado");
  if (!channel.isActive) throw new ValidationError("El canal está desactivado");
  if (!isValidFormat(channel.kind, format)) throw new ValidationError("Formato no válido para este canal");
  return channel;
}

const createItemSchema = z.object({
  cycleId: z.string(),
  channelId: z.string(),
  format: z.string().trim().min(1, "Elige un formato"),
  title: z.string().trim().min(1, "Indica un título").max(200),
  plannedAt: plannedAtSchema,
});

export async function createItem(ctx: ProjectContext, input: z.input<typeof createItemSchema>) {
  await authorize(ctx, "content.write");
  const data = parseInput(createItemSchema, input);
  const cycle = await getCycle(ctx, data.cycleId);
  assertCycleWritable(cycle);
  const channel = await resolveChannel(ctx, data.channelId, data.format);
  const item = await repo.insertItem(ctx, {
    cycleId: cycle.id,
    channelId: channel.id,
    format: data.format,
    title: data.title,
    plannedAt: await resolvePlannedAt(ctx, data.plannedAt, cycle.period),
  });
  await recordAudit({
    action: "content_item.created",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "content_item",
    entityId: item.id,
  });
  return item;
}

/** Carga la pieza y comprueba que se puede modificar (permiso, ciclo abierto, no cancelada, no publicada). */
async function loadItemForWrite(ctx: ProjectContext, itemId: string, opts: { allowCancelled?: boolean } = {}) {
  await authorize(ctx, "content.write");
  const item = await loadItem(ctx, itemId);
  assertCycleWritable(await getCycle(ctx, item.cycleId));
  if (item.status === "cancelled" && !opts.allowCancelled) {
    throw new ValidationError("La pieza está cancelada; reactívala para modificarla");
  }
  // Lo programado o publicado debe seguir siendo exactamente lo aprobado.
  await assertContentEditable(ctx, item.id);
  return item;
}

const updateItemSchema = createItemSchema.omit({ cycleId: true }).extend({ itemId: z.string() });

export async function updateItem(ctx: ProjectContext, input: z.input<typeof updateItemSchema>) {
  const data = parseInput(updateItemSchema, input);
  const item = await loadItemForWrite(ctx, data.itemId);
  const channel = await resolveChannel(ctx, data.channelId, data.format);
  await repo.updateItem(ctx, item.id, {
    channelId: channel.id,
    format: data.format,
    title: data.title,
    plannedAt: await resolvePlannedAt(ctx, data.plannedAt, item.cyclePeriod),
  });
  await recordAudit({
    action: "content_item.updated",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "content_item",
    entityId: item.id,
  });
}

export async function setItemCancelled(ctx: ProjectContext, input: { itemId: string; cancelled: boolean }) {
  const item = await loadItemForWrite(ctx, input.itemId, { allowCancelled: true });
  if (input.cancelled === (item.status === "cancelled")) return;
  const hasVersions = Boolean(await repo.findVersion(ctx, item.id));
  await repo.updateItem(ctx, item.id, { status: input.cancelled ? "cancelled" : hasVersions ? "draft" : "idea" });
  await recordAudit({
    action: input.cancelled ? "content_item.cancelled" : "content_item.reactivated",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "content_item",
    entityId: item.id,
  });
}

// ---------------------------------------------------------------------------
// Versiones y activos: toda modificación del contenido crea una versión nueva
// ---------------------------------------------------------------------------

const optionalText = (maxLen: number) =>
  z
    .string()
    .trim()
    .max(maxLen)
    .optional()
    .transform((v) => v || null);

const httpUrl = z
  .url("Enlace no válido")
  .refine((u) => /^https?:\/\//i.test(u), "El enlace debe empezar por http:// o https://");

const versionSchema = z.object({
  itemId: z.string(),
  body: z.string().max(20000).default(""),
  emailSubject: optionalText(300),
  emailPreheader: optionalText(300),
  linkUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .pipe(httpUrl.nullable()),
  note: optionalText(500),
});

async function nextVersion(
  ctx: ProjectContext,
  item: { id: string },
  change: (prev: { content: repo.VersionContent; assetIds: string[] }) => {
    content: repo.VersionContent;
    assetIds: string[];
    newAsset?: repo.NewAsset;
  },
  note: string | null,
  audit: { action: string; data?: Record<string, unknown> },
) {
  const prev = await repo.findVersion(ctx, item.id);
  const prevAssets = prev ? await repo.listVersionAssets(ctx, prev.id) : [];
  const prevState = {
    content: {
      body: prev?.body ?? "",
      emailSubject: prev?.emailSubject ?? null,
      emailPreheader: prev?.emailPreheader ?? null,
      linkUrl: prev?.linkUrl ?? null,
    },
    assetIds: prevAssets.map((a) => a.id),
  };
  const next = change(prevState);
  if (!next.newAsset && JSON.stringify(next) === JSON.stringify(prevState)) {
    throw new ValidationError(prev ? "No hay cambios respecto a la versión actual" : "La versión está vacía");
  }
  try {
    const version = await repo.createVersion(ctx, { itemId: item.id, note, ...next });
    await recordAudit({
      action: audit.action,
      actorId: ctx.actor.userId,
      projectId: ctx.projectId,
      entityType: "content_version",
      entityId: version.id,
      data: { itemId: item.id, versionNo: version.versionNo, ...audit.data },
    });
    return version;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Alguien ha guardado otra versión a la vez. Recarga y repite.");
    throw err;
  }
}

/** Guarda el texto como una versión nueva, conservando los activos de la anterior. */
export async function saveVersion(ctx: ProjectContext, input: z.input<typeof versionSchema>) {
  const data = parseInput(versionSchema, input);
  const item = await loadItemForWrite(ctx, data.itemId);
  const content: repo.VersionContent = {
    body: data.body.replace(/\r\n/g, "\n"),
    emailSubject: item.channelKind === "email" ? data.emailSubject : null,
    emailPreheader: item.channelKind === "email" ? data.emailPreheader : null,
    linkUrl: data.linkUrl,
  };
  return nextVersion(ctx, item, (prev) => ({ content, assetIds: prev.assetIds }), data.note, {
    action: "content_version.created",
  });
}

const MAX_ASSETS_PER_VERSION = 20;

/** Sube un archivo y crea una versión nueva que lo incluye. */
export async function uploadAsset(
  ctx: ProjectContext,
  input: { itemId: string; filename: string; bytes: Uint8Array },
) {
  const item = await loadItemForWrite(ctx, input.itemId);
  if (input.bytes.byteLength === 0) throw new ValidationError("El archivo está vacío");
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) throw new ValidationError(`Archivo demasiado grande (${ALLOWED_DESCRIPTION})`);
  const mimeType = detectMimeType(input.bytes);
  if (!mimeType) throw new ValidationError(`Tipo de archivo no admitido (${ALLOWED_DESCRIPTION})`);
  const filename = sanitizeFilename(input.filename);

  const assetId = randomUUID();
  const storageKey = assetStorageKey(ctx.projectId, assetId);
  // Se escribe primero el archivo: si la transacción falla queda un huérfano inofensivo,
  // nunca una fila apuntando a un archivo inexistente.
  await getStorage().put(storageKey, input.bytes);
  const newAsset: repo.NewAsset = {
    id: assetId,
    kind: "file",
    storageKey,
    url: null,
    filename,
    mimeType,
    sizeBytes: input.bytes.byteLength,
    sha256: createHash("sha256").update(input.bytes).digest("hex"),
  };
  return nextVersion(
    ctx,
    item,
    (prev) => {
      if (prev.assetIds.length >= MAX_ASSETS_PER_VERSION) throw new ValidationError("Demasiados archivos en la pieza");
      return { ...prev, newAsset };
    },
    `Añadido archivo: ${filename}`,
    { action: "content_version.asset_added", data: { assetId } },
  );
}

const linkSchema = z.object({
  itemId: z.string(),
  url: httpUrl,
  label: z.string().trim().max(200).optional(),
});

/** Añade un enlace externo (Drive, Canva…). Ojo: su contenido puede cambiar fuera del Hub. */
export async function addLinkAsset(ctx: ProjectContext, input: z.input<typeof linkSchema>) {
  const data = parseInput(linkSchema, input);
  const item = await loadItemForWrite(ctx, data.itemId);
  const assetId = randomUUID();
  const label = data.label || data.url;
  const newAsset: repo.NewAsset = {
    id: assetId,
    kind: "link",
    storageKey: null,
    url: data.url,
    filename: label,
    mimeType: null,
    sizeBytes: null,
    sha256: null,
  };
  return nextVersion(ctx, item, (prev) => ({ ...prev, newAsset }), `Añadido enlace: ${label}`, {
    action: "content_version.asset_added",
    data: { assetId },
  });
}

/** Quita un activo de la pieza creando una versión nueva (las anteriores lo conservan). */
export async function removeAsset(ctx: ProjectContext, input: { itemId: string; assetId: string }) {
  const item = await loadItemForWrite(ctx, input.itemId);
  if (!isUuid(input.assetId)) throw new NotFoundError();
  const asset = await repo.findAsset(ctx, input.assetId);
  if (!asset) throw new NotFoundError();
  return nextVersion(
    ctx,
    item,
    (prev) => {
      if (!prev.assetIds.includes(asset.id)) throw new NotFoundError();
      return { ...prev, assetIds: prev.assetIds.filter((id) => id !== asset.id) };
    },
    `Quitado: ${asset.filename}`,
    { action: "content_version.asset_removed", data: { assetId: asset.id } },
  );
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "archivo";
  const clean = base.replace(/[^\p{L}\p{N}._ -]/gu, "_").trim().slice(0, 150);
  return clean || "archivo";
}

// ---------------------------------------------------------------------------
// Comentarios
// ---------------------------------------------------------------------------

const commentSchema = z.object({
  itemId: z.string(),
  body: z.string().trim().min(1, "Escribe un comentario").max(5000),
});

/** Comentario sobre la pieza, ligado a la versión vigente en ese momento. */
export async function addComment(ctx: ProjectContext, input: z.input<typeof commentSchema>) {
  await authorize(ctx, "comment.write");
  const data = parseInput(commentSchema, input);
  const item = await loadItem(ctx, data.itemId);
  assertCycleWritable(await getCycle(ctx, item.cycleId));
  const current = await repo.findVersion(ctx, item.id);
  const comment = await repo.insertComment(ctx, { itemId: item.id, versionId: current?.id ?? null, body: data.body });
  await recordAudit({
    action: "comment.created",
    actorId: ctx.actor.userId,
    projectId: ctx.projectId,
    entityType: "comment",
    entityId: comment.id,
  });
  return comment;
}
