import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { approvals, auditEvents, projects, publications } from "@/lib/db/schema";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import { requireProjectAccess, type ProjectContext } from "@/modules/access/context";
import { createItem, saveVersion } from "@/modules/content/service";
import {
  cancelPublication,
  decideInternal,
  getItemReview,
  listMyPendingWork,
  markPublished,
  recordClientDecision,
  recordPublication,
  submitForReview,
} from "@/modules/review/service";
import { seedTwoProjects, type Fixture } from "../fixtures/two-projects";

let fx: Fixture;
let ana: ProjectContext; // responsable de A
let edu: ProjectContext; // editor de A
let rev: ProjectContext; // revisor de A

beforeEach(async () => {
  fx = await seedTwoProjects();
  ana = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
  edu = await requireProjectAccess(fx.actors.edu, fx.projectA.id);
  rev = await requireProjectAccess(fx.actors.rev, fx.projectA.id);
});

/** Pieza nueva escrita por Edu con una versión, en borrador. */
async function draftByEdu(body = "Copy de prueba") {
  const item = await createItem(edu, {
    cycleId: fx.contentA.cycle.id,
    channelId: fx.channelA.id,
    format: "post",
    title: "Pieza de prueba",
  });
  const version = await saveVersion(edu, { itemId: item.id, body });
  return { itemId: item.id, versionId: version.id };
}

const client = { approverName: "Marta (cliente)", evidence: "Email de Marta del 3/11: OK" };

async function status(itemId: string) {
  return (await getItemReview(ana, itemId)).status;
}

async function pgCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    return err.cause?.code ?? err.code;
  }
}

describe("flujo completo", () => {
  it("borrador → revisión → aprobada → programada → publicada, todo auditado", async () => {
    const { itemId, versionId } = await draftByEdu();
    expect(await status(itemId)).toBe("draft");
    await submitForReview(edu, { itemId, versionId });
    expect(await status(itemId)).toBe("in_review");
    await decideInternal(rev, { itemId, versionId, decision: "approved" });
    expect(await status(itemId)).toBe("awaiting_client");
    await recordClientDecision(ana, { itemId, versionId, decision: "approved", ...client });
    expect(await status(itemId)).toBe("approved");
    const pub = await recordPublication(ana, {
      itemId,
      versionId,
      status: "scheduled",
      at: "2026-10-15T18:00",
      externalUrl: "https://www.instagram.com/p/abc",
    });
    expect(pub.scheduledAt?.toISOString()).toBe("2026-10-15T16:00:00.000Z"); // Madrid, horario de verano
    expect(await status(itemId)).toBe("scheduled");
    await markPublished(ana, { publicationId: pub.id, at: "2026-10-15T18:02" });
    expect(await status(itemId)).toBe("published");

    const actions = (await getDb().select().from(auditEvents).where(eq(auditEvents.projectId, fx.projectA.id))).map(
      (e) => e.action,
    );
    for (const a of [
      "review.submitted",
      "review.internal_approved",
      "review.client_approved",
      "publication.scheduled",
      "publication.published",
    ]) {
      expect(actions).toContain(a);
    }
  });

  it("si el proyecto no exige cliente, basta la aprobación interna", async () => {
    await getDb().update(projects).set({ requireClientApproval: false }).where(eq(projects.id, fx.projectA.id));
    const { itemId, versionId } = await draftByEdu();
    await submitForReview(edu, { itemId, versionId });
    await decideInternal(rev, { itemId, versionId, decision: "approved" });
    expect(await status(itemId)).toBe("approved");
    await expect(
      recordClientDecision(ana, { itemId, versionId, decision: "approved", ...client }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("WF-01: no se publica sin aprobación", () => {
  it("el servicio rechaza registrar la publicación de un borrador o de algo en revisión", async () => {
    const { itemId, versionId } = await draftByEdu();
    const attempt = () => recordPublication(ana, { itemId, versionId, status: "published", at: "2026-10-15T10:00" });
    await expect(attempt()).rejects.toBeInstanceOf(ValidationError);
    await submitForReview(edu, { itemId, versionId });
    await expect(attempt()).rejects.toBeInstanceOf(ValidationError);
    await decideInternal(rev, { itemId, versionId, decision: "approved" });
    await expect(attempt()).rejects.toBeInstanceOf(ValidationError); // falta el cliente
  });

  it("la base de datos lo rechaza aunque se salte el servicio", async () => {
    const { itemId, versionId } = await draftByEdu();
    const code = await pgCode(
      getDb().insert(publications).values({
        projectId: fx.projectA.id,
        contentItemId: itemId,
        contentVersionId: versionId,
        status: "published",
        publishedAt: new Date(),
        authorizedBy: fx.users.ana.id,
      }),
    );
    expect(code).toBe("23514");
  });
});

describe("WF-02: lo publicado es exactamente lo aprobado", () => {
  it("editar tras aprobar crea una versión sin aprobar; la vieja ya no se puede publicar", async () => {
    const { itemId, versionId: v1 } = await draftByEdu();
    await submitForReview(edu, { itemId, versionId: v1 });
    await decideInternal(rev, { itemId, versionId: v1, decision: "approved" });
    await recordClientDecision(ana, { itemId, versionId: v1, decision: "approved", ...client });
    expect(await status(itemId)).toBe("approved");

    const v2 = await saveVersion(edu, { itemId, body: "Copy cambiado después de aprobar" });
    expect(await status(itemId)).toBe("draft");

    await expect(
      recordPublication(ana, { itemId, versionId: v1, status: "published", at: "2026-10-15T10:00" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      recordPublication(ana, { itemId, versionId: v2.id, status: "published", at: "2026-10-15T10:00" }),
    ).rejects.toBeInstanceOf(ValidationError);

    const code = await pgCode(
      getDb().insert(publications).values({
        projectId: fx.projectA.id,
        contentItemId: itemId,
        contentVersionId: v1,
        status: "published",
        publishedAt: new Date(),
        authorizedBy: fx.users.ana.id,
      }),
    );
    expect(code).toBe("23514");
  });

  it("no se puede editar una pieza programada; al cancelar la programación vuelve a ser editable", async () => {
    const { item, publication } = fx.reviewA.scheduled;
    await expect(saveVersion(edu, { itemId: item.id, body: "Cambio tardío" })).rejects.toBeInstanceOf(ValidationError);
    await cancelPublication(ana, { publicationId: publication.id, reason: "Corregir errata" });
    expect(await status(item.id)).toBe("approved");
    await saveVersion(edu, { itemId: item.id, body: "Errata corregida" });
    expect(await status(item.id)).toBe("draft");
  });

  it("una publicación confirmada no se puede cancelar ni modificar", async () => {
    const { publication } = fx.reviewA.scheduled;
    await markPublished(ana, { publicationId: publication.id, at: "2026-10-20T12:01" });
    await expect(cancelPublication(ana, { publicationId: publication.id, reason: "x" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    const code = await pgCode(
      getDb().update(publications).set({ status: "cancelled" }).where(eq(publications.id, publication.id)),
    );
    expect(code).toBe("42501");
  });

  it("una decisión sobre una versión que ya no es la última se rechaza", async () => {
    const { itemId, versionId: v1 } = await draftByEdu();
    await submitForReview(edu, { itemId, versionId: v1 });
    await saveVersion(edu, { itemId, body: "Otra versión mientras se revisaba" });
    await expect(decideInternal(rev, { itemId, versionId: v1, decision: "approved" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe("WF-03: la aprobación del cliente exige evidencia", () => {
  it("sin evidencia o sin nombre se rechaza (servicio y BD)", async () => {
    const { itemId, versionId } = await draftByEdu();
    await submitForReview(edu, { itemId, versionId });
    await decideInternal(rev, { itemId, versionId, decision: "approved" });
    await expect(
      recordClientDecision(ana, { itemId, versionId, decision: "approved", approverName: "Marta", evidence: "" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      recordClientDecision(ana, { itemId, versionId, decision: "approved", approverName: "", evidence: "Email OK" }),
    ).rejects.toBeInstanceOf(ValidationError);
    const code = await pgCode(
      getDb().insert(approvals).values({
        projectId: fx.projectA.id,
        contentItemId: itemId,
        contentVersionId: versionId,
        stage: "client",
        decision: "approved",
        decidedBy: fx.users.ana.id,
      }),
    );
    expect(code).toBe("23514");
  });

  it("no se registra la respuesta del cliente antes de la aprobación interna", async () => {
    const { itemId, versionId } = await draftByEdu();
    await submitForReview(edu, { itemId, versionId });
    await expect(
      recordClientDecision(ana, { itemId, versionId, decision: "approved", ...client }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("WF-04: separación de funciones", () => {
  it("quien escribe una versión no puede aprobarla internamente", async () => {
    const item = await createItem(ana, {
      cycleId: fx.contentA.cycle.id,
      channelId: fx.channelA.id,
      format: "post",
      title: "Escrita por Ana",
    });
    const v = await saveVersion(ana, { itemId: item.id, body: "Copy de Ana" });
    await submitForReview(ana, { itemId: item.id, versionId: v.id });
    await expect(decideInternal(ana, { itemId: item.id, versionId: v.id, decision: "approved" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    // Con la separación desactivada en el proyecto, sí puede.
    await getDb().update(projects).set({ separationOfDuties: false }).where(eq(projects.id, fx.projectA.id));
    await decideInternal(ana, { itemId: item.id, versionId: v.id, decision: "approved" });
    expect(await status(item.id)).toBe("awaiting_client");
  });
});

describe("pedir cambios", () => {
  it("exige comentario; la versión queda bloqueada y hace falta una nueva", async () => {
    const { itemId, versionId } = await draftByEdu();
    await submitForReview(edu, { itemId, versionId });
    await expect(
      decideInternal(rev, { itemId, versionId, decision: "changes_requested" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await decideInternal(rev, { itemId, versionId, decision: "changes_requested", comment: "Cambia el CTA" });
    expect(await status(itemId)).toBe("changes_requested");
    await expect(submitForReview(edu, { itemId, versionId })).rejects.toBeInstanceOf(ValidationError);
    const v2 = await saveVersion(edu, { itemId, body: "CTA nuevo" });
    await submitForReview(edu, { itemId, versionId: v2.id });
    expect(await status(itemId)).toBe("in_review");
  });
});

describe("permisos por rol", () => {
  it("cada rol solo puede lo suyo", async () => {
    const { itemId, versionId } = await draftByEdu();
    await expect(submitForReview(rev, { itemId, versionId })).rejects.toBeInstanceOf(ForbiddenError);
    await submitForReview(edu, { itemId, versionId });
    await expect(decideInternal(edu, { itemId, versionId, decision: "approved" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await decideInternal(rev, { itemId, versionId, decision: "approved" });
    await expect(
      recordClientDecision(rev, { itemId, versionId, decision: "approved", ...client }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await recordClientDecision(ana, { itemId, versionId, decision: "approved", ...client });
    await expect(
      recordPublication(rev, { itemId, versionId, status: "published", at: "2026-10-15T10:00" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await recordPublication(edu, { itemId, versionId, status: "published", at: "2026-10-15T10:00" });
  });
});

describe("decisiones inmutables", () => {
  it("no se puede modificar ni borrar una decisión", async () => {
    expect(await pgCode(getDb().update(approvals).set({ comment: "editado" }))).toBe("42501");
    expect(await pgCode(getDb().delete(approvals))).toBe("42501");
    expect(await pgCode(getDb().execute(sql`DELETE FROM publications`))).toBe("42501");
  });
});

describe("pendiente de mí", () => {
  it("cada persona ve solo lo que puede hacer, y solo en sus proyectos", async () => {
    const revPending = await listMyPendingWork(fx.actors.rev);
    expect(revPending.map((p) => [p.itemId, p.action])).toEqual([[fx.reviewA.inReview.item.id, "review"]]);

    const anaPending = await listMyPendingWork(fx.actors.ana);
    expect(anaPending.every((p) => p.projectId === fx.projectA.id)).toBe(true);
    expect(anaPending.map((p) => p.action)).toContain("review"); // Edu escribió la pieza en revisión
    expect(JSON.stringify(anaPending)).not.toContain("BETA-SECRET");

    // Mix es lector en A (no ve tareas allí) y editor en B (no aprueba).
    const mixPending = await listMyPendingWork(fx.actors.mix);
    expect(mixPending.every((p) => p.projectId === fx.projectB.id)).toBe(true);
    expect(mixPending.map((p) => p.action)).not.toContain("review");

    // La programación vencida pide confirmar la publicación.
    const later = await listMyPendingWork(fx.actors.ana, new Date("2026-10-21T00:00:00Z"));
    expect(later.find((p) => p.itemId === fx.reviewA.scheduled.item.id)?.action).toBe("confirm");
  });
});
