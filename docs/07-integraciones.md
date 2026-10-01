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

## 7.3 Observaciones iniciales (sin verificar)

- En el entorno de trabajo de esta sesión hay disponible un **conector de Metricool**. Los nombres de sus herramientas sugieren funciones de programación de publicaciones, envío de publicaciones a revisión y consulta de analítica. Esto **no** confirma qué ofrece su API para una integración propia, en qué plan, ni con qué condiciones: debe pasar el protocolo anterior. Si Ideolab ya usa Metricool, es un buen candidato a primer adaptador, empezando por **lectura de métricas** y **envío a revisión** (no publicación directa).
- Las APIs de plataformas sociales suelen requerir procesos de revisión de aplicación y permisos específicos que pueden tardar semanas; por eso no deben estar en el camino crítico del primer ciclo completo.

## 7.4 Orden recomendado

1. Ninguna integración hasta completar el ciclo manual con el cliente piloto.
2. Primero integraciones de **solo lectura** (métricas): menor riesgo, mayor ahorro de tiempo en el informe.
3. Después, "crear borrador / enviar a revisión" en la herramienta externa, tras aprobación en el Hub.
4. Publicación/envío directo por API: solo si se pide expresamente, por proyecto, y siempre tras aprobación humana registrada y acción humana explícita.
