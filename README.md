# Sistema de Etiquetado v2 — Backend

API REST construida con **NestJS 11** para el Sistema de Etiquetado de productos fraccionados de Excellence Chemical S.A.C. (repo `backend`, parte de `sistema-etiquetado-fraccionados`).

Cubre dos dominios:

1. **Etiquetado** — fabricantes, productos, lotes (con COA y ficha de seguridad), plantillas y generación/impresión de etiquetas (con soporte de rombo NFPA 704).
2. **KPIs / Documentación ISO** (Fase 3) — árbol de carpetas y archivos de gestión, con un modelo de permisos granular propio. El estado de decisiones y pendientes de este módulo vive en [`contexto-fase3-kpis-iso.md`](./contexto-fase3-kpis-iso.md), que es su fuente de verdad.

El código y el lenguaje de dominio están en español; los identificadores, comentarios y mensajes de error nuevos deben mantener esa convención.

## Stack

- **NestJS 11** + TypeScript (`module`/`moduleResolution: nodenext`, `target: ES2023`)
- **Prisma ORM 7.9.1** sobre **PostgreSQL** con **driver adapter** (`@prisma/adapter-pg`); el cliente se genera en `src/generated/prisma` y **está commiteado al repo**
- **Supabase** (`@supabase/supabase-js`) como proveedor de autenticación (`auth.users`) y de almacenamiento (3 buckets, ver abajo)
- **Handlebars** + **Puppeteer 25** para renderizar las plantillas de etiqueta (HTML → PNG)
- `@nestjs/schedule` para la limpieza programada de trabajos de impresión
- `@nestjs/throttler` para rate limiting (100 peticiones/IP/minuto, global)
- `class-validator` / `class-transformer` (`ValidationPipe` global) en la mayoría de los módulos; el módulo `usuario` valida con **zod**

Prefijo global de rutas: **`/api`**.

## Estructura de módulos

| Módulo | Responsabilidad |
|---|---|
| `fabricantes` | CRUD de fabricantes |
| `productos` | CRUD de productos + ficha de seguridad (subir/leer/eliminar) |
| `lotes` | CRUD de lotes + COA (certificado de análisis) |
| `plantillas` | CRUD de plantillas de etiqueta |
| `etiquetas` | Cola de trabajos de impresión, renderizador (Puppeteer + Handlebars) y limpieza programada |
| `usuario` | Perfil propio, administración de usuarios, permisos CRUD y accesos de KPIs/ISO |
| `carpetas` | Módulo KPIs/ISO: árbol de carpetas, archivos y resolución de accesos |
| `prisma` | Módulo global de acceso a base de datos |
| `storage` | Wrapper sobre Supabase Storage |
| `common` | Guards, decoradores y utilidades compartidas |

## Modelo de datos (Prisma)

### Etiquetado

- **Usuario**: espejo local de Supabase Auth (`supabaseUserId` único, `nombre`, `esAdmin`, `esAdminKpis`, `avatarUrl`). Relación 1:N con `Permiso`, `AccesoIndicador` y `TrabajoImpresion`; 1:1 opcional con `AccesoISO`.
- **Permiso**: por usuario + `Recurso` (`LOTES`, `PRODUCTOS`, `FABRICANTES`, `PLANTILLAS`, `COA`, `USUARIOS`, `ETIQUETAS`), con los flags `puedeVer` / `puedeCrear` / `puedeEditar` / `puedeEliminar`.
- **Fabricante** y **Producto**: `nombre` + `nombreNormalizado` (minúsculas, sin acentos), ambos únicos, para evitar duplicados tipo "Ácido Cítrico" vs "acido citrico". Los services **deben** setear `nombreNormalizado` al escribir.
- **Producto**: sin fabricante fijo (varía por lote); campos NFPA opcionales (`nfpaSalud`, `nfpaInflamabilidad`, `nfpaReactividad`, 0-4) y `fichaSeguridadUrl` opcional.
- **Lote**: `numeroLote`, `coaUrl`, único compuesto `[productoId, fabricanteId, numeroLote]`.
  ⚠️ `fechaFabricacion` / `fechaVencimiento` se guardan como **`String` tal cual aparecen en el COA** (el formato varía según el proveedor). `fechaVencimientoOrden` (`DateTime?`) lo calcula el service solo para ordenar/filtrar — **nunca editarlo a mano**.
- **TrabajoImpresion**: `estado` (`PENDIENTE` | `IMPRESO` | `ERROR`), datos de peso/unidades/proforma, `imagenPath`, `mensajeError`, `creadoPorId`.

### KPIs / ISO

- **Carpeta**: `nombre`, `carpetaPadreId` (autorreferencia, `onDelete: Cascade`), `modulo` (`KPIS` | `ISO`), `tipo` (`TipoCarpeta?`: `ANIO`, `PROCESO`, `PERIODO`, `RI`, `DS`, `OBSOLETO`) y `proceso` (`ProcesoIndicador?`, **denormalizado en cada nodo** del subárbol de un proceso).
- **Archivo**: `carpetaId` (`onDelete: Cascade`), `nombre`, `tipo` (`PDF` | `WORD` | `EXCEL` | `POWERPOINT`), `storagePath`, `subidoPorId`, `fechaSubida`.
- **AccesoIndicador**: por usuario + `proceso` (único compuesto), con 5 booleanos independientes: `puedeVer`, `puedeDescargar`, `puedeAdjuntar`, `puedeEditar`, `puedeEliminar`.
- **AccesoISO**: uno por usuario (`usuarioId @unique`), los mismos 5 booleanos + `gestionaObsoleto`.

⚠️ El `onDelete: Cascade` en `Carpeta.carpetaPadre` y `Archivo.carpeta` significa que borrar una carpeta se lleva en silencio todo su subárbol. Verificar que esté vacía antes de borrar.

## Autenticación y permisos

La autenticación vive **100% en Supabase Auth**; el backend solo mantiene un espejo local vinculado por `supabaseUserId`.

`SupabaseAuthGuard` valida el bearer JWT vía `supabaseAdmin.auth.getUser`, carga la fila espejo con `permisos` + `accesosIndicador` + `accesoIso`, y la deja en **`request.usuario`** (ojo: `.usuario`, **no** `.user`).

**El orden de los guards importa**: `SupabaseAuthGuard` va siempre primero, porque todos los demás leen el `request.usuario` que él popula.

| Guard | Uso |
|---|---|
| `SupabaseAuthGuard` | Todas las rutas de usuario final |
| `PermisosGuard` + `@RequierePermiso('RECURSO', 'accion')` | Módulos CRUD (`fabricantes`, `productos`, `lotes`, `plantillas`, generación de etiquetas) |
| `AccesoCarpetaGuard` + `@RequiereAccesoCarpeta({ accion, esArchivo? })` | Módulo `carpetas`. Acciones: `ver`, `descargar`, `crear`, `editar`, `eliminar` |
| `EsAdminGuard` | Administración de usuarios y permisos CRUD (solo `esAdmin`) |
| `EsAdminKpisGuard` | Gestión de accesos de KPIs/ISO (acepta `esAdmin` **o** `esAdminKpis`) |
| `AgentTokenGuard` | Rutas del agente de impresión (header `x-agent-token`, comparación en tiempo constante). **No pasan por Supabase Auth.** |

### Dos sistemas de permisos, desacoplados

- **Módulos CRUD** → tabla `Permiso` (4 booleanos por `Recurso`).
- **KPIs/ISO** → `AccesoIndicador` / `AccesoISO` (5 booleanos + `gestionaObsoleto`).

Son independientes a propósito: un `esAdminKpis` gestiona accesos de KPIs/ISO de otros usuarios y **no** toca los permisos de Lotes/Productos/etc. Tampoco tiene bypass de contenido: para ver algo dentro de KPIs/ISO necesita que a él mismo se le asignen accesos. El `esAdmin` general sí tiene bypass total.

### Resolución de acceso en `carpetas`

`AccesoDocumentosService` resuelve el acceso **recorriendo la cadena de padres**: gana la carpeta más específica. El acceso a KPIS se ata al `proceso` del ancestro más cercano; el de ISO, al concepto ISO completo.

Sobre eso hay **reglas duras en código, no en tablas** (detalle y motivos en la sección 1.1 de `contexto-fase3-kpis-iso.md`):

1. **PDF de ISO no se elimina**, ni siquiera con `puedeEliminar=true`. Solo `esAdmin`. Son la versión oficial aprobada de los documentos de calidad.
2. **Visibilidad por tipo en ISO**: `puedeVer` alcanza para los PDF; Word/Excel/PowerPoint exigen además `puedeEditar` (son borradores de trabajo). Se aplica también al **listar** el contenido de la carpeta, no solo al abrir el archivo.
3. **`gestionaObsoleto`** acopla ver+editar en un único flag para la carpeta `Obsoleto` y devuelve acceso total sobre ella.
4. **Ninguna acción de eliminar procede sin visibilidad**: se evalúa `puedeVerArchivo()` antes de la regla dura del PDF y del flag `puedeEliminar`.
5. **Descarga**: `puedeDescargar` se valida en backend. Excepción — un PDF de ISO se sirve con solo `puedeVer`, porque `GET /archivos/:id/url` es la única fuente de la signed URL que alimenta el visor propio de ISO; exigir `puedeDescargar` ahí dejaría a esos usuarios sin poder **abrir** el documento.

> **Disciplina del módulo**: ningún permiso se declara solo en el frontend. Si la UI oculta un botón por un flag, el guard equivalente valida ese mismo flag antes de tocar la BD.

## Endpoints

Los módulos CRUD (`fabricantes`, `productos`, `lotes`, `plantillas`) siguen el patrón REST estándar (`POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`) bajo `SupabaseAuthGuard` + `PermisosGuard`.

### Archivos adjuntos de etiquetado

- `POST|GET|DELETE /api/lotes/:id/coa` — COA del lote (subir = `puedeEditar`, ver = `puedeVer`, borrar = `puedeEliminar`).
- `POST|GET|DELETE /api/productos/:id/ficha-seguridad` — ficha de seguridad del producto, mismo criterio de permisos.

### Etiquetas — cola de impresión, **no** renderizado síncrono

`POST /api/etiquetas/generar` **no devuelve un PNG**. Crea un `TrabajoImpresion` en estado `PENDIENTE` y devuelve su id. Un agente de impresión externo consume la cola:

| Ruta | Guard | Descripción |
|---|---|---|
| `POST /api/etiquetas/generar` | Supabase + `ETIQUETAS:puedeCrear` | Encola el trabajo, devuelve el id |
| `GET /api/etiquetas/trabajos/pendientes` | `AgentTokenGuard` | El agente hace polling |
| `PATCH /api/etiquetas/trabajos/:id/estado` | `AgentTokenGuard` | El agente reporta `IMPRESO` / `ERROR` |
| `GET /api/etiquetas/trabajos/:id` | Supabase | El frontend consulta el estado — **solo del trabajo propio** (o cualquiera si es `esAdmin`); uno ajeno responde 404 |

`LimpiezaTrabajosService` corre un cron **diario a las 3 AM** que borra los trabajos `IMPRESO`/`ERROR` más viejos que `RETENCION_TRABAJOS_DIAS` (por defecto 3).

### Usuarios

| Ruta | Guard |
|---|---|
| `GET /api/usuarios/me`, `PATCH /api/usuarios/me` | Supabase (cualquiera edita su propio perfil) |
| `POST /api/usuarios`, `GET /api/usuarios` | `EsAdminGuard` |
| `PATCH /api/usuarios/:id/permisos` | `EsAdminGuard` |
| `PATCH /api/usuarios/:id/rol-kpis` | `EsAdminGuard` (asigna/quita `esAdminKpis`) |
| `GET /api/usuarios/lista-basica` | `EsAdminKpisGuard` |
| `GET /api/usuarios/:id/accesos-kpis-iso` | `EsAdminKpisGuard` |
| `PATCH /api/usuarios/:id/accesos-kpis-iso` | `EsAdminKpisGuard` |

Los guards se aplican **por método**, no a nivel de clase: cada ruta nueva necesita su propio `@UseGuards(...)` explícito.

Las respuestas de este módulo se limitan a lo que cada endpoint toca, vía constantes de `select` compartidas en el service. `GET /usuarios/lista-basica` devuelve solo `{ id, nombre, avatarUrl }`; `PATCH /usuarios/:id/rol-kpis` devuelve `{ id, nombre, avatarUrl, esAdmin, esAdminKpis }`; y los dos endpoints de `accesos-kpis-iso` comparten un único `select` (`{ id, nombre, avatarUrl, accesosIndicador, accesoIso }`) que **deliberadamente omite `permisos`**: los puede llamar un `esAdminKpis` que no es `esAdmin`, y ese rol no tiene por qué ver permisos de los módulos CRUD.

### Carpetas y archivos (KPIs/ISO)

| Ruta | Acción requerida |
|---|---|
| `GET /api/carpetas/raiz` | — (el guard deja pasar; el filtrado por accesos lo hace el service) |
| `GET /api/carpetas/:id` | `ver` |
| `GET /api/carpetas/:id/ruta` | `ver` — breadcrumb; devuelve `{ id, nombre, tipo }` por nivel |
| `POST /api/carpetas/:id/archivos` | `crear` (`:id` es la carpeta) |
| `GET /api/archivos/:id/url` | `descargar` (`:id` es el archivo) |
| `DELETE /api/archivos/:id` | `eliminar` (`:id` es el archivo) |

`GET /archivos/:id/url` responde `{ url, esPdfIso }`. **`esPdfIso` no cumple función de autorización** (para cuando el frontend lo recibe, el guard ya bloqueó lo que no correspondía): le indica al frontend que ese archivo va por el visor propio de ISO en vez de descarga directa. Da `true` solo para archivos `PDF` dentro del módulo `ISO`.

El tipo de archivo se infiere del `mimetype` en la subida; un tipo no soportado da `400`.

## Storage (Supabase)

Tres buckets:

| Bucket | Contenido |
|---|---|
| `coas` | COAs de lotes y, bajo su propio prefijo, fichas de seguridad de productos |
| `trabajos-impresion` | Imágenes generadas de las etiquetas |
| `documentos-gestion` | Archivos de KPIs **e** ISO (un solo bucket para los dos) |

## Etiquetas: renderizado

`EtiquetaGeneratorService` (Puppeteer + Handlebars) reutiliza **una sola instancia** del browser headless. Elige la imagen de fondo según el nombre del template (`estandar.hbs` / `con-rombo.hbs` / `blanco.hbs` / `muestras.hbs`), y solo embebe la fuente Selawik en base64 cuando `process.platform !== 'win32'` (en las máquinas de desarrollo Windows se usa la Segoe UI real, por nombre).

`getTemplate` **re-lee el archivo en cada llamada** (sin caché), así que editar un `.hbs` surte efecto sin reiniciar el servidor.

## Variables de entorno

`.env` en la raíz (git-ignored).

```env
# obligatorias
DATABASE_URL=              # Postgres — lo usa el driver adapter en runtime
DIRECT_URL=                # lo usa prisma.config.ts para las migraciones
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
AGENT_TOKEN=               # secreto compartido con el agente de impresión

# opcionales
PORT=3000
FRONTEND_URL=              # se agrega a la lista de CORS
RETENCION_TRABAJOS_DIAS=3  # retención de trabajos de impresión ya cerrados
PUPPETEER_EXECUTABLE_PATH= # Chromium del sistema (lo setea el Dockerfile)
```

⚠️ **`DATABASE_URL` y `DIRECT_URL` no son intercambiables.** El bloque `datasource` del schema **no tiene `url`** (la conexión viene del adapter), y la CLI de Prisma no lee `DATABASE_URL` en este proyecto: toma `DIRECT_URL` desde `prisma.config.ts`. Un `new PrismaClient()` pelado, sin `PrismaPg`, no se conecta.

## Instalación y ejecución

```bash
npm install

# generar el cliente de Prisma (output: src/generated/prisma, commiteado)
npx prisma generate

# migraciones
npx prisma migrate dev --name <slug>   # desarrollo
npx prisma migrate deploy              # producción

# desarrollo (watch, http://localhost:3000, prefijo /api)
npm run start:dev

# producción (nest-cli.json copia generated/prisma y assets a dist/)
npm run build
npm run start:prod

# lint / formato
npm run lint
npm run format

# tests (no hay watchers enganchados: correr a mano)
npm test
npm test -- src/carpetas/acceso-documentos.service.spec.ts   # un archivo
npm test -- -t "nombre del test"                             # un test
npm run test:e2e
```

CORS habilitado para `http://localhost:3000`, `http://localhost:3001` (el frontend en desarrollo) y `FRONTEND_URL`.

### Seeds

```bash
npm run seed:kpis      # árbol de carpetas KPIs/ISO del año (idempotente)
npm run seed:accesos   # asigna AccesoIndicador/AccesoISO por nombre de usuario
```

Ambos corren con `ts-node` **contra el `.ts` directamente**, sin paso de compilación: cualquier `.js`/`.d.ts` en `prisma/seeds/` es un artefacto suelto (gitignored — uno viejo llegó a pisar el seed real).

Ningún seed crea filas de `Archivo`, así que **ninguna fila sembrada puede apuntar a un `storagePath` inexistente** en Supabase Storage.

> Los seeds usan `ts-node`, no `tsx`, a propósito: `tsx` (esbuild) no emite `emitDecoratorMetadata`, que la inyección de dependencias de Nest necesita. Un script que levante el contexto de Nest y se ejecute con `tsx` recibe dependencias sin inicializar.

## Tests

- `src/carpetas/acceso-documentos.service.spec.ts` — 12 casos sobre las reglas de acceso a archivos: regla dura de PDFs de ISO, visibilidad por tipo, visibilidad previa a eliminar, y la validación de descarga con su excepción del visor.
- `src/app.controller.spec.ts` — smoke test.

## Convenciones y trampas conocidas

- **Importar tipos de Prisma desde `../generated/prisma`, nunca desde `@prisma/client`.**
- Regenerar **y commitear** `src/generated/prisma` después de cada cambio de schema.
- Español en identificadores, comentarios y mensajes de error.
- `request.usuario`, no `request.user`.
- Antes de tocar cualquier cosa de KPIs/ISO, leer [`contexto-fase3-kpis-iso.md`](./contexto-fase3-kpis-iso.md).
- Puppeteer necesita las dependencias de sistema de Chromium headless; en Docker/servidor hay que instalarlas (el `Dockerfile` ya lo resuelve vía `PUPPETEER_EXECUTABLE_PATH`).
- No existe ningún concepto de "rol" genérico: la autorización es siempre por flags (`Permiso`, `AccesoIndicador`/`AccesoISO`) o por los booleanos `esAdmin`/`esAdminKpis`. Hubo un `RolesGuard` + `@Roles(...)` basado en un `request.user.rol` inexistente; se eliminó por código muerto. Para una ruta nueva, usar alguno de los guards de la tabla de arriba.
