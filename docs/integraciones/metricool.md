# Informe de verificación · Metricool (métricas, solo lectura)

**Estado:** borrador, pendiente de aprobación. Mientras no se apruebe, no se escribe código de integración (doc. 07).
**Fecha:** 9 de octubre de 2026 · **Alcance:** solo leer métricas para el informe mensual (`MetricsProvider`, capacidad `metrics.read`). No se ha probado ni se propone crear, programar ni enviar publicaciones.

## 1. Necesidad

Cada mes hay que pasar al Hub las métricas de redes de cada cliente: hoy se hace a mano o con la importación CSV genérica (ADR 013). Si Metricool las diera directamente, se ahorraría ese paso en cada cliente y cada mes, y desaparecerían los errores de copia.

## 2. Documentación consultada

| Fuente | Resultado |
|---|---|
| Documentación oficial (`app.metricool.com/resources/apidocs`, `static.metricool.com/API+DOC/API+English.pdf`, `help.metricool.com`) | **No se pudo abrir** desde el entorno de trabajo: la política de red lo bloquea. **Hay que leerla a mano** antes de aprobar este informe. |
| Búsqueda web del 9-10-2026: resultados que citan la documentación oficial y guías de terceros | Ver §3. Es información de **segunda mano**, no comprobada contra la fuente. |
| Conector MCP de Metricool usado en esta sesión, con la cuenta de Ideolab | Pruebas reales, en §4. **El conector no es la API REST** que usaría el Hub: confirma qué datos tiene Metricool, no cómo los da la API ni en qué plan. |

## 3. Acceso (según fuentes secundarias, sin confirmar)

- **Plan actual de Ideolab:** **Starter** (confirmado por Sandra el 9-10-2026). Según las fuentes de abajo, no incluye la API.
- **Plan:** la API REST solo está en los planes **Advanced** y **Custom**, que son de pago. Las cifras publicadas por terceros no coinciden (desde unos 43 €/mes por 15 marcas hasta 67 $/mes), así que hay que consultar la página de precios.
- **Autenticación:** un `userToken` por cuenta, en la cabecera `X-Mc-Auth`, más `userId` y `blogId` como parámetros en cada llamada. Una guía de terceros habla de `Authorization: Bearer`; prevalece la oficial.
- **Marcas:** el mismo token da acceso a **todas las marcas de la cuenta**, incluidas las compartidas. Cada marca se identifica por su `blogId`, y hay un endpoint (`simpleProfiles`) que las lista.
- **Límites de uso:** no constan en las fuentes oficiales encontradas. Un tercero menciona respuestas 429, sin confirmar.

**Encaje con el aislamiento por proyecto:** como un token ve todas las marcas, el Hub tendría que guardar por proyecto el `blogId` de su marca y usar solo ese. El token sería una credencial de la agencia, no del cliente, y habría que guardarlo cifrado y fuera del alcance de los proyectos. Esto se diseñaría en F7.

## 4. Pruebas reales con el conector, en solo lectura (9-10-2026)

- **Marcas de la cuenta:** solo hay una, `ideolabestudio` (`blogId` 7181707), con Instagram conectado desde el **2 de octubre de 2026** y zona horaria Europe/Madrid. **Cerveza Byra no está en Metricool**, así que no se ha podido probar con el cliente piloto.
- **Catálogo de métricas de Instagram:** se ha recibido el catálogo completo de la red. Está organizado por conectores (`evolution`, `posts`, `reels`, `stories`…) y cada métrica trae su definición y su forma de agregarse (`SUM`, `LAST`, `AVG`). Varias vienen marcadas como «Deprecated».
- **Datos del 1 al 8 de octubre:** una fila por día. Los valores son 0 o vacíos, salvo publicaciones (1 o 2 en algunos días) y visualizaciones (5 un día). La cuenta lleva conectada una semana y no se pudieron contrastar esas cifras con las que muestra Instagram.
- **Columnas sin cabecera:** la respuesta no dice qué columna es cada métrica. Se deduce por el orden de la petición, y eso hay que confirmarlo con la API real antes de importar nada.

### Correspondencia propuesta con el catálogo del Hub (Instagram)

| Hub (`metric_definitions`) | Metricool | Observación |
|---|---|---|
| `social.followers` | IGEV01 `followers` (LAST) | Valor al final del periodo. |
| `social.followers_gained` | IGEV43 `followersGained` (SUM) | Dato bruto. Las bajas van aparte en IGEV44, así que el neto sería IGEV43 − IGEV44. |
| `social.posts` | IGEV37 `postsCount` (posts + reels) | IGEV04 cuenta solo posts. |
| `social.reach` | IGEV06 `reach` (SUM diario) | Es la suma del alcance de cada día: cuenta varias veces a la misma persona, que es justo lo que el catálogo advierte. Falta saber si la API da el alcance del mes. |
| `social.impressions` | IGEV05 `views` | Instagram ya no usa impresiones, sino visualizaciones. Incluye datos orgánicos y de pago. |
| `social.interactions` | IGEV38 `postsInteractions` | Me gusta, comentarios, guardados y compartidos de posts y reels. |
| `social.engagement_rate` | IGEV9999 `totalEngagement` | Interacciones por cada X personas alcanzadas. La X la fija la marca (`engagementRatio` = 100 en esta cuenta, es decir, un porcentaje). |
| `social.video_views` | IGEV23 `reelsViews` | |
| `social.link_clicks` | IGAC12 `profileLinksTaps` | Las métricas de clics de evolución están obsoletas. Se toma la más parecida. |
| `social.profile_visits` | sin equivalente vigente | IGEV07 está obsoleta. Seguiría siendo manual. |

## 5. Límites

Metricool solo tiene datos desde que se conecta cada red: esta cuenta, desde el 2-10-2026. Faltan por confirmar en la documentación oficial cuántos meses hacia atrás se pueden pedir, cuánto tardan en estar disponibles las métricas del día y los límites de uso.

## 6. Datos personales

Solo se recibirían métricas agregadas de cuentas de empresa, sin datos de seguidores individuales. Las demográficas, que también son agregadas, no se pedirían. Metricool es una empresa española (Metricool Software, S.L.). Hay que comprobar su contrato de encargo de tratamiento antes de conectar cuentas de clientes.

## 7. Modo de fallo

Si el token caduca, cambia el plan o la API falla, la importación no se ejecuta y el Hub sigue funcionando con el alta manual y el CSV (principio 5). Cada valor importado llevaría `source = integration` y su referencia, como exige F7.

## 8. Decisión propuesta: **posponer la API**; usar Metricool sin API

- **No implementar ahora el adaptador de la API.** Exige un plan Advanced o superior, de pago; Ideolab tiene Starter y hoy no hay presupuesto para cambiar; no se ha podido leer la documentación oficial; y el cliente piloto todavía no está en Metricool.
- **Alternativa sin coste y sin código nuevo:** las métricas del mes entran por la **importación CSV que ya existe**, de una de estas dos formas:
  1. Exportando el CSV desde Metricool, si el plan actual lo permite (pendiente de probar con una exportación real: próximos pasos, punto 2 del doc. 08).
  2. Pidiéndoselas a Claude en el chat con el conector de Metricool: «dame en CSV las métricas de octubre de la marca X con estas columnas». Después se importa el CSV en el Hub y una persona revisa el mapeo, como siempre.
- **Volver a evaluar la API** cuando haya presupuesto para el plan Advanced y Byra (u otro cliente) esté en Metricool. Antes de escribir código, completar §2, §3 y §5 con la documentación oficial.
