// SOLO DESARROLLO LOCAL: crea (si no existe) un usuario administrador y una sesión,
// para entrar sin configurar Google. Uso:
//   npm run dev:session -- tu@email.com
// Después, en el navegador, crea la cookie `mph_session` con el token que se imprime
// (o usa: curl -H "cookie: mph_session=<token>" http://localhost:3000).
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createSession } from "@/modules/identity/session";
import { eq } from "drizzle-orm";

async function main() {
  if (process.env.NODE_ENV === "production" || (process.env.APP_URL ?? "").startsWith("https://")) {
    throw new Error("dev-session solo puede usarse en local");
  }
  const email = (process.argv[2] ?? "admin@ideolab.local").toLowerCase();
  const db = getDb();
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) [user] = await db.insert(users).values({ email, name: "Admin local", isAdmin: true }).returning();
  const { token } = await createSession(user.id);
  console.log(`Usuario: ${email}\nCookie mph_session=${token}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
