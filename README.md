# Marketing Project Hub

Aplicación web interna de Ideolab para gestionar el ciclo mensual de redes sociales y email marketing de varios clientes.

> **Estado:** F0 (cimientos) y F1 (acceso y aislamiento) implementadas. Siguiente: despliegue en Render (ver [doc. 09](docs/09-despliegue.md)) y F2 (ciclo mensual y contenidos).

**Stack:** Next.js 16 + TypeScript · PostgreSQL + Drizzle ORM · login con Google (arctic) · Vitest + Playwright · Render (Frankfurt).

```bash
npm ci
cp .env.example .env.local             # y rellénalo
docker compose up -d db                  # PostgreSQL local
npm run db:migrate && npm run dev        # http://localhost:3000
npm run check                            # lint + tipos + pruebas
```

## Documentación

| # | Documento | Contenido |
|---|-----------|-----------|
| 1 | [Análisis de requisitos](docs/01-analisis-requisitos.md) | Requisitos, supuestos, decisiones pendientes y riesgos |
| 2 | [Comparativa de stack](docs/02-comparativa-stack.md) | Opciones evaluadas y recomendación |
| 3 | [Arquitectura](docs/03-arquitectura.md) | Arquitectura, módulos, límites de responsabilidad y estructura de carpetas |
| 4 | [Modelo de datos](docs/04-modelo-datos.md) | Modelo relacional, invariantes y diagrama |
| 5 | [Autenticación y autorización](docs/05-autenticacion-autorizacion.md) | Estrategia de acceso por proyecto y matriz de permisos |
| 6 | [Pruebas de aislamiento](docs/06-pruebas-aislamiento.md) | Batería de pruebas para garantizar que no se mezclan datos de clientes |
| 7 | [Integraciones](docs/07-integraciones.md) | Protocolo de verificación previo a cualquier integración externa |
| 8 | [Plan de implementación](docs/08-plan-implementacion.md) | Fases incrementales con criterios de aceptación y estado |
| 9 | [Despliegue](docs/09-despliegue.md) | Google OAuth, Render, primer acceso, copias de seguridad y desarrollo local |

Reglas para asistentes de IA: [CLAUDE.md](CLAUDE.md).

## Principios no negociables

1. Nada se publica ni se envía sin autorización humana explícita sobre una versión concreta.
2. Los datos de clientes distintos no se mezclan nunca (aislamiento por proyecto en aplicación **y** en base de datos).
3. Los datos originales se guardan separados de las interpretaciones generadas por IA.
4. No se inventan métricas ni capacidades de APIs: todo dato lleva su fuente; toda integración se verifica antes de construirse.
5. La IA solo genera borradores; siempre requieren revisión humana.
6. Toda integración es sustituible y tiene un modo manual equivalente.
7. Primero un ciclo mensual completo de un cliente; después, funcionalidades avanzadas.
