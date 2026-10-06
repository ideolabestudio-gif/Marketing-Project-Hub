# 9. Despliegue y puesta en marcha

Alojamiento elegido: **Render, región Frankfurt (UE)**. Un servicio web Node y una base de datos PostgreSQL gestionada, definidos en `render.yaml`.

Por qué Render: no hay servidores que mantener, despliega solo al hacer push a `main`, tiene región en la UE y PostgreSQL gestionado con copias de seguridad. La app es un Node.js estándar, así que puede moverse a otro proveedor (Railway, Fly.io, un VPS…) sin cambios de código.

> Los nombres de los planes y los precios cambian: revísalos en el panel de Render al crear los servicios. Para la base de datos, elige un plan de pago que incluya **copias de seguridad automáticas** (el gratuito no sirve para datos reales).

## 9.0 Opción gratuita para probar (Render Free + Neon Free)

Es la que está en uso ahora mismo para ver la aplicación. Sirve para probar y enseñar, **no para trabajo real con clientes**:

- **Base de datos en Neon** (plan gratuito, región AWS Frankfurt). Desactiva "Connection pooling" y **quita `&channel_binding=require`** del final de la cadena de conexión (debe terminar en `?sslmode=require`).
- **Aplicación en Render** como *Web Service* creado a mano (**no** con Blueprint, que crea servicios de pago): región Frankfurt, rama `main`, Build `npm ci && npm run build`, Start `npm run db:migrate && npm run start`, tipo **Free**, Health Check `/health`. Variables: `DATABASE_URL` (Neon), `APP_URL`, `BOOTSTRAP_ADMIN_EMAILS`, `NODE_VERSION=22`, `NEXT_TELEMETRY_DISABLED=1`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Limitaciones: la app se duerme tras 15 minutos sin uso (la primera visita tarda ~1 minuto); **los archivos subidos se pierden** al reiniciarse (no hay disco); Neon gratuito solo permite recuperar las últimas horas.

Para trabajo real, usar el Blueprint (`render.yaml`) de las secciones siguientes, con disco y copias de seguridad.

## 9.1 Crear el cliente OAuth de Google

1. Entra en [Google Cloud Console](https://console.cloud.google.com/) con una cuenta de Ideolab y crea un proyecto (p. ej. "Marketing Project Hub").
2. **APIs y servicios → Pantalla de consentimiento de OAuth**:
   - Si Ideolab usa **Google Workspace**, elige tipo **Interno**: solo podrán entrar cuentas de vuestra organización.
   - Si no, elige **Externo** y añade como usuarios de prueba los emails del equipo (o publica la app; solo se piden los permisos básicos `openid`, `email` y `profile`).
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**, tipo **Aplicación web**.
   - URI de redirección autorizado: `https://<tu-servicio>.onrender.com/auth/google/callback` (y `http://localhost:3000/auth/google/callback` si se va a probar en local).
4. Guarda el **ID de cliente** y el **secreto**.

## 9.2 Crear los servicios en Render

1. En Render: **New → Blueprint** y conecta el repositorio `ideolabestudio-gif/Marketing-Project-Hub`. Render lee `render.yaml` y propone la base de datos `mph-db` y el servicio `marketing-project-hub`.
2. Rellena las variables marcadas como secretas:

| Variable | Valor |
|----------|-------|
| `APP_URL` | La URL pública del servicio, p. ej. `https://marketing-project-hub.onrender.com` (sin barra final) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Los del paso 9.1 |
| `BOOTSTRAP_ADMIN_EMAILS` | Tu email de Google (o varios, separados por comas). Entrarán como administradores la primera vez |
| `AUTH_GOOGLE_HOSTED_DOMAIN` | Solo si usáis Google Workspace: vuestro dominio (p. ej. `ideolab.es`). Si no, déjala vacía |

3. El Blueprint crea también un **disco persistente** de 10 GB montado en `/var/data` para los archivos subidos (`STORAGE_DIR=/var/data/storage`). Requiere plan de pago; revisa en el panel que el disco tenga copias (instantáneas).
4. Confirma. En cada despliegue se ejecuta `npm ci && npm run build`, y al arrancar `npm run db:migrate && npm run start` (las migraciones son idempotentes).
5. Comprueba `https://<tu-servicio>/health` → `{"ok":true}`.

## 9.3 Primer acceso

1. Entra en la URL y pulsa **Entrar con Google** con un email de `BOOTSTRAP_ADMIN_EMAILS`.
2. En **Administración → Usuarios**, da de alta al resto del equipo (solo podrán entrar los emails dados de alta).
3. En **Administración → Clientes y proyectos**, crea el cliente piloto (Cerveza Byra) y su proyecto, entra en **Miembros** y asigna roles (incluido el tuyo: el administrador no ve los datos de un proyecto si no es miembro).
4. En el proyecto, **Ajustes → Canales**: añade sus redes y la newsletter.

## 9.4 Copias de seguridad (criterio de F0)

1. En el panel de la base de datos `mph-db`, confirma que las copias de seguridad automáticas están activas en el plan elegido.
2. Haz una **restauración de prueba** en una base de datos nueva y comprueba que la app arranca contra ella. Anota la fecha aquí:
   - Restauración probada: _pendiente_

## 9.5 Desarrollo local

```bash
cp .env.example .env.local            # rellena lo necesario
docker compose up -d db               # PostgreSQL local
npm ci
npm run db:migrate                    # lee DATABASE_URL de .env.local
npm run dev                           # http://localhost:3000
```

Sin credenciales de Google, `npm run dev:session -- tu@email.com` crea un administrador local y una sesión; crea en el navegador la cookie `mph_session` con el token que imprime. Este script se niega a ejecutarse contra un entorno HTTPS.

Pruebas: `npm test` (necesita PostgreSQL; por defecto `postgres://postgres@localhost:5432/postgres`, configurable con `TEST_DATABASE_URL`) y `npm run build && npm run test:e2e`.
