/**
 * Matriz de permisos por rol de proyecto. Es la ÚNICA fuente de verdad: la UI, los
 * servicios y la prueba HT-03 la leen de aquí. Ver docs/05-autenticacion-autorizacion.md.
 */
export const ROLES = ["manager", "editor", "reviewer", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "project.read",
  "project.settings",
  "cycle.manage",
  "content.write",
  "ai.generate",
  "approval.internal",
  "approval.client.record",
  "publish",
  "metrics.write",
  "report.write",
  "report.approve",
  "integration.manage",
  "comment.write",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  manager: PERMISSIONS,
  editor: [
    "project.read",
    "content.write",
    "ai.generate",
    "publish",
    "metrics.write",
    "report.write",
    "comment.write",
  ],
  reviewer: ["project.read", "approval.internal", "report.approve", "comment.write"],
  viewer: ["project.read"],
};

/** Permisos que siguen disponibles cuando el proyecto está archivado. */
export const READ_ONLY_PERMISSIONS: readonly Permission[] = ["project.read"];

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  manager: "Responsable de cuenta",
  editor: "Editor",
  reviewer: "Revisor",
  viewer: "Solo lectura",
};
