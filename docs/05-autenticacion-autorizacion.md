# 5. Autenticación y autorización por proyecto

## 5.1 Autenticación

| Aspecto | Decisión |
|---------|----------|
| Método | OAuth 2.0 con Google (código + PKCE, librería arctic). Solo entran emails dados de alta en `users` por un administrador. Opcionalmente se limita a un dominio de Google Workspace (`AUTH_GOOGLE_HOSTED_DOMAIN`). Sin contraseñas propias. |
| Alta de usuarios | Solo un administrador da de alta emails. Un login con email no permitido se rechaza y se audita. El primer administrador se crea con `BOOTSTRAP_ADMIN_EMAILS`. |
| Sesiones | En base de datos, cookie `HttpOnly`, `Secure`, `SameSite=Lax`; caducidad por inactividad (p. ej. 8 h) y absoluta (p. ej. 30 días); revocables al desactivar un usuario. |
| Protección | CSRF (incluida en acciones de servidor/librería de auth), cabeceras de seguridad (CSP, HSTS), rate limiting en login. |
| 2FA | Delegada en la cuenta de Google (recomendar obligatoria en la organización). |

## 5.2 Modelo de autorización

Dos niveles:

1. **Global**: `users.is_admin`. El administrador gestiona clientes, proyectos, usuarios y membresías (la estructura). **No** tiene acceso implícito a los datos de los proyectos: para verlos tiene que asignarse como miembro, y esa asignación queda auditada (mínimo privilegio).
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

Implementación: `src/modules/access/context.ts` (resumen).

```ts
export async function requireProjectAccess(actor, projectId, permission = "project.read"): Promise<ProjectContext> {
  const membership = isUuid(projectId) ? await findMembership(actor.userId, projectId) : undefined;
  if (!membership) {                       // también si el proyecto no existe
    await auditDenied(actor, projectId, permission, "not_member");
    throw new NotFoundError();             // 404, no 403: no revelar que el proyecto existe
  }
  const ctx = Object.freeze({ projectId, actor, role: membership.role, projectArchived }) as ProjectContext;
  await authorize(ctx, permission);        // ForbiddenError + auditoría si falta el permiso
  return ctx;
}
```

`ProjectContext` es un tipo "marcado": solo esta función puede crearlo, así que el compilador impide llamar a un servicio de proyecto sin haber pasado por la comprobación.

Capas de defensa:

1. **Entrada (UI/acción de servidor)**: toda página bajo `/p/[projectId]` usa `projectContextForPage` y toda acción `projectContextForAction` (`src/lib/project-page.ts`). Cualquier `projectId` o ID de recurso que llegue del navegador (URL, formulario o argumento ligado) se trata como no fiable: la seguridad no depende de su origen, sino de que siempre se autoriza y los recursos se buscan dentro del proyecto autorizado.
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
