import { insertAuditEvent, type AuditEntry } from "./repo";

export type { AuditEntry };

/**
 * Registra un evento de auditoría. Las acciones usan el formato `<entidad>.<verbo>`
 * (p. ej. `channel.created`, `access.denied`).
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  await insertAuditEvent(entry);
}
