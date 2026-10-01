# 2. Comparativa de stack

## 2.1 Criterios

Ponderación pensada para un MVP interno mantenido por un equipo pequeño:

| Criterio | Peso | Qué se valora |
|----------|------|---------------|
| Mantenibilidad | 30 % | Pocas piezas, stack convencional, tipado, facilidad para que otra persona lo retome |
| Seguridad | 30 % | Facilidad para garantizar aislamiento por proyecto, auth madura, superficie de ataque |
| Velocidad de desarrollo | 25 % | CRUD + flujos de aprobación + UI interactiva (calendario, revisión) |
| Coste | 15 % | Infraestructura y dependencia de proveedor |

## 2.2 Opciones evaluadas

### A. Monolito TypeScript: Next.js + PostgreSQL + Drizzle ORM
- **Pros:** un solo lenguaje de extremo a extremo y tipos compartidos; UI interactiva (calendario editorial, vista de revisión) sin un segundo framework; ecosistema enorme; despliegue como un único contenedor; el modelo relacional vive en PostgreSQL y es portable.
- **Contras:** no trae panel de administración ni sistema de permisos: hay que construir la capa de autorización (es pequeña y, de todos modos, la queremos explícita); Next.js cambia con frecuencia, conviene fijar versiones.

### B. Django + HTMX + PostgreSQL
- **Pros:** "baterías incluidas": autenticación, admin, migraciones, formularios y permisos; muy productivo para aplicaciones internas tipo CRUD; muy estable.
- **Contras:** para vistas muy interactivas (arrastrar piezas en un calendario) habría que añadir JS; dos lenguajes si el equipo es web/JS. Los permisos nativos de Django son por modelo, no por proyecto: igualmente habría que construir el aislamiento por proyecto.

### C. Supabase (Postgres + Auth + Storage + RLS) + frontend Next.js
- **Pros:** muy rápido de arrancar; Row Level Security nativa como capa de aislamiento; storage incluido.
- **Contras:** la lógica de negocio crítica (flujo de aprobación, "no publicar sin aprobar") acaba repartida entre políticas SQL, funciones y frontend, más difícil de probar y razonar; mayor acoplamiento a un proveedor; un error en una política RLS expone datos directamente al cliente.

### D. Laravel + Livewire/Inertia
- **Pros:** muy productivo, maduro, buen ecosistema de colas y auth.
- **Contras:** solo recomendable si el equipo ya trabaja en PHP.

### E. No-code (Airtable/Notion + Make/Zapier)
- **Descartada.** No permite garantizar aislamiento por cliente ni impedir publicaciones sin aprobación de forma verificable; las automatizaciones son difíciles de auditar y probar.

## 2.3 Puntuación (1 = peor, 5 = mejor)

| Opción | Mantenibilidad | Seguridad | Velocidad | Coste | **Total ponderado** |
|--------|---------------|-----------|-----------|-------|---------------------|
| A. Next.js + Postgres + Drizzle | 4 | 4 | 4 | 4 | **4,00** |
| B. Django + HTMX | 5 | 4 | 4 | 4 | **4,30** |
| C. Supabase + Next.js | 3 | 3 | 5 | 4 | **3,65** |
| D. Laravel | 4 | 4 | 4 | 4 | **4,00** |

La diferencia entre A y B es pequeña y depende casi por completo de **qué lenguaje domina el equipo** (decisión D-01). Las puntuaciones son juicio de diseño, no medidas.

## 2.4 Recomendación

En puntuación pura, **Django (B) queda ligeramente por delante** por su estabilidad y por traer administración, auth y migraciones de serie. La diferencia está dentro del margen de error de una valoración subjetiva, así que el factor decisivo es el lenguaje del equipo (D-01):

- **Si el equipo trabaja en JavaScript/TypeScript** (lo más habitual en un estudio con perfil web) → **opción A, monolito modular en TypeScript**. Es la opción que se detalla en el resto de documentos.
- **Si el equipo trabaja en Python o no tiene preferencia** → **opción B, Django + HTMX**. La arquitectura, el modelo de datos, la autorización y las pruebas de esta documentación se aplican igual; solo cambia la estructura de carpetas (cada módulo pasa a ser una *app* de Django con `models.py`, `services.py`, `selectors.py` y `views.py`).

Motivos a favor de A cuando el equipo es JS/TS:
1. La parte más diferencial de la UI (calendario editorial, comparación de versiones, vista previa por red) es interactiva.
2. Un único lenguaje y tipos compartidos reducen errores entre servidor y cliente.
3. La autorización por proyecto hay que construirla en cualquier opción; en A queda explícita y bajo control en una sola capa.

### Stack concreto propuesto (opción A)

| Pieza | Elección | Motivo |
|-------|----------|--------|
| Lenguaje | TypeScript (modo `strict`) | Tipado de extremo a extremo |
| Framework | Next.js (App Router), versión fijada | Servidor + UI en un despliegue |
| Base de datos | PostgreSQL gestionado (región UE) | Relacional, FKs compuestas, RLS opcional, JSONB para instantáneas |
| ORM / migraciones | Drizzle ORM + migraciones SQL versionadas | Cercano a SQL, migraciones revisables |
| Validación | Zod | Validar toda entrada en el borde del servidor |
| Autenticación | Google OAuth (código + PKCE) con la librería **arctic** + sesiones propias en BD (token aleatorio; en BD solo su hash) | Flujo pequeño y auditable; sin depender de un framework de auth; sesiones revocables al instante |
| Colas / trabajos | pg-boss (cola sobre PostgreSQL), cuando haga falta (F5) | Evita Redis; suficiente para el volumen esperado |
| Ficheros | Almacenamiento compatible S3 en la UE, URLs firmadas de corta duración | Ficheros nunca públicos |
| UI | Tailwind CSS + componentes shadcn/ui | Rápido y mantenible |
| Pruebas | Vitest (unitarias/integración) y Playwright (HTTP/E2E), siempre contra PostgreSQL real (servicio de GitHub Actions en CI) | Aislamiento probado contra BD real |
| Despliegue | Render (Frankfurt) con runtime Node nativo (`npm ci && npm run build` / `npm start`) + PostgreSQL gestionado con copias de seguridad. Ver doc. 09 | Mismos comandos que en local y en CI; sin Docker que mantener. Es un Node estándar, portable a otro proveedor |
| CI | GitHub Actions: lint, typecheck, pruebas, pruebas de aislamiento | Bloquea merges si falla aislamiento |

### Coste orientativo
Para el volumen supuesto (S-01), la infraestructura de un MVP de este tipo suele estar en el orden de **decenas de euros al mes** (contenedor pequeño + Postgres gestionado + almacenamiento). Es una estimación de orden de magnitud: hay que confirmarla con los precios vigentes del proveedor elegido. El coste de la IA depende del uso y se controla con límites por proyecto.
