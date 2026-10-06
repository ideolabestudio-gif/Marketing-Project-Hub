# 8. Plan incremental de implementación

Cada fase termina con algo desplegado en el entorno de pruebas y con sus criterios de aceptación verificados (automáticamente cuando sea posible). Ninguna fase empieza sin que la anterior cumpla sus criterios.

```
F0 Cimientos ─▶ F1 Acceso y aislamiento ─▶ F2 Ciclo y contenidos ─▶ F3 Aprobación y publicación manual
     ─▶ F4 Métricas e informe ─▶ ★ HITO: ciclo completo de un cliente piloto (manual)
     ─▶ F5 Borradores IA ─▶ F6 Verificación de integraciones ─▶ F7 Primer adaptador ─▶ F8 Endurecimiento
```

La IA (F5) va después del hito a propósito: el ciclo debe funcionar sin IA. Si se prefiere, F5 puede adelantarse a antes del hito, porque está desacoplada.

---

### F0 · Cimientos — ✅ código hecho · ⏳ despliegue pendiente de cuentas
**Alcance:** repositorio, Next.js + TypeScript estricto, Drizzle + migraciones, Docker Compose (Postgres local), lint con reglas de fronteras entre módulos, Vitest y Playwright contra PostgreSQL real, CI en GitHub Actions, despliegue en Render (Frankfurt), copias de seguridad de BD. El almacenamiento de ficheros (S3) se añade en F2, cuando haga falta.

**Criterios de aceptación**
- [x] `docker compose up -d db` + `npm run db:migrate` + `npm run dev` levantan la app en local.
- [x] CI ejecuta lint, tipos, comprobación de migraciones, pruebas, build y pruebas HTTP; un error de tipos o de lint hace fallar el PR.
- [x] Una importación prohibida (p. ej. `app/` → `lib/db`) hace fallar el lint (`tests/lint/boundaries.test.ts`).
- [ ] Despliegue automático desde `main`, con migraciones al arrancar (preparado en `render.yaml`; falta crear el servicio en Render, ver doc. 09).
- [ ] Copia de seguridad diaria configurada y **una restauración probada** (tras crear la BD en Render).

### F1 · Identidad, proyectos y aislamiento — ✅ hecho (falta probar el login real con Google tras el despliegue)
**Alcance:** login con Google + lista de permitidos, sesiones, administración de clientes/proyectos/canales/usuarios/membresías, `requireProjectAccess`, matriz de permisos, auditoría, fixture de dos proyectos y **toda la infraestructura de pruebas de aislamiento** (doc. 06).

**Criterios de aceptación**
- [x] Un email no permitido no puede entrar; el intento queda auditado (lógica probada en `identity.test.ts`; el intercambio con Google se probará con credenciales reales).
- [x] El admin crea un cliente, un proyecto con zona horaria y canales, y asigna roles (probado también en navegador).
- [x] Un usuario solo ve en "mis proyectos" aquellos con membresía.
- [x] HT-01, HT-03, HT-04, HT-05, SV-05, SV-06, DB-06 pasan.
- [x] Desactivar un usuario invalida sus sesiones activas.

### F2 · Ciclo mensual y contenidos — ✅ hecho
**Alcance:** abrir ciclo `AAAA-MM`, brief, vista de calendario y de lista, piezas por canal y formato, versiones inmutables con historial y comparación, subida de archivos servidos solo tras autorizar (y enlaces externos), comentarios.

**Criterios de aceptación**
- [x] Se crea el ciclo de un mes para un proyecto; no se puede duplicar el mismo mes.
- [x] Se planifican piezas en el calendario con fecha en la zona horaria del proyecto (probado con cambio de horario).
- [x] Editar una pieza crea una versión nueva; las anteriores se pueden consultar y comparar (palabra a palabra, y archivos añadidos o quitados).
- [x] Los archivos solo se descargan tras autorización, por una ruta que comprueba la membresía en cada petición (FS-01..03). Se descartan las URLs firmadas: no hacen falta con almacenamiento en disco propio.
- [x] DB-01, DB-02, SV-01..04, HT-02 y E2E-01 pasan.

Pendiente fuera del código: en Render, el disco persistente (`render.yaml`) necesita plan de pago.

### F3 · Revisión, aprobación y publicación manual — ✅ hecho
**Alcance:** flujo de revisión (enviar → aprobación interna → respuesta del cliente con evidencia), separación de funciones, registro manual de programación/publicación (fecha, URL, ID externo), cancelación de programaciones, panel "Pendiente de mí", estados con color en el calendario. Opciones por proyecto: exigir o no al cliente y separación de funciones.

**Criterios de aceptación**
- [x] Solo se puede registrar publicación de la **última versión aprobada** en las etapas exigidas (servicio + trigger de BD).
- [x] Editar tras aprobar obliga a reaprobar (la versión nueva nace sin aprobaciones); una pieza programada o publicada no se puede editar.
- [x] La aprobación de cliente exige quién respondió y evidencia (servicio + CHECK de BD).
- [x] No existe en el código ninguna llamada externa ni planificador (WF-08).
- [x] WF-01..04 y DB-03 pasan.
- [x] Toda decisión y publicación queda en auditoría con usuario y hora.

Limitación conocida: la evidencia del cliente es texto (p. ej. resumen o enlace al email); adjuntar un archivo de evidencia queda para más adelante.

### F4 · Métricas e informe mensual
**Alcance:** catálogo de métricas con definiciones, alta manual, importación CSV con mapeo y previsualización, correcciones como filas nuevas, informe con secciones de datos (renderizadas desde `metric_values`) y análisis humano, aprobación del informe, exportación HTML/PDF, cierre del ciclo con aprendizajes.

**Criterios de aceptación**
- [ ] Toda métrica muestra su fuente (manual/CSV/integración) y quién la registró.
- [ ] Una corrección no borra el valor anterior; el historial es visible.
- [ ] Si falta una métrica, el informe muestra "sin dato", nunca un valor estimado (WF-07).
- [ ] El informe exportado solo contiene datos del proyecto (EX-01).
- [ ] Cerrar el ciclo lo deja en solo lectura.

### ★ HITO · Ciclo completo de un cliente piloto
**Criterios de aceptación**
- [ ] El equipo gestiona **un mes real** de un cliente piloto de principio a fin en el Hub: planificación, producción, aprobación, registro de publicaciones, métricas, informe entregado y cierre.
- [ ] Lista de fricciones recogida y priorizada con el equipo.
- [ ] Decisión explícita sobre qué automatizar primero (IA, métricas, programación) basada en tiempo real invertido.

### F5 · Borradores con IA
**Alcance:** puerto `AiProvider` con implementación `disabled` y una real (según D-07), plantillas de prompt versionadas, `context-builder` de un solo proyecto, generación de borradores de copy/asuntos de email/ideas e interpretación de informe, almacenamiento en `ai_generations`, UI que marca claramente lo generado por IA, límite de gasto por proyecto.

**Criterios de aceptación**
- [ ] La IA está desactivada por defecto por proyecto.
- [ ] Una generación nunca modifica contenidos ni informes por sí sola (AI-03).
- [ ] Usar un borrador crea una versión `ai_assisted` vinculada a la generación (WF-05).
- [ ] La interpretación IA del informe aparece en una sección distinta y marcada; el informe no se aprueba sin revisarla (WF-06).
- [ ] La IA solo recibe métricas registradas; no se le pide producir cifras nuevas.
- [ ] AI-01, AI-02, AI-04, JB-01, JB-02 pasan.

### F6 · Verificación de integraciones (sin código de producción)
**Alcance:** informes de verificación (doc. 07) de las herramientas que use Ideolab (D-04), con pruebas reales en cuentas de prueba.

**Criterios de aceptación**
- [ ] Un informe por proveedor candidato con decisión implementar/posponer/descartar.
- [ ] Lista de capacidades confirmadas con evidencia; nada se da por supuesto.

### F7 · Primer adaptador (solo lectura de métricas, recomendado)
**Criterios de aceptación**
- [ ] Credenciales cifradas por proyecto; conexión de un proyecto no es usable por otro.
- [ ] Las métricas importadas llevan `source = integration` y referencia al import.
- [ ] Si la integración falla o se desactiva, el modo manual sigue funcionando sin cambios.
- [ ] Solo se exponen en la UI las capacidades verificadas.

### F8 · Endurecimiento y siguientes pasos (a decidir tras el hito)
Candidatos: RLS en PostgreSQL, portal de aprobación para clientes (D-03), adaptador de "enviar a revisión" en la herramienta de programación, plantillas de ciclo, duplicar ciclo anterior, panel multi-cliente para dirección, revisión de seguridad externa.

---

## Próximos pasos

1. **Ideolab**: probar F2 y F3 con datos reales de **Cerveza Byra** (piezas, revisión, respuesta del cliente, registro de publicación) y apuntar las fricciones.
2. Empezar **F4 · Métricas e informe mensual** (cierra el ciclo y lleva al hito del piloto).
3. Pendiente de F0: copias de seguridad con restauración probada cuando se pase a un plan de pago.
