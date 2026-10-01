# 6. Pruebas de aislamiento de datos entre clientes

Objetivo: demostrar de forma automática y en cada cambio que **un usuario de un proyecto no puede leer, modificar, referenciar ni inferir datos de otro proyecto**, y que la IA y los procesos en segundo plano tampoco mezclan datos.

## 6.1 Fixture estándar

Todas las pruebas de integración usan una semilla con al menos:

| Elemento | Proyecto A (cliente Alfa) | Proyecto B (cliente Beta) |
|----------|---------------------------|---------------------------|
| Usuarios | `ana` (manager A), `edu` (editor A) | `bea` (manager B) |
| Usuario en ambos | `mix` (viewer A, editor B) | |
| Datos | ciclo, canales, piezas, versiones, activos, aprobaciones, métricas, informe, generaciones IA | ídem, con textos marcadores únicos (`ALFA-SECRET-…`, `BETA-SECRET-…`) |

Los marcadores permiten buscar en cualquier respuesta (HTML, JSON, prompt, fichero) si aparece texto del otro proyecto.

Se ejecutan contra **PostgreSQL real** (Testcontainers), no contra mocks.

## 6.2 Batería de pruebas

### Capa de base de datos (`tests/isolation/db.*.test.ts`)
| ID | Prueba | Resultado esperado |
|----|--------|--------------------|
| DB-01 | Insertar `content_versions` con `project_id = B` y `content_item_id` de A | Error de FK |
| DB-02 | Ligar un activo de B a una versión de A | Error de FK |
| DB-03 | Registrar aprobación en proyecto A sobre versión de B | Error de FK |
| DB-04 | `metric_values` de A con `channel_id` de B | Error de FK |
| DB-05 | `report_sections` de A con `ai_generation_id` de B | Error de FK |
| DB-06 | Para **cada** tabla con `project_id`, existe al menos una FK compuesta o está en la lista blanca justificada | Prueba de esquema (introspección de `information_schema`) que falla si se añade una tabla nueva sin cumplirlo |
| DB-07 | `UPDATE`/`DELETE` sobre `audit_events`, `approvals`, `metric_values`, `content_versions` con el rol de la app | Denegado |

### Capa de repositorio/servicio
| ID | Prueba | Resultado esperado |
|----|--------|--------------------|
| SV-01 | Cada función `list*` con contexto A | Ningún resultado contiene `BETA-SECRET` |
| SV-02 | Cada función `get*(ctx A, idDeB)` | `NotFound` |
| SV-03 | Cada función de escritura con `ctx A` e IDs de B (en cualquier argumento, incluidos anidados) | `NotFound`, sin efectos en BD |
| SV-04 | Comentario con `target_id` de B desde A | Rechazado |
| SV-05 | `mix` con contexto A no puede escribir (viewer) aunque sea editor en B | `Forbidden` |
| SV-06 | Revocar membresía y reintentar con la misma sesión | Acceso denegado inmediatamente |

Las pruebas SV-01..03 se **generan** recorriendo el registro de servicios exportados por cada módulo, para que un servicio nuevo quede cubierto sin escribir la prueba a mano (y falle si no declara su caso de prueba).

### Capa HTTP / rutas
| ID | Prueba | Resultado esperado |
|----|--------|--------------------|
| HT-01 | Matriz: para cada ruta y acción de servidor bajo `/p/[projectId]`, usuario de A con `projectId = B` | 404 y respuesta sin marcadores de B |
| HT-02 | Usuario de A con `projectId = A` pero ID de recurso de B en la URL o el cuerpo | 404 |
| HT-03 | Matriz de permisos completa (rol × permiso) generada desde `permissions.ts` | Coincide con la tabla del doc. 05 |
| HT-04 | Sin sesión | Redirección a login, sin datos |
| HT-05 | Denegaciones generan `audit_events` `access.denied` | Evento registrado |

### Ficheros
| ID | Prueba | Resultado esperado |
|----|--------|--------------------|
| FS-01 | Pedir URL firmada de un activo de B desde A | 404 |
| FS-02 | Clave de almacenamiento generada siempre con prefijo `projects/{projectId}/` | Verificado para toda subida |
| FS-03 | Acceso directo al bucket sin firma | Denegado |

### IA
| ID | Prueba | Resultado esperado |
|----|--------|--------------------|
| AI-01 | `context-builder` con `ctx A` e `input_refs` que incluyen un ID de B | Excepción antes de llamar al proveedor |
| AI-02 | Prompt construido para A (proveedor simulado que captura la entrada) | No contiene `BETA-SECRET` |
| AI-03 | La generación se guarda en `ai_generations` y **no** modifica `content_versions` ni `report_sections` | Sin cambios hasta acción humana |
| AI-04 | Proyecto con `ai_enabled = false` | Generación rechazada |

### Trabajos en segundo plano
| ID | Prueba | Resultado esperado |
|----|--------|--------------------|
| JB-01 | Trabajo con `projectId = A` y referencias a B | Falla sin efectos |
| JB-02 | Trabajo encolado por usuario que pierde la membresía antes de ejecutarse | Se cancela al re-autorizar |

### Exportaciones e informes
| ID | Prueba | Resultado esperado |
|----|--------|--------------------|
| EX-01 | Informe/exportación de A | Solo contiene datos de A (búsqueda de marcadores en el HTML/PDF generado) |
| EX-02 | Panel "mis pendientes" de `mix` | Muestra A y B separados y etiquetados; `edu` solo ve A |

### E2E (Playwright)
| ID | Prueba |
|----|--------|
| E2E-01 | `ana` inicia sesión, navega por todo A; manipula la URL a B ⇒ 404 |
| E2E-02 | `mix` cambia entre A y B; ningún dato persiste de un proyecto al otro (caché, formularios, selección) |

## 6.3 Pruebas de los principios de flujo (complementarias)

| ID | Prueba | Resultado esperado |
|----|--------|--------------------|
| WF-01 | Publicar una versión sin aprobación | Rechazado |
| WF-02 | Aprobar v3, crear v4, intentar publicar v3 o v4 | Rechazado (v3 no vigente, v4 sin aprobar) |
| WF-03 | Aprobación de cliente sin evidencia | Rechazado |
| WF-04 | Autor intenta aprobar internamente su propia versión | Rechazado (si separación de funciones activa) |
| WF-05 | Versión `ai_assisted` sin `ai_generation_id` | Rechazado (CHECK) |
| WF-06 | Aprobar informe con sección `ai_interpretation` sin revisar | Rechazado |
| WF-07 | Sección de datos del informe sin métricas registradas | Muestra "sin dato", nunca un valor estimado |
| WF-08 | Búsqueda en el código: ningún trabajo programado invoca `publish`/`send` de adaptadores | Prueba estática en CI |

## 6.4 Política de CI

- La suite `tests/isolation` y `WF-*` se ejecuta en cada PR y **bloquea el merge** si falla.
- Cobertura obligatoria: todo servicio exportado y toda ruta bajo `/p/[projectId]` deben aparecer en las matrices generadas (la prueba falla si hay uno sin cubrir).
- Cualquier tabla nueva debe pasar DB-06.

## 6.5 Estado de implementación (tras F1)

| Prueba | Estado | Dónde |
|--------|--------|-------|
| Fixture de dos proyectos con marcadores | ✅ | `tests/fixtures/two-projects.ts` |
| DB-06 (toda tabla con `project_id` tiene FK a projects; toda FK hacia tabla de proyecto es compuesta; tablas referenciables por `(project_id, id)`) | ✅ | `tests/isolation/db-schema.test.ts` |
| DB-07 (auditoría inmutable: UPDATE, DELETE y TRUNCATE prohibidos) | ✅ | `tests/isolation/db-schema.test.ts` |
| DB-01, DB-02 y referencias cruzadas de piezas y comentarios; CHECK de la clave de archivo; inmutabilidad de versiones y archivos | ✅ F2 | `tests/isolation/db-content.test.ts` |
| DB-03..05 | ⏳ F3–F5 | Con aprobaciones, métricas e IA; DB-06 obliga a que cumplan el patrón |
| SV-01..03, generadas desde el registro de servicios; la prueba falla si un servicio nuevo no está clasificado | ✅ | `tests/isolation/service-isolation.test.ts` + `service-cases.ts` |
| SV-05 (rol distinto en cada proyecto), SV-06 (retirar la membresía corta el acceso) | ✅ | `tests/isolation/access.test.ts` |
| HT-01 (todas las páginas de `/p/[projectId]`, descubiertas leyendo el sistema de ficheros) | ✅ | `tests/e2e/route-isolation.spec.ts` |
| HT-03 (matriz rol × permiso igual a la documentada y aplicada contra BD) | ✅ | `tests/isolation/access.test.ts` |
| HT-04 (sin sesión, sesión falsa o usuario desactivado ⇒ login) | ✅ | `tests/e2e/route-isolation.spec.ts` |
| HT-05 (denegaciones auditadas) | ✅ | `tests/isolation/access.test.ts` |
| Fronteras entre capas (lint) | ✅ | `tests/lint/boundaries.test.ts` |
| HT-02 (proyecto A en la URL con una pieza de B) | ✅ F2 | `tests/e2e/route-isolation.spec.ts` |
| FS-01 (archivo de B pedido desde A o con la URL de B ⇒ 404; sin sesión ⇒ 401), cabeceras seguras | ✅ F2 | `tests/e2e/route-isolation.spec.ts` |
| FS-02 (clave siempre bajo el prefijo del proyecto) | ✅ F2 | CHECK en BD + `tests/integration/content.test.ts` |
| FS-03 (sin acceso directo) | ✅ por diseño | El disco no se expone; solo la ruta autorizada sirve archivos |
| E2E-01 (navegador real: recorrer A y manipular la URL hacia B) | ✅ F2 | `tests/e2e/browser.spec.ts` |
| AI-*, JB-*, EX-*, WF-* | ⏳ | Con sus fases (F3–F5) |

Comprobación de que las pruebas detectan fugas: al quitar a propósito el filtro `project_id` de dos consultas de canales, fallan SV-01 y SV-02/03 en esas funciones; al quitarlo de la búsqueda de archivos, falla SV-02 de `getAssetFile` (y `removeAsset` sigue protegido por una segunda comprobación).
