import { readFileSync } from "node:fs";

export const E2E_STATE_FILE = ".e2e/state.json";

export type E2EState = {
  projectA: string;
  projectB: string;
  tokens: Record<"ana" | "edu" | "bea" | "mix" | "admin" | "inactive", string>;
};

export function readState(): E2EState {
  return JSON.parse(readFileSync(E2E_STATE_FILE, "utf8"));
}

/** En HTTP (no HTTPS) la cookie de sesión se llama mph_session. */
export function sessionCookie(token: string): Record<string, string> {
  return { cookie: `mph_session=${token}` };
}
