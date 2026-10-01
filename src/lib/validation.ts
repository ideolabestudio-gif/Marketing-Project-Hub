import { z } from "zod";
import { ValidationError } from "./errors";

export const uuidSchema = z.uuid();

export function isUuid(value: unknown): value is string {
  return uuidSchema.safeParse(value).success;
}

/** Valida la entrada de un servicio y lanza ValidationError con mensajes legibles. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    const first = result.error.issues[0];
    throw new ValidationError(first ? first.message : "Datos no válidos", fieldErrors);
  }
  return result.data;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("es-ES", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Código de error de PostgreSQL para violación de UNIQUE. */
export function isUniqueViolation(err: unknown): boolean {
  return pgCode(err) === "23505";
}

function pgCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let i = 0; i < 3 && current && typeof current === "object"; i++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
