import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import {
  approvals,
  assets,
  comments,
  contentItems,
  contentVersionAssets,
  contentVersions,
  publications,
} from "@/lib/db/schema";
import { seedTwoProjects, type Fixture } from "../fixtures/two-projects";

/**
 * DB-01/DB-02: aunque el código tuviera un error, la base de datos rechaza referencias
 * cruzadas entre proyectos. Y lo aprobable (versiones, sus archivos) es inmutable.
 */
let fx: Fixture;
beforeEach(async () => {
  fx = await seedTwoProjects();
});

/** Comprueba el código de error de PostgreSQL (Drizzle lo envuelve en `cause`). */
async function expectPgError(promise: Promise<unknown>, code: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "se esperaba un error de la base de datos").not.toBeNull();
  const pgCode = (err as { code?: string; cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code;
  expect(pgCode).toBe(code);
}
const FK_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";

describe("referencias cruzadas entre proyectos (BD)", () => {
  it("DB-01: una versión del proyecto B no puede colgar de una pieza de A", async () => {
    await expectPgError(
      getDb().insert(contentVersions).values({
        projectId: fx.projectB.id,
        contentItemId: fx.contentA.item.id,
        versionNo: 99,
        createdBy: fx.users.bea.id,
      }),
      FK_VIOLATION,
    );
  });

  it("DB-02: no se puede ligar un archivo de B a una versión de A", async () => {
    for (const projectId of [fx.projectA.id, fx.projectB.id]) {
      await expectPgError(
        getDb().insert(contentVersionAssets).values({
          projectId,
          contentVersionId: fx.contentA.latestVersionId,
          assetId: fx.contentB.asset.id,
          position: 5,
        }),
        FK_VIOLATION,
      );
    }
  });

  it("una pieza de A no puede usar un ciclo o un canal de B", async () => {
    await expectPgError(
      getDb().insert(contentItems).values({
        projectId: fx.projectA.id,
        cycleId: fx.contentB.cycle.id,
        channelId: fx.channelA.id,
        format: "post",
        title: "x",
      }),
      FK_VIOLATION,
    );
    await expectPgError(
      getDb().insert(contentItems).values({
        projectId: fx.projectA.id,
        cycleId: fx.contentA.cycle.id,
        channelId: fx.channelB.id,
        format: "post",
        title: "x",
      }),
      FK_VIOLATION,
    );
  });

  it("un comentario de A no puede apuntar a una versión de B", async () => {
    await expectPgError(
      getDb().insert(comments).values({
        projectId: fx.projectA.id,
        contentItemId: fx.contentA.item.id,
        contentVersionId: fx.contentB.latestVersionId,
        body: "x",
        authorId: fx.users.ana.id,
      }),
      FK_VIOLATION,
    );
  });

  it("la clave de almacenamiento de un archivo debe ser de su propio proyecto", async () => {
    await expectPgError(
      getDb().insert(assets).values({
        projectId: fx.projectA.id,
        kind: "file",
        storageKey: `projects/${fx.projectB.id}/assets/00000000-0000-4000-8000-000000000000`,
        filename: "x.png",
        sha256: "0".repeat(64),
        uploadedBy: fx.users.ana.id,
      }),
      CHECK_VIOLATION,
    );
  });
});

describe("inmutabilidad de lo aprobable", () => {
  it("no se puede modificar ni borrar una versión", async () => {
    await expect(
      getDb().update(contentVersions).set({ body: "cambiado" }).where(eq(contentVersions.id, fx.contentA.latestVersionId)),
    ).rejects.toThrow();
    await expect(
      getDb().delete(contentVersions).where(eq(contentVersions.id, fx.contentA.latestVersionId)),
    ).rejects.toThrow();
  });

  it("no se pueden cambiar los archivos de una versión ni los propios archivos", async () => {
    await expect(
      getDb()
        .delete(contentVersionAssets)
        .where(eq(contentVersionAssets.contentVersionId, fx.contentA.latestVersionId)),
    ).rejects.toThrow();
    await expect(
      getDb().update(assets).set({ filename: "otro.png" }).where(eq(assets.id, fx.contentA.asset.id)),
    ).rejects.toThrow();
  });

  it("solo se admiten versiones de origen humano hasta F5", async () => {
    await expectPgError(
      getDb().execute(
        sql`INSERT INTO content_versions (project_id, content_item_id, version_no, origin, created_by)
            VALUES (${fx.projectA.id}, ${fx.contentA.item.id}, 50, 'ai_assisted', ${fx.users.ana.id})`,
      ),
      CHECK_VIOLATION,
    );
  });
});

describe("DB-03: aprobaciones y publicaciones no cruzan proyectos", () => {
  it("una aprobación de A no puede apuntar a una versión de B", async () => {
    await expectPgError(
      getDb().insert(approvals).values({
        projectId: fx.projectA.id,
        contentItemId: fx.contentA.item.id,
        contentVersionId: fx.contentB.latestVersionId,
        stage: "submission",
        decision: "submitted",
        decidedBy: fx.users.ana.id,
      }),
      FK_VIOLATION,
    );
  });

  it("una aprobación no puede mezclar la pieza de una versión con otra pieza del mismo proyecto", async () => {
    await expectPgError(
      getDb().insert(approvals).values({
        projectId: fx.projectA.id,
        contentItemId: fx.reviewA.inReview.item.id,
        contentVersionId: fx.contentA.latestVersionId,
        stage: "submission",
        decision: "submitted",
        decidedBy: fx.users.ana.id,
      }),
      FK_VIOLATION,
    );
  });

  it("una publicación de A no puede usar una versión de B", async () => {
    // El trigger de aprobaciones (BEFORE INSERT) actúa antes que la FK y ya la rechaza;
    // cualquiera de las dos barreras basta.
    const err = await getDb()
      .insert(publications)
      .values({
        projectId: fx.projectA.id,
        contentItemId: fx.reviewA.scheduled.item.id,
        contentVersionId: fx.reviewB.scheduled.versionId,
        status: "published",
        publishedAt: new Date(),
        authorizedBy: fx.users.ana.id,
      })
      .then(
        () => null,
        (e: { cause?: { code?: string } }) => e,
      );
    expect([FK_VIOLATION, CHECK_VIOLATION]).toContain(err?.cause?.code);
  });
});
