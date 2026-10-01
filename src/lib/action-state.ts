import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";

/** Resultado que devuelven las acciones de servidor a los formularios. */
export type ActionState = { ok: boolean; message?: string } | undefined;

/**
 * Ejecuta una acción y traduce los errores de dominio a un mensaje para el formulario.
 * Cualquier otro error (incluidos redirect/notFound de Next) se propaga.
 */
export async function runAction(fn: () => Promise<void>, successMessage = "Guardado"): Promise<ActionState> {
  try {
    await fn();
    return { ok: true, message: successMessage };
  } catch (err) {
    if (err instanceof ValidationError || err instanceof ConflictError || err instanceof ForbiddenError) {
      return { ok: false, message: err.message };
    }
    if (err instanceof NotFoundError) return { ok: false, message: "No encontrado" };
    throw err;
  }
}

export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
