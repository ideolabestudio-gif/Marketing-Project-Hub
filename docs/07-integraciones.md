# 7. Integraciones externas: protocolo de verificación

**Regla: no se escribe código de integración hasta que exista un informe de verificación aprobado en `docs/integraciones/<proveedor>.md`.** Mientras tanto, todo funciona en modo manual.

## 7.1 Puertos (interfaces) previstos

| Puerto | Adaptador por defecto (manual) | Posibles adaptadores (a verificar) |
|--------|-------------------------------|------------------------------------|
| `PublishingProvider` | Registrar a mano fecha, URL e ID de lo publicado | Herramienta de programación de redes; APIs nativas de cada red |
| `EmailCampaignProvider` | Registrar a mano envío, fecha y enlace a la campaña en el ESP | ESP que use Ideolab (Mailchimp, Brevo, etc., según D-04) |
| `MetricsProvider` | Formulario manual + importación CSV con mapeo de columnas | Analítica de la herramienta de programación; APIs de las redes; API del ESP |
| `AiProvider` | `disabled` (no genera nada) | Anthropic Claude u otro, según D-07 |
| `StorageProvider` | S3 compatible | — |

Cada adaptador declara sus **capacidades verificadas** (p. ej. `metrics.read`, `post.create_draft`, `post.submit_for_review`, `post.schedule`) y la UI solo ofrece las acciones declaradas. Lo no declarado sigue en modo manual.

## 7.2 Plantilla de informe de verificación

Para cada proveedor, antes de implementar:

1. **Necesidad**: qué paso del ciclo automatiza y cuánto tiempo ahorra.
2. **Documentación oficial consultada**: enlaces y fecha de consulta.
3. **Acceso**: tipo de autenticación, scopes/permisos necesarios, ¿requiere revisión de app o verificación de empresa?, ¿requiere un plan de pago concreto?
4. **Capacidades confirmadas con una prueba real** en una cuenta de pruebas o del cliente piloto (con su permiso): qué endpoints, qué campos devuelven, qué métricas exactas y con qué definición.
5. **Límites**: rate limits, antigüedad máxima de los datos, retrasos en la disponibilidad de métricas.
6. **Términos de uso y datos personales**: qué datos se reciben, dónde se procesan, encaje con RGPD.
7. **Modo de fallo**: qué pasa si caduca el token o la API cambia; cómo se vuelve a modo manual.
8. **Decisión**: implementar / posponer / descartar, y capacidades que se habilitarán.

## 7.3 Herramientas de Ideolab (confirmado) y observaciones sin verificar

Ideolab usa **Metricool** para programar publicaciones y **MailerLite** para email marketing. Ambos son los primeros candidatos a integración y ambos tienen que pasar el protocolo anterior antes de escribir código.

| Herramienta | Uso en el Hub (propuesto) | Qué hay que verificar (no se da nada por supuesto) |
|-------------|---------------------------|----------------------------------------------------|
| Metricool | 1) Importar métricas de redes para el informe. 2) Enviar a Metricool como borrador o "pendiente de revisión" una pieza ya aprobada en el Hub | Si existe API para integraciones propias y en qué plan; cómo se autentica; si una cuenta de agencia accede a varias marcas y cómo se separan (encaje con el aislamiento por proyecto); qué métricas devuelve y con qué definición; si permite crear publicaciones sin publicarlas |
| MailerLite | 1) Importar estadísticas de campañas enviadas (aperturas, clics, bajas…). 2) Más adelante, crear la campaña como borrador en MailerLite | API disponible y plan necesario; si se usa una clave de API por cuenta de cliente (encaja con credenciales por proyecto); qué estadísticas expone; que crear un borrador no implique programar ni enviar |

Notas:
- En el entorno de trabajo de estas sesiones hay disponible un conector de Metricool. Los nombres de sus herramientas sugieren funciones de programación, envío a revisión y analítica. Esto **no** confirma qué ofrece su API para una integración propia, ni en qué plan.
- Las listas de suscriptores se quedan en MailerLite (supuesto S-04): el Hub solo guardaría estadísticas agregadas de campañas.
- Las APIs de plataformas sociales suelen requerir revisión de aplicación y permisos que pueden tardar semanas; por eso no deben estar en el camino crítico del primer ciclo completo.

## 7.4 Orden recomendado

1. Ninguna integración hasta completar el ciclo manual con el cliente piloto.
2. Primero integraciones de **solo lectura** (métricas): menor riesgo, mayor ahorro de tiempo en el informe.
3. Después, "crear borrador / enviar a revisión" en la herramienta externa, tras aprobación en el Hub.
4. Publicación/envío directo por API: solo si se pide expresamente, por proyecto, y siempre tras aprobación humana registrada y acción humana explícita.

## 7.5 Conector de Claude (entrante)

El Hub expone un servidor MCP en `/api/mcp` para usar Claude con la suscripción de cada persona, sin API de pago. No llama a ningún servicio externo: es Claude quien llama al Hub, con un token OAuth de la persona y sus mismos permisos por proyecto. Solo lee y deja borradores. Detalle en `docs/integraciones/claude-conector.md`.
