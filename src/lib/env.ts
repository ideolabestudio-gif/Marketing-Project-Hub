import { z } from "zod";

const envSchema = z.object({
  APP_URL: z.url().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  /** Opcional: restringe el login a un dominio de Google Workspace (p. ej. ideolab.es). */
  AUTH_GOOGLE_HOSTED_DOMAIN: z.string().min(1).optional(),
  /** Emails separados por comas que se crean como administradores en su primer login. */
  BOOTSTRAP_ADMIN_EMAILS: z.string().default(""),
  /**
   * Direcciones de vuelta OAuth admitidas para el conector de Claude, además de las de
   * claude.ai y claude.com (separadas por comas). Solo hace falta si Claude cambia la suya.
   */
  OAUTH_EXTRA_REDIRECT_URIS: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  return envSchema.parse({
    APP_URL: process.env.APP_URL || undefined,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || undefined,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || undefined,
    AUTH_GOOGLE_HOSTED_DOMAIN: process.env.AUTH_GOOGLE_HOSTED_DOMAIN || undefined,
    BOOTSTRAP_ADMIN_EMAILS: process.env.BOOTSTRAP_ADMIN_EMAILS || undefined,
    OAUTH_EXTRA_REDIRECT_URIS: process.env.OAUTH_EXTRA_REDIRECT_URIS || undefined,
  });
}

export function bootstrapAdminEmails(env: Env): string[] {
  return env.BOOTSTRAP_ADMIN_EMAILS.split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/** Las cookies llevan `Secure` y prefijo `__Host-` cuando la app se sirve por HTTPS. */
export function isSecureDeployment(env: Env): boolean {
  return env.APP_URL.startsWith("https://");
}
