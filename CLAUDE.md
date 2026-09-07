# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

NestJS 11 REST API for a product-labeling system for fractionated chemical products
("Sistema de Etiquetado v2"). It manages fabricantes (manufacturers), productos, lotes
(batches, with COA file upload), plantillas (label templates), usuarios, and a KPIs/ISO
document module (`carpetas`). Label images are generated from Handlebars templates rendered
to PNG via Puppeteer. Code and domain language are Spanish — keep new identifiers,
comments, and error messages in Spanish to match.

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
`EPSON_PRINTER_NAME`, `EPSON_PAPER_SIZE`, `PUPPETEER_EXECUTABLE_PATH` (set to system Chromium
in the Dockerfile).

## KPIs / ISO

Antes de tocar cualquier cosa de KPIs/ISO, leé @contexto-fase3-kpis-iso.md — es la fuente de
verdad de decisiones y pendientes de ese módulo, incluyendo el modelo de permisos granular
(AccesoIndicador/AccesoISO) y las dudas abiertas.

## Architecture notes

**Prisma 7 with driver adapter.** The client is generated to `src/generated/prisma` and is
**committed to git** (regenerate and commit it after any schema change). Runtime instantiation
uses `PrismaPg` (`@prisma/adapter-pg`) — see `src/prisma/prisma.service.ts` (Nest DI, global
module) and `src/lib/prisma.ts` (standalone, used by seeds/scripts). Import Prisma types from
`../generated/prisma`, never `@prisma/client`. `nest-cli.json` copies `generated/prisma` and
`assets/` into `dist/` on build.

**Auth lives entirely in Supabase.** The `Usuario` table is a local mirror keyed by
`supabaseUserId`. `SupabaseAuthGuard` validates the bearer JWT via `supabaseAdmin.auth.getUser`,
loads the mirror row with `permisos` + `accesosIndicador` + `accesoIso`, and attaches it as
`request.usuario` (note: `.usuario`, not `.user`).

**Guard chaining — order matters.** `SupabaseAuthGuard` must come first; `PermisosGuard`,
`EsAdminGuard`, and `AccesoCarpetaGuard` all read the `request.usuario` it populates.
- CRUD modules (`fabricantes`, `productos`, `lotes`, `plantillas`): `SupabaseAuthGuard` +
  `PermisosGuard` with `@RequierePermiso('RECURSO', 'puedeVer'|'puedeCrear'|'puedeEditar'|'puedeEliminar')`.
  `Recurso` enum: LOTES, PRODUCTOS, FABRICANTES, PLANTILLAS, COA, USUARIOS, ETIQUETAS.
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
`AGENT_TOKEN`) — these routes are **not** behind Supabase auth. `EtiquetaGeneratorService` (Puppeteer +
Handlebars) is the actual renderer: it reuses one headless browser, picks a background image by
template filename (`estandar.hbs` / `con-rombo.hbs` / `blanco.hbs` / `muestras.hbs`), and only
embeds the Selawik font as base64 when `process.platform !== 'win32'` (on Windows dev machines real
Segoe UI is used by name). `limpieza-trabajos.service.ts` runs a `@nestjs/schedule` cron cleanup.

**Label templates** are `.hbs` files in `src/assets/templates/`, plus fonts and background images
in `src/assets/`. `getTemplate` re-reads the file every call (no cache) so template edits take effect
without restart. `@nestjs/throttler` applies a global 100 req/IP/min limit.

**Date handling on `Lote`.** `fechaFabricacion` / `fechaVencimiento` are stored as raw `String`
exactly as they appear on the COA (formats vary by supplier). `fechaVencimientoOrden` (`Date?`) is
computed by the service purely for sorting/filtering — never edit it by hand.

**Duplicate prevention.** `Fabricante` and `Producto` have both `nombre` and `nombreNormalizado`
(lowercase, no accents) as unique columns; services must set `nombreNormalizado` on write.

## Global setup (`src/main.ts`)

Global prefix `api`; `ValidationPipe({ whitelist: true, transform: true })` global (DTOs use
`class-validator`); CORS allows `localhost:3000/3001` + `FRONTEND_URL`.
