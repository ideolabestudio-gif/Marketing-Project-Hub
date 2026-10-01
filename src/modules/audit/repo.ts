import { getDb } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";

export type AuditEntry = {
  action: string;
  actorId?: string | null;
  projectId?: string | null;
  entityType?: string;
  entityId?: string;
  data?: Record<string, unknown>;
};

export async function insertAuditEvent(entry: AuditEntry): Promise<void> {
  await getDb()
    .insert(auditEvents)
    .values({
      action: entry.action,
      actorId: entry.actorId ?? null,
      projectId: entry.projectId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId,
      data: entry.data,
    });
}
