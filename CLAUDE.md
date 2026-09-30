# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

NestJS 11 REST API for "Sistema de Gestión Excellence Chemical" — an operations management
system for Excellence Chemical S.A.C. (repo folder name still says "Etiquetado" for historical
reasons; that's cosmetic, the system covers more than labeling now). It manages fabricantes
(manufacturers), productos, lotes (batches, with COA file upload), plantillas (label templates),
usuarios, a KPIs/ISO document module (`carpetas`), and an order lead-time module (`pedidos` +
`clientes`). The
API queues label print jobs; the label image itself is rendered by the separate
`agente-impresion` app. Code and domain language are Spanish — keep new identifiers, comments,
and error messages in Spanish to match.

## Commands

```bash
npm run start:dev        # watch mode, http://localhost:3000, global prefix /api
npm run build            # nest build → dist/
npm run lint             # eslint --fix over {src,apps,libs,test}
npm run format           # prettier --write

npm test                 # jest, runs *.spec.ts under src/ (no DB or Supabase needed)
npm test -- path/to/file.spec.ts        # single test file
npm test -- -t "nombre del test"        # single test by name
npm run test:e2e         # jest --config ./test/jest-e2e.json

npx prisma migrate dev --name <slug>    # create + apply a migration (elsewhere: npx prisma migrate deploy)
npx prisma generate                     # regen client into src/generated/prisma (committed!)
npm run seed:kpis                        # crea el árbol de carpetas KPIs/ISO del año (prisma/seeds/kpis-iso-2026.seed.ts)
npm run seed:accesos                     # asigna AccesoIndicador/AccesoISO por nombre de usuario (prisma/seeds/accesos-kpis-iso.seed.ts)
```

There are no watchers wired to tests; run `npm test` manually. GitHub Actions
(`.github/workflows/ci.yml`) runs `npm test` and `npm run build` on every push.

Both seeds run through `ts-node` against the `.ts` directly — there is no compile step, so any
`.js`/`.d.ts` sitting in `prisma/seeds/` is a stray artifact (gitignored; a stale one once
overwrote the real seed source). Neither seed creates `Archivo` rows, so no seeded row can point
at a `storagePath` that does not exist in Supabase Storage.

## Environment

`.env` at repo root (git-ignored). Required: `DATABASE_URL` (Postgres, used at runtime by the
pg driver adapter), `DIRECT_URL` (used by `prisma.config.ts` for migrations — Prisma CLI does
**not** read `DATABASE_URL` here), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AGENT_TOKEN`
(shared secret for the print agent). Optional: `PORT` (3000), `FRONTEND_URL` (added to CORS),
`EPSON_PRINTER_NAME`, `EPSON_PAPER_SIZE`.
`SEGUIMIENTO_DIAS_TRAS_ENTREGA` (90) es cuánto sigue abriendo el enlace público `/p/<token>` de
un pedido entregado.

## KPIs / ISO

Antes de tocar cualquier cosa de KPIs/ISO, leé @contexto-fase3-kpis-iso.md — es la fuente de
verdad de decisiones y pendientes de ese módulo, incluyendo el modelo de permisos granular
(AccesoIndicador/AccesoISO) y las dudas abiertas.

## Architecture notes

**Row Level Security is ON for every table** (migration `activar_rls`, no policies). Supabase exposes the
`public` schema over HTTP and the anon key ships in the frontend, so without RLS anyone could read the tables
directly, bypassing every guard. The backend is unaffected: it connects as `postgres` (table owner, BYPASSRLS).
**Any migration that creates a table must also `ENABLE ROW LEVEL SECURITY` on it.** Deploys run
`prisma migrate deploy` before starting (see `Dockerfile`), so `DIRECT_URL` must be set in the host's env.

**Avatars go through the backend.** `POST /usuarios/me/avatar` (multipart `file`) uploads to the `avatars` bucket with the service key; the bucket is public-read with **no client write policies** (migration `avatars_solo_lectura_publica`). Don't upload from the browser and don't accept `avatarUrl` in `PATCH /usuarios/me`.

**Prisma 7 with driver adapter.** The client is generated to `src/generated/prisma` and is
**committed to git** (regenerate and commit it after any schema change). Runtime instantiation
uses `PrismaPg` (`@prisma/adapter-pg`) — see `src/prisma/prisma.service.ts` (Nest DI, global
module) and `src/lib/prisma.ts` (standalone, used by seeds/scripts). Import Prisma types from
`../generated/prisma`, never `@prisma/client`. `nest-cli.json` copies `generated/prisma`
into `dist/` on build.

**Auth lives entirely in Supabase.** The `Usuario` table is a local mirror keyed by
`supabaseUserId`. `SupabaseAuthGuard` validates the bearer JWT via `supabaseAdmin.auth.getUser`,
loads the mirror row with `permisos` + `accesosIndicador` + `accesoIso`, and attaches it as
`request.usuario` (note: `.usuario`, not `.user`).

**Guard chaining — order matters.** `SupabaseAuthGuard` must come first; `PermisosGuard`,
`EsAdminGuard`, and `AccesoCarpetaGuard` all read the `request.usuario` it populates.
- CRUD modules (`fabricantes`, `productos`, `lotes`, `plantillas`, `pedidos`, `clientes`, `cotizaciones`):
  `SupabaseAuthGuard` + `PermisosGuard` with `@RequierePermiso('RECURSO', 'puedeVer'|'puedeCrear'|'puedeEditar'|'puedeEliminar')`.
  `Recurso` enum: LOTES, PRODUCTOS, FABRICANTES, PLANTILLAS, USUARIOS, ETIQUETAS, PEDIDOS, COTIZACIONES,
  CLIENTES. There is no `COA` resource (removed by the `quitar_recurso_coa` migration): COA upload is
  `LOTES.puedeEditar`. `pedidos`, `cotizaciones`, and `clientes` used to all gate on `PEDIDOS` but were
  split into their own resources: the three have different owners in practice (one person despachos
  pedidos, another cotiza, Clientes can be a third), so access needs to be grantable independently. The
  frontend's `Permisosgrid.vue` auto-ticks `CLIENTES.puedeVer`+`puedeCrear` when `PEDIDOS.puedeCrear` or
  `COTIZACIONES.puedeCrear` is granted, since both forms' client combobox and "create new client" link
  read/write `/clientes`.
- `carpetas` module: `SupabaseAuthGuard` + `AccesoCarpetaGuard` with `@RequiereAccesoCarpeta({ accion })`.
  Access is resolved per-folder by walking the parent chain (`AccesoDocumentosService`): most-specific
  folder wins; KPIS access is tied to a `proceso`, ISO access to the whole ISO concept
  (`AccesoIndicador` / `AccesoISO` tables). Special hardcoded rules live in the service, not tables:
  ISO "Obsoleto" folders and any ISO PDF are edit-total only.
- Admin-only user routes: `EsAdminGuard`.
- **Deactivated accounts.** `Usuario.activo=false` (set by `PATCH /usuarios/:id/activo`, admin only,
  never on oneself) keeps the row and its history but `SupabaseAuthGuard` answers 403 with
  `code: 'CUENTA_DESACTIVADA'` — the frontend keys off that code to sign the user out. Who/when is in
  `desactivadoPorId`/`desactivadoEn`. It is the way out for users `DELETE /usuarios/:id` refuses (409:
  they have labels, pedidos or files). Every deactivate/reactivate/delete/permission change writes a
  `RegistroAuditoria` row (no foreign keys, names copied, so it survives deleting either user); read it with
  `GET /usuarios/auditoria` (admin only). A failure to write it never blocks the action itself.
- **Second factor (TOTP).** `SupabaseAuthGuard` also calls `evaluarMfa` (`src/common/auth/mfa.ts`): if `getUser().factors`
  has a *verified* factor, the JWT's `aal` claim must be `aal2`, else 403 `code: 'MFA_REQUERIDO'` — enforcement is here,
  not just in the frontend, otherwise a password-only session could call the API directly. `EXIGIR_MFA_ADMIN=true` also
  makes admins without a factor get 403 `MFA_ENROLAR` everywhere except `GET /usuarios/me`. Default is off (optional);
  turn it on only after every admin has enrolled. The lost-phone recovery is removing the factor in the Supabase dashboard.
- **Permission coverage test.** `src/common/guards/cobertura-permisos.spec.ts` reads the Nest metadata of
  every controller and fails if a route has no session guard, no restricting guard, a `PermisosGuard`
  without a valid `@RequierePermiso`, or a write route gated only by `puedeVer`. **A new controller must be
  added to its `CONTROLLERS` list** (a forgotten one is not detected). Routes that intentionally skip a
  guard go in its `PUBLICAS` / `SOLO_SESION` lists, each with a reason.

**Print job queue (not synchronous rendering).** `POST /api/etiquetas/generar` does not return a
PNG. It creates a `TrabajoImpresion` row (status PENDIENTE) and returns its id. An external print
agent polls `GET /api/etiquetas/trabajos/pendientes` and `PATCH /api/etiquetas/trabajos/:id/estado`,
authenticated with the `x-agent-token` header (`AgentTokenGuard`, constant-time compare against
`AGENT_TOKEN`) — these routes are **not** behind Supabase auth. The backend does not render
labels: the agent renders the `.hbs` templates (Puppeteer + Handlebars) and prints. The
`plantillas` table only stores the template filename. `limpieza-trabajos.service.ts` runs a
`@nestjs/schedule` cron cleanup.

**GHS / fichas de seguridad.** `Producto` guarda `pictogramasGhs`, `palabraAdvertencia`, `frasesH` y
`frasesP`; se muestran solo en la página pública del QR (`etiquetas-publicas.service.ts`), no en la
etiqueta impresa. `productos/fds-parser.ts` propone esos datos leyendo el PDF de la ficha
(`POST /productos/analizar-ficha`, sin OCR). `lotes.service.remove()` rechaza borrar un lote con un
QR vigente (`qrVigente()`, en `etiquetas/qr-vigencia.ts`) — la vigencia sigue el vencimiento real
del lote (`fechaVencimientoOrden` + `QR_MARGEN_RETENCION_DIAS`, un año por defecto), no una
cantidad fija de días desde que se imprimió; si el lote no tiene una fecha de vencimiento
parseable, cae a un plazo fijo desde la impresión (`QR_VIGENCIA_DIAS`, 730 días) como respaldo.

**Label templates** live in the `agente-impresion` repo (`assets/templates/`), not here.
`@nestjs/throttler` applies a global 100 req/IP/min limit.

**Date handling on `Lote`.** `fechaFabricacion` / `fechaVencimiento` are stored as raw `String`
exactly as they appear on the COA (formats vary by supplier). `fechaVencimientoOrden` (`Date?`) is
computed by the service purely for sorting/filtering — never edit it by hand.

**Cliente contact authorization.** `Cliente.autorizaContactoEn` (`DateTime?`) records when staff confirmed the client was
informed and authorizes the use of celular/correo; the API takes `autorizaContacto: boolean` and stores the date
(marking again keeps the original date, `false` clears it). Null = no record (legacy import). It does not gate sending.

**Duplicate prevention.** `Fabricante`, `Producto`, and `Cliente` all have both `nombre` and
`nombreNormalizado` (lowercase, no accents) as unique columns; services must set
`nombreNormalizado` on write.

**`Pedido` has no `estado` column.** It's derived in `pedidos.service.ts` from which of
`inicioPreparacionEn`/`preparadoEn`/`salioEn`/`entregadoEn` are set (null = that stage hasn't happened yet;
the furthest stage wins: RECIBIDO < EN_PREPARACION < PREPARADO < SALIO < ENTREGADO) — this
keeps a displayed status from ever drifting out of sync with the actual timestamps. All four
stage timestamps (`recibidoEn` included) stay editable after being set: the frontend precharges
"now" when marking a stage, but warehouse staff often only log a delivery after leaving for the
day, so the real time has to be correctable, not locked in. `ultimoEditadoPorId` tracks the last
person who touched a pedido (not a full audit trail — see `contexto` discussion if that's ever
needed). Clients were bulk-imported once from a real Excel client list; there's no seed script
for it (was a throwaway one-off, not committed).

**Seguimiento del pedido.** Cada `Pedido` tiene `tokenSeguimiento` (lo genera la base, 122 bits): es la
única llave de la página pública `/p/<token>` (`GET /api/publico/pedidos/:token`, sin sesión, lista cerrada de campos,
404 igual para inexistente y caducado).

**El aviso por correo al cliente NO vive en este backend.** `Pedido.avisoSalioEnviadoEn` /
`avisoEntregadoEnviadoEn` existen en el schema pero ningún service de este repo los lee ni escribe —
no hay `NotificacionesService` ni integración con Resend; ambos se mencionaban antes en este
archivo como si estuvieran implementados y nunca se llegaron a codear (Resend exige un dominio
verificado que no se tiene). El aviso real corre por fuera, como un workflow de **n8n** que hace
polling sobre `GET /pedidos` y manda el correo por SMTP (`sistemas@excellencechemical.com`) —
ver ese workflow para la lógica de qué se considera "pendiente de aviso" y cómo se marca. Si en
algún momento se decide mover esa lógica a este backend, hay que decidir primero si sigue
viviendo solo en n8n o si se reescribe acá para no terminar con dos sistemas mandando el mismo
correo sin coordinarse.

**El aviso de "pedido vencido" SÍ vive en este backend, como notificación interna (no correo).**
`NotificacionesModule` (`GET /notificaciones`, `GET /notificaciones/no-leidas/cantidad`,
`PATCH /notificaciones/:id/leer`, `PATCH /notificaciones/leer-todas`, todas solo con
`SupabaseAuthGuard` — cada una filtra por el usuario del token, ver `SOLO_SESION` en
`cobertura-permisos.spec.ts`) expone la bandeja. `AlertasPedidosService` (`pedidos/alertas-pedidos.service.ts`,
cron `@nestjs/schedule` cada 30 min) revisa pedidos sin `entregadoEn` que acumularon ≥48 horas
**hábiles** (`common/fecha/horas-habiles.ts`: lunes a viernes, 7:30am–5:30pm, sin contar noches ni
fines de semana) desde `recibidoEn`, y crea una `Notificacion` para cada usuario con
`esAdmin=true` o `PEDIDOS.puedeVer=true`. `Pedido.alerta48hEnviadaEn` evita mandarla dos veces,
mismo patrón que `avisoSalioEnviadoEn`. Es un sistema separado del aviso por correo al cliente de
arriba — uno es interno (personal de la empresa), el otro es externo (al cliente). El refrigerio de
cada `Usuario` (`refrigerioInicioMinutos`/`refrigerioFinMinutos`, minutos desde medianoche, editado
por un Admin vía `PATCH /usuarios/:id/refrigerio`) se descuenta del conteo: `horasHabilesEntre()`
toma la intersección de los refrigerios de quienes pueden marcar el pedido como entregado
(`PEDIDOS.puedeEditar` + admins) — si están escalonados, no se descuenta nada.

`AlertasPedidosService` corre en realidad DOS alertas, nunca las dos a la vez para el mismo
pedido: `PEDIDO_VENCIDO` (≥48h hábiles desde `recibidoEn`, solo mientras `salioEn` sigue null) y
`PEDIDO_SALIO_SIN_ENTREGAR` (≥24h hábiles desde `salioEn`, una vez que ya salió — umbral más corto
por ser la etapa final). Cada una con su propio campo de dedupe (`alerta48hEnviadaEn` /
`alertaSalioSinEntregarEnviadaEn`), así que un pedido puede recibir primero una y después la otra
según cómo avance, pero nunca ambas al mismo tiempo.

**El recordatorio de "cotización sin avisar a almacén" también es notificación interna, ya no
correo.** Antes lo disparaba un cron de n8n que llamaba `POST /cotizaciones/recordatorios/despachar`
(ruta eliminada) y mandaba un correo — se sacó porque el correo se revisaba poco.
`AlertasCotizacionesService` (`cotizaciones/alertas-cotizaciones.service.ts`) corre dos cosas:
- Cada 15 min, llama directo a `CotizacionesService.findPendientesDeRecordatorio()` (cotizaciones
  aprobadas hace más de 1h sin `avisoAlmacenEn`, SLA de reloj real, no horas hábiles — sin cambios
  respecto a la política previa) y crea `COTIZACION_SIN_AVISO_ALMACEN`.
- Cada 30 min, revisa cotizaciones sin `cotizacionEnviadaEn` con ≥24h **hábiles** desde
  `requerimientoEn` (`alertaLentaEnviadaEn` como dedupe) y crea `COTIZACION_RESPUESTA_LENTA`.

Ambas notifican a cada usuario con `COTIZACIONES.puedeEditar` o `esAdmin`; el refrigerio que se
descuenta en la segunda es el de ese mismo grupo (Joel/Alice), no el de Pedidos.

**`ResumenDiarioService` (`notificaciones/resumen-diario.service.ts`) manda un único mensaje
diario con lo que sigue abierto, para que las alertas puntuales de arriba no dependan de que
alguien revise Mensajería seguido.** Cron `0 8 * * 1-5` (L-V 8am): cuenta, con `Prisma.count()`,
las entidades que ya dispararon alguna de las 4 alertas puntuales y siguen sin resolverse
(`alerta48hEnviadaEn`/`alertaSalioSinEntregarEnviadaEn` en Pedido con la etapa siguiente aún null;
`recordatorioEnviadoEn`/`alertaLentaEnviadaEn` en Cotizacion igual) — no vuelve a calcular horas
hábiles, reusa el trabajo que ya hicieron los crons puntuales. Si no hay nada pendiente **no manda
nada** (día tranquilo se queda tranquilo, a propósito para no volverse tedioso). Dedupe: si ya
existe una `Notificacion` `RESUMEN_DIARIO` creada desde la medianoche, no manda otra — cubre
reinicios del proceso el mismo día, no hace falta un campo nuevo en ningún modelo. Destinatarios:
unión de quienes reciben alertas de Pedidos (`PEDIDOS.puedeVer`) y de Cotizaciones
(`COTIZACIONES.puedeEditar`) + admins.

**`Cotizacion` (módulo `cotizaciones`) — seguimiento del proceso de Joel, con auditoría contra
manipulación de fechas.** Mismo patrón que `Pedido` (sin columna `estado`, derivado en
`cotizaciones.service.ts` de qué de `cotizacionEnviadaEn`/`pedidoAprobadoEn`/`avisoAlmacenEn` está
seteado). De las 4 fechas, 3 (`CAMPOS_PROTEGIDOS`: `cotizacionEnviadaEn`, `pedidoAprobadoEn`,
`avisoAlmacenEn`) **no son libremente editables**: surgió porque un vendedor cargaba datos
retroactivos (incluso de días de vacaciones) para mejorar su propio indicador de tiempo de
respuesta, algo que el Excel anterior no podía detectar. La política, igual para esas 3:
- **Al marcar por primera vez**, el valor que mande el cliente HTTP se ignora — `create()`/`update()`
  siempre usan `new Date()` del servidor. Nadie elige la fecha real de cada etapa.
- **Corregir una fecha ya marcada** es exclusivo de `esAdmin` (chequeado en el service, no solo
  oculto en el frontend) y exige `motivoCorreccion` no vacío (`BadRequestException` si falta,
  `ForbiddenException` si no es admin).

`requerimientoEn` (fecha en que llegó el pedido del cliente) quedó **afuera** de esa protección a
pedido explícito del negocio: es de carga y edición libre desde `create()`/`update()`, sin exigir
`esAdmin` ni `motivoCorreccion` (ver comentario en `CAMPOS_PROTEGIDOS`, `cotizaciones.service.ts`).
Esto reabre el hueco que la política original evitaba para ese campo puntual — decisión consciente,
no un descuido. Sigue incluida en `calcularAlertasCotizacion()` (feriado/ausencia/carga tardía)
como control informativo, nunca bloqueante.
- Cada cambio (incluida la marca inicial) escribe una fila en `CotizacionHistorial` (`campo`,
  `valorAnterior`, `valorNuevo`, `motivo`, `editadoPorId`, `editadoEn` con `@default(now())`,
  inmutable) dentro de la misma `$transaction` que el `update` — es la evidencia real de cuándo
  se tocó cada dato, algo que una celda de Excel no guarda.
- `calcularAlertasCotizacion()` (exportada del service, cubierta por tests) marca cada fecha con
  `FERIADO_O_FIN_DE_SEMANA` (cae en día no laboral, `common/fecha/feriados-peru.ts`, feriados de
  Perú + fin de semana), `AUSENCIA_REGISTRADA` (cae dentro de una ausencia del creador o último
  editor, ver `AusenciasModule` abajo) o `CARGA_TARDIA` (el historial registra el cambio más de
  `UMBRAL_CARGA_TARDIA_HORAS` — 24h — después de la fecha que dice). Las alertas **no ocultan ni
  excluyen** la cotización de nada: se muestran junto al dato para que un supervisor decida, misma
  filosofía que "no confiar ciegamente" del módulo KPIs/ISO.
- `AusenciasModule` (`GET`/`POST`/`DELETE /ausencias`, `EsAdminGuard`) es un registro simple de
  vacaciones/licencias por usuario (`usuarioId`, `desde`, `hasta` como `@db.Date`, `motivo?`) que
  solo sirve de fuente de verdad para el chequeo de arriba — no es un módulo de RR.HH.
- `numeroProforma` es `@unique`; marcar "cotización enviada" sin proforma (ni en el PATCH ni ya
  guardada) da `BadRequestException`, y un duplicado da `ConflictException` (P2002 mapeado) con
  mensaje legible.

## Global setup (`src/main.ts`)

Global prefix `api`; `ValidationPipe({ whitelist: true, transform: true })` global (DTOs use
`class-validator`); CORS allows `localhost:3000/3001` + `FRONTEND_URL`.
