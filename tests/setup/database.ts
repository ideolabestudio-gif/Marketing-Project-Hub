import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Servidor PostgreSQL de pruebas (en CI, un servicio de GitHub Actions). */
export const TEST_SERVER_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/postgres";

export function databaseUrlFor(name: string): string {
  const url = new URL(TEST_SERVER_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

/** Crea (o recrea) una base de datos vacía y le aplica todas las migraciones. */
export async function createMigratedDatabase(name: string): Promise<string> {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Nombre de BD no válido: ${name}`);
  const admin = postgres(TEST_SERVER_URL, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const url = databaseUrlFor(name);
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  } finally {
    await client.end();
  }
  return url;
}
