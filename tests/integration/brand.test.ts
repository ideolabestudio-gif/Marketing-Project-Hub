import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { auditEvents, brandProfiles } from "@/lib/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { requireProjectAccess, type ProjectContext } from "@/modules/access/context";
import { getCalendarPlanChatPrompt, getCopyDraftChatPrompt } from "@/modules/ai/service";
import { getBrandProfile, saveBrandProfile } from "@/modules/brand/service";
import {
  addLibraryFile,
  addLibraryLink,
  attachLibraryItem,
  getAssetFile,
  getItemDetail,
  listLibrary,
  removeLibraryItem,
} from "@/modules/content/service";
import { MARKER_A, MARKER_B, seedTwoProjects, type Fixture } from "../fixtures/two-projects";

let fx: Fixture;
let ctx: ProjectContext;

beforeEach(async () => {
  fx = await seedTwoProjects();
  ctx = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
});

describe("ficha del cliente", () => {
  it("cada guardado crea una versión nueva y la vigente es la última", async () => {
    const before = await getBrandProfile(ctx);
    expect(before.current?.versionNo).toBe(2);
    expect(before.current?.voice).toBe(`Tono cercano ${MARKER_A}`);

    const v3 = await saveBrandProfile(ctx, { ...before.current!, audience: "Familias con niños" });
    const after = await getBrandProfile(ctx);
    expect(after.current?.id).toBe(v3.id);
    expect(after.current?.audience).toBe("Familias con niños");
    expect(after.versions.map((v) => v.versionNo)).toEqual([3, 2, 1]);
    const audit = await getDb().select().from(auditEvents).where(eq(auditEvents.entityId, v3.id));
    expect(audit.map((a) => a.action)).toEqual(["brand_profile.saved"]);
  });

  it("no guarda una versión sin cambios", async () => {
    const { current } = await getBrandProfile(ctx);
    await expect(saveBrandProfile(ctx, { ...current! })).rejects.toBeInstanceOf(ValidationError);
    expect((await getBrandProfile(ctx)).versions).toHaveLength(2);
  });

  it("las versiones son inmutables en la base de datos", async () => {
    await expect(
      getDb().update(brandProfiles).set({ voice: "cambiado" }).where(eq(brandProfiles.id, fx.brandA.profile.id)),
    ).rejects.toThrow();
    await expect(getDb().delete(brandProfiles).where(eq(brandProfiles.id, fx.brandA.profile.id))).rejects.toThrow();
  });

  it("solo el responsable edita la ficha; el editor y el revisor la leen", async () => {
    for (const actor of [fx.actors.edu, fx.actors.rev]) {
      const other = await requireProjectAccess(actor, fx.projectA.id);
      expect((await getBrandProfile(other)).current?.id).toBe(fx.brandA.profile.id);
      await expect(saveBrandProfile(other, { about: "Intento" })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("la IA recibe la ficha y los materiales del proyecto, y nada del otro", async () => {
    const copy = await getCopyDraftChatPrompt(ctx, { itemId: fx.contentA.item.id });
    expect(copy).toContain(`Tono de voz: Tono cercano ${MARKER_A}`);
    expect(copy).toContain(`Qué evitar: Evitar ${MARKER_A}`);
    expect(copy).toContain(`- Logo ${MARKER_A} (Logos): Logo principal ${MARKER_A}`);
    expect(copy).not.toContain(MARKER_B);

    const plan = await getCalendarPlanChatPrompt(ctx, { cycleId: fx.contentA.cycle.id });
    expect(plan).toContain(`Quién es el cliente: Cliente ${MARKER_A}`);
    expect(plan).not.toContain(MARKER_B);
  });
});

describe("biblioteca de materiales", () => {
  it("guarda archivos y enlaces con su categoría y sirve el archivo solo tras autorizar", async () => {
    const library = await listLibrary(ctx);
    expect(library.map((m) => [m.category, m.title])).toEqual([
      ["logo", `Logo ${MARKER_A}`],
      ["photo", `Fotos ${MARKER_A}`],
    ]);
    const logo = library.find((m) => m.id === fx.brandA.libraryFile.id)!;
    expect((await getAssetFile(ctx, logo.asset.id)).mimeType).toBe("image/png");
    await expect(getAssetFile(ctx, (await listLibraryOf(fx.projectB.id, fx.actors.bea))[0].asset.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("valida el tipo de archivo, la categoría y el enlace", async () => {
    await expect(
      addLibraryFile(ctx, { category: "logo", filename: "x.svg", bytes: new TextEncoder().encode("<svg/>") }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(addLibraryLink(ctx, { category: "nada" as never, url: "https://example.com" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(addLibraryLink(ctx, { category: "other", url: "javascript:alert(1)" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("el revisor y el lector no pueden añadir ni quitar materiales", async () => {
    for (const actor of [fx.actors.rev, fx.actors.mix]) {
      const other = await requireProjectAccess(actor, fx.projectA.id);
      await expect(addLibraryLink(other, { category: "other", url: "https://example.com" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(removeLibraryItem(other, { libraryItemId: fx.brandA.libraryLink.id })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
  });

  it("añadir un material a una pieza crea una versión nueva; quitarlo de la biblioteca no lo borra de la pieza", async () => {
    const before = await getItemDetail(ctx, fx.contentA.item.id);
    const version = await attachLibraryItem(ctx, { itemId: fx.contentA.item.id, libraryItemId: fx.brandA.libraryFile.id });
    expect(version.versionNo).toBe(before.current!.versionNo + 1);
    const detail = await getItemDetail(ctx, fx.contentA.item.id);
    const logo = (await listLibrary(ctx)).find((m) => m.id === fx.brandA.libraryFile.id)!;
    expect(detail.currentAssets.map((a) => a.id)).toContain(logo.asset.id);

    await expect(
      attachLibraryItem(ctx, { itemId: fx.contentA.item.id, libraryItemId: fx.brandA.libraryFile.id }),
    ).rejects.toBeInstanceOf(ValidationError);

    await removeLibraryItem(ctx, { libraryItemId: fx.brandA.libraryFile.id });
    expect((await listLibrary(ctx)).map((m) => m.id)).not.toContain(fx.brandA.libraryFile.id);
    expect((await getItemDetail(ctx, fx.contentA.item.id)).currentAssets.map((a) => a.id)).toContain(logo.asset.id);
    expect((await getAssetFile(ctx, logo.asset.id)).mimeType).toBe("image/png");
  });
});

async function listLibraryOf(projectId: string, actor: Fixture["actors"]["bea"]) {
  return listLibrary(await requireProjectAccess(actor, projectId));
}
