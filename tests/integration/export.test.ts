import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { ForbiddenError } from "@/lib/errors";
import { requireProjectAccess } from "@/modules/access/context";
import { exportProject } from "@/modules/export/service";
import { EXPORTED_TABLES } from "@/modules/export/repo";
import { adminSetProjectStatus } from "@/modules/projects/service";
import { MARKER_A, MARKER_B, seedTwoProjects, type Fixture } from "../fixtures/two-projects";

let fx: Fixture;
let dir: string;
beforeEach(async () => {
  fx = await seedTwoProjects();
  dir = mkdtempSync(join(tmpdir(), "mph-export-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Abre el ZIP con `unzip` (así se comprueba también que es un ZIP válido). */
function unzip(bytes: Uint8Array) {
  const file = join(dir, "p.zip");
  writeFileSync(file, bytes);
  execFileSync("unzip", ["-tq", file]);
  const names = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" }).trim().split("\n");
  const read = (name: string) => execFileSync("unzip", ["-p", file, name], { encoding: "utf8" });
  return { names, read, all: () => execFileSync("unzip", ["-p", file], { maxBuffer: 1 << 26 }).toString("utf8") };
}

describe("exportar un proyecto", () => {
  it("incluye textos, archivos, evidencias, métricas, informe y datos, y nada de B", async () => {
    const ana = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
    const zip = await exportProject(ana, new Date("2026-10-21T10:00:00Z"));
    expect(zip.filename).toMatch(/2026-10-21\.zip$/);
    const { names, read, all } = unzip(zip.bytes);
    const period = fx.contentA.cycle.period;

    expect(names).toContain("LEEME.txt");
    expect(names).toContain(`meses/${period}/brief.txt`);
    expect(names).toContain(`meses/${period}/metricas.csv`);
    expect(names).toContain(`meses/${period}/informe.txt`);
    expect(names).toContain("actividad.csv");
    for (const table of Object.keys(EXPORTED_TABLES)) expect(names).toContain(`datos/${table}.json`);

    const v1 = names.find((n) => n.includes(`Pieza ${MARKER_A}`) && n.endsWith("/v1.txt"))!;
    expect(read(v1)).toContain(MARKER_A);
    expect(names.some((n) => n.includes("/archivos/") && n.endsWith(`imagen-${MARKER_A}.png`))).toBe(true);
    expect(names.some((n) => n.includes("/evidencias/") && n.endsWith(`evidencia-${MARKER_A}.png`))).toBe(true);
    expect(names.some((n) => n.startsWith("biblioteca/"))).toBe(true);
    expect(names.some((n) => n.startsWith(`meses/${period}/importaciones/`))).toBe(true);

    const metrics = read(`meses/${period}/metricas.csv`);
    expect(metrics).toContain(`Programada ${MARKER_A}`); // métrica de la publicación
    expect(metrics).toContain("1250"); // valor vigente
    expect(metrics).toContain(`Corrección ${MARKER_A}`);

    const everything = all();
    expect(everything).toContain(MARKER_A);
    expect(everything).not.toContain(MARKER_B);
    expect(everything).not.toContain(fx.projectB.id);
  });

  it("solo la responsable; también con el proyecto archivado; queda en la auditoría", async () => {
    const edu = await requireProjectAccess(fx.actors.edu, fx.projectA.id);
    await expect(exportProject(edu)).rejects.toBeInstanceOf(ForbiddenError);
    await adminSetProjectStatus(fx.actors.admin, { projectId: fx.projectA.id, status: "archived" });
    const ana = await requireProjectAccess(fx.actors.ana, fx.projectA.id, "project.export");
    await exportProject(ana);
    const [row] = await getDb().execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM audit_events WHERE project_id = ${fx.projectA.id} AND action = 'project.exported'`,
    );
    expect(row.n).toBe(1);
  });

  it("no se deja ninguna tabla con datos de proyecto", async () => {
    const rows = await getDb().execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = 'project_id'`,
    );
    // projects va en datos/project.json; asset_files, como archivos sueltos.
    const covered = new Set([...Object.keys(EXPORTED_TABLES), "projects", "asset_files"]);
    const missing = rows.map((r) => r.table_name).filter((t) => !covered.has(t));
    expect(missing, "Añade estas tablas a EXPORTED_TABLES en src/modules/export/repo.ts").toEqual([]);
  });
});
