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

npm test                 # jest, runs *.spec.ts under src/
npm test -- path/to/file.spec.ts        # single test file
npm test -- -t "nombre del test"        # single test by name
npm run test:e2e         # jest --config ./test/jest-e2e.json

npx prisma migrate dev --name <slug>    # create + apply a migration
npx prisma generate                     # regen client into src/generated/prisma (committed!)
npm run seed:kpis                        # crea el árbol de carpetas KPIs/ISO del año (prisma/seeds/kpis-iso-2026.seed.ts)
npm run seed:accesos                     # asigna AccesoIndicador/AccesoISO por nombre de usuario (prisma/seeds/accesos-kpis-iso.seed.ts)
```

There are no watchers wired to tests; run `npm test` manually.

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

## KPIs / ISO

Antes de tocar cualquier cosa de KPIs/ISO, leé @contexto-fase3-kpis-iso.md — es la fuente de
verdad de decisiones y pendientes de ese módulo, incluyendo el modelo de permisos granular
(AccesoIndicador/AccesoISO) y las dudas abiertas.

## Architecture notes

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
- CRUD modules (`fabricantes`, `productos`, `lotes`, `plantillas`): `SupabaseAuthGuard` +
  `PermisosGuard` with `@RequierePermiso('RECURSO', 'puedeVer'|'puedeCrear'|'puedeEditar'|'puedeEliminar')`.
  `Recurso` enum: LOTES, PRODUCTOS, FABRICANTES, PLANTILLAS, COA, USUARIOS, ETIQUETAS, PEDIDOS.
  `COA` is a leftover: no guard uses it (COA upload is `LOTES.puedeEditar`) and the Zod enum in
  `usuarios.dto.ts` no longer accepts it; removing it from Prisma would need an enum migration.
  `clientes` and `pedidos` both gate on `PEDIDOS` — clients only exist today to feed the pedido
  form's autocomplete, they don't warrant their own `Recurso`.
- `carpetas` module: `SupabaseAuthGuard` + `AccesoCarpetaGuard` with `@RequiereAccesoCarpeta({ accion })`.
  Access is resolved per-folder by walking the parent chain (`AccesoDocumentosService`): most-specific
  folder wins; KPIS access is tied to a `proceso`, ISO access to the whole ISO concept
  (`AccesoIndicador` / `AccesoISO` tables). Special hardcoded rules live in the service, not tables:
  ISO "Obsoleto" folders and any ISO PDF are edit-total only.
- Admin-only user routes: `EsAdminGuard`.

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

**Duplicate prevention.** `Fabricante`, `Producto`, and `Cliente` all have both `nombre` and
`nombreNormalizado` (lowercase, no accents) as unique columns; services must set
`nombreNormalizado` on write.

**`Pedido` has no `estado` column.** It's derived in `pedidos.service.ts` from which of
`preparadoEn`/`salioEn`/`entregadoEn` are set (null = that stage hasn't happened yet) — this
keeps a displayed status from ever drifting out of sync with the actual timestamps. All four
stage timestamps (`recibidoEn` included) stay editable after being set: the frontend precharges
"now" when marking a stage, but warehouse staff often only log a delivery after leaving for the
day, so the real time has to be correctable, not locked in. `ultimoEditadoPorId` tracks the last
person who touched a pedido (not a full audit trail — see `contexto` discussion if that's ever
needed). Clients were bulk-imported once from a real Excel client list; there's no seed script
for it (was a throwaway one-off, not committed).

## Global setup (`src/main.ts`)

Global prefix `api`; `ValidationPipe({ whitelist: true, transform: true })` global (DTOs use
`class-validator`); CORS allows `localhost:3000/3001` + `FRONTEND_URL`.
