# Sistema de Gestión Excellence Chemical — Backend

API REST construida con **NestJS 11** para el Sistema de Gestión de Excellence Chemical S.A.C. (repo `backend`; el nombre de carpeta sigue diciendo "Etiquetado" por motivos históricos, pero el sistema ya cubre más que eso).

Cubre estos dominios:

1. **Etiquetado** — fabricantes, productos, lotes (con COA y ficha de seguridad), plantillas y generación/impresión de etiquetas (con soporte de rombo NFPA 704).
2. **KPIs / Documentación ISO** (Fase 3) — árbol de carpetas y archivos de gestión, con un modelo de permisos granular propio. El estado de decisiones y pendientes de este módulo vive en [`contexto-fase3-kpis-iso.md`](./contexto-fase3-kpis-iso.md), que es su fuente de verdad.
3. **Pedidos / tiempo de entrega** — reemplaza el registro manual en Excel del lead time de pedidos (recepción → inicio de preparación → preparado → salida → entrega), con su lista de clientes. Permisos vía el recurso `PEDIDOS`.

El código y el lenguaje de dominio están en español; los identificadores, comentarios y mensajes de error nuevos deben mantener esa convención.

## Stack

- **NestJS 11** + TypeScript (`module`/`moduleResolution: nodenext`, `target: ES2023`)
- **Prisma ORM 7.9.1** sobre **PostgreSQL** con **driver adapter** (`@prisma/adapter-pg`); el cliente se genera en `src/generated/prisma` y **está commiteado al repo**
- **Supabase** (`@supabase/supabase-js`) como proveedor de autenticación (`auth.users`) y de almacenamiento (3 buckets, ver abajo)
- `@nestjs/schedule` para la limpieza programada de trabajos de impresión
- `@nestjs/throttler` para rate limiting (100 peticiones/IP/minuto, global)
- `class-validator` / `class-transformer` (`ValidationPipe` global) en la mayoría de los módulos; el módulo `usuario` valida con **zod**

Prefijo global de rutas: **`/api`**.

## Monitoreo

`GET /api/salud` (público, sin datos) responde `200 { ok: true, db: true }` solo si el servidor está arriba **y** la base contesta; si la base no responde, `503`. El workflow `.github/workflows/salud.yml` lo consulta cada 15 minutos (con reintentos, porque Render puede dormir el servicio) y, si no responde 200, falla y GitHub avisa por correo. Para activarlo hay que definir la variable de repositorio `SALUD_URL` (por ejemplo `https://<tu-backend>.onrender.com/api/salud`); sin ella el chequeo se salta.

## Estructura de módulos

| Módulo | Responsabilidad |
|---|---|
| `fabricantes` | CRUD de fabricantes |
| `productos` | CRUD de productos + ficha de seguridad (subir/leer/eliminar) |
| `lotes` | CRUD de lotes + COA (certificado de análisis) |
| `plantillas` | CRUD de plantillas de etiqueta |
| `pedidos` | CRUD de pedidos; el estado se **deriva** de las fechas de cada etapa (no hay columna `estado`) |
| `clientes` | CRUD de clientes; alimenta el autocompletado del formulario de pedido |
| `etiquetas` | Cola de trabajos de impresión, y limpieza programada (el renderizado lo hace `agente-impresion`) |
| `usuario` | Perfil propio, administración de usuarios, permisos CRUD y accesos de KPIs/ISO |
| `carpetas` | Módulo KPIs/ISO: árbol de carpetas, archivos y resolución de accesos |
| `prisma` | Módulo global de acceso a base de datos |
| `storage` | Wrapper sobre Supabase Storage |
| `common` | Guards, decoradores y utilidades compartidas |

## Modelo de datos (Prisma)

### Etiquetado

- **Usuario**: espejo local de Supabase Auth (`supabaseUserId` único, `nombre`, `esAdmin`, `esAdminKpis`, `avatarUrl`). Relación 1:N con `Permiso`, `AccesoIndicador` y `TrabajoImpresion`; 1:1 opcional con `AccesoISO`. `activo` (por defecto `true`): en `false` la cuenta no puede usar el sistema pero conserva su historial; `desactivadoEn` / `desactivadoPorId` dicen cuándo y quién la desactivó.
- **Permiso**: por usuario + `Recurso` (`LOTES`, `PRODUCTOS`, `FABRICANTES`, `PLANTILLAS`, `USUARIOS`, `ETIQUETAS`, `PEDIDOS`; no existe un recurso `COA`: subir el COA es `LOTES.puedeEditar`), con los flags `puedeVer` / `puedeCrear` / `puedeEditar` / `puedeEliminar`.
- **Fabricante** y **Producto**: `nombre` + `nombreNormalizado` (minúsculas, sin acentos), ambos únicos, para evitar duplicados tipo "Ácido Cítrico" vs "acido citrico". Los services **deben** setear `nombreNormalizado` al escribir.
- **Producto**: sin fabricante fijo (varía por lote); campos NFPA opcionales (`nfpaSalud`, `nfpaInflamabilidad`, `nfpaReactividad`, 0-4) y `fichaSeguridadUrl` opcional. Clasificación GHS opcional, que se muestra solo en la página pública del QR (no en la etiqueta impresa): `pictogramasGhs` (códigos `GHS01`–`GHS09`), `palabraAdvertencia` (`PELIGRO` | `ATENCION`), `frasesH` y `frasesP`.
- **Lote**: `numeroLote`, `coaUrl`, único compuesto `[productoId, fabricanteId, numeroLote]`.
  ⚠️ `fechaFabricacion` / `fechaVencimiento` se guardan como **`String` tal cual aparecen en el COA** (el formato varía según el proveedor). `fechaVencimientoOrden` (`DateTime?`) lo calcula el service solo para ordenar/filtrar — **nunca editarlo a mano**.
- **TrabajoImpresion**: `estado` (`PENDIENTE` | `IMPRESO` | `ERROR`), datos de peso/unidades/proforma, `imagenPath`, `mensajeError`, `creadoPorId` y `token` (código imposible de adivinar que va en el QR impreso; abre la página pública de trazabilidad de **esa** etiqueta). El QR sigue vigente hasta `QR_MARGEN_RETENCION_DIAS` (por defecto 365) después del vencimiento del lote (`fechaVencimientoOrden`); si el lote no tiene una fecha parseable, cae a un plazo fijo desde la impresión (`QR_VIGENCIA_DIAS`, por defecto 730). Ver `etiquetas/qr-vigencia.ts`. También lleva contadores de uso de esa página pública: `escaneos`/`ultimoEscaneoAt` (aperturas del QR), `coaVistas`/`coaDescargas` (botones "Ver"/"Descargar" del COA) y `fdsVistas` (botón de la ficha de seguridad) — los tres últimos se incrementan en `EtiquetasPublicasService`.

### Pedidos y clientes

- **Cliente**: `nombre` + `nombreNormalizado` (únicos, igual que Fabricante/Producto), `tipoDocumento` (`RUC` | `DNI` | `CARNET_EXTRANJERIA`), `numeroDocumento`, `direccion`, `celular`.
- **Pedido**: `clienteId` (`onDelete: Restrict`), `numeroProforma`, y las fechas de cada etapa: `recibidoEn`, `inicioPreparacionEn`, `preparadoEn`, `salioEn`, `entregadoEn` (todas editables, porque el personal a veces registra la entrega al terminar el día). `categoriaObservacion` (`INSUMO_EN_IMPORTACION`, `INSUMO_SIN_STOCK`, `RECOGE_EN_ALMACEN`, `IMPORTACION_EXPORTACION`, `CANCELADO`, `OTRO`) y `detalleObservacion`. `creadoPorId` y `ultimoEditadoPorId` registran quién lo creó y quién lo tocó por última vez (no es una auditoría completa).
- **No hay columna `estado`**: `derivarEstado()` en `pedidos.service.ts` la calcula. Gana la etapa más avanzada con fecha: `ENTREGADO` > `SALIO` > `PREPARADO` > `EN_PREPARACION` > `RECIBIDO`. Así el estado mostrado no puede desincronizarse de las fechas reales.

### Auditoría de cuentas

- **RegistroAuditoria** (`registro_auditoria`): `accion` (`USUARIO_DESACTIVADO` | `USUARIO_REACTIVADO` | `USUARIO_ELIMINADO` | `PERMISOS_ACTUALIZADOS`), `actorId`/`actorNombre`, `objetivoId`/`objetivoNombre`, `detalle` y `createdAt`. **Sin claves foráneas** y con los nombres copiados, a propósito: el registro tiene que sobrevivir a que se elimine el usuario afectado o el admin que actuó. Si no se puede escribir, la acción principal igual se completa (queda en el log del servidor).

### KPIs / ISO

- **Carpeta**: `nombre`, `carpetaPadreId` (autorreferencia, `onDelete: Cascade`), `modulo` (`KPIS` | `ISO`), `tipo` (`TipoCarpeta?`: `ANIO`, `PROCESO`, `PERIODO`, `RI`, `DS`, `OBSOLETO`) y `proceso` (`ProcesoIndicador?`, **denormalizado en cada nodo** del subárbol de un proceso).
- **Archivo**: `carpetaId` (`onDelete: Cascade`), `nombre`, `tipo` (`PDF` | `WORD` | `EXCEL` | `POWERPOINT`), `storagePath`, `subidoPorId`, `fechaSubida`.
- **AccesoIndicador**: por usuario + `proceso` (único compuesto), con 5 booleanos independientes: `puedeVer`, `puedeDescargar`, `puedeAdjuntar`, `puedeEditar`, `puedeEliminar`.
- **AccesoISO**: uno por usuario (`usuarioId @unique`), los mismos 5 booleanos + `gestionaObsoleto`.

⚠️ El `onDelete: Cascade` en `Carpeta.carpetaPadre` y `Archivo.carpeta` significa que borrar una carpeta se lleva en silencio todo su subárbol. Verificar que esté vacía antes de borrar.

## Autenticación y permisos

La autenticación vive **100% en Supabase Auth**; el backend solo mantiene un espejo local vinculado por `supabaseUserId`.

`SupabaseAuthGuard` valida el bearer JWT vía `supabaseAdmin.auth.getUser`, carga la fila espejo con `permisos` + `accesosIndicador` + `accesoIso`, y la deja en **`request.usuario`** (ojo: `.usuario`, **no** `.user`). Si la cuenta está desactivada (`activo = false`) responde **403** con `code: 'CUENTA_DESACTIVADA'`, para que el frontend cierre la sesión en vez de tratarlo como un simple "sin permiso".

**El orden de los guards importa**: `SupabaseAuthGuard` va siempre primero, porque todos los demás leen el `request.usuario` que él popula.

| Guard | Uso |
|---|---|
| `SupabaseAuthGuard` | Todas las rutas de usuario final |
| `PermisosGuard` + `@RequierePermiso('RECURSO', 'accion')` | Módulos CRUD (`fabricantes`, `productos`, `lotes`, `plantillas`, `pedidos`, `clientes`, generación de etiquetas). Un `PermisosGuard` sin `@RequierePermiso` deja pasar a todos: el test de cobertura lo detecta |
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

### Test de cobertura de permisos

`src/common/guards/cobertura-permisos.spec.ts` lee la metadata de Nest de **todas las rutas de todos los controllers** (sin levantar la app ni tocar la base) y falla si una ruta:

- no pide sesión (`SupabaseAuthGuard` primero) y no es una de las rutas públicas listadas;
- pide solo sesión sin una restricción real (permiso, admin, admin de KPIs, acceso a carpeta o token del agente) y no está en la lista `SOLO_SESION`, cada una con su motivo;
- usa `PermisosGuard` sin un `@RequierePermiso` válido (recurso del enum y acción existente), o `AccesoCarpetaGuard` sin `@RequiereAccesoCarpeta`;
- escribe (POST/PATCH/PUT/DELETE) con solo `puedeVer`.

**Un controller nuevo hay que sumarlo a la lista `CONTROLLERS` del test**: uno olvidado no se detecta solo.

## Endpoints

Los módulos CRUD (`fabricantes`, `productos`, `lotes`, `plantillas`) siguen el patrón REST estándar (`POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`) bajo `SupabaseAuthGuard` + `PermisosGuard`.

### Archivos adjuntos de etiquetado

- `POST|GET|DELETE /api/lotes/:id/coa` — COA del lote (subir = `puedeEditar`, ver = `puedeVer`, borrar = `puedeEliminar`).
- `POST|GET|DELETE /api/productos/:id/ficha-seguridad` — ficha de seguridad del producto, mismo criterio de permisos.
- `POST /api/productos/analizar-ficha` — recibe un PDF (máx. 10 MB, `PRODUCTOS:puedeVer`) y **propone** la clasificación GHS leyendo su sección 2; no guarda nada. Ver "Lectura de fichas de seguridad".

### Lotes: eliminación

`DELETE /api/lotes/:id` borra el lote junto con su historial de etiquetas (y su COA del storage). **Se rechaza con 409** si el lote tiene alguna etiqueta impresa con QR todavía vigente (según el vencimiento del lote, ver `qr-vigencia.ts`), para no dejar sin trazabilidad un QR que ya está pegado en un envase.

### Etiquetas — cola de impresión, **no** renderizado síncrono

`POST /api/etiquetas/generar` **no devuelve un PNG**. Crea un `TrabajoImpresion` en estado `PENDIENTE` y devuelve su id. Un agente de impresión externo consume la cola:

| Ruta | Guard | Descripción |
|---|---|---|
| `POST /api/etiquetas/generar` | Supabase + `ETIQUETAS:puedeCrear` | Encola el trabajo, devuelve el id |
| `GET /api/etiquetas/trabajos/pendientes` | `AgentTokenGuard` | El agente hace polling |
| `PATCH /api/etiquetas/trabajos/:id/estado` | `AgentTokenGuard` | El agente reporta `IMPRESO` / `ERROR` |
| `GET /api/etiquetas/trabajos/:id` | Supabase | El frontend consulta el estado — **solo del trabajo propio** (o cualquiera si es `esAdmin`); uno ajeno responde 404 (la restricción está en el service, no en un guard) |
| `GET /api/etiquetas/historial` | Supabase + `ETIQUETAS:puedeVer` | Etiquetas generadas (las 1000 más recientes) con producto, lote, estado, autor, token del QR y contadores de escaneos/COA/FDS |
| `GET /api/publico/etiquetas/:token` (+ `/coa`, `/fds`) | Sin login | Página pública del QR: datos del lote, clasificación GHS, COA y ficha de seguridad. Cada apertura suma 1 a `escaneos` y actualiza `ultimoEscaneoAt`; `/coa` suma a `coaVistas` (o `coaDescargas` si `?descargar=1`) y `/fds` suma a `fdsVistas` |

`LimpiezaTrabajosService` corre un cron **diario a las 3 AM** que borra los trabajos `IMPRESO`/`ERROR` más viejos que `RETENCION_TRABAJOS_DIAS` (por defecto 3). Los `IMPRESO` con `token` se conservan mientras el QR siga vigente, porque son el respaldo de la etiqueta ya pegada.

### Alertas de impresión y vista previa

| Ruta | Guard | Descripción |
|---|---|---|
| `POST /api/etiquetas/agente/estado` | `AgentTokenGuard` | El agente avisa cada ~15s que está vivo y el estado de la impresora (papel, tinta, tapa...) |
| `GET /api/etiquetas/agente/estado` | Supabase (`ETIQUETAS:puedeVer` o `puedeCrear`) | Lo consulta el frontend: si el agente no responde, si la impresora tiene un problema, o si hay etiquetas esperando más de `ALERTA_COLA_MINUTOS` (por defecto 5) |
| `POST /api/etiquetas/vista-previa` | Supabase + `ETIQUETAS:puedeCrear` | Pide al agente que **dibuje** la etiqueta sin imprimirla ni guardar nada; devuelve un id efímero |
| `GET /api/etiquetas/vista-previa/pendientes` | `AgentTokenGuard` | El agente hace polling de vistas previas pendientes |
| `POST /api/etiquetas/vista-previa/:id/imagen` | `AgentTokenGuard` | El agente entrega la imagen (o un error) |
| `GET /api/etiquetas/vista-previa/:id` | Supabase | El frontend hace polling hasta que la imagen esté lista |

`AgenteEstadoService` guarda el último aviso del agente **en memoria** (se repone en segundos si el servidor se reinicia); si no hay aviso en `AGENTE_TIMEOUT_SEG` (por defecto 60) se considera desconectado. `VistaPreviaService` también vive en memoria, con un límite de 50 vistas previas simultáneas y una vigencia de 3 minutos — no persiste nada en la base.

### Usuarios

| Ruta | Guard |
|---|---|
| `GET /api/usuarios/me`, `PATCH /api/usuarios/me` | Supabase (cualquiera edita su propio perfil) |
| `POST /api/usuarios`, `GET /api/usuarios` | `EsAdminGuard` |
| `PATCH /api/usuarios/:id/permisos` | `EsAdminGuard` (deja registro de auditoría) |
| `PATCH /api/usuarios/:id/activo` | `EsAdminGuard` — desactiva o reactiva la cuenta (`{ activo: boolean }`); no se puede desactivar a uno mismo; deja registro de auditoría |
| `DELETE /api/usuarios/:id` | `EsAdminGuard` — borra la fila y la cuenta de Supabase; no a uno mismo; **409** si tiene historial (etiquetas, pedidos o archivos), en cuyo caso se desactiva; deja registro de auditoría |
| `GET /api/usuarios/auditoria` | `EsAdminGuard` — últimos movimientos sobre cuentas (`?limite=`, máx. 500) |
| `PATCH /api/usuarios/:id/rol-kpis` | `EsAdminGuard` (asigna/quita `esAdminKpis`) |
| `GET /api/usuarios/lista-basica` | `EsAdminKpisGuard` |
| `GET /api/usuarios/:id/accesos-kpis-iso` | `EsAdminKpisGuard` |
| `PATCH /api/usuarios/:id/accesos-kpis-iso` | `EsAdminKpisGuard` |

Los guards se aplican **por método**, no a nivel de clase: cada ruta nueva necesita su propio `@UseGuards(...)` explícito.

Las respuestas de este módulo se limitan a lo que cada endpoint toca, vía constantes de `select` compartidas en el service. `GET /usuarios/lista-basica` devuelve solo `{ id, nombre, avatarUrl }`; `PATCH /usuarios/:id/rol-kpis` devuelve `{ id, nombre, avatarUrl, esAdmin, esAdminKpis }`; y los dos endpoints de `accesos-kpis-iso` comparten un único `select` (`{ id, nombre, avatarUrl, accesosIndicador, accesoIso }`) que **deliberadamente omite `permisos`**: los puede llamar un `esAdminKpis` que no es `esAdmin`, y ese rol no tiene por qué ver permisos de los módulos CRUD.

### Pedidos y clientes

`/api/pedidos` y `/api/clientes` siguen el patrón REST estándar (`POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`) y ambos se controlan con el recurso **`PEDIDOS`** (los clientes solo existen para alimentar el formulario de pedido, no justifican un recurso propio). `GET /api/pedidos?estado=` filtra por estado derivado (`RECIBIDO`, `EN_PREPARACION`, `PREPARADO`, `SALIO`, `ENTREGADO`).

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

El backend no renderiza etiquetas: crea el trabajo de impresión y el `agente-impresion` lo renderiza (Handlebars + Puppeteer) y lo imprime. La etiqueta impresa **no lleva** pictogramas GHS ni número de envase: la clasificación de seguridad se ve al escanear el QR.

## Lectura de fichas de seguridad

`POST /api/productos/analizar-ficha` (`src/productos/fds-parser.ts`) lee el texto del PDF con `pdf-parse` y devuelve `{ pictogramasGhs, palabraAdvertencia, frasesH, frasesP, noPeligroso }`:

- Toma la **sección 2** (ignorando el índice del documento) y, si no la ubica, busca en todo el PDF.
- Extrae los códigos H/P y usa el texto oficial en español de las frases H; los pictogramas se deducen de los códigos H según el Anexo V del CLP (con las reglas de irritación vs. corrosivo y nocivo vs. tóxico).
- Entiende fichas en español, inglés y portugués, y varios formatos (código antes o después del texto, entre paréntesis, combinaciones como `H301+H311+H331`).
- `noPeligroso: true` si la ficha dice que el producto no está clasificado como peligroso.
- **No hace OCR**: si el PDF no tiene texto (escaneado) responde 400 y la clasificación se marca a mano.

Es una propuesta: el formulario del producto la muestra y una persona la revisa antes de guardar.

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
AGENTE_TIMEOUT_SEG=60      # sin aviso del agente en este tiempo, se considera desconectado
ALERTA_COLA_MINUTOS=5      # avisa si hay etiquetas pendientes más viejas que esto
QR_MARGEN_RETENCION_DIAS=365  # cuánto después del vencimiento del lote sigue vigente el QR
QR_VIGENCIA_DIAS=730       # respaldo para lotes sin fecha de vencimiento parseable
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

# producción (nest-cli.json copia generated/prisma a dist/)
npm run build
npm run start:prod

# lint / formato
npm run lint
npm run format

# tests (no hay watchers enganchados: correr a mano; la CI también los corre)
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

## Tests y CI

`npm test` corre Jest sobre `src/**/*.spec.ts` (211 casos, sin base de datos ni Supabase: los servicios se prueban con dobles). **GitHub Actions** (`.github/workflows/ci.yml`) corre `npm test` y `npm run build` en cada push y pull request.

- `common/guards/cobertura-permisos.spec.ts` — el test de cobertura de permisos (ver "Autenticación y permisos"), ~110 casos.
- `common/guards/supabase-auth.guard.spec.ts` — la cuenta desactivada responde 403 con `CUENTA_DESACTIVADA`.
- `carpetas/acceso-documentos.service.spec.ts` — reglas de acceso a archivos: regla dura de PDFs de ISO, visibilidad por tipo, visibilidad previa a eliminar y la validación de descarga con su excepción del visor.
- `usuario/usuarios.service.spec.ts` — respuestas mínimas de los endpoints, eliminación (409 con historial, no a uno mismo), desactivación/reactivación y auditoría.
- `etiquetas/` — vigencia del QR (`qr-vigencia.spec.ts`), trabajos de impresión (solo el creador ve su trabajo), vista previa, estado del agente y cálculo de tara.
- `lotes/lotes.service.spec.ts` — un lote con QR vigente no se elimina; alta y duplicados.
- `pedidos/pedidos.service.spec.ts` — estado derivado de las fechas y filtro por estado.
- `common/parsear-fecha-vencimiento.spec.ts`, `productos/fds-parser.spec.ts` — parseo de fechas del COA y de fichas de seguridad.

## Convenciones y trampas conocidas

- **Importar tipos de Prisma desde `../generated/prisma`, nunca desde `@prisma/client`.**
- Regenerar **y commitear** `src/generated/prisma` después de cada cambio de schema.
- Español en identificadores, comentarios y mensajes de error.
- **Toda tabla nueva activa RLS en su propia migración** (`ALTER TABLE "x" ENABLE ROW LEVEL SECURITY;`, sin políticas). Supabase expone el esquema `public` por HTTP con la clave pública del frontend; sin RLS esa clave lee la tabla sin pasar por los guards. El backend no se ve afectado (se conecta como `postgres`, con BYPASSRLS).
- El `Dockerfile` corre `npx prisma migrate deploy` antes de arrancar: en el servidor tiene que estar definida `DIRECT_URL`. Si una migración falla, el contenedor no arranca y la plataforma conserva la versión anterior.
- Una ruta nueva necesita su `@UseGuards(...)` explícito y su controller sumado a `CONTROLLERS` en `cobertura-permisos.spec.ts`.
- Un cambio de esquema es una migración (`npx prisma migrate dev`) **y** regenerar/commitear el cliente. En otros entornos, `npx prisma migrate deploy`.
- `request.usuario`, no `request.user`.
- Antes de tocar cualquier cosa de KPIs/ISO, leer [`contexto-fase3-kpis-iso.md`](./contexto-fase3-kpis-iso.md).
- No existe ningún concepto de "rol" genérico: la autorización es siempre por flags (`Permiso`, `AccesoIndicador`/`AccesoISO`) o por los booleanos `esAdmin`/`esAdminKpis`. Hubo un `RolesGuard` + `@Roles(...)` basado en un `request.user.rol` inexistente; se eliminó por código muerto. Para una ruta nueva, usar alguno de los guards de la tabla de arriba.
