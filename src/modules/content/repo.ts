import { and, asc, desc, eq, max, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  assets,
  channels,
  comments,
  contentItems,
  contentVersionAssets,
  contentVersions,
  cycles,
  users,
} from "@/lib/db/schema";
import type { ProjectContext } from "@/modules/access/context";

// Todas las consultas filtran por ctx.projectId. Lee channels/cycles/users con JOIN;
// solo escribe en sus tablas (content_items, content_versions, assets, comments…).

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
  values: Pick<ItemRow, "cycleId" | "channelId" | "format" | "title" | "plannedAt">,
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

export type NewAsset = Pick<AssetRow, "id" | "kind" | "storageKey" | "url" | "filename" | "mimeType" | "sizeBytes" | "sha256">;

/**
 * Crea la versión siguiente de una pieza en una transacción: (opcional) registra un
 * activo nuevo, inserta la versión con su lista de activos y pasa la pieza de idea a
 * borrador. La restricción UNIQUE (pieza, nº versión) evita duplicados concurrentes.
 */
export async function createVersion(
  ctx: ProjectContext,
  input: { itemId: string; content: VersionContent; note: string | null; assetIds: string[]; newAsset?: NewAsset },
): Promise<VersionRow> {
  return getDb().transaction(async (tx) => {
    const [{ current }] = await tx
      .select({ current: max(contentVersions.versionNo) })
      .from(contentVersions)
      .where(and(eq(contentVersions.projectId, ctx.projectId), eq(contentVersions.contentItemId, input.itemId)));

    const assetIds = [...input.assetIds];
    if (input.newAsset) {
      await tx.insert(assets).values({ ...input.newAsset, projectId: ctx.projectId, uploadedBy: ctx.actor.userId });
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
