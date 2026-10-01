# 3. Arquitectura

## 3.1 Visión general

**Monolito modular**: una sola aplicación desplegable, dividida internamente en módulos con fronteras claras. Un proceso web y un proceso *worker* (mismo código) para trabajos en segundo plano.

```
                 ┌──────────────────────────── Aplicación (un contenedor) ────────────────────────────┐
Navegador ──────▶│  UI (rutas /p/[projectId]/…)                                                         │
 (personal       │        │                                                                            │
  Ideolab)       │        ▼                                                                            │
                 │  Acciones de servidor / API  ──▶  requireProjectAccess()  ──▶  ProjectContext        │
                 │        │                                                                            │
                 │        ▼                                                                            │
                 │  Servicios de módulo (casos de uso + reglas de negocio)                              │
                 │        │                       │                         │                          │
                 │        ▼                       ▼                         ▼                          │
                 │  Repositorios con ámbito    Puertos (interfaces)      Auditoría                     │
                 │  de proyecto                AI / Publishing /                                       │
                 │        │                    Metrics / Storage                                       │
                 └────────┼───────────────────────────┼───────────────────────────────────────────────┘
                          ▼                           ▼
                    PostgreSQL               Adaptadores: Manual (por defecto) │ Proveedor X (tras verificación)
                    (FKs compuestas,         Storage S3 (URLs firmadas)
                     auditoría)              Proveedor IA (desactivable)
```

### Decisiones de arquitectura (ADR resumidos)

| ADR | Decisión | Motivo |
|-----|----------|--------|
| 001 | Monolito modular, no microservicios | Equipo pequeño, un solo despliegue, transacciones simples |
| 002 | El **proyecto** es la frontera de aislamiento (tenant) | Autorización por proyecto (RE-04) y no mezclar clientes (RE-06) |
| 003 | Aislamiento en 3 capas: servicio, repositorio y base de datos | Un único fallo no debe bastar para filtrar datos |
| 004 | Puertos y adaptadores para IA, publicación, métricas, email y almacenamiento; el adaptador **manual** es el de referencia | Integraciones sustituibles (RE-10) |
| 005 | Contenido versionado e inmutable; la aprobación apunta a una versión | Lo publicado es exactamente lo aprobado (RE-05) |
| 006 | Salidas de IA en tablas propias, nunca sobrescriben datos originales | Separación original/IA (RE-07, RE-09) |
| 007 | Métricas inmutables con fuente obligatoria; las correcciones son filas nuevas | No inventar métricas (RE-08), trazabilidad |
| 008 | Ninguna ruta de código publica/envía sin aprobación humana registrada y acción humana explícita | RE-05 |
| 009 | Archivos en un **disco persistente de Render** detrás del puerto `StorageProvider` (`src/lib/storage`). Se sirven solo por `/p/[projectId]/archivos/[assetId]`, que autoriza cada descarga; no hay URLs públicas ni firmadas. El tipo se detecta por contenido (sin SVG/HTML) y el máximo es 25 MB | Sin otro proveedor que contratar; un adaptador S3 (p. ej. Cloudflare R2 en la UE) se puede añadir sin tocar los módulos si el volumen crece |
| 010 | Los enlaces externos (Drive, Canva) se admiten como referencia, marcados como "pueden cambiar fuera del Hub" | Lo aprobable de verdad son los archivos subidos, que son inmutables |

## 3.2 Módulos y límites de responsabilidad

Regla general: **un módulo solo accede a sus propias tablas**. Para leer o modificar datos de otro módulo usa su servicio público. Todas las funciones de servicio reciben un `ProjectContext` (excepto `identity` y la administración global).

| Módulo | Responsabilidad | Tablas propias | No hace |
|--------|-----------------|----------------|---------|
| `identity` | Usuarios, inicio de sesión, sesiones, lista de emails permitidos | `users`, `sessions`, `accounts` | Decidir permisos sobre proyectos |
| `access` | Membresías, roles, `requireProjectAccess`, matriz de permisos | `project_memberships` | Lógica de negocio |
| `projects` | Clientes, proyectos, canales, configuración (zona horaria, idioma) | `clients`, `projects`, `channels` | Contenidos |
| `cycles` | Ciclo mensual, brief, estados del ciclo, cierre | `cycles` | Contenidos individuales |
| `content` | Piezas planificadas, versiones, activos (ficheros) | `content_items`, `content_versions`, `assets`, `content_version_assets` | Aprobar o publicar |
| `approvals` | Máquina de estados de revisión; registra decisiones sobre versiones | `approvals` | Publicar |
| `publishing` | Registro de publicaciones/programaciones; verifica `approvals.isPublishable(version)` | `publications` | Publicar sin aprobación; aprobar |
| `metrics` | Catálogo de métricas, registro manual, importación CSV, adaptadores de lectura | `metric_definitions`, `metric_values` | Interpretar datos |
| `reports` | Informe mensual: secciones de datos, análisis humano, interpretación IA (marcada) | `reports`, `report_sections` | Calcular métricas inventadas |
| `ai` | Plantillas de prompt, construcción de contexto de un único proyecto, llamadas al proveedor, registro de generaciones | `ai_generations` | Escribir en contenidos o informes directamente |
| `integrations` | Registro de conexiones por proyecto, credenciales cifradas, adaptadores | `integration_connections` | Activar adaptadores no verificados |
| `audit` | Registro append-only de acciones relevantes | `audit_events` | — |
| `comments` | Comentarios sobre piezas/versiones/informes | `comments` | — |

### Flujo clave: de borrador IA a publicación

```
ai.generateCopyDraft(ctx, itemId)        → ai_generations (status = draft)        [nada cambia en content]
   │ humano pulsa "usar como base"
content.createVersion(ctx, itemId, {..., origin: 'ai_assisted', aiGenerationId})   → content_versions v3
   │ humano solicita revisión
approvals.requestReview(ctx, v3)
   │ humano (interno o registro de aprobación del cliente con evidencia)
approvals.decide(ctx, v3, 'approved', evidence)                                    → approvals
   │ cualquier edición crea v4 → v4 necesita su propia aprobación
publishing.recordManual(ctx, itemId, v3, url)   o   publishing.schedule(ctx, itemId, v3) (solo con adaptador verificado)
   └─ comprueba: v3 aprobada, v3 es la última versión, actor con permiso `publish`, acción humana explícita
```

## 3.3 Estructura de carpetas

```
marketing-project-hub/
├── docs/                         # Esta documentación + ADRs + verificaciones de integraciones
│   └── integraciones/            # Un informe de verificación por proveedor (doc. 07)
├── src/
│   ├── app/                      # Rutas y UI. Sin acceso directo a BD.
│   │   ├── (auth)/login/
│   │   ├── admin/                # Gestión global: proyectos, usuarios, membresías
│   │   └── p/[projectId]/        # Todo lo de un proyecto vive bajo este segmento
│   │       ├── page.tsx          # Resumen del proyecto
│   │       ├── ciclos/[period]/  # Plan, producción, revisión, publicación, métricas, informe
│   │       ├── canales/
│   │       └── ajustes/
│   ├── modules/
│   │   ├── identity/
│   │   ├── access/
│   │   │   ├── permissions.ts    # Matriz rol → permisos (fuente única)
│   │   │   └── require-project-access.ts
│   │   ├── projects/
│   │   ├── cycles/
│   │   ├── content/
│   │   │   ├── domain.ts         # Reglas puras (sin E/S)
│   │   │   ├── repo.ts           # Acceso a datos; exige ProjectContext
│   │   │   ├── service.ts        # Casos de uso; comprueba permisos; audita
│   │   │   └── schemas.ts        # Validación Zod de entrada
│   │   ├── approvals/
│   │   ├── publishing/
│   │   │   └── providers/        # manual.ts (por defecto) + adaptadores verificados
│   │   ├── metrics/
│   │   │   └── providers/        # manual.ts, csv.ts + adaptadores verificados
│   │   ├── reports/
│   │   ├── ai/
│   │   │   ├── providers/        # interfaz + implementación(es) + "disabled"
│   │   │   ├── prompts/          # Plantillas versionadas
│   │   │   └── context-builder.ts# Construye contexto de UN proyecto
│   │   ├── integrations/
│   │   ├── comments/
│   │   └── audit/
│   ├── lib/
│   │   ├── db/                   # Esquema Drizzle, cliente, migraciones (solo importable desde modules/*/repo.ts)
│   │   ├── storage/              # Claves projects/{projectId}/…, URLs firmadas
│   │   ├── jobs/                 # pg-boss; cada trabajo lleva projectId y se re-autoriza
│   │   └── crypto/               # Cifrado de secretos de integraciones
│   └── worker.ts                 # Entrada del proceso de trabajos
├── tests/
│   ├── isolation/                # Suite obligatoria de aislamiento (doc. 06)
│   ├── integration/
│   ├── e2e/                      # Playwright
│   └── fixtures/                 # Semillas con ≥ 2 proyectos SIEMPRE
├── drizzle/                      # Migraciones SQL generadas y revisadas
├── .github/workflows/ci.yml
├── Dockerfile
└── docker-compose.yml            # Postgres + almacenamiento S3 local para desarrollo
```

> **Estado tras F2:** existen los módulos `identity`, `access`, `projects`, `audit`, `cycles` y
> `content` (este último incluye por ahora los comentarios). Las
> piezas comunes de la UI están en `src/lib/project-page.ts` (entrada obligatoria de toda página
> o acción de proyecto) y `src/modules/identity/next.ts` (cookies y sesión en Next.js). Las
> pruebas viven en `tests/isolation`, `tests/integration`, `tests/lint` y `tests/e2e`.
>
> Los repositorios pueden **leer** tablas de otros módulos mediante JOIN para listados
> (p. ej. `access` lee `projects` para "mis proyectos"), pero solo **escriben** en las suyas.

Reglas comprobadas automáticamente (`no-restricted-imports` en `eslint.config.mjs`, verificadas por `tests/lint/boundaries.test.ts`):
- `src/app/**` no puede importar `src/lib/db/**` ni `modules/*/repo.ts`.
- `modules/X/**` no puede importar `modules/Y/repo.ts` (solo `modules/Y/service.ts`).
- Solo los `repo.ts` importan el cliente de base de datos.
- Ningún módulo salvo `integrations` y los `providers/` puede hacer llamadas HTTP salientes (regla por automatizar cuando existan integraciones).
