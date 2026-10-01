import { globSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { requireProjectAccess } from "@/modules/access/context";
import { listMyProjects } from "@/modules/access/service";
import { MARKER_A, MARKER_B, seedTwoProjects, type Fixture } from "../fixtures/two-projects";
import { SERVICE_CASES } from "./service-cases";

const SERVICE_FILES = globSync("src/modules/*/service.ts");

async function exportedServiceFunctions(): Promise<string[]> {
  const names: string[] = [];
  for (const file of SERVICE_FILES) {
    const moduleName = file.replace(/\\/g, "/").split("/")[2];
    const mod: Record<string, unknown> = await import(resolve(file));
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === "function") names.push(`${moduleName}.${name}`);
    }
  }
  return names.sort();
}

/** Huella de todos los datos de un proyecto, para comprobar que un intento cruzado no los cambió. */
async function projectFingerprint(projectId: string): Promise<string> {
  const db = getDb();
  const parts = await Promise.all([
    db.execute(sql`SELECT * FROM projects WHERE id = ${projectId}`),
    db.execute(sql`SELECT * FROM channels WHERE project_id = ${projectId} ORDER BY id`),
    db.execute(sql`SELECT * FROM project_memberships WHERE project_id = ${projectId} ORDER BY user_id`),
  ]);
  return JSON.stringify(parts);
}

describe("cobertura del registro de servicios", () => {
  let exported: string[];
  beforeAll(async () => {
    exported = await exportedServiceFunctions();
  });

  it("toda función exportada por un service.ts está clasificada en SERVICE_CASES", () => {
    expect(exported.length).toBeGreaterThan(0);
    const missing = exported.filter((n) => !(n in SERVICE_CASES));
    expect(missing, "Añade estas funciones a tests/isolation/service-cases.ts").toEqual([]);
  });

  it("SERVICE_CASES no contiene funciones que ya no existen", () => {
    const stale = Object.keys(SERVICE_CASES).filter((n) => !exported.includes(n));
    expect(stale).toEqual([]);
  });
});

describe("aislamiento de servicios con contexto de proyecto (SV-01..03)", () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await seedTwoProjects();
  });

  for (const [name, c] of Object.entries(SERVICE_CASES)) {
    if (c.kind !== "project") continue;

    it(`${name}: con el contexto de A no devuelve datos de B (SV-01)`, async () => {
      const ctxA = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
      const result = await c.own(ctxA, fx);
      expect(JSON.stringify(result ?? null)).not.toContain(MARKER_B);
    });

    if (typeof c.foreign === "function") {
      const foreign = c.foreign;
      it(`${name}: con el contexto de A e IDs de B falla con NotFound y sin efectos (SV-02/03)`, async () => {
        const ctxA = await requireProjectAccess(fx.actors.ana, fx.projectA.id);
        const before = await projectFingerprint(fx.projectB.id);
        await expect(foreign(ctxA, fx)).rejects.toBeInstanceOf(NotFoundError);
        expect(await projectFingerprint(fx.projectB.id)).toBe(before);
      });
    } else {
      it(`${name}: justifica por qué no recibe IDs (${c.foreign.none})`, () => {
        expect(c.foreign).toHaveProperty("none");
      });
    }
  }
});

describe("servicios de administración", () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await seedTwoProjects();
  });

  for (const [name, c] of Object.entries(SERVICE_CASES)) {
    if (c.kind !== "admin") continue;
    it(`${name}: un no administrador recibe Forbidden`, async () => {
      await expect(c.call(fx.actors.ana, fx)).rejects.toBeInstanceOf(ForbiddenError);
    });
    it(`${name}: un administrador puede usarlo`, async () => {
      await expect(c.call(fx.actors.admin, fx)).resolves.not.toThrow();
    });
  }
});

describe("listMyProjects (SV-01 por usuario)", () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await seedTwoProjects();
  });

  it("cada usuario ve solo los proyectos de los que es miembro", async () => {
    const ana = JSON.stringify(await listMyProjects(fx.actors.ana));
    expect(ana).toContain(MARKER_A);
    expect(ana).not.toContain(MARKER_B);

    const bea = JSON.stringify(await listMyProjects(fx.actors.bea));
    expect(bea).toContain(MARKER_B);
    expect(bea).not.toContain(MARKER_A);

    const mix = await listMyProjects(fx.actors.mix);
    expect(mix.map((p) => p.projectId).sort()).toEqual([fx.projectA.id, fx.projectB.id].sort());
  });

  it("un administrador sin membresías no ve proyectos en su lista", async () => {
    expect(await listMyProjects(fx.actors.admin)).toEqual([]);
  });
});
