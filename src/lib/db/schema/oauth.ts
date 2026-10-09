import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

/**
 * Conector de Claude (servidor MCP en /api/mcp) y su inicio de sesión OAuth 2.1.
 * No son datos de cliente: una conexión es de una persona, y lo que ve a través de
 * ella se autoriza proyecto a proyecto con su membresía, igual que en la web.
 * De los códigos y tokens solo se guarda el SHA-256.
 */

/** Aplicaciones registradas (registro dinámico, RFC 7591). Solo clientes públicos con PKCE. */
export const oauthClients = pgTable("oauth_clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Permiso que una persona dio a una aplicación. Revocarlo invalida todos sus tokens. */
export const oauthGrants = pgTable(
  "oauth_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("oauth_grants_user_id_idx").on(t.userId)],
);

/** Códigos de autorización: de un solo uso y de vida corta. */
export const oauthCodes = pgTable("oauth_codes", {
  id: text("id").primaryKey(),
  grantId: uuid("grant_id")
    .notNull()
    .references(() => oauthGrants.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const oauthTokenKind = pgEnum("oauth_token_kind", ["access", "refresh"]);

/** Tokens de acceso y de refresco. Un refresco usado dos veces revoca el permiso entero. */
export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: text("id").primaryKey(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => oauthGrants.id, { onDelete: "cascade" }),
    kind: oauthTokenKind("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [index("oauth_tokens_grant_id_idx").on(t.grantId)],
);
