# 5. Autenticación y autorización por proyecto

## 5.1 Autenticación

| Aspecto | Decisión |
|---------|----------|
| Método | OAuth con Google. Si Ideolab usa Google Workspace, restringir al dominio; si no, **lista de emails permitidos** (`allowed_emails`). Sin contraseñas propias. |
| Alta de usuarios | Solo un administrador añade emails a la lista. Un login con email no permitido se rechaza y se audita. |
| Sesiones | En base de datos, cookie `HttpOnly`, `Secure`, `SameSite=Lax`; caducidad por inactividad (p. ej. 8 h) y absoluta (p. ej. 30 días); revocables al desactivar un usuario. |
| Protección | CSRF (incluida en acciones de servidor/librería de auth), cabeceras de seguridad (CSP, HSTS), rate limiting en login. |
| 2FA | Delegada en la cuenta de Google (recomendar obligatoria en la organización). |

## 5.2 Modelo de autorización

Dos niveles:

1. **Global**: `users.is_admin`. El administrador gestiona clientes, proyectos, usuarios y membresías. Su acceso a datos de proyectos queda **auditado**.
2. **Por proyecto**: `project_memberships.role`. Sin membresía no hay acceso de ningún tipo al proyecto.

### Roles por proyecto

| Rol | Pensado para |
|-----|--------------|
| `manager` | Responsable de cuenta del cliente |
| `editor` | Community manager / redactor / diseñador |
| `reviewer` | Revisor interno (dirección, calidad) |
| `viewer` | Consulta (p. ej. dirección, otra área) |

### Matriz de permisos (fuente única en `modules/access/permissions.ts`)

| Permiso | manager | editor | reviewer | viewer |
|---------|:------:|:------:|:-------:|:------:|
| `project.read` | ✔ | ✔ | ✔ | ✔ |
| `project.settings` (canales, zona horaria, IA on/off) | ✔ | | | |
| `cycle.manage` (abrir, cambiar estado, cerrar) | ✔ | | | |
| `content.write` (crear piezas y versiones, subir activos) | ✔ | ✔ | | |
| `ai.generate` (pedir borradores) | ✔ | ✔ | | |
| `approval.internal` | ✔ | | ✔ | |
| `approval.client.record` (registrar aprobación del cliente con evidencia) | ✔ | | | |
| `publish` (registrar/ordenar publicación de versión aprobada) | ✔ | ✔ | | |
| `metrics.write` (manual / CSV) | ✔ | ✔ | | |
| `report.write` | ✔ | ✔ | | |
| `report.approve` | ✔ | | ✔ | |
| `integration.manage` | ✔ (y admin) | | | |
| `comment.write` | ✔ | ✔ | ✔ | |

Reglas adicionales independientes del rol:
- **Separación de funciones**: quien crea una versión no puede darle la aprobación interna (configurable por proyecto; activado por defecto).
- Ciclo `closed` ⇒ solo lectura para todos.
- Proyecto `archived` ⇒ solo lectura; solo admin puede reactivarlo.

## 5.3 Cómo se aplica en el código

```ts
// modules/access/require-project-access.ts
export async function requireProjectAccess(
  session: Session, projectId: string, permission: Permission,
): Promise<ProjectContext> {
  const membership = await findMembership(session.userId, projectId);   // una consulta
  if (!membership && !session.isAdmin) {
    await audit.accessDenied(session, projectId, permission);
    throw new NotFoundError();          // 404, no 403: no revelar que el proyecto existe
  }
  if (!can(membership?.role, permission, session.isAdmin)) {
    await audit.accessDenied(session, projectId, permission);
    throw new ForbiddenError();
  }
  return Object.freeze({ projectId, userId: session.userId, role: membership?.role ?? 'admin' });
}
```

Capas de defensa:

1. **Entrada (UI/acción de servidor)**: toda ruta bajo `/p/[projectId]` obtiene un `ProjectContext` con `requireProjectAccess`. El `projectId` sale **solo de la URL** y se valida; nunca de un campo oculto de formulario.
2. **Servicio**: las funciones públicas de cada módulo exigen `ProjectContext` como primer argumento (el tipo lo obliga) y vuelven a comprobar el permiso concreto.
3. **Repositorio**: todas las consultas añaden `WHERE project_id = ctx.projectId`; las búsquedas por ID son siempre `(project_id, id)`. Un helper `scoped(ctx)` lo hace por construcción; consultas sin él no pasan revisión ni lint.
4. **Base de datos**: FKs compuestas impiden referencias cruzadas entre proyectos (doc. 04). RLS opcional después.
5. **Ficheros**: claves `projects/{projectId}/…`; bucket privado; URLs firmadas de corta duración emitidas solo tras `requireProjectAccess`.
6. **Trabajos en segundo plano**: la carga útil incluye `projectId` y `requestedBy`; el worker reconstruye el contexto y re-autoriza (la membresía pudo cambiar).
7. **IA**: `ai/context-builder.ts` recibe un `ProjectContext` y solo puede cargar datos a través de repositorios con ese contexto; comprueba que todos los `input_refs` pertenecen al proyecto antes de llamar al proveedor.
8. **Listados globales** (p. ej. "mis proyectos", panel de pendientes): siempre parten de `project_memberships` del usuario.

## 5.4 Garantías sobre publicación/envío

- No existe ningún trabajo programado ni disparador que publique sin una acción humana registrada en `publications.authorized_by`.
- `publishing` comprueba en la misma transacción: versión aprobada según las etapas requeridas, versión vigente (no hay otra más nueva), permiso `publish`, proyecto/ciclo no cerrado.
- Los adaptadores de integración comienzan con capacidades de solo lectura o de "crear borrador / enviar a revisión en la herramienta externa" cuando existan y estén verificadas. La publicación directa por API se habilita, si se desea, como paso separado y explícito por proyecto.
