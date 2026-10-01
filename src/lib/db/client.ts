import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb(url: string) {
  return drizzle(postgres(url, { max: 10 }), { schema });
}

export type Db = ReturnType<typeof createDb>;

const globalForDb = globalThis as unknown as { __mphDb?: Db };

/**
 * Cliente de base de datos perezoso: se crea en el primer uso para que las pruebas
 * puedan fijar DATABASE_URL antes. Solo debe importarse desde `modules/<x>/repo.ts`
 * (regla de lint).
 */
export function getDb(): Db {
  if (!globalForDb.__mphDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL no está definida");
    globalForDb.__mphDb = createDb(url);
  }
  return globalForDb.__mphDb;
}
