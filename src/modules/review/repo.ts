import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { approvals, channels, contentItems, contentVersions, cycles, projects, publications, users } from "@/lib/db/schema";
import type { ProjectContext } from "@/modules/access/context";

// Lee content_items/content_versions/cycles/projects con JOIN (solo lectura).
// Solo escribe en approvals y publications, sus tablas.

export type ApprovalRow = typeof approvals.$inferSelect;
export type PublicationRow = typeof publications.$inferSelect;

export async function getProjectFlags(ctx: ProjectContext) {
  const [row] = await getDb()
    .select({
      requireClientApproval: projects.requireClientApproval,
      separationOfDuties: projects.separationOfDuties,
      timezone: projects.timezone,
    })
    .from(projects)
    .where(eq(projects.id, ctx.projectId))
    .limit(1);
  return row;
}

/** Pieza con su última versión (si la hay) y el estado de su ciclo. */
export async function findItemWithLatestVersion(ctx: ProjectContext, itemId: string) {
  const db = getDb();
  const [item] = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      baseStatus: contentItems.status,
      cycleId: contentItems.cycleId,
      cycleStatus: cycles.status,
      period: cycles.period,
    })
    .from(contentItems)
    .innerJoin(cycles, and(eq(cycles.projectId, contentItems.projectId), eq(cycles.id, contentItems.cycleId)))
    .where(and(eq(contentItems.projectId, ctx.projectId), eq(contentItems.id, itemId)))
    .limit(1);
  if (!item) return undefined;
  const [latest] = await db
    .select({ id: contentVersions.id, versionNo: contentVersions.versionNo, createdBy: contentVersions.createdBy })
    .from(contentVersions)
    .where(and(eq(contentVersions.projectId, ctx.projectId), eq(contentVersions.contentItemId, itemId)))
    .orderBy(desc(contentVersions.versionNo))
    .limit(1);
  return { ...item, latest: latest ?? null };
}

export async function listApprovalsForItem(ctx: ProjectContext, itemId: string) {
  return getDb()
    .select({
      id: approvals.id,
      contentVersionId: approvals.contentVersionId,
      versionNo: contentVersions.versionNo,
      stage: approvals.stage,
      decision: approvals.decision,
      clientApproverName: approvals.clientApproverName,
      evidence: approvals.evidence,
      comment: approvals.comment,
      createdAt: approvals.createdAt,
      actorEmail: users.email,
      actorName: users.name,
    })
    .from(approvals)
    .innerJoin(
      contentVersions,
      and(eq(contentVersions.projectId, approvals.projectId), eq(contentVersions.id, approvals.contentVersionId)),
    )
    .innerJoin(users, eq(users.id, approvals.decidedBy))
    .where(and(eq(approvals.projectId, ctx.projectId), eq(approvals.contentItemId, itemId)))
    .orderBy(asc(approvals.createdAt));
}

export async function listPublicationsForItem(ctx: ProjectContext, itemId: string) {
  return getDb()
    .select({
      publication: publications,
      versionNo: contentVersions.versionNo,
      authorizedByEmail: users.email,
      authorizedByName: users.name,
    })
    .from(publications)
    .innerJoin(
      contentVersions,
      and(eq(contentVersions.projectId, publications.projectId), eq(contentVersions.id, publications.contentVersionId)),
    )
    .innerJoin(users, eq(users.id, publications.authorizedBy))
    .where(and(eq(publications.projectId, ctx.projectId), eq(publications.contentItemId, itemId)))
    .orderBy(desc(publications.createdAt));
}

export async function findActivePublication(ctx: ProjectContext, itemId: string): Promise<PublicationRow | undefined> {
  const [row] = await getDb()
    .select()
    .from(publications)
    .where(
      and(
        eq(publications.projectId, ctx.projectId),
        eq(publications.contentItemId, itemId),
        ne(publications.status, "cancelled"),
      ),
    )
    .limit(1);
  return row;
}

export async function findPublication(ctx: ProjectContext, publicationId: string) {
  const [row] = await getDb()
    .select()
    .from(publications)
    .where(and(eq(publications.projectId, ctx.projectId), eq(publications.id, publicationId)))
    .limit(1);
  return row;
}

export async function insertApproval(
  ctx: ProjectContext,
  values: Pick<
    ApprovalRow,
    "contentItemId" | "contentVersionId" | "stage" | "decision" | "clientApproverName" | "evidence" | "comment"
  >,
): Promise<ApprovalRow> {
  const [row] = await getDb()
    .insert(approvals)
    .values({ ...values, projectId: ctx.projectId, decidedBy: ctx.actor.userId })
    .returning();
  return row;
}

export async function insertPublication(
  ctx: ProjectContext,
  values: Pick<
    PublicationRow,
    "contentItemId" | "contentVersionId" | "status" | "scheduledAt" | "publishedAt" | "externalUrl" | "externalId" | "note"
  >,
): Promise<PublicationRow> {
  const [row] = await getDb()
    .insert(publications)
    .values({ ...values, projectId: ctx.projectId, method: "manual", authorizedBy: ctx.actor.userId })
    .returning();
  return row;
}

export async function updatePublication(
  ctx: ProjectContext,
  publicationId: string,
  values: Partial<
    Pick<PublicationRow, "status" | "publishedAt" | "externalUrl" | "externalId" | "cancelledAt" | "cancelledBy" | "note">
  >,
): Promise<void> {
  await getDb()
    .update(publications)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(publications.projectId, ctx.projectId), eq(publications.id, publicationId)));
}

/**
 * Datos para calcular el estado de varias piezas a la vez: las de un ciclo, o las de
 * todos los ciclos no cerrados del proyecto.
 */
export async function listWorkflowRows(ctx: ProjectContext, opts: { cycleId?: string } = {}) {
  const db = getDb();
  const items = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      baseStatus: contentItems.status,
      plannedAt: contentItems.plannedAt,
      period: cycles.period,
    })
    .from(contentItems)
    .innerJoin(cycles, and(eq(cycles.projectId, contentItems.projectId), eq(cycles.id, contentItems.cycleId)))
    .where(
      and(
        eq(contentItems.projectId, ctx.projectId),
        opts.cycleId ? eq(contentItems.cycleId, opts.cycleId) : ne(cycles.status, "closed"),
      ),
    );
  if (items.length === 0) return { items, latestVersions: [], events: [], activePublications: [] };
  const itemIds = items.map((i) => i.id);

  const latestVersions = await db
    .selectDistinctOn([contentVersions.contentItemId], {
      itemId: contentVersions.contentItemId,
      versionId: contentVersions.id,
      createdBy: contentVersions.createdBy,
    })
    .from(contentVersions)
    .where(and(eq(contentVersions.projectId, ctx.projectId), inArray(contentVersions.contentItemId, itemIds)))
    .orderBy(contentVersions.contentItemId, desc(contentVersions.versionNo));

  const versionIds = latestVersions.map((v) => v.versionId);
  const events =
    versionIds.length === 0
      ? []
      : await db
          .select({ versionId: approvals.contentVersionId, stage: approvals.stage, decision: approvals.decision })
          .from(approvals)
          .where(and(eq(approvals.projectId, ctx.projectId), inArray(approvals.contentVersionId, versionIds)));

  const activePublications = await db
    .select({ itemId: publications.contentItemId, status: publications.status, scheduledAt: publications.scheduledAt })
    .from(publications)
    .where(
      and(
        eq(publications.projectId, ctx.projectId),
        inArray(publications.contentItemId, itemIds),
        ne(publications.status, "cancelled"),
      ),
    );
  return { items, latestVersions, events, activePublications };
}

/** Publicaciones activas (programadas o publicadas) de las piezas de un ciclo. */
export async function listActivePublicationsForCycle(ctx: ProjectContext, cycleId: string) {
  return getDb()
    .select({
      itemId: contentItems.id,
      title: contentItems.title,
      format: contentItems.format,
      channelName: channels.displayName,
      status: publications.status,
      scheduledAt: publications.scheduledAt,
      publishedAt: publications.publishedAt,
      externalUrl: publications.externalUrl,
    })
    .from(publications)
    .innerJoin(
      contentItems,
      and(eq(contentItems.projectId, publications.projectId), eq(contentItems.id, publications.contentItemId)),
    )
    .innerJoin(channels, and(eq(channels.projectId, contentItems.projectId), eq(channels.id, contentItems.channelId)))
    .where(
      and(
        eq(publications.projectId, ctx.projectId),
        eq(contentItems.cycleId, cycleId),
        ne(publications.status, "cancelled"),
      ),
    )
    .orderBy(asc(publications.publishedAt), asc(publications.scheduledAt));
}
