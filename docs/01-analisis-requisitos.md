# 1. Análisis de requisitos

## 1.1 Fuente

El único documento de requisitos disponible es el encargo inicial (objetivo + principios obligatorios). No existe todavía un documento funcional detallado en el repositorio. Por eso este análisis separa claramente:

- **Requisitos explícitos**: lo que dice el encargo.
- **Supuestos**: lo que se infiere para poder diseñar. Hay que validarlos (sección 1.4).

## 1.2 Requisitos explícitos

| ID | Requisito | Origen |
|----|-----------|--------|
| RE-01 | Aplicación web **interna** de Ideolab | Encargo |
| RE-02 | Gestiona el **ciclo mensual** de redes sociales y email marketing | Encargo |
| RE-03 | **Varios clientes** | Encargo |
| RE-04 | Autorización **por proyecto** | Encargo |
| RE-05 | Ninguna publicación ni envío de campaña sin **autorización humana** | Principio |
| RE-06 | **No mezclar** datos de clientes distintos | Principio |
| RE-07 | **Separar** datos originales de interpretaciones generadas por IA | Principio |
| RE-08 | **No inventar** métricas ni capacidades de APIs | Principio |
| RE-09 | La IA genera **borradores** que requieren revisión humana | Principio |
| RE-10 | Integraciones **sustituibles** y utilizables en **modo manual** | Principio |
| RE-11 | Priorizar un **ciclo mensual completo de un cliente** | Principio |

## 1.3 Ciclo mensual propuesto (supuesto a validar)

Se propone este ciclo como columna vertebral del producto. Cada paso tiene una versión manual que funciona sin integraciones.

```
1. Planificación  →  2. Producción  →  3. Revisión/aprobación  →  4. Programación/publicación  →  5. Medición  →  6. Informe  →  7. Cierre
   (brief del mes)     (copys, piezas,     (interna y del cliente,    (manual o vía integración,       (manual, CSV        (datos +        (aprendizajes
                        emails; IA como     sobre versión concreta)    solo versiones aprobadas)        o import)           análisis)        para el mes siguiente)
                        borrador)
```

| Paso | Qué ocurre | Salida |
|------|------------|--------|
| Planificación | Se abre el ciclo `AAAA-MM` del proyecto, se fijan objetivos, fechas clave y canales | Brief del mes, lista de piezas planificadas |
| Producción | Se redactan copys/emails y se adjuntan piezas; la IA puede proponer borradores | Versiones de contenido |
| Revisión | Revisión interna y aprobación del cliente sobre una **versión concreta** | Aprobaciones registradas con evidencia |
| Publicación | Se publica/programa a mano (o con integración) solo lo aprobado; se registra URL/ID | Registros de publicación |
| Medición | Se introducen o importan métricas con su **fuente** | Instantáneas de métricas inmutables |
| Informe | Datos objetivos + análisis humano + (opcional) interpretación IA marcada como tal | Informe mensual aprobado |
| Cierre | Se congela el ciclo y se anotan aprendizajes | Ciclo cerrado (solo lectura) |

## 1.4 Supuestos

| ID | Supuesto | Impacto si es falso |
|----|----------|---------------------|
| S-01 | Los usuarios son personal de Ideolab (decenas como máximo, no miles) | Escalado y coste |
| S-02 | En el MVP los clientes **no** acceden a la aplicación; su aprobación se registra por un usuario interno con evidencia (email, captura, acta) | Habría que añadir portal de cliente y otro modelo de amenazas |
| S-03 | "Proyecto" = espacio de trabajo de un cliente (o de una marca de un cliente). Es la **frontera de aislamiento** | Modelo de datos |
| S-04 | Las listas de suscriptores de email permanecen en la herramienta de email marketing (ESP), no en el Hub | Si se guardan, entran datos personales de terceros (RGPD) y sube mucho el nivel de exigencia |
| S-05 | Los ficheros pesados (vídeo) se guardan en almacenamiento de objetos, no en la base de datos | Coste y rendimiento |
| S-06 | Ideolab y sus clientes están en la UE (RGPD; preferencia por alojamiento en la UE) | Elección de proveedor |
| S-07 | Un equipo pequeño (1–2 personas) mantendrá la aplicación | Sesgo hacia simplicidad y monolito |

## 1.5 Decisiones técnicas pendientes

Necesito confirmación de Ideolab en estos puntos antes de implementar. Entre paréntesis, la opción por defecto que se usará si no hay respuesta.

| ID | Decisión | Opciones | Por defecto |
|----|----------|----------|-------------|
| D-01 | Lenguaje con el que se siente cómodo el equipo que mantendrá la app | TypeScript / Python / PHP | TypeScript |
| D-02 | Inicio de sesión | Google Workspace (SSO de dominio) / Google con lista de emails permitidos / enlace mágico por email | Google OAuth + lista de emails permitidos |
| D-03 | ¿Los clientes entrarán a aprobar? | No en MVP / Portal de aprobación más adelante | No en MVP |
| D-04 | Herramientas actuales (programador de redes, ESP, analítica) | p. ej. Metricool, Meta Business Suite, Mailchimp, Brevo… | Por confirmar: condiciona las integraciones |
| D-05 | Redes y formatos que hay que soportar | Instagram, Facebook, LinkedIn, TikTok, X, YouTube, newsletter… | Catálogo configurable, sin lógica específica por red en el MVP |
| D-06 | Alojamiento | PaaS en región UE / VPS propio | PaaS en región UE con contenedor Docker |
| D-07 | Proveedor de IA | Anthropic (Claude) / otro / ninguno al principio | Interfaz abstracta; proveedor configurable y desactivable |
| D-08 | Formato del informe al cliente | PDF / enlace web / presentación | HTML imprimible a PDF |
| D-09 | Política de retención de datos al terminar con un cliente | Archivar / exportar y borrar | Archivar (solo lectura) + exportación |
| D-10 | Cliente piloto para el primer ciclo completo | — | Por designar |

## 1.6 Decisiones tomadas (1 de octubre de 2026)

| ID | Decisión | Motivo |
|----|----------|--------|
| D-01 | **TypeScript + Next.js** (opción A del doc. 02) | El desarrollo será con asistentes de IA ("vibecoding"). El tipado estricto, las reglas de lint entre capas y las pruebas de aislamiento hacen de red de seguridad frente a código generado. Es además el stack más conocido por esas herramientas y usa un solo lenguaje |
| D-02 | **Login con Google** + lista de emails dados de alta por un administrador. Si Ideolab usa Google Workspace, se puede limitar además al dominio (`AUTH_GOOGLE_HOSTED_DOMAIN`) | Sin contraseñas propias; funciona con Workspace y con cuentas de Google normales |
| D-03 | **Los clientes no entran** en la herramienta. Su aprobación la registra el equipo con evidencia | Menos superficie de ataque; se revisará después del hito |
| D-04 | Publicaciones con **Metricool**; emails con **MailerLite** | Son los candidatos a las primeras integraciones (doc. 07), siempre tras verificarlas |
| D-06 | **Render, región Frankfurt (UE)**: servicio web + PostgreSQL gestionado (doc. 09) | Sin servidores que mantener, despliegue desde GitHub, datos en la UE |
| D-10 | Cliente piloto: **Cerveza Byra** | Elegido por Ideolab |

D-05, D-07, D-08 y D-09 mantienen la opción por defecto hasta que haga falta decidirlas (fases F2–F5).

## 1.7 Riesgos

| ID | Riesgo | Prob. | Impacto | Mitigación |
|----|--------|-------|---------|------------|
| R-01 | Fuga de datos entre clientes (consulta sin filtrar, fichero accesible, prompt de IA con datos mezclados) | Media | **Crítico** | Aislamiento en 3 capas (servicio, repositorio, BD con FKs compuestas), suite de pruebas de aislamiento obligatoria en CI (doc. 06) |
| R-02 | Publicación o envío accidental | Baja | **Crítico** | No existe ninguna ruta de publicación automática; publicar exige aprobación de la versión exacta; integraciones empiezan en modo lectura/borrador |
| R-03 | La IA "inventa" métricas o conclusiones en informes | Alta | Alto | La IA solo recibe métricas registradas; su salida vive en tabla aparte, marcada, y nunca sustituye a los datos |
| R-04 | Capacidades de APIs distintas a lo esperado (permisos, revisión de app de Meta, límites, planes de pago) | Alta | Medio | Protocolo de verificación (doc. 07) antes de escribir código; modo manual siempre disponible |
| R-05 | Ampliación de alcance antes de completar un ciclo | Alta | Alto | Plan por fases con hito "ciclo completo de un cliente piloto" antes de nada avanzado |
| R-06 | Métricas no comparables entre plataformas (definiciones distintas de alcance, impresiones…) | Alta | Medio | Catálogo de métricas con definición y origen; no se suman métricas de plataformas distintas sin indicarlo |
| R-07 | Gestión insegura de credenciales de integraciones | Media | Alto | Secretos cifrados, por proyecto, fuera del código; mínimo privilegio en scopes |
| R-08 | Dependencia de una sola persona (bus factor) | Media | Medio | Stack convencional, documentación, ADRs, pruebas automatizadas |
| R-09 | Datos personales (RGPD) en contenidos o métricas | Media | Medio | No almacenar listas de suscriptores; métricas agregadas; alojamiento UE; registro de auditoría |
| R-10 | Zonas horarias en fechas de publicación | Media | Bajo | Guardar en UTC + zona horaria del proyecto; mostrar siempre la zona |
