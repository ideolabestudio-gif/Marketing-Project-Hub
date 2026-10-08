# Vigilancia competitiva — PoC con Metricool (sector alimentación)

> Fecha: 08/10/2026 · Estado: **PoC incompleto — bloqueado en un paso que solo puede hacer una persona en Metricool** (añadir los competidores). No se ha desarrollado aplicación.

**Etiquetas usadas**

- **PROBADO**: lo hemos ejecutado hoy con datos reales.
- **DOCUMENTADO, NO PROBADO**: lo dice la documentación oficial, pero no lo hemos ejecutado.
- **NO VERIFICADO**: no hay ni prueba ni documentación oficial abierta hoy.
- **CORREGIDO**: el estudio anterior (`01-estudio-viabilidad.md`) decía otra cosa.

---

## A. ¿Funciona? — PARCIALMENTE

| Tramo del flujo | Estado | Evidencia |
|---|---|---|
| Obtener publicaciones de una cuenta por la conexión de Metricool, con texto, fecha/hora, URL e ID | **PROBADO** (cuenta propia `ideolabestudio`) | 5 publicaciones reales devueltas, del 3 al 5 de octubre |
| Buscar la keyword en el texto | **PROBADO** | 2 alertas y 3 «sin alerta» sobre esas 5 publicaciones |
| No alertar si no hay keyword | **PROBADO** | Ídem + casos del enunciado |
| No repetir la alerta de una publicación ya vista | **PROBADO** | Segunda pasada: 0 alertas |
| Generar la alerta con competidor, red, keyword, fecha, texto y URL | **PROBADO** (por consola) | Ver §C |
| **Obtener las publicaciones de un competidor (Lidl, Mercadona, Carrefour, ALDI)** | **NO PROBADO** | La marca de Metricool no tiene ningún competidor añadido: las consultas devuelven 0 filas |
| Latencia real desde que el competidor publica | **NO MEDIDA** | Depende del punto anterior |

El flujo `Lidl → Instagram → nueva publicación → Metricool → texto → "receta" → alerta` **no está demostrado de extremo a extremo**. Falta justo el tramo que lo hace «competitivo».

## B. ¿Funciona con Metricool? — PARCIALMENTE (provisional)

- **PROBADO**: la conexión de Metricool expone un conector de «publicaciones de competidores» en Instagram con los campos necesarios (ver §D).
- **PROBADO**: hoy ese conector devuelve **0 filas** para competidores, publicaciones y reels de competidores (periodo 08/09–08/10/2026), porque no hay competidores configurados.
- **DOCUMENTADO, NO PROBADO**: Metricool sincroniza los datos **una vez cada 24 horas, de madrugada**. Si se confirma, la alerta llegaría al día siguiente, no «en tiempo real».
- **CORREGIDO**: el estudio anterior daba por «verificado» que Metricool devuelve texto, fecha y URL de competidores. Lo verificado era el **catálogo de campos**, no datos reales.

## C. Qué hemos probado realmente

| # | Prueba | Resultado |
|---|---|---|
| 1 | Listar marcas de la cuenta de Metricool | **PROBADO**: 1 marca, `ideolabestudio`, con Instagram conectado. Alta el 01/10/2026 |
| 2 | Catálogo de métricas de Instagram | **PROBADO**: existen los conectores `competitors`, `competitor posts` y `competitor reels` |
| 3 | Consultar competidores de Instagram (08/09–08/10) | **PROBADO**: 0 filas |
| 4 | Consultar publicaciones y reels de competidores (08/09–08/10) | **PROBADO**: 0 filas |
| 5 | Consultar publicaciones propias (01/07–08/10) | **PROBADO**: 5 filas con fecha/hora, texto, ID, URL y tipo |
| 6 | Zona horaria de la fecha devuelta | **PROBADO**: es **UTC**. Programada a las 12:00 (Madrid) → devuelta como `10:02:53`; 10:15 → `08:16:04` |
| 7 | Detección sobre esas 5 publicaciones (keywords de prueba `receta`, `nuevo producto`, `Black Friday`, `sin alcohol`) | **PROBADO**: 2 alertas (`Black Friday`, `sin alcohol`), 3 sin alerta; `receta` y `nuevo producto` no saltan |
| 8 | Casos del enunciado | **PROBADO**: «Hoy os traemos una nueva receta…» → alerta; «Celebramos nuestro aniversario con vosotros» → sin alerta; «Te proponemos una nueva forma de preparar…» → sin alerta |
| 9 | Segunda pasada con los mismos datos | **PROBADO**: 0 alertas (no repite) |
| 10 | Catálogo de competidores en Facebook, YouTube, X, Bluesky, LinkedIn y TikTok | **PROBADO** (solo catálogo): ver §F |
| 11 | Llamar a la API REST de Metricool directamente | **NO PROBADO**: no tenemos token de API y el entorno de trabajo no tiene salida de red hacia `app.metricool.com` |
| 12 | Verificar las cuentas oficiales de Instagram | Lidl y Carrefour **PROBADO** en su web; Mercadona y ALDI **NO VERIFICADO** (ver §H) |

Regla de coincidencia usada: sin distinguir mayúsculas ni tildes, y la keyword debe empezar en límite de palabra. `receta` detecta «receta», «RECETAS» y `#recetafácil`; no detecta «decreta». Sin IA.

Reproducible con `poc/detect.py` y `poc/config.json` (no llama a ninguna API: recibe las publicaciones ya obtenidas).

## D. Qué datos podemos obtener

Campos del conector `competitor posts` de Instagram. Todos están **PROBADOS en catálogo** y **NO PROBADOS con datos de un competidor**.

| Dato | Campo | Disponible |
|---|---|---|
| Competidor (cuenta) | `IGCP01` | ✓ |
| Red | La define el conector | ✓ |
| ID de la publicación | `IGCP02` | ✓ |
| Texto / caption | `IGCP04` | ✓ |
| Fecha y hora de publicación | `IGCP06` | ✓ (UTC en la cuenta propia) |
| URL | `IGCP11` | ✓ |
| Imagen | `IGCP03` | ✓ |
| Likes, comentarios, interacciones, engagement | `IGCP07`–`IGCP10` | ✓ |
| Vídeo | — | ✗ No hay campo |
| **Fecha/hora en que Metricool detecta la publicación** | — | ✗ **No hay campo por publicación.** Solo existe `IGCO01` («Updated») por competidor |

Los reels van en un conector aparte (`competitor reels`) con texto, fecha, URL e ID. Hay que consultar los dos. Las stories de terceros no están disponibles.

## E. Latencia real

**No se ha podido medir ninguna latencia de competidores.** Lo que sí sabemos:

| Tiempo | Estado | Detalle |
|---|---|---|
| **T0** (publicación real) | Obtenible | Es la fecha del propio post. **PROBADO** en cuenta propia: precisión de segundos, en UTC |
| **T1** (disponible en Metricool) | **NO VERIFICADO** | Metricool no lo expone por publicación. Solo se puede aproximar consultando cada hora y anotando cuándo aparece cada post |
| **T2** (lo obtiene nuestro sistema) | Depende de nuestra frecuencia de consulta | — |
| **T3** (alerta) | **PROBADO**: menos de 1 segundo tras T2 | Alerta por consola |

- Latencia Metricool (T1 − T0): **DOCUMENTADO, NO PROBADO** → sincronización diaria de madrugada. Para competidores de X, la ayuda dice que se sincronizan «las publicaciones del día anterior». Expectativa razonable: **entre unas horas y más de 24 h**.
- Latencia sistema (T2 − T1): hasta 1 h si consultamos cada hora.
- Latencia alerta (T3 − T2): < 1 s (**PROBADO**).
- Latencia total: **NO MEDIDA**.

## F. Otras redes a través de Metricool

| Red | ¿Metricool monitoriza competidores? | ¿Conector/API? | ¿Posts nuevos? | ¿Texto? | ¿Latencia conocida? | Viabilidad |
|---|---|---|---|---|---|---|
| Instagram | Sí, solo cuentas profesionales y con nuestro Instagram conectado **a través de Facebook** — DOCUMENTADO | Catálogo PROBADO (posts y reels) | NO PROBADO | Campo existe; NO PROBADO | Diaria — DOCUMENTADO, NO PROBADO | 🟡 |
| Facebook | Sí, solo páginas — DOCUMENTADO | Catálogo PROBADO | NO PROBADO | Campo existe; NO PROBADO | Diaria — DOCUMENTADO, NO PROBADO | 🟡 |
| YouTube | Sí, solo planes de pago, máx. 10 canales — DOCUMENTADO | Catálogo PROBADO | NO PROBADO | **Solo título**; no hay campo de descripción — PROBADO en catálogo | Diaria — DOCUMENTADO, NO PROBADO | 🟡 |
| X | Sí, solo planes de pago **con complemento de pago** — DOCUMENTADO | Catálogo PROBADO; sin campo URL (se construye con el ID) | «Publicaciones del día anterior» — DOCUMENTADO | Campo existe; NO PROBADO | ≥ 1 día — DOCUMENTADO | 🟡 |
| Bluesky | Sí — DOCUMENTADO | **Solo datos agregados del competidor; no existe conector de publicaciones** — PROBADO | No por este conector | No por este conector | — | 🔴 por el conector |
| LinkedIn | No — DOCUMENTADO | No existe conector de competidores — PROBADO | No | No | — | 🔴 |
| TikTok | No — DOCUMENTADO | No existe conector de competidores — PROBADO | No | No | — | 🔴 |

Sobre la API REST: es una vía distinta del conector usado aquí. Existe una ruta `/v2/analytics/competitors/` (**DOCUMENTADO, NO PROBADO**) y exige plan **Advanced o Custom**. El conector (MCP) funciona con cualquier plan, incluido el gratuito (**DOCUMENTADO**).

## G. LinkedIn y TikTok

La pregunta es: ¿podemos detectar automáticamente las publicaciones nuevas de una empresa competidora concreta y comprobar sus keywords?

### LinkedIn — No, por ninguna vía oficial (DOCUMENTADO, NO PROBADO)

- **API que existe**: Community Management API, con su Posts API (`GET /rest/posts?author={organización}`).
- **Qué permite**: gestionar y leer páginas de empresa, sus publicaciones, comentarios y estadísticas.
- **Restricción decisiva**: el permiso `r_organization_social` está «restringido a organizaciones en las que el miembro autenticado tiene uno de estos roles: ADMINISTRATOR, DIRECT_SPONSORED_CONTENT_POSTER, CONTENT_ADMIN». Solo lees páginas que administras.
- **¿Cuentas de terceros?** No. Los casos de uso aprobados hablan siempre de páginas propias o de clientes.
- **Permisos especiales**: hay que solicitar el producto (nivel Development y luego Standard, con vídeo demostrando el caso de uso). El permiso para leer publicaciones de personas (`r_member_social`) está cerrado a nuevas solicitudes.
- **Proveedores autorizados**: **NO VERIFICADO** que alguno ofrezca publicaciones de páginas ajenas con licencia. Los que lo anuncian suelen hacer scraping.
- **Para nuestro caso**: no sirve. Queda el modo manual.

### TikTok — No para contenido orgánico con fines comerciales (DOCUMENTADO, NO PROBADO)

| API oficial | Qué da | ¿Sirve? |
|---|---|---|
| Research API | Datos públicos de cuentas y contenido | No. Solo instituciones académicas y entidades sin ánimo de lucro, «independientes de intereses comerciales» |
| Display API | Perfil y vídeos recientes de **un usuario que autoriza la app** | No. El competidor tendría que darnos permiso |
| Commercial Content API | Anuncios y otro contenido comercial; datos de anuncios limitados a la UE | Parcial: da anuncios, no las publicaciones orgánicas. Solicitud abierta al público, respuesta en unos 2 días laborables |

- **Proveedores autorizados**: **NO VERIFICADO**.
- **Para nuestro caso**: no sirve para publicaciones orgánicas. La Commercial Content API podría ser una señal secundaria (anuncios) en una fase posterior.

## H. Cuentas de Instagram a utilizar

| Competidor | Cuenta | Verificación |
|---|---|---|
| Lidl | `lidlespana` | **PROBADO**: enlazada desde lidl.es |
| Carrefour | `carrefoures` | **PROBADO**: enlazada desde carrefour.es |
| Mercadona | `mercadona` | **NO VERIFICADO**: su web no deja leer los enlaces e Instagram bloquea la consulta automática |
| ALDI | `aldi.es` | **NO VERIFICADO**: ídem |

Las dos no verificadas se confirman al añadirlas en Metricool (foto, nombre y seguidores). No ha hecho falta sustituir ningún competidor: aún no sabemos si alguno falla.

## I. Qué hay que configurar para terminar el PoC

1. **Comprobar el tipo de conexión de Instagram** en Metricool → Conexiones. Para añadir competidores, Instagram debe estar conectado **a través de Facebook**, no con las credenciales de Instagram.
2. **Confirmar el plan.** Con el plan gratuito solo caben 5 competidores por red y **no se pueden editar ni borrar** una vez añadidos. Con plan de pago, hasta 100.
3. **Añadir los competidores**: Analítica → Competidores → Instagram → Añadir, escribiendo el nombre exacto: `lidlespana`, `mercadona`, `carrefoures`, `aldi.es`.
4. Al añadirlos, Metricool carga el histórico **desde el día 1 del mes anterior**. Ese mismo día se puede repetir la prueba de detección con publicaciones reales de los cuatro.
5. **Medición de latencia**: consulta automática cada hora durante 3–5 días, anotando la primera vez que aparece cada publicación.
6. **Token de API**: no hace falta para el PoC. Sí para una aplicación propia (plan Advanced o Custom).

## J. ¿Metricool es suficiente? — Opción 2 (provisional)

**Metricool sirve como una de las fuentes, pero necesitamos APIs adicionales.**

- Cubre, sobre el papel, Instagram, Facebook, X y YouTube, pero con actualización diaria.
- No da publicaciones de Bluesky por el conector, ni la descripción de los vídeos de YouTube, ni LinkedIn, ni TikTok.
- No expone cuándo detecta cada publicación.
- Si se necesita avisar en menos de un día, hacen falta fuentes directas: API de Meta (Business Discovery) para Instagram, WebSub/RSS para YouTube, API de X, API pública de Bluesky. Todas **DOCUMENTADO, NO PROBADO**.

Esta conclusión puede cambiar a «Opción 3» si la prueba con competidores reales no devuelve texto o tarda más de un día.

## K. Recomendación

**¿Merece la pena construir la aplicación?** Todavía no se puede decidir. Merece la pena terminar el PoC (unos 10 minutos de configuración y 3–5 días de medición) antes de escribir nada.

1. **Demostrado**: obtención de publicaciones por la conexión de Metricool (cuenta propia), detección exacta, control de falsos positivos, no repetición y alerta.
2. **Incógnita**: que Metricool devuelva de verdad las publicaciones de competidores con su texto, y cuánto tarda.
3. **Redes para el MVP**: Instagram y Facebook vía Metricool, **si** el PoC lo confirma y un aviso al día siguiente es aceptable. YouTube por vía directa.
4. **Fuera del MVP**: LinkedIn y TikTok (solo manual), X (coste añadido) y Bluesky (poca presencia de estas marcas).
5. **¿Metricool como fuente principal?** Solo para Instagram y Facebook, y solo si basta la frecuencia diaria.
6. **APIs adicionales**: YouTube (WebSub/RSS) y, si se exige menos de 24 h en Instagram, la API de Meta.
7. **Riesgo técnico**: la latencia diaria; depender de la conexión de Instagram vía Facebook; el límite de 5 competidores no borrables en el plan gratuito; que Metricool cambie su catálogo.
8. **Siguiente paso**: los puntos 1–3 de §I. Después, repetir las pruebas 3, 4 y 7 con datos de competidores y arrancar la medición horaria.

---

## Fuentes (abiertas el 08/10/2026)

- Metricool — [Datos históricos disponibles](https://help.metricool.com/es/datos-historicos-disponibles-5zavf) (sincronización diaria; competidores)
- Metricool — [Qué hacer si no se actualizan los datos](https://help.metricool.com/es/que-hacer-si-no-se-actualizan-los-datos-de-tus-redes-sociales-en-metricool-4i4p5) («cada 24 horas durante la madrugada»)
- Metricool — [Cómo añadir competidores](https://help.metricool.com/es/how-to-add-competitors-in-metricool-sgjjg) (redes, límites por plan, requisitos)
- Metricool — [Límites de MCP y requisitos del plan](https://help.metricool.com/es/limites-de-mcp-y-requisitos-del-plan-h72jg)
- Metricool — [Acceso a la API](https://help.metricool.com/api-access-export-your-metricool-data-to-other-tools-and-automate-tasks-x8ln5) (Advanced y Custom)
- Metricool — [Rutas de la API](https://help.metricool.com/wli-checking-our-api-important-considerations-6eyw9) (`/v2/analytics/competitors/`)
- LinkedIn — [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) · [Community Management API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview)
- TikTok — [Research API](https://developers.tiktok.com/products/research-api/) · [Display API](https://developers.tiktok.com/doc/display-api-overview) · [Commercial Content API](https://developers.tiktok.com/products/commercial-content-api)
- Cuentas oficiales — [lidl.es](https://www.lidl.es/) · [carrefour.es](https://www.carrefour.es/)
- Datos de Metricool: consultas reales con la conexión de Metricool (`getBrandSettings`, `getAnalyticsAvailableMetrics`, `getAnalyticsDataByMetrics`, `getScheduledPosts`).
