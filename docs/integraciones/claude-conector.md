# Conector de Claude (servidor MCP del Hub)

Estado: implementado (2026-10-09), pendiente de la prueba real en claude.ai.

## 1. Necesidad
Usar Claude con el Hub sin pagar la API de Anthropic. Con el conector, Claude (con la suscripción de la persona, en claude.ai web, escritorio o móvil) lee el Hub y deja borradores, en vez de copiar y pegar prompts y respuestas.

## 2. Cómo funciona
No es una integración saliente: es Claude quien llama al Hub. El Hub no hace ninguna llamada de red nueva (`tests/lint/no-external-publishing.test.ts` sigue igual).

- `POST /api/mcp`: servidor MCP (transporte Streamable HTTP, sin sesión, respuestas JSON). Código en `src/modules/mcp/`.
- Inicio de sesión OAuth 2.1 (`src/modules/oauth/`): metadatos en `/.well-known/oauth-protected-resource` y `/.well-known/oauth-authorization-server`, registro dinámico en `/oauth/register`, permiso en `/oauth/authorize` (la persona entra con Google y pulsa «Permitir») y tokens en `/oauth/token`.
- Cada persona ve y revoca sus conexiones en `/conexiones`.

## 3. Herramientas
| Herramienta | Qué hace | Permiso |
|---|---|---|
| `listar_proyectos`, `ver_proyecto`, `ver_ciclo`, `ver_pieza`, `ver_metricas` | Leer | `project.read` |
| `preparar_calendario` | Devuelve el prompt del calendario (el mismo del modo chat); sin periodo abre el ciclo del mes que viene, como «Preparar calendario» | `ai.generate` (+ `cycle.manage` para abrir el ciclo) |
| `guardar_propuesta_calendario` | Guarda la propuesta en `ai_generations` (provider `chat`); no crea piezas | `ai.generate` |
| `preparar_texto_pieza` / `guardar_borrador_texto` | Prompt y borrador de texto de una pieza en `ai_generations`; no crea versiones | `ai.generate` |
| `subir_csv_metricas` | Crea una importación pendiente; una persona asigna columnas y la aplica | `metrics.write` |

No hay herramientas para aprobar, publicar, programar, enviar, cerrar ni borrar (lo comprueba `tests/integration/mcp.test.ts`).

## 4. Seguridad
- Aislamiento: cada herramienta entra por `requireProjectAccess` con la persona del token, igual que una página. Probado en `tests/integration/mcp.test.ts` y `tests/e2e/mcp-connector.spec.ts`.
- Solo se aceptan direcciones de vuelta https en `claude.ai` o `claude.com` (hoy `/api/mcp/auth_callback`); se pueden añadir otras exactas con `OAUTH_EXTRA_REDIRECT_URIS`.
- Los rechazos de OAuth quedan en los registros de Render con el prefijo `[oauth]`.
- PKCE S256 obligatorio. Códigos de un solo uso (5 min). Token de acceso de 1 h y de refresco de 30 días con rotación; reutilizar un código o un refresco revoca la conexión. En BD solo se guarda el SHA-256.
- Desactivar a un usuario o pulsar «Desconectar» corta el acceso al momento.
- La pantalla de permiso no se puede incrustar en otra web (`frame-ancestors 'none'`).
- Pendiente: limitar la frecuencia de `/oauth/register` (hoy cualquiera puede registrar una aplicación, aunque solo con las direcciones de Claude).

## 5. Datos y términos
Lo que Claude lee pasa a la conversación de claude.ai de la persona, con las condiciones de su plan de Claude. Por eso el conector solo muestra los proyectos de los que es miembro, y las instrucciones del servidor piden no mezclar clientes.

## 6. Modo de fallo
Si el conector falla, todo sigue funcionando a mano: «Calendario con IA» con copiar y pegar, e importación de CSV desde la web.

## 7. Pendiente de verificar con la prueba real
- Que claude.ai complete el registro y el inicio de sesión con este Hub (direcciones de vuelta y registro dinámico).
- En Render Free el servicio se duerme: la primera llamada tras un rato parado puede tardar. Si claude.ai da error al conectar, abre antes el Hub en el navegador y vuelve a intentarlo.
