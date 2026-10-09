import { desc, eq, max } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { brandProfiles, users } from "@/lib/db/schema";
import type { ProjectContext } from "@/modules/access/context";

// Todas las consultas filtran por ctx.projectId. Solo escribe en brand_profiles.

export type BrandProfileRow = typeof brandProfiles.$inferSelect;
export type BrandProfileFields = Pick<BrandProfileRow, "about" | "audience" | "voice" | "offering" | "keywords" | "avoid">;

export async function findLatestProfile(ctx: ProjectContext): Promise<BrandProfileRow | undefined> {
  const [row] = await getDb()
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.projectId, ctx.projectId))
    .orderBy(desc(brandProfiles.versionNo))
    .limit(1);
  return row;
}

export async function listProfileVersions(ctx: ProjectContext) {
  return getDb()
    .select({
      id: brandProfiles.id,
      versionNo: brandProfiles.versionNo,
      createdAt: brandProfiles.createdAt,
      authorEmail: users.email,
      authorName: users.name,
    })
    .from(brandProfiles)
    .innerJoin(users, eq(users.id, brandProfiles.createdBy))
    .where(eq(brandProfiles.projectId, ctx.projectId))
    .orderBy(desc(brandProfiles.versionNo));
}

/** Inserta la versión siguiente. La restricción UNIQUE (proyecto, nº) evita duplicados concurrentes. */
export async function insertProfileVersion(ctx: ProjectContext, fields: BrandProfileFields): Promise<BrandProfileRow> {
  return getDb().transaction(async (tx) => {
    const [{ current }] = await tx
      .select({ current: max(brandProfiles.versionNo) })
      .from(brandProfiles)
      .where(eq(brandProfiles.projectId, ctx.projectId));
    const [row] = await tx
      .insert(brandProfiles)
      .values({ ...fields, projectId: ctx.projectId, versionNo: (current ?? 0) + 1, createdBy: ctx.actor.userId })
      .returning();
    return row;
  });
}
