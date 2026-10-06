@AGENTS.md

# Marketing Project Hub — reglas para asistentes de IA

Aplicación interna de Ideolab para el ciclo mensual de redes sociales y email marketing de varios clientes. Lee `docs/` antes de cambios de diseño; el plan por fases está en `docs/08-plan-implementacion.md`.

## Principios que ningún cambio puede romper
1. Nada se publica ni se envía sin aprobación humana registrada sobre una versión concreta y una acción humana explícita. No crees trabajos programados que publiquen o envíen.
2. Los datos de clientes distintos no se mezclan nunca (el **proyecto** es la frontera de aislamiento).
3. Lo generado por IA va en tablas propias y no sobrescribe datos originales.
4. No inventes métricas ni capacidades de APIs. No escribas código de integración (Metricool, MailerLite…) sin un informe de verificación aprobado en `docs/integraciones/` (ver `docs/07-integraciones.md`).
5. Toda integración tiene un modo manual equivalente.

## Arquitectura (resumen)
- `src/modules/<módulo>/`: `service.ts` (casos de uso, permisos, auditoría), `repo.ts` (único sitio con acceso a BD), `permissions.ts`/`context.ts` en `access`.
- Toda función de servicio con datos de un proyecto recibe `ProjectContext` como primer argumento y llama a `authorize(ctx, permiso)`. Solo `requireProjectAccess` crea un `ProjectContext`.
- Toda consulta de un `repo.ts` con datos de proyecto filtra por `ctx.projectId`; las búsquedas por ID son siempre `(project_id, id)`.
- Páginas bajo `/p/[projectId]`: empiezan con `projectContextForPage`. Acciones de servidor: `projectContextForAction`. Ambas en `src/lib/project-page.ts`.
- La UI (`src/app`, `src/components`) no importa `@/lib/db` ni ningún `repo.ts` (lo impide el lint).
- Tablas nuevas con datos de cliente: `project_id NOT NULL` con FK a `projects`, `UNIQUE (project_id, id)` y FKs compuestas `(project_id, x_id)` hacia otras tablas de proyecto. Lo comprueba `tests/isolation/db-schema.test.ts`.
- Esquema en `src/lib/db/schema/`; migraciones con `npm run db:generate` (nunca edites a mano una migración ya publicada).
- Archivos: solo mediante `src/lib/storage` desde los servicios; se sirven únicamente por `/p/[projectId]/archivos/[assetId]` tras autorizar. Nunca URLs públicas.
- Versiones de contenido, sus archivos, las decisiones de revisión y la auditoría son inmutables (triggers): cambiar algo = crear una fila nueva.
- El estado de una pieza (en revisión, aprobada, programada…) NO se guarda: lo calcula `src/modules/review` a partir de hechos inmutables. No añadas columnas de estado que puedan desincronizarse.
- Publicar = registrar lo que una persona hizo fuera del Hub. Un trigger de BD rechaza publicaciones sin las aprobaciones exigidas. `tests/lint/no-external-publishing.test.ts` falla si aparece `fetch`, http o un planificador en `src/`.
- Textos de la UI en español.

## Al añadir funcionalidad
- Cada función nueva exportada por un `service.ts` debe añadirse a `tests/isolation/service-cases.ts` (si no, falla la prueba de cobertura). Si recibe IDs de recursos, define su caso `foreign` con IDs del proyecto B.
- Cada página nueva bajo `/p/[projectId]` queda cubierta automáticamente por `tests/e2e/route-isolation.spec.ts`; si tiene segmentos dinámicos nuevos, añade su valor de ejemplo en `fill()` y en `tests/e2e/seed.ts`.
- Datos de ejemplo para pruebas: amplía `tests/fixtures/two-projects.ts` en los DOS proyectos, con el marcador de cada uno.
- Registra en auditoría (`recordAudit`) toda escritura relevante.

## Comandos
- `npm run check`: lint + tipos + pruebas (necesita PostgreSQL; `TEST_DATABASE_URL`, por defecto `postgres://postgres@localhost:5432/postgres`).
- `npm run build && npm run test:e2e`: pruebas HTTP contra la app compilada.
- Ejecuta `npm run check` antes de cada commit. No desactives ni saltes pruebas para conseguir verde.
