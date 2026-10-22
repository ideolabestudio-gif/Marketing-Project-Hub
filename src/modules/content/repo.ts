import { and, asc, desc, eq, ilike, max, sql } from "drizzle-orm";
import { insertAsset, type NewAsset } from "@/lib/db/assets";
import { getDb } from "@/lib/db/client";
import {
  assetFiles,
  assets,
  channels,
  comments,
  contentItems,
  contentVersionAssets,
  contentVersions,
  cycles,
  libraryItems,
  users,
} from "@/lib/db/schema";
import type { ProjectContext } from "@/modules/access/context";

// Todas las consultas filtran por ctx.projectId. Lee channels/cycles/users con JOIN;
// solo escribe en sus tablas (content_items, content_versions, assets, library_items, comments…).

export type ItemRow = typeof contentItems.$inferSelect;
export type VersionRow = typeof contentVersions.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;

export type VersionContent = {
  body: string;
  emailSubject: string | null;
  emailPreheader: string | null;
  linkUrl: string | null;
};

const itemColumns = {
  id: contentItems.id,
  cycleId: contentItems.cycleId,
  channelId: contentItems.channelId,
  format: contentItems.format,
  title: contentItems.title,
  plannedAt: contentItems.plannedAt,
  status: contentItems.status,
  aiGenerationId: contentItems.aiGenerationId,
  createdAt: contentItems.createdAt,
  channelName: channels.displayName,
  channelPlatform: channels.platform,
  channelKind: channels.kind,
  cyclePeriod: cycles.period,
  cycleStatus: cycles.status,
};

export async function listItemsForCycle(ctx: ProjectContext, cycleId: string) {
  const db = getDb();
  const latest = db
    .select({ itemId: contentVersions.contentItemId, latestVersion: max(contentVersions.versionNo).as("latest_version") })
    .from(contentVersions)
    .where(eq(contentVersions.projectId, ctx.projectId))
    .groupBy(contentVersions.contentItemId)
    .as("latest");
  return db
    .select({ ...itemColumns, latestVersion: latest.latestVersion })
    .from(contentItems)
    .innerJoin(channels, and(eq(channels.projectId, contentItems.projectId), eq(channels.id, contentItems.channelId)))
    .innerJoin(cycles, and(eq(cycles.projectId, contentItems.projectId), eq(cycles.id, contentItems.cycleId)))
    .leftJoin(latest, eq(latest.itemId, contentItems.id))
    .where(and(eq(contentItems.projectId, ctx.projectId), eq(contentItems.cycleId, cycleId)))
    .orderBy(sql`${contentItems.plannedAt} ASC NULLS LAST`, asc(contentItems.createdAt));
}

/** Piezas del proyecto cuyo título contiene el texto (sin distinguir mayúsculas), las más recientes primero. */
export async function searchItems(ctx: ProjectContext, text: string, limit: number) {
  const pattern = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return getDb()
    .select(itemColumns)
    .from(contentItems)
    .innerJoin(channels, and(eq(channels.projectId, contentItems.projectId), eq(channels.id, contentItems.channelId)))
    .innerJoin(cycles, and(eq(cycles.projectId, contentItems.projectId), eq(cycles.id, contentItems.cycleId)))
    .where(and(eq(contentItems.projectId, ctx.projectId), ilike(contentItems.title, pattern)))
    .orderBy(desc(cycles.period), sql`${contentItems.plannedAt} ASC NULLS LAST`)
    .limit(limit);
}

export async function findItem(ctx: ProjectContext, itemId: string) {
  const [row] = await getDb()
    .select(itemColumns)
    .from(contentItems)
    .innerJoin(channels, and(eq(channels.projectId, contentItems.projectId), eq(channels.id, contentItems.channelId)))
    .innerJoin(cycles, and(eq(cycles.projectId, contentItems.projectId), eq(cycles.id, contentItems.cycleId)))
    .where(and(eq(contentItems.projectId, ctx.projectId), eq(contentItems.id, itemId)))
    .limit(1);
  return row;
}

export async function insertItem(
  ctx: ProjectContext,
  values: Pick<ItemRow, "cycleId" | "channelId" | "format" | "title" | "plannedAt"> & { aiGenerationId?: string | null },
): Promise<ItemRow> {
  const [row] = await getDb()
    .insert(contentItems)
    .values({ ...values, projectId: ctx.projectId, createdBy: ctx.actor.userId })
    .returning();
  return row;
}

export async function updateItem(
  ctx: ProjectContext,
  itemId: string,
  values: Partial<Pick<ItemRow, "channelId" | "format" | "title" | "plannedAt" | "status">>,
): Promise<void> {
  await getDb()
    .update(contentItems)
    .set(values)
    .where(and(eq(contentItems.projectId, ctx.projectId), eq(contentItems.id, itemId)));
}

export async function listVersions(ctx: ProjectContext, itemId: string) {
  return getDb()
    .select({
      id: contentVersions.id,
      versionNo: contentVersions.versionNo,
      note: contentVersions.note,
      origin: contentVersions.origin,
      createdAt: contentVersions.createdAt,
      authorEmail: users.email,
      authorName: users.name,
    })
    .from(contentVersions)
    .innerJoin(users, eq(users.id, contentVersions.createdBy))
    .where(and(eq(contentVersions.projectId, ctx.projectId), eq(contentVersions.contentItemId, itemId)))
    .orderBy(desc(contentVersions.versionNo));
}

export async function findVersion(
  ctx: ProjectContext,
  itemId: string,
  versionNo?: number,
): Promise<VersionRow | undefined> {
  const where = and(
    eq(contentVersions.projectId, ctx.projectId),
    eq(contentVersions.contentItemId, itemId),
    versionNo === undefined ? undefined : eq(contentVersions.versionNo, versionNo),
  );
  const [row] = await getDb()
    .select()
    .from(contentVersions)
    .where(where)
    .orderBy(desc(contentVersions.versionNo))
    .limit(1);
  return row;
}

export async function listVersionAssets(ctx: ProjectContext, versionId: string): Promise<AssetRow[]> {
  const rows = await getDb()
    .select({ asset: assets })
    .from(contentVersionAssets)
    .innerJoin(
      assets,
      and(eq(assets.projectId, contentVersionAssets.projectId), eq(assets.id, contentVersionAssets.assetId)),
    )
    .where(
      and(eq(contentVersionAssets.projectId, ctx.projectId), eq(contentVersionAssets.contentVersionId, versionId)),
    )
    .orderBy(asc(contentVersionAssets.position));
  return rows.map((r) => r.asset);
}

export async function findAsset(ctx: ProjectContext, assetId: string): Promise<AssetRow | undefined> {
  const [row] = await getDb()
    .select()
    .from(assets)
    .where(and(eq(assets.projectId, ctx.projectId), eq(assets.id, assetId)))
    .limit(1);
  return row;
}

export type { NewAsset };

/** Contenido de un archivo guardado en la base de datos (undefined si es anterior a esa tabla). */
export async function findAssetBytes(ctx: ProjectContext, assetId: string): Promise<Uint8Array | undefined> {
  const [row] = await getDb()
    .select({ bytes: assetFiles.bytes })
    .from(assetFiles)
    .where(and(eq(assetFiles.projectId, ctx.projectId), eq(assetFiles.assetId, assetId)))
    .limit(1);
  return row?.bytes;
}

/** Copia a la base de datos un archivo antiguo que solo estaba en disco. */
export async function insertAssetBytes(ctx: ProjectContext, assetId: string, bytes: Uint8Array): Promise<void> {
  await getDb().insert(assetFiles).values({ projectId: ctx.projectId, assetId, bytes }).onConflictDoNothing();
}

/**
 * Crea la versión siguiente de una pieza en una transacción: (opcional) registra un
 * activo nuevo, inserta la versión con su lista de activos y pasa la pieza de idea a
 * borrador. La restricción UNIQUE (pieza, nº versión) evita duplicados concurrentes.
 */
export async function createVersion(
  ctx: ProjectContext,
  input: {
    itemId: string;
    content: VersionContent;
    note: string | null;
    assetIds: string[];
    newAsset?: NewAsset;
    aiGenerationId?: string | null;
  },
): Promise<VersionRow> {
  return getDb().transaction(async (tx) => {
    const [{ current }] = await tx
      .select({ current: max(contentVersions.versionNo) })
      .from(contentVersions)
      .where(and(eq(contentVersions.projectId, ctx.projectId), eq(contentVersions.contentItemId, input.itemId)));

    const assetIds = [...input.assetIds];
    if (input.newAsset) {
      await insertAsset(tx, { projectId: ctx.projectId, userId: ctx.actor.userId }, input.newAsset);
      assetIds.push(input.newAsset.id);
    }

    const [version] = await tx
      .insert(contentVersions)
      .values({
        projectId: ctx.projectId,
        contentItemId: input.itemId,
        versionNo: (current ?? 0) + 1,
        ...input.content,
        note: input.note,
        origin: input.aiGenerationId ? "ai_assisted" : "human",
        aiGenerationId: input.aiGenerationId ?? null,
        createdBy: ctx.actor.userId,
      })
      .returning();

    if (assetIds.length > 0) {
      await tx.insert(contentVersionAssets).values(
        assetIds.map((assetId, position) => ({
          projectId: ctx.projectId,
          contentVersionId: version.id,
          assetId,
          position,
        })),
      );
    }

    await tx
      .update(contentItems)
      .set({ status: "draft" })
      .where(
        and(
          eq(contentItems.projectId, ctx.projectId),
          eq(contentItems.id, input.itemId),
          eq(contentItems.status, "idea"),
        ),
      );
    return version;
  });
}

export async function listComments(ctx: ProjectContext, itemId: string) {
  return getDb()
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      versionNo: contentVersions.versionNo,
      authorEmail: users.email,
      authorName: users.name,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .leftJoin(
      contentVersions,
      and(eq(contentVersions.projectId, comments.projectId), eq(contentVersions.id, comments.contentVersionId)),
    )
    .where(and(eq(comments.projectId, ctx.projectId), eq(comments.contentItemId, itemId)))
    .orderBy(asc(comments.createdAt));
}

export async function insertComment(
  ctx: ProjectContext,
  values: { itemId: string; versionId: string | null; body: string },
) {
  const [row] = await getDb()
    .insert(comments)
    .values({
      projectId: ctx.projectId,
      contentItemId: values.itemId,
      contentVersionId: values.versionId,
      body: values.body,
      authorId: ctx.actor.userId,
    })
    .returning();
  return row;
}

// ---------------------------------------------------------------------------
// Biblioteca de materiales del proyecto
// ---------------------------------------------------------------------------

export type LibraryItemRow = typeof libraryItems.$inferSelect;

const libraryColumns = {
  id: libraryItems.id,
  category: libraryItems.category,
  title: libraryItems.title,
  description: libraryItems.description,
  createdAt: libraryItems.createdAt,
  asset: assets,
};

export async function listLibrary(ctx: ProjectContext) {
  return getDb()
    .select(libraryColumns)
    .from(libraryItems)
    .innerJoin(assets, and(eq(assets.projectId, libraryItems.projectId), eq(assets.id, libraryItems.assetId)))
    .where(eq(libraryItems.projectId, ctx.projectId))
    .orderBy(asc(libraryItems.category), asc(libraryItems.title));
}

export async function findLibraryItem(ctx: ProjectContext, libraryItemId: string) {
  const [row] = await getDb()
    .select(libraryColumns)
    .from(libraryItems)
    .innerJoin(assets, and(eq(assets.projectId, libraryItems.projectId), eq(assets.id, libraryItems.assetId)))
    .where(and(eq(libraryItems.projectId, ctx.projectId), eq(libraryItems.id, libraryItemId)))
    .limit(1);
  return row;
}

/** Registra el activo y su ficha en la biblioteca en una transacción. */
export async function insertLibraryItem(
  ctx: ProjectContext,
  input: { asset: NewAsset } & Pick<LibraryItemRow, "category" | "title" | "description">,
): Promise<LibraryItemRow> {
  return getDb().transaction(async (tx) => {
    await insertAsset(tx, { projectId: ctx.projectId, userId: ctx.actor.userId }, input.asset);
    const [row] = await tx
      .insert(libraryItems)
      .values({
        projectId: ctx.projectId,
        assetId: input.asset.id,
        category: input.category,
        title: input.title,
        description: input.description,
        createdBy: ctx.actor.userId,
      })
      .returning();
    return row;
  });
}

/** Quita el material de la biblioteca. El activo se conserva (es inmutable y puede estar en versiones). */
export async function deleteLibraryItem(ctx: ProjectContext, libraryItemId: string): Promise<void> {
  await getDb()
    .delete(libraryItems)
    .where(and(eq(libraryItems.projectId, ctx.projectId), eq(libraryItems.id, libraryItemId)));
}
