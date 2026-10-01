// Aplica las migraciones pendientes de ./drizzle. Se ejecuta en cada arranque del
// servidor (ver render.yaml): es idempotente y solo usa dependencias de producción.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL no está definida");
  process.exit(1);
}
const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.log("Migraciones aplicadas");
} finally {
  await client.end();
}
