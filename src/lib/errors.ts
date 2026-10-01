/**
 * Errores de dominio. Los servicios lanzan estos errores; la capa de UI los traduce
 * (404, mensaje de formulario…). Nunca se incluyen datos de otro proyecto en el mensaje.
 */
export class DomainError extends Error {}

/** El recurso no existe o el usuario no puede saber que existe. */
export class NotFoundError extends DomainError {
  constructor(message = "No encontrado") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "No tienes permiso para esta acción") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends DomainError {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
