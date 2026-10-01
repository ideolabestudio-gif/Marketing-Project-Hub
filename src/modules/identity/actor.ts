import { ForbiddenError } from "@/lib/errors";

/** Usuario autenticado que realiza una acción. Solo se obtiene validando una sesión. */
export type Actor = Readonly<{
  userId: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
}>;

export function assertAdmin(actor: Actor): void {
  if (!actor.isAdmin) throw new ForbiddenError("Solo un administrador puede hacer esto");
}
