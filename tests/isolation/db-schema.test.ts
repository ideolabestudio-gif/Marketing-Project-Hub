import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";
import { resetDatabase } from "../fixtures/two-projects";

/**
 * Tablas con project_id exentas de la regla, con su justificación.
 * Añadir una tabla aquí requiere revisión explícita.
 */
const WHITELIST: Record<string, string> = {
  audit_events: "Registra también intentos sobre proyectos inexistentes; append-only (DB-07)",
};

type FkRow = { table: string; ref_table: string; columns: string[]; ref_columns: string[] };

async function introspect() {
  const db = getDb();
  const projectScoped = await db.execute<{ table_name: string; is_nullable: string }>(sql`
    SELECT table_name, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'project_id'`);
  const fks = await db.execute<FkRow>(sql`
    SELECT c.conrelid::regclass::text AS table,
           c.confrelid::regclass::text AS ref_table,
           array_agg(a.attname ORDER BY k.ord) AS columns,
           array_agg(af.attname ORDER BY k.ord) AS ref_columns
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS k(attnum, fattnum, ord)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = k.fattnum
    WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
    GROUP BY c.oid, c.conrelid, c.confrelid`);
  return { projectScoped: [...projectScoped], fks: [...fks] };
}

describe("esquema: aislamiento por proyecto en la base de datos (DB-06)", () => {
  let data: Awaited<ReturnType<typeof introspect>>;
  beforeAll(async () => {
    data = await introspect();
  });

  it("toda tabla con project_id lo tiene NOT NULL y con FK a projects", () => {
    const problems: string[] = [];
    for (const { table_name, is_nullable } of data.projectScoped) {
      if (WHITELIST[table_name]) continue;
      if (is_nullable !== "NO") problems.push(`${table_name}.project_id admite NULL`);
      const hasProjectFk = data.fks.some(
        (fk) => fk.table === table_name && fk.ref_table === "projects" && fk.columns.join() === "project_id",
      );
      if (!hasProjectFk) problems.push(`${table_name} no tiene FK project_id → projects`);
    }
    expect(problems).toEqual([]);
  });

  it("toda FK hacia una tabla con project_id es compuesta e incluye project_id", () => {
    const scoped = new Set(data.projectScoped.map((t) => t.table_name));
    const problems: string[] = [];
    for (const fk of data.fks) {
      if (!scoped.has(fk.ref_table) || WHITELIST[fk.table]) continue;
      const pairs = fk.columns.map((c, i) => `${c}->${fk.ref_columns[i]}`);
      if (!pairs.includes("project_id->project_id")) {
        problems.push(`${fk.table}(${fk.columns.join(",")}) → ${fk.ref_table} no incluye project_id`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("toda tabla con project_id es referenciable por (project_id, id)", async () => {
    const rows = await getDb().execute<{ table: string }>(sql`
      SELECT c.conrelid::regclass::text AS table
      FROM pg_constraint c
      WHERE c.contype IN ('u', 'p') AND c.connamespace = 'public'::regnamespace
        AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
             FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey))
            = ARRAY['id', 'project_id']`);
    const referenceable = new Set(rows.map((r) => r.table));
    const hasIdColumn = await getDb().execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'id'`);
    const withId = new Set(hasIdColumn.map((r) => r.table_name));
    const missing = data.projectScoped
      .map((t) => t.table_name)
      .filter((t) => !WHITELIST[t] && withId.has(t) && !referenceable.has(t));
    expect(missing).toEqual([]);
  });
});

describe("auditoría inmutable (DB-07)", () => {
  beforeAll(async () => {
    await resetDatabase();
    await getDb().insert(auditEvents).values({ action: "test.event" });
  });

  it("no se puede modificar un evento", async () => {
    await expect(getDb().update(auditEvents).set({ action: "otro" })).rejects.toThrow();
  });

  it("no se puede borrar un evento", async () => {
    await expect(getDb().delete(auditEvents)).rejects.toThrow();
  });

  it("no se puede vaciar la tabla", async () => {
    await expect(getDb().execute(sql`TRUNCATE audit_events`)).rejects.toThrow();
  });
});
