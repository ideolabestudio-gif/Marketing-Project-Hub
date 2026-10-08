# Vigilancia competitiva — Estudio de viabilidad (fase 0)

> Fecha: 08/10/2026 · Estado: **pendiente de validación** · No se ha escrito código.
>
> Este documento estudia una **aplicación nueva e independiente** del Marketing Project Hub. Se guarda aquí solo porque es el repositorio disponible; el producto debe vivir en su propio repositorio (ver §3.4).

**Leyenda de fiabilidad** usada en las tablas:
- ✅ **Verificado**: comprobado en documentación oficial o en una consulta real durante este estudio.
- 🟡 **Por confirmar**: fuentes secundarias coherentes, pero hay que confirmarlo con una prueba real antes de construir el conector.
- ❌ **No posible** por la vía oficial.

---

## 1. Qué quieres conseguir

Una herramienta de **inteligencia competitiva**, no de reputación propia. El flujo central es:

> **Elegir empresas y sus cuentas concretas → definir palabras clave (por empresa, globales y por grupos) → detectar cuándo esas cuentas publican algo relacionado (literal o conceptualmente) → recibir una alerta, inmediata o en el dashboard, sin duplicados.**

Elementos clave que he entendido:

| Concepto | Qué es |
|---|---|
| **Empresa monitorizada** | Nombre, descripción, web, sector, tipo (competidor / cliente / referente). |
| **Fuente** | Una cuenta o URL concreta de esa empresa: `@empresaA` en Instagram, su canal de YouTube, su blog, su feed RSS… **No** se busca el nombre de la empresa en toda la red: se lee lo que publica *esa cuenta*. |
| **Keyword** | Término a vigilar. Ámbito: de una empresa o global. Pertenece a un **grupo** (Productos, Negocio, Marketing, Tecnología…). Prioridad: **crítica** (alerta inmediata) o **normal** (solo dashboard / resumen). |
| **Publicación** | Lo que publica una fuente: texto, fecha, URL, plataforma. Se conserva como histórico consultable. |
| **Coincidencia** | Publicación × keyword. Tipo **exacta** (aparece literalmente) o **semántica** (la IA la relaciona conceptualmente, con % de confianza). |
| **Alerta** | Notificación (email, Slack, Telegram, Teams, webhook) agrupando publicaciones casi idénticas de la misma empresa en varias redes. |
| **Análisis** | Resumen breve por IA, estadísticas por empresa y comparativa entre competidores por grupo de keywords. |

Restricciones que tomo como requisitos, no como preferencias:
- Solo **APIs oficiales, fuentes públicas pensadas para ser consumidas (RSS, sitemaps) o proveedores con licencia**. Nada de scraping que viole términos de uso.
- **Nunca prometer "tiempo real"** si la fuente no lo permite: cada fuente declara su frecuencia real.
- **Nada de datos inventados**: una fuente no conectada se muestra como "pendiente"; los mocks solo existen en desarrollo y pruebas.

---

## 2. Qué fuentes puedes monitorizar realmente

### 2.1 Resumen

| Fuente | ¿Se puede? | Método recomendado | Coste aprox. | Frecuencia real | Limitaciones principales |
|---|---|---|---|---|---|
| **Web / blog con RSS** | ✅ Sí | Lectura del feed RSS/Atom | 0 € | 15–60 min (sondeo) | Solo si la web publica feed. |
| **Web sin RSS** | ✅ Sí, con cuidado | `sitemap.xml` (`lastmod`) y, como último recurso, detección de cambios en 1–3 páginas concretas (blog, prensa) respetando `robots.txt` | 0 € | 1–24 h | Frágil si cambia el HTML; frecuencia baja por respeto al sitio. |
| **YouTube** | ✅ Sí | Notificaciones push oficiales (WebSub) + feed RSS del canal; YouTube Data API para detalles | 0 € (cuota gratuita 10.000 unidades/día) | **Casi tiempo real** (push) | El feed RSS muestra ~15 últimos vídeos; directos aparecen al terminar. |
| **X (Twitter)** | ✅ Sí | API oficial de X, lectura del timeline de cada cuenta | **Pago por uso: 0,005 $ por post leído** | 5–15 min (sondeo) | Prepago de créditos; coste lineal con el volumen. |
| **Instagram** | 🟡 Sí, con condiciones | Opción A: **Metricool (competidores)**, que ya usáis. Opción B: Instagram Graph API — *Business Discovery* | A: incluido en plan Advanced. B: 0 € | A: la de Metricool (probablemente diaria, por confirmar). B: 15–60 min | Solo cuentas **profesionales** (empresa/creador) públicas. Sin stories. B exige cuenta IG profesional propia vinculada a página de Facebook y app de Meta. |
| **Facebook (páginas)** | 🟡 Difícil por API directa | Opción A: **Metricool (competidores)**. Opción B: Graph API con *Page Public Content Access* | A: incluido. B: 0 € pero requiere verificación de empresa + revisión de Meta | A: la de Metricool. B: 15–60 min | B: aprobación incierta y lenta. |
| **LinkedIn (páginas de empresa)** | ❌ No por API | **Modo manual asistido** (ver §2.3) | 0 € | Manual | La API oficial solo permite leer páginas que tú administras. No hay vía oficial para leer páginas de terceros. |
| **TikTok** | ❌ No (orgánico) | Modo manual. Anuncios: *Commercial Content API* (solo UE) | 0 € | Manual | La *Research API* es solo para academia/ONG; prohíbe uso comercial. |
| **Reddit** | 🟡 Limitado | API oficial previa aprobación (Responsible Builder Policy) | Uso comercial: precio a negociar | 15–60 min | Desde nov. 2025 toda clave nueva requiere aprobación manual; uso comercial necesita acuerdo escrito. Baja prioridad: las empresas rara vez publican ahí. |
| **Noticias / notas de prensa** | ✅ Sí | Feeds de sala de prensa de cada empresa, Google Alerts (RSS), GDELT (gratuito); proveedor de pago opcional | 0 € (opciones gratuitas) / desde ~100–450 $/mes (pago) | 15 min – 24 h | Cobertura variable; verificar términos de uso de cada servicio. |
| **Bluesky** *(extra)* | ✅ Sí | API pública abierta (AT Protocol) | 0 € | Casi tiempo real | Poca presencia de empresas en España, pero coste cero. |
| **Threads** *(extra)* | 🟡 Por confirmar | Threads API | 0 € | — | Hay que verificar si permite leer perfiles de terceros. |

**Conclusión de viabilidad:** el objetivo principal **es alcanzable** con fuentes legales para **web/blog/RSS, noticias, YouTube y X** con calidad alta, y para **Instagram y Facebook** a través de Metricool o de la API de Meta con condiciones. **LinkedIn y TikTok no se pueden automatizar legalmente** hoy: se cubrirán con un modo manual asistido que entra en el mismo flujo de keywords y alertas.

### 2.2 Respuestas a tus preguntas (punto 21)

| Pregunta | Respuesta |
|---|---|
| ¿Puedo monitorizar una cuenta de Instagram de otra empresa? | **Sí, si es una cuenta profesional** (empresa o creador) pública. Con la API *Business Discovery* de Instagram consultas el perfil y sus publicaciones recientes usando **tu** cuenta profesional. Cuentas personales: no. 🟡 |
| ¿Puedo saber cuándo publica? | Sí, pero **por sondeo** (consultar cada X minutos), no por aviso push. Fecha de publicación incluida (`timestamp`). |
| ¿Puedo acceder al texto/caption? | Sí. ✅ Verificado en Metricool: sus datos de "publicaciones de competidores" de Instagram y Facebook incluyen **texto, fecha con hora, URL, imagen, likes, comentarios**. Por Business Discovery: campo `caption` según documentación de Meta 🟡 (confirmar en prueba). |
| ¿Puedo analizar hashtags? | Sí: los hashtags vienen dentro del texto. Buscar *por* hashtag en todo Instagram es otra API (máx. 30 hashtags distintos cada 7 días) y no es el objetivo principal. |
| ¿Puedo monitorizar LinkedIn de una empresa? | **No con la API oficial.** La *Community Management API* solo da acceso a páginas que administras y requiere ser partner. Los proveedores que lo ofrecen hacen scraping (Proxycurl cerró en 2025 tras una demanda de LinkedIn). Solución: modo manual asistido. |
| ¿Puedo monitorizar X? | **Sí**, con la API oficial de pago por uso (0,005 $ por post devuelto). Lectura del timeline de cada cuenta. ✅ (precio en docs.x.com) |
| ¿Puedo monitorizar TikTok? | **No** para contenido orgánico de terceros con fines comerciales. La *Research API* excluye explícitamente a usuarios comerciales. La *Commercial Content API* sí da **anuncios** (solo UE), lo que puede ser útil como señal secundaria. |
| ¿Puedo monitorizar YouTube? | **Sí, y es la mejor fuente**: notificaciones push oficiales (WebSub) cuando un canal sube un vídeo o cambia título/descripción, gratis. ✅ |
| ¿Puedo recibir los datos mediante API? | Sí para web/RSS, YouTube, X, Instagram/Facebook (con condiciones), Bluesky y noticias. No para LinkedIn ni TikTok. |
| ¿Necesito que la empresa monitorizada me autorice? | **No** para las vías indicadas: se lee contenido público mediante APIs que lo permiten. Lo que sí necesitas es **tu propia** cuenta/app autorizada (cuenta profesional de Instagram, app de Meta, cuenta de desarrollador de X, plan de Metricool). |
| ¿Alternativas legales vía RSS o terceros? | Sí: RSS de webs y salas de prensa, RSS de YouTube, Google Alerts en formato RSS, GDELT, **Metricool** (que tiene acuerdos con las plataformas) y plataformas de *social listening* con licencia (Brandwatch, Talkwalker, Meltwater: 800–3.000 €/mes, fuera de presupuesto para el MVP). Se descartan "scrapers" tipo Apify/Bright Data por riesgo de incumplir términos de uso. |

### 2.3 Detalle por fuente

#### Web, blog, notas de prensa (RSS) — ✅ prioridad 1
- **Método:** RSS/Atom de la web. Autodetección de feeds a partir de la URL (`<link rel="alternate">`, `/feed`, `/rss`). Si no hay feed: `sitemap.xml` con `lastmod` para descubrir URLs nuevas y leer solo esas.
- **Reglas de respeto:** respetar `robots.txt`, `User-Agent` identificable, cabeceras `ETag`/`If-Modified-Since`, máx. 1 petición por sitio cada 15 min. Solo se guarda título, extracto y URL (derechos de autor: no se republica el contenido completo).
- **Coste:** 0 €. **Dificultad:** baja.

#### YouTube — ✅ prioridad 1
- **Método:** suscripción WebSub al hub de Google con el topic del canal (push casi inmediato al subir vídeo o cambiar título/descripción). La suscripción caduca (~10 días): renovarla automáticamente. Respaldo por sondeo del RSS `youtube.com/feeds/videos.xml?channel_id=…`. Data API v3 (`playlistItems.list`, 1 unidad/llamada) para descripción completa.
- **Requisitos:** clave de API de Google Cloud (gratis). Para push, URL pública HTTPS para recibir avisos.
- **Coste:** 0 €. **Dificultad:** baja-media.

#### X — ✅ prioridad 2
- **Método:** `GET /2/users/:id/tweets` con `since_id` para traer solo lo nuevo.
- **Coste (verificado en docs.x.com):** 0,005 $ por post leído; las consultas sin resultados no devuelven recursos. Créditos prepago con límite de gasto configurable. Ejemplo: 20 cuentas × 60 posts/mes = 1.200 posts ≈ **6 $/mes**.
- 🟡 Confirmar en la consola de desarrollador: tope mensual y si la deduplicación diaria aplica a nuestro caso.
- **Dificultad:** baja.

#### Instagram — 🟡 prioridad 2
Dos vías legales; recomiendo **empezar por Metricool** porque ya lo pagáis y es un intermediario con acuerdos con Meta.
- **A. Metricool (competidores):** ✅ verificado en vuestra conexión de Metricool que el conector "competitor posts" de Instagram y Facebook devuelve: competidor, id de post, imagen, **texto**, **fecha y hora**, likes, comentarios, interacciones, engagement y **URL**. Metricool admite competidores en Instagram, Facebook, X, YouTube, Twitch y Bluesky (no LinkedIn ni TikTok). Acceso por API solo en plan **Advanced** o superior.
  🟡 Por confirmar: cada cuánto actualiza Metricool los datos de competidores, cuántos competidores por marca admite vuestro plan y si los términos de su API permiten este uso.
- **B. Instagram Graph API — Business Discovery:** consulta `business_discovery.username(empresaA){media{caption,permalink,timestamp,…}}` con el token de vuestra cuenta profesional. Requiere: cuenta IG profesional propia vinculada a una página de Facebook, app de Meta y permisos `instagram_basic` / `pages_read_engagement`. Para uso interno (solo usuarios con rol en la app) probablemente baste el acceso estándar sin revisión de app 🟡. Límite de llamadas ligado a la cuenta (cifras contradictorias entre fuentes: 200/h o fórmula por impresiones) → sondeo cada 15–60 min es seguro para decenas de cuentas.
- **No disponible en ninguna vía:** stories, cuentas personales, contenido privado.

#### Facebook — 🟡 prioridad 3
- **A. Metricool** (igual que Instagram). ✅ datos verificados.
- **B. Graph API** con la funcionalidad *Page Public Content Access* (documentación oficial actualizada en julio 2026): exige **verificación de empresa** y **revisión de app**; sin ello solo se leen páginas cuyos administradores tienen rol en la app. Aprobación incierta. Solo tiene sentido si Metricool no cubre la frecuencia necesaria.

#### LinkedIn — ❌ modo manual asistido
No hay API oficial para leer publicaciones de páginas que no administras, y LinkedIn persigue el scraping. Propuesta legal:
1. **Captura con un clic**: extensión de navegador o *bookmarklet* propio que, cuando **una persona** está viendo una publicación en LinkedIn, envía texto + URL + empresa a la app. Entra en el mismo motor de keywords, IA y alertas. Es lectura humana normal, no automatizada.
2. **Pegar publicación**: formulario rápido (texto + URL).
3. **Señales indirectas**: muchas empresas replican lo importante en su web, blog o nota de prensa, que sí se vigilan automáticamente.
La UI mostrará LinkedIn como **"Manual — sin conexión automática disponible"**.

#### TikTok — ❌ modo manual
Mismo modo manual que LinkedIn. Opcional futuro: *Commercial Content API* para ver anuncios de una marca en la UE (requiere solicitud; 1–2 semanas).

#### Reddit — 🟡 baja prioridad
Las empresas rara vez publican en Reddit; su valor está en menciones, que no es el objetivo. Si se quisiera: solicitar acceso a la API (aprobación manual, 2–4 semanas, uso comercial con acuerdo y precio a negociar). Fuera del MVP.

#### Noticias — ✅ prioridad 2
- **Gratis:** RSS de la sala de prensa de cada empresa; **Google Alerts** con entrega por RSS (`"Empresa A"`) — producto pensado para esto; **GDELT DOC API** (gratuita, cobertura internacional, 15 min).
- **De pago (opcional, si falta cobertura):** NewsAPI.ai/Event Registry, NewsData.io, NewsAPI.org (su plan gratuito no permite producción). Precios entre ~100 y ~450 $/mes 🟡. *Bing News Search API* ya no existe (retirada en 2025).
- Nota: aquí sí se busca el **nombre** de la empresa (las noticias las publican terceros); se etiquetará como fuente "Noticias", distinta de las cuentas propias.

---

## 3. Arquitectura recomendada

### 3.1 Vista general

```
┌──────────────┐   ┌──────────────────────────────────────────────────────────┐
│  FRONTEND    │   │                      BACKEND (API)                        │
│  Next.js     │◄─►│  Empresas · Fuentes · Keywords · Publicaciones · Alertas  │
└──────────────┘   └───────────────┬──────────────────────────────────────────┘
                                   │ PostgreSQL (datos + cola de trabajos)
        ┌──────────────────────────┼──────────────────────────────┐
        ▼                          ▼                              ▼
┌───────────────┐   ┌─────────────────────────────┐   ┌─────────────────────┐
│  SCHEDULER    │──►│  WORKER                      │──►│  ALERT ENGINE       │
│  (por fuente, │   │  1. Conector.fetch()         │   │  agrupa, decide     │
│  según su     │   │  2. Normalizar → Publicación │   │  inmediata/resumen  │
│  frecuencia   │   │  3. Deduplicar               │   └─────────┬───────────┘
│  real)        │   │  4. Keyword engine (exacto)  │             ▼
└───────────────┘   │  5. Semantic engine (IA)     │   ┌─────────────────────┐
  Webhooks push ───►│  6. AI analysis (resumen)    │   │  NOTIFICATIONS      │
  (YouTube WebSub)  └─────────────────────────────┘   │  email·Slack·Telegram│
                                                       │  Teams·webhook       │
                                                       └─────────────────────┘
```

### 3.2 Módulos

| Módulo | Responsabilidad |
|---|---|
| `connectors/<fuente>` | Un adaptador por fuente con la **misma interfaz**: `capabilities()` (qué datos da, frecuencia mínima real, si es push o sondeo, credenciales necesarias), `validateTarget()` (comprueba que la cuenta existe y es accesible), `fetchSince(cursor)` → lista de publicaciones normalizadas + nuevo cursor. Estado visible: `conectado` · `pendiente de credenciales` · `no disponible (manual)` · `error`. |
| `connectors/manual` | Entrada humana (formulario, extensión de navegador). Mismo formato de salida. |
| `ingestion` | Normaliza, guarda la publicación **original inmutable** (texto, URL, fecha de publicación, fecha de detección, fuente) y aplica idempotencia por `(fuente, id_externo)`. |
| `dedup` | Huella del texto normalizado (*SimHash/MinHash*) para agrupar la misma publicación en varias redes de la misma empresa en una ventana de 72 h → **grupo de publicación**. Opcionalmente confirmación por IA en casos dudosos. |
| `keyword-engine` | Coincidencia **exacta**: normaliza mayúsculas, tildes y variantes (`IA`/`I.A.`), límites de palabra (que "IA" no salte con "ag**ia**"), frases, sinónimos manuales y exclusiones. Determinista y gratis. |
| `semantic-engine` | Coincidencia **semántica** con IA: recibe la publicación + keywords/grupos aplicables y devuelve, por keyword, si está relacionada, **confianza** y una justificación breve. Umbral configurable (p. ej. ≥ 75 %). |
| `ai-analysis` | Resumen de 1–2 frases y tema principal. Guardado en tabla propia, separado del texto original. |
| `alert-engine` | Reglas: keyword crítica → alerta inmediata; normal → dashboard y resumen diario/semanal opcional. Una alerta por **grupo** de publicación (no por red). Ventana de silencio y límite por hora para evitar avalanchas. |
| `notifications` | Canales intercambiables: email, Slack (incoming webhook), Telegram (Bot API), Teams (**Workflows**; los conectores de Office 365 se retiraron en mayo de 2026), webhook genérico firmado con HMAC. Registro de cada envío y reintentos. |
| `scheduler` | Programa cada fuente según `max(frecuencia pedida, frecuencia mínima real del conector)`. Cola en PostgreSQL (p. ej. `pg-boss` o `graphile-worker`): sin Redis. |
| `analytics` | Estadísticas y comparativa calculadas **solo** a partir de publicaciones y coincidencias registradas. Si una fuente no está conectada, se indica ("sin datos de LinkedIn") en lugar de mostrar 0. |

### 3.3 Modelo de datos (borrador)

```
workspaces ─┬─ companies (nombre, web, sector, tipo, descripción)
            │     └─ sources (plataforma, identificador, url, conector, estado,
            │                 frecuencia_pedida, frecuencia_efectiva, cursor, último_ok, último_error)
            ├─ keyword_groups (Productos, Negocio…)
            ├─ keywords (término, grupo, ámbito: global|empresa, prioridad: crítica|normal,
            │            sinónimos, exclusiones, semántica_activada)
            ├─ posts (source, id_externo, url, texto, publicado_en, detectado_en,
            │         huella, post_group_id)          ← inmutable
            ├─ post_groups (empresa, publicación representativa, plataformas[])
            ├─ matches (post, keyword, tipo: exacta|semántica, confianza, justificación,
            │           origen: regla|ia, modelo)
            ├─ ai_outputs (post, tipo: resumen|clasificación, contenido, modelo, coste)
            ├─ alerts (post_group, keywords[], prioridad, estado: nueva|vista|archivada)
            ├─ alert_deliveries (alert, canal, enviado_en, resultado)
            ├─ notification_channels (tipo, destino, credenciales cifradas)
            └─ read_state (usuario, post_group, leído_en)
```

Retención: configurable por espacio de trabajo (30 / 90 / 365 días o indefinido); búsqueda de texto completo con PostgreSQL (`tsvector` en español) — suficiente para decenas de miles de publicaciones sin motor de búsqueda externo.

### 3.4 Por qué un repositorio separado del Hub
El Marketing Project Hub prohíbe por diseño las llamadas HTTP salientes y los planificadores en `src/` (su prueba `no-external-publishing` fallaría). Esta herramienta **necesita** ambas cosas. Además, su modelo de datos no está ligado a proyectos de cliente. Conviene un repositorio propio, reutilizando stack y convenciones (Next.js, PostgreSQL, Drizzle, servicios con permisos y auditoría) para que el equipo no tenga que aprender nada nuevo. Más adelante el Hub podría consumir sus datos por API.

---

## 4. Stack tecnológico

| Capa | Elección | Motivo |
|---|---|---|
| Lenguaje | TypeScript en todo | Mismo stack que el Hub; tipos compartidos entre conectores, worker y UI. |
| Frontend + API | Next.js (App Router) + Tailwind + componentes tipo shadcn/ui | Interfaz limpia estilo Linear/Vercel sin construir un sistema de diseño desde cero. |
| Base de datos | PostgreSQL + Drizzle ORM | Relacional, búsqueda de texto completo en español incluida, sirve también de cola. |
| Cola / planificador | `pg-boss` (o `graphile-worker`) sobre PostgreSQL | Reintentos, trabajos programados y concurrencia sin Redis. |
| Worker | Proceso Node separado (mismo código) | Las consultas a fuentes no bloquean la web. |
| Parsing RSS | `rss-parser` o `feedsmith` | Maduros, RSS/Atom. |
| IA | API de Claude (Anthropic SDK) | Ver §5. |
| Email | Resend o Postmark | Entregabilidad y plan gratuito suficiente. |
| Auth | Igual que el Hub (OAuth con Google Workspace vía `arctic`) | Uso interno. |
| Despliegue | Un contenedor web + un contenedor worker + PostgreSQL gestionado (Railway, Render, Fly.io o un VPS en la UE) | Barato; datos en la UE por RGPD. |
| Pruebas | Vitest + fixtures grabadas de cada API (sin llamadas reales) | Cada conector se prueba contra respuestas reales guardadas. |

---

## 5. Servicios externos necesarios

| Servicio | Para qué | Credencial | Coste | Dificultad |
|---|---|---|---|---|
| **Anthropic (Claude)** | Coincidencia semántica, resumen, confirmar duplicados | API key | Ver §6 | Baja |
| **Google Cloud (YouTube Data API)** | Detalle de vídeos, resolver `@handle` → `channel_id` | API key | 0 € (10.000 unidades/día) | Baja |
| **YouTube WebSub** (hub de Google) | Push de vídeos nuevos | Ninguna (URL pública HTTPS) | 0 € | Media |
| **X API** | Timeline de cuentas | Cuenta de desarrollador + créditos | 0,005 $/post | Baja |
| **Metricool API** | Posts de competidores en Instagram/Facebook (y X/YouTube como respaldo) | Token de usuario + `blogId` | Incluido en plan Advanced (ya contratado o a contratar; desde ~43–53 €/mes según tramo) | Baja |
| **Meta (Instagram Graph API)** *(alternativa a Metricool)* | Business Discovery | App de Meta + cuenta IG profesional + página FB | 0 € | Media |
| **Email transaccional** (Resend/Postmark) | Alertas por email | API key | 0 € hasta ~3.000 emails/mes | Baja |
| **Slack** | Alertas | Incoming webhook | 0 € | Baja |
| **Telegram** | Alertas | Bot token (BotFather) | 0 € | Baja |
| **Microsoft Teams** | Alertas | URL de webhook de **Workflows** | 0 € (incluido en M365) | Baja |
| **Google Alerts / GDELT** | Noticias | Ninguna | 0 € | Baja |

---

## 6. Coste estimado

**Supuesto de volumen (escenario base):** 20 empresas × 4 fuentes automáticas × ~1 publicación/día ≈ **80 publicaciones/día ≈ 2.400/mes**.

### 6.1 IA (precios oficiales de Anthropic, octubre 2026)

| Modelo | Uso | Precio entrada / salida (por millón de tokens) |
|---|---|---|
| `claude-haiku-5-5` | Coincidencia semántica + resumen de **todas** las publicaciones | 0,10 $ / 0,50 $ |
| `claude-sonnet-5-5` | Solo casos dudosos o análisis semanal comparativo | 2 $ / 10 $ |

Por publicación con Haiku: ~1.500 tokens de entrada (texto + keywords aplicables) y ~250 de salida ≈ **0,0003 $**.
- 2.400 publicaciones/mes → **~0,70 $/mes**. Con 10× volumen → ~7 $/mes.
- Con *prompt caching* de las keywords y procesado por lotes (Batch API, 50 % de descuento) para lo no urgente, aún menos.
- Conclusión: **la IA no es un coste relevante**. Se puede analizar todo, no hace falta prefiltrar.

### 6.2 Total mensual

| Partida | Escenario mínimo (sin X ni Metricool) | Escenario base | Escenario amplio (60 empresas) |
|---|---|---|---|
| Hosting (web + worker + PostgreSQL) | 10–25 € | 15–30 € | 30–60 € |
| IA (Claude) | < 1 € | 1–2 € | 5–10 € |
| X API | 0 € | 5–10 € | 20–40 € |
| Metricool Advanced | 0 € | 0 € si ya está contratado / ~45–55 € si no | ~85–110 € (más marcas) |
| Email / Slack / Telegram / Teams | 0 € | 0 € | 0–20 € |
| Noticias de pago (opcional) | 0 € | 0 € | 100–450 € |
| **Total** | **~10–25 €/mes** | **~20–100 €/mes** | **~150–700 €/mes** |

🟡 Precios de terceros a reconfirmar en el momento de contratar.

---

## 7. MVP recomendado

**Objetivo del MVP:** demostrar con datos reales el ciclo *cuenta concreta → keyword → detección → alerta* en las fuentes con vía oficial clara.

**Incluye:**
1. Crear empresas (nombre, web, sector, tipo, descripción).
2. Añadir fuentes con **validación** al guardarlas ("✓ feed encontrado, 10 entradas" / "✗ esta cuenta no es profesional").
3. Keywords por empresa y globales, con grupos, prioridad (crítica/normal), sinónimos y exclusiones.
4. **Conectores reales en el MVP:**
   - Web/blog/prensa por **RSS** (+ autodetección de feed).
   - **YouTube** (WebSub + RSS de respaldo).
   - **Noticias** por Google Alerts RSS.
   - **Manual** (formulario + bookmarklet) para LinkedIn, TikTok y cualquier otra.
5. Coincidencia exacta + **semántica con Claude Haiku** (tipo, confianza, justificación).
6. Resumen automático de cada publicación con coincidencias.
7. Deduplicación entre fuentes de la misma empresa.
8. Alertas inmediatas por **email** para keywords críticas; resto en el dashboard.
9. Dashboard "Hoy", ficha de empresa e histórico con búsqueda y filtros (empresa, plataforma, keyword, grupo, fecha, tipo de coincidencia, leído, alerta enviada).
10. Panel de **estado de fuentes** (última lectura correcta, errores, frecuencia real).

**Prueba de concepto antes del MVP (1–2 días, recomendada):** con 3 empresas reales:
- Leer el RSS de sus webs y sus canales de YouTube.
- Consultar `getAnalyticsDataByMetrics` de Metricool con el conector *competitor posts* para ver **frecuencia y retraso real** de los datos de Instagram/Facebook.
- Una llamada de Business Discovery para confirmar `caption` y límites.
- Una llamada a X con 1 cuenta para confirmar el coste facturado.
Resultado: un informe por fuente en `docs/` (como exige la metodología del Hub para integraciones) antes de escribir cada conector definitivo.

**Fuera del MVP:** Instagram, Facebook y X (fase 2), Slack/Telegram/Teams/webhook (fase 2), estadísticas y comparativa (fase 3), Reddit, TikTok anuncios, multiusuario avanzado.

---

## 8. Roadmap

| Fase | Contenido | Duración orientativa |
|---|---|---|
| **0. Validación** *(este documento)* | Estudio de viabilidad + prueba de concepto de fuentes | 1–2 días |
| **1. MVP** | §7: empresas, fuentes, keywords, RSS, YouTube, noticias, manual, IA, dedup, email, dashboard, histórico | 3–4 semanas |
| **2. Redes sociales** | Conector Metricool (Instagram, Facebook; X y YouTube como respaldo), conector X directo, decisión Business Discovery vs Metricool. Canales Slack, Telegram, Teams, webhook. Resumen diario por email | 2–3 semanas |
| **3. Inteligencia competitiva** | Ficha de empresa con estadísticas (publicaciones/semana, keywords, temas, evolución); comparativa entre competidores por grupo; resumen semanal generado por IA ("qué ha hecho la competencia esta semana") | 2 semanas |
| **4. Ampliaciones** | Extensión de navegador para captura manual en LinkedIn/TikTok; Bluesky; Threads (si la API lo permite); TikTok anuncios (UE); noticias de pago; exportación CSV; integración con el Hub | según prioridad |

---

## 9. Riesgos técnicos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **LinkedIn y TikTok sin API** — probablemente donde más publican algunos competidores B2B | Alto | Modo manual asistido de un clic; vigilar web/prensa como señal paralela; revisar la situación cada 6 meses. Comunicarlo con claridad en la UI. |
| **Cambios de políticas/precios** de Meta, X o Reddit (ya ocurrió: X pasó a pago por uso, Reddit exige aprobación, Teams retiró conectores) | Alto | Conectores aislados tras una interfaz común; límites de gasto; alerta interna si una fuente falla N veces; cada fuente puede pasar a "manual" sin romper nada. |
| **Frecuencia real de Metricool** desconocida (puede ser diaria) | Medio | Medirla en la prueba de concepto; si es insuficiente para keywords críticas, usar Business Discovery para esas cuentas. |
| **Falsos positivos semánticos** (alertas que no interesan) | Medio | Umbral de confianza configurable; keywords críticas solo alertan de inmediato con coincidencia exacta **o** semántica ≥ 85 %; botón "no relevante" que alimenta ejemplos negativos en el prompt. |
| **Falsos negativos** (se pierde algo importante) | Medio | Coincidencia exacta siempre activa además de la semántica; histórico re-analizable si se añade una keyword nueva. |
| **Deduplicación imperfecta** (textos adaptados por red) | Bajo | Huella + similitud + confirmación por IA en la zona gris; la UI muestra "también publicado en…". |
| **Webs sin RSS / HTML cambiante** | Bajo | Sitemap primero; detección de cambios solo en páginas concretas y a baja frecuencia; marcar la fuente como "frágil". |
| **Instagram: cuentas no profesionales** | Bajo | Validación al dar de alta la fuente, con mensaje claro. |
| **Coste de X si se vigilan muchas cuentas muy activas** | Bajo | Límite de gasto mensual en la consola de X y contador en la app. |
| **RGPD** — se tratan datos de empresas, pero los posts pueden contener nombres de personas | Bajo-medio | Solo cuentas corporativas; base legal de interés legítimo documentada; retención configurable con borrado automático; no se perfilan personas; datos alojados en la UE; las publicaciones se envían a la IA solo para clasificarlas. |
| **Derechos de autor** | Bajo | Se guarda texto para análisis interno y se enlaza al original; no se republica ni se descargan imágenes/vídeos. |

---

## 10. Propuesta de UX

Principio: **responder en 10 segundos a "¿qué ha publicado hoy la competencia que me interesa?"**. Sin gráficos decorativos.

### Navegación (barra lateral, estilo Linear)
`Hoy` · `Actividad` · `Empresas` · `Keywords` · `Comparar` · `Fuentes` · `Ajustes`

### 1. Hoy (pantalla de inicio)
```
Hoy · miércoles 8 de octubre                               [ Buscar…  ⌘K ]

  18 empresas    34 publicaciones hoy    126 coincidencias    7 alertas nuevas

  🔴 ALERTAS NUEVAS
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ Empresa A · LinkedIn + Facebook · hace 35 min        [inteligencia artif.]│
  │ "Hoy presentamos nuestro nuevo producto basado en inteligencia artificial"│
  │ Resumen IA: Lanza una solución de IA para automatizar procesos           │
  │ industriales.                     Exacta · nuevo producto  Semántica 91 % │
  │                                   [Ver publicación ↗] [Marcar leída] [No relevante]
  └──────────────────────────────────────────────────────────────────────────┘

  ACTIVIDAD RECIENTE
  Empresa   Canal     Keyword            Tipo        Fecha        Estado
  Empresa B YouTube   contratación       Exacta      10:02        ● no leída
  Empresa C Blog      nueva sede         Semántica   09:40        ✓ leída
```

### 2. Actividad (histórico)
Lista densa con filtros en barra superior (chips): empresa, plataforma, keyword, grupo, rango (hoy / 7 d / 30 d / 90 d / 12 m / personalizado), tipo de coincidencia, leído/no leído, alerta enviada/no enviada. Búsqueda de texto completo. Panel lateral al hacer clic con texto completo, resumen, coincidencias con su justificación, y "también publicado en…".

### 3. Empresas
Tarjetas/filas: nombre, tipo (competidor/cliente/referente), publicaciones detectadas, última actividad ("hace 35 min"), keywords detectadas, alertas, y **iconos de fuentes con su estado** (verde conectada, gris manual, ámbar pendiente de credenciales, rojo error).

**Ficha de empresa** con pestañas: `Actividad` · `Keywords` · `Fuentes` · `Alertas` · `Estadísticas`. En `Fuentes`, cada una muestra método, frecuencia real ("Push · casi inmediato", "Cada 15 min", "Diaria vía Metricool", "Manual") y última lectura correcta.

### 4. Keywords
Tabla agrupada por grupo; columnas: término, ámbito (global / empresa), prioridad (🔴 crítica / normal), semántica activada, sinónimos, exclusiones, coincidencias en 30 días. Botón "Probar keyword" que la ejecuta sobre el histórico antes de guardarla.

### 5. Comparar (fase 3)
Tabla empresas × grupos de keywords (publicaciones, IA, Producto, Eventos, Contratación…) para un periodo, con celdas clicables que llevan al listado filtrado. Nota visible si alguna empresa tiene fuentes manuales/no conectadas.

### 6. Fuentes
Estado global de conectores: conectado / pendiente de credenciales (con instrucciones) / no disponible por API (manual) / error. Es donde se ve, sin maquillar, qué se está vigilando de verdad.

### Alerta por email
```
Asunto: 🚨 Empresa A · inteligencia artificial · LinkedIn

Nueva actividad detectada
Empresa:     Empresa A
Plataforma:  LinkedIn (también en Facebook)
Keyword:     inteligencia artificial (exacta) · nuevo producto (semántica 91 %)
Publicación: "Estamos muy orgullosos de presentar nuestra nueva solución…"
Resumen:     Empresa A lanza una solución de IA para automatizar procesos industriales.
Fecha:       08/10/2026 — 10:15
[Ver publicación]   [Abrir en la app]
```

---

## 11. Decisiones que necesito de ti para pasar al MVP

1. **¿Validas el alcance del MVP** (RSS/web, YouTube, noticias, manual + IA + email) dejando redes sociales automáticas para la fase 2?
2. **Metricool:** ¿tenéis plan Advanced (con API)? ¿Autorizas usar sus datos de competidores como vía principal para Instagram/Facebook?
3. **X:** ¿aceptas el coste de pago por uso (estimado 5–10 $/mes en el escenario base)?
4. **LinkedIn:** ¿te sirve el modo manual asistido, sabiendo que es la única vía legal hoy?
5. **Repositorio:** ¿creamos un repositorio nuevo para esta aplicación (recomendado)?
6. Una lista de **3 empresas reales** con sus cuentas para la prueba de concepto.

---

## Fuentes consultadas

- X API — precios: https://docs.x.com/x-api/getting-started/pricing
- Instagram Business Discovery: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/business-discovery
- Meta — Page Public Content Access: https://developers.facebook.com/documentation/development/features-reference/page-public-content-access
- YouTube — notificaciones push: https://developers.google.com/youtube/v3/guides/push_notifications
- TikTok — Commercial Content API: https://developers.tiktok.com/products/commercial-content-api
- TikTok Research API (elegibilidad, fuente secundaria): https://www.xpoz.ai/blog/guides/tiktok-research-api-limits-access-and-alternatives/
- LinkedIn API (fuentes secundarias): https://schedpilot.com/linkedin-api-pricing/ · https://apiserpent.com/blog/official-linkedin-api-vs-scraping
- Reddit — política y precios (fuentes secundarias): https://www.redditapis.com/reddit-responsible-builder-policy · https://octolens.com/blog/reddit-api-pricing
- Microsoft Teams — retirada de conectores Office 365: https://o365reports.com/office-365-connectors-retirement-in-teams-and-migration-to-workflows/
- Metricool — planes y API: https://help.metricool.com/plans-add-ons-and-api-access-explained-xux1u · https://www.upload-post.com/metricool-pricing/
- Metricool — campos de "competitor posts": verificados directamente con la conexión de Metricool (`getAnalyticsAvailableMetrics`, conectores Instagram y Facebook).
- Anthropic — modelos y precios: documentación de la API de Claude (octubre 2026).
