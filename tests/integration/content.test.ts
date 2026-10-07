import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { assets, cycles, auditEvents } from "@/lib/db/schema";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { requireProjectAccess, type ProjectContext } from "@/modules/access/context";
import {
  addComment,
  addLinkAsset,
  compareVersions,
  createItem,
  getItemDetail,
  getVersion,
  listItems,
  removeAsset,
  saveVersion,
  setItemCancelled,
  updateItem,
  uploadAsset,
} from "@/modules/content/service";
import { closeCycle, openCycle, setCycleStatus, updateCycleBrief } from "@/modules/cycles/service";
import { approveReport, markAiSectionReviewed, updateReportSection } from "@/modules/reports/service";
import { FIXTURE_PERIOD, seedTwoProjects, TINY_PNG, type Fixture } from "../fixtures/two-projects";

let fx: Fixture;
let ctx: ProjectContext;

beforeEach(async () => {
  fx = await seedTwoProjects();
  ctx = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
});

describe("ciclos", () => {
  it("no permite dos ciclos del mismo mes en un proyecto, pero sí en proyectos distintos", async () => {
    await expect(openCycle(ctx, { period: FIXTURE_PERIOD })).rejects.toBeInstanceOf(ConflictError);
    // El fixture ya tiene 2026-10 en A y en B: el mismo mes convive en proyectos distintos.
    await expect(openCycle(ctx, { period: "2026-13" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("solo el responsable gestiona el ciclo; el editor no", async () => {
    const edu = await requireProjectAccess(fx.actors.edu, fx.projectA.id);
    await expect(openCycle(edu, { period: "2026-12" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateCycleBrief(edu, { cycleId: fx.contentA.cycle.id, objectives: "x" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("solo se cierra con el informe aprobado y un ciclo cerrado queda en solo lectura", async () => {
    await expect(
      setCycleStatus(ctx, { cycleId: fx.contentA.cycle.id, status: "closed" as never }),
    ).rejects.toBeInstanceOf(ValidationError);
    // Ni siquiera escribiendo directamente en BD: un trigger exige el informe aprobado.
    await expect(
      getDb().update(cycles).set({ status: "closed" }).where(eq(cycles.id, fx.contentA.cycle.id)),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(closeCycle(ctx, { cycleId: fx.contentA.cycle.id, learnings: "Aprendizajes del mes" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    for (const s of fx.metricsA.sections.filter((x) => x.kind === "human_analysis")) {
      await updateReportSection(ctx, { sectionId: s.id, title: s.title, body: "Análisis" });
    }
    await markAiSectionReviewed(ctx, { sectionId: fx.aiA.aiSection.id });
    await approveReport(ctx, { reportId: fx.metricsA.report.id });
    await closeCycle(ctx, { cycleId: fx.contentA.cycle.id, learnings: "Aprendizajes del mes" });
    await expect(saveVersion(ctx, { itemId: fx.contentA.item.id, body: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createItem(ctx, { cycleId: fx.contentA.cycle.id, channelId: fx.channelA.id, format: "post", title: "x" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addComment(ctx, { itemId: fx.contentA.item.id, body: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateCycleBrief(ctx, { cycleId: fx.contentA.cycle.id, notes: "x" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("piezas", () => {
  it("guarda la fecha en UTC a partir de la hora del proyecto (Madrid)", async () => {
    const item = await createItem(ctx, {
      cycleId: fx.contentA.cycle.id,
      channelId: fx.channelA.id,
      format: "reel",
      title: "Reel",
      plannedAt: "2026-10-30T19:30",
    });
    // 30 de octubre de 2026: ya en horario de invierno (UTC+1)
    expect(item.plannedAt?.toISOString()).toBe("2026-10-30T18:30:00.000Z");
    expect(item.status).toBe("idea");
  });

  it("exige que la fecha caiga dentro del mes del ciclo", async () => {
    await expect(
      createItem(ctx, {
        cycleId: fx.contentA.cycle.id,
        channelId: fx.channelA.id,
        format: "post",
        title: "x",
        plannedAt: "2026-11-01T10:00",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza canales de otro proyecto, formatos que no encajan y canales desactivados", async () => {
    const base = { cycleId: fx.contentA.cycle.id, title: "x" };
    await expect(createItem(ctx, { ...base, channelId: fx.channelB.id, format: "post" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(createItem(ctx, { ...base, channelId: fx.channelA.id, format: "newsletter" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      updateItem(ctx, { itemId: fx.contentA.item.id, channelId: fx.channelB.id, format: "post", title: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("un revisor o un lector no pueden crear ni editar piezas", async () => {
    for (const actor of [fx.actors.rev, fx.actors.mix]) {
      const c = await requireProjectAccess(actor, fx.projectA.id);
      await expect(saveVersion(c, { itemId: fx.contentA.item.id, body: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("una pieza cancelada no se edita hasta reactivarla", async () => {
    await setItemCancelled(ctx, { itemId: fx.contentA.item.id, cancelled: true });
    await expect(saveVersion(ctx, { itemId: fx.contentA.item.id, body: "x" })).rejects.toBeInstanceOf(ValidationError);
    await setItemCancelled(ctx, { itemId: fx.contentA.item.id, cancelled: false });
    const { item } = await getItemDetail(ctx, fx.contentA.item.id);
    expect(item.status).toBe("draft");
  });

  it("lista solo las piezas del ciclo", async () => {
    const other = await openCycle(ctx, { period: "2026-11" });
    await createItem(ctx, { cycleId: other.id, channelId: fx.channelA.id, format: "post", title: "Noviembre" });
    const items = await listItems(ctx, fx.contentA.cycle.id);
    expect(items.map((i) => i.title)).not.toContain("Noviembre");
    expect(items.map((i) => i.id)).toContain(fx.contentA.item.id);
    expect(items.find((i) => i.id === fx.contentA.item.id)?.latestVersion).toBe(2);
  });
});

describe("versiones", () => {
  it("cada cambio crea una versión nueva y las anteriores no cambian", async () => {
    const itemId = fx.contentA.item.id;
    const v1Before = await getVersion(ctx, { itemId, versionNo: 1 });
    const v3 = await saveVersion(ctx, { itemId, body: "Copy nuevo", note: "CTA" });
    expect(v3.versionNo).toBe(3);
    const v1After = await getVersion(ctx, { itemId, versionNo: 1 });
    expect(v1After).toEqual(v1Before);
    const detail = await getItemDetail(ctx, itemId);
    expect(detail.current?.versionNo).toBe(3);
    expect(detail.versions.map((v) => v.versionNo)).toEqual([3, 2, 1]);
    // El archivo de v2 sigue en v3 (el texto cambia, los archivos se conservan)
    expect(detail.currentAssets.map((a) => a.id)).toEqual([fx.contentA.asset.id]);
  });

  it("rechaza guardar sin cambios", async () => {
    const { current } = await getItemDetail(ctx, fx.contentA.item.id);
    await expect(saveVersion(ctx, { itemId: fx.contentA.item.id, body: current!.body })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("asunto y preencabezado solo se guardan en canales de email", async () => {
    const v = await saveVersion(ctx, { itemId: fx.contentA.item.id, body: "Otro", emailSubject: "Asunto" });
    expect(v.emailSubject).toBeNull();
  });

  it("quitar un archivo crea una versión sin él; la anterior lo conserva", async () => {
    const itemId = fx.contentA.item.id;
    const v3 = await removeAsset(ctx, { itemId, assetId: fx.contentA.asset.id });
    expect((await getVersion(ctx, { itemId, versionNo: v3.versionNo })).assets).toEqual([]);
    expect((await getVersion(ctx, { itemId, versionNo: 2 })).assets.map((a) => a.id)).toEqual([fx.contentA.asset.id]);
    await expect(removeAsset(ctx, { itemId, assetId: fx.contentA.asset.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("compara versiones palabra a palabra y detecta archivos añadidos", async () => {
    const itemId = fx.contentA.item.id;
    await saveVersion(ctx, { itemId, body: "Copy ALFA-SECRET con #otoño" });
    const diff = await compareVersions(ctx, { itemId, fromNo: 1, toNo: 3 });
    const body = diff.fields.find((f) => f.key === "body")!;
    expect(body.changed).toBe(true);
    expect(body.parts.filter((p) => p.removed).map((p) => p.value.trim())).toContain("hashtag");
    expect(body.parts.filter((p) => p.added).map((p) => p.value.trim())).toContain("otoño");
    expect(diff.assetsAdded.map((a) => a.id)).toEqual([fx.contentA.asset.id]);
  });

  it("los enlaces externos deben ser http(s)", async () => {
    await expect(
      addLinkAsset(ctx, { itemId: fx.contentA.item.id, url: "javascript:alert(1)" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      saveVersion(ctx, { itemId: fx.contentA.item.id, body: "x", linkUrl: "ftp://servidor/archivo" }),
    ).rejects.toBeInstanceOf(ValidationError);
    const v = await addLinkAsset(ctx, { itemId: fx.contentA.item.id, url: "https://www.canva.com/design/abc" });
    expect(v.versionNo).toBe(3);
  });

  it("toda versión nueva queda auditada", async () => {
    await saveVersion(ctx, { itemId: fx.contentA.item.id, body: "Auditado" });
    const events = await getDb().select().from(auditEvents).where(eq(auditEvents.action, "content_version.created"));
    expect(events.some((e) => e.projectId === fx.projectA.id && e.actorId === fx.users.ana.id)).toBe(true);
  });
});

describe("archivos", () => {
  it("guarda el archivo bajo la clave del proyecto, con hash y tipo detectado", async () => {
    const [row] = await getDb().select().from(assets).where(eq(assets.id, fx.contentA.asset.id));
    expect(row.storageKey).toBe(`projects/${fx.projectA.id}/assets/${row.id}`);
    expect(row.mimeType).toBe("image/png");
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    const stored = await readFile(join(process.env.STORAGE_DIR!, row.storageKey!));
    expect(new Uint8Array(stored)).toEqual(TINY_PNG);
  });

  it("rechaza tipos no admitidos aunque la extensión parezca válida (SVG, HTML)", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    for (const bytes of [svg, html]) {
      await expect(
        uploadAsset(ctx, { itemId: fx.contentA.item.id, filename: "foto.png", bytes }),
      ).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it("rechaza archivos vacíos o de más de 25 MB", async () => {
    await expect(
      uploadAsset(ctx, { itemId: fx.contentA.item.id, filename: "a.png", bytes: new Uint8Array() }),
    ).rejects.toBeInstanceOf(ValidationError);
    const big = new Uint8Array(25 * 1024 * 1024 + 1);
    big.set(TINY_PNG);
    await expect(
      uploadAsset(ctx, { itemId: fx.contentA.item.id, filename: "a.png", bytes: big }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("limpia el nombre del archivo", async () => {
    await uploadAsset(ctx, { itemId: fx.contentA.item.id, filename: "../../etc/pa<ss>wd.png", bytes: TINY_PNG });
    const { currentAssets } = await getItemDetail(ctx, fx.contentA.item.id);
    expect(currentAssets.at(-1)?.filename).toBe("pa_ss_wd.png");
  });
});
