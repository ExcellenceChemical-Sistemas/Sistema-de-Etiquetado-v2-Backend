# Contexto — Fase 3: Módulo KPIs + Documentación ISO (estado de avance)

> Continúa a `contexto-fase3-kpis-iso.md` (especificación funcional original, ya aprobada por Alice). Este documento es el estado de **implementación**: qué está hecho, qué falta, y qué archivos hacen falta para seguir en otro chat si es necesario.
>
> **Actualizado tras una décima sesión de chat** — reemplaza a la versión anterior. La séptima sesión definió el rediseño del modelo de permisos (sección 1.1). La octava dejó 6 recomendaciones de arquitectura (sección 1.2), de las cuales se cerró el punto 1 (tablas separadas). La novena cerró las 4 dudas de la sección 1.1 y enlazó este contexto a **Claude Code** en el backend vía `CLAUDE.md`.
>
> **La décima sesión es la primera con código real aplicado** — hasta acá todo era diseño/decisión. Lo hecho:
> - **Migración corrida** (`20260905120422_accesos_kpis_iso_granulares`): enums `TipoAccesoIndicador`/`TipoAccesoISO` eliminados, los 5 booleanos + `gestionaObsoleto` en `AccesoIndicador`/`AccesoISO`, `esAdminKpis` en `Usuario`, `POWERPOINT` en `TipoArchivoDocumento`. Los `tipoAcceso` viejos se perdieron (eran datos de prueba).
> - **Backend reescrito al modelo granular**: `acceso-documentos.service.ts` (con `puedeVerArchivo` / `puedeEliminarArchivo` aplicando los puntos 1, 2 y 5 de la sección 1.1), `actualizar-accesos-kpis-iso.dto.ts`, `usuarios.service.ts`, `acceso-carpeta.guard.ts`, `carpetas.service.ts` (filtra archivos por tipo al listar) y `archivos.service.ts` (acepta PowerPoint).
> - **Agregados**: `EsAdminKpisGuard` (solo en `PATCH /usuarios/:id/accesos-kpis-iso` y `GET /usuarios/lista-basica`; el resto sigue con `EsAdminGuard`), el endpoint `GET /usuarios/lista-basica`, y `PATCH /usuarios/:id/rol-kpis` para asignar/quitar `esAdminKpis` (exclusivo del Admin general).
> - **Seeds**: `kpis-iso-2026.seed.ts` se había pisado con una copia del seed de accesos — reconstruido desde el `.js` compilado y ahora idempotente (no duplica el árbol si el año ya existe). `accesos-kpis-iso.seed.ts` migrado al shape granular y sin nombres hardcodeados. Script `seed:accesos` agregado.
> - **Primer test unitario del módulo**: `acceso-documentos.service.spec.ts`, 7 casos sobre las reglas de archivo.
> - **Validación end-to-end por HTTP**: los 6 casos de la prueba manual corrieron contra los endpoints reales, todos OK (matriz en la sección 3), cubriendo la regla dura de PDFs (punto 1) y el fix del gap de visibilidad (punto 5) cada uno por su propio camino. Como efecto colateral quedaron dos archivos nuevos en la base y se borró el id 3 (ver sección 2).
>
> **Falta todo el frontend** (sección 4) y enlazar el contexto a Claude Code en ese repo. Todo lo marcado como "resuelto/confirmado funcionando" en secciones anteriores sigue vigente tal cual.

---

## 0. Dónde vive esto

- Empresa: Excellence Chemical S.A.C. (código de documento asociado: QA-FMT-06).
- Fase 3 del roadmap consolidado. Reemplaza la gestión manual en Google Drive por una app propia, con control real de permisos e impresión/descarga.
- Se implementa **sobre el mismo backend** del proyecto de etiquetado ("Sistema de Etiquetado v2"): NestJS + Prisma + Supabase, desplegado en Render. Mismo `schema.prisma`, mismo sistema de permisos granulares (`Usuario`, `Permiso`, enum `Recurso`) que se **extiende**, no se reemplaza.
- Frontend: Nuxt (mismo proyecto del etiquetado), autenticación vía Supabase Auth, `AppSidebar.vue` compartido.
- **Método de trabajo confirmado**: el asistente entrega el código completo (o el diff puntual) y el usuario copia y pega directamente en su repo. El asistente no ejecuta nada contra el backend real ni asume acceso a archivos que no se le suban/peguen explícitamente.
- **Nomenclatura confirmada**: la carpeta real del proyecto es `src/usuario/...` (singular).
- **Claude Code conectado al backend — hecho en sesión 9, sigue vigente**: el repo de `backend` (`etiquetadov2/backend`) ya tiene este archivo en su raíz y un `CLAUDE.md` (generado con `/init`) que lo referencia vía `@contexto-fase3-kpis-iso.md`, confirmado leyendo bien el contenido. **Falta hacer lo mismo en el repo de `frontend`** (`etiquetadov2/frontend`): ya tiene el archivo copiado en la raíz, pero todavía no se corrió `/init` ni se enlazó desde su propio `CLAUDE.md`.
- **Patrón real de la vista de admin de usuarios**: `pages/usuarios/index.vue` lista usuarios y abre un dialog, `components/admin/Editarpermisos.vue`, que a su vez usa `components/admin/PermisosGrid.vue` + `utils/permisos.ts` y hace el `PATCH`. No existe (ni hace falta) un `pages/usuarios/[id].vue` como página propia.
- **Jerarquía de permisos (vigente hasta el rediseño de la sesión 7)**: el Administrador (`esAdmin: true`) gestiona permisos de todos y ve/edita todo en KPIs/ISO automáticamente (bypass, incluida eliminación de PDFs de ISO). Esto va a convivir con el nuevo rol de Admin de KPIs (ver sección 1.1) una vez implementado.

---

## 1. Especificación funcional original (resumen — ya aprobada por Alice, sin cambios)

### Estructura de carpetas
```
KPIs-SGC
└── 2026
    ├── INDICADORES
    │   ├── 1. INDICADOR-COMERCIAL-MENSUAL       (1.ENERO...12.DICIEMBRE → RI + DS)
    │   ├── 2. INDICADOR-COMPRAS-MENSUAL
    │   ├── 3. INDICADOR-ALMACÉN Y DISTRIBUCIÓN-MENSUAL
    │   ├── 4. INDICADOR-CONTROL DE CALIDAD-MENSUAL
    │   ├── 5. INDICADOR-SGC-TRIMESTRAL          (1er...4to Trimestre → RI + DS)
    │   ├── 6. INDICADOR-DIRECCIÓN Y PLANEAMIENTO-TRIMESTRAL
    │   ├── 7. INDICADOR-RR.HH-SEMESTRAL         (1er/2do Semestre → RI + DS)
    │   └── 8. INDICADOR-SERVICIOS GENERALES-SEMESTRAL
    └── ISO-SGC-2026          ← plana, sin carpetas de proceso
        ├── (PDF, Word, Excel juntos)
        └── Obsoleto/
```
- RI = Reporte de Indicador (1-3 Word). DS = Data de Sustento (1-3 Excel).
- Años siguientes se clonan con el mismo esquema; el selector de transferencia (checkboxes) aplica solo a ISO por ahora, y crea copias independientes, no referencias.

### Pendiente de confirmar con Alice / decidir
- Naming exacto de subcarpetas trimestrales/semestrales (sigue placeholder en el seed).
- Si Word/Excel/PowerPoint necesitan visor en línea propio o alcanza con descarga restringida (hoy solo PDF tiene visor propio).

---

## 1.1 REDISEÑO DE PERMISOS — diseño cerrado (sesión 7), backend implementado (sesión 10, ver sección 3)

Se reemplazó el modelo anterior de niveles fijos (`LECTURA`/`ESCRITURA`, `VISUALIZACION`/`EDICION_TOTAL`) por un modelo de **5 permisos booleanos independientes** más un rol de gestión nuevo.

> **Estado**: el diseño de esta sección se decidió en sesión 7, se afinó con las dudas cerradas en sesiones 9 y 10, y **ya está implementado en el backend** (migración corrida, service/DTO/guards reescritos — ver sección 3). Lo que sigue describe el modelo tal como quedó, no una propuesta. **El frontend todavía usa los enums viejos** (ver sección 4).

### Rol nuevo: Admin de KPIs (`esAdminKpis`)
- Campo booleano nuevo en `Usuario`: `esAdminKpis`. Cualquier usuario puede tenerlo (no es una persona hardcodeada).
- Se encarga **exclusivamente** de gestionar accesos de KPIs y Documentación ISO — no toca permisos normales (Lotes, Productos, etc.), eso sigue siendo del Admin general.
- Es quien decide, por usuario: puede ver / descargar / adjuntar / editar / eliminar, tanto en cada proceso de Indicadores como en ISO.
- **Confirmado explícitamente**: la propia Admin de KPIs NO tiene bypass de contenido — para ver o hacer algo dentro de KPIs/ISO necesita que a ELLA MISMA también se le asignen accesos, igual que a cualquier otro usuario. `esAdminKpis` solo le da la capacidad de gestionar accesos de otros, no acceso propio automático.
- El Admin general (`esAdmin`) sigue con bypass total en contenido de KPIs/ISO (ya implementado y confirmado funcionando en sesión anterior) y además puede gestionar accesos igual que la Admin de KPIs (o incluso asignar/quitar el flag `esAdminKpis` a otros usuarios).

### Permisos granulares (reemplazan a los enums `TipoAccesoIndicador`/`TipoAccesoISO`)
Para cada proceso de Indicadores (`AccesoIndicador`) y para ISO en general (`AccesoISO`), 5 flags independientes:
- `puedeVer`
- `puedeDescargar`
- `puedeAdjuntar`
- `puedeEditar`
- `puedeEliminar`

Ejemplo dado por el usuario para ilustrar la granularidad esperada:
- Edin: `puedeVer=true` en Indicador Comercial, todo lo demás false ahí. En Indicador Calidad: `puedeVer=true` + `puedeEditar=true`.
- ISO: puede haber usuarios que solo vean los PDF (el resto de tipos no se especificó aún cómo se filtra dentro de ISO — ver "Dudas abiertas").

### Tipos de archivo adjuntables (ampliado en sesión 7)
`TipoArchivoDocumento` pasa a incluir 4 valores (antes 3): `PDF`, `WORD`, `EXCEL`, `POWERPOINT`.

### Regla de UI confirmada
- Si un usuario no tiene `puedeVer` en ningún proceso de Indicadores ni en ISO → el ítem "KPIs / ISO" del sidebar se oculta por completo.
- Dentro de una carpeta, cada botón (Ver / Descargar / Adjuntar / Eliminar) se muestra u oculta individualmente según el flag correspondiente para esa carpeta.

### Cambios de schema propuestos (redactados, AÚN NO APLICADOS por el usuario — falta correr la migración)

```prisma
model Usuario {
  id                Int       @id @default(autoincrement())
  supabaseUserId    String    @unique
  nombre            String
  esAdmin           Boolean   @default(false)
  esAdminKpis       Boolean   @default(false) // gestiona accesos de KPIs/ISO de otros; no implica acceso propio automático
  avatarUrl         String?
  permisos          Permiso[]
  createdAt         DateTime  @default(now())
  trabajosImpresion TrabajoImpresion[]
  archivosSubidos   Archivo[]
  accesosIndicador  AccesoIndicador[]
  accesoIso         AccesoISO?
}

// TipoAccesoIndicador y TipoAccesoISO quedan obsoletos, se eliminan del schema

model AccesoIndicador {
  id             Int              @id @default(autoincrement())
  usuarioId      Int
  usuario        Usuario          @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  proceso        ProcesoIndicador
  puedeVer       Boolean          @default(false)
  puedeDescargar Boolean          @default(false)
  puedeAdjuntar  Boolean          @default(false)
  puedeEditar    Boolean          @default(false)
  puedeEliminar  Boolean          @default(false)

  @@unique([usuarioId, proceso])
  @@map("accesos_indicador")
}

model AccesoISO {
  id               Int      @id @default(autoincrement())
  usuarioId        Int      @unique
  usuario          Usuario  @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  puedeVer         Boolean  @default(false)
  puedeDescargar   Boolean  @default(false)
  puedeAdjuntar    Boolean  @default(false)
  puedeEditar      Boolean  @default(false)
  puedeEliminar    Boolean  @default(false)
  gestionaObsoleto Boolean  @default(false) // ver+editar la carpeta Obsoleto (antes hardcodeado "solo Alice")

  @@map("accesos_iso")
}

enum TipoArchivoDocumento {
  PDF
  WORD
  EXCEL
  POWERPOINT
}
```

⚠️ Esto implica una migración real (`npx prisma migrate dev --name accesos_kpis_iso_granulares`) que el usuario debe correr en su entorno — no se ha corrido todavía.

### ✅ Punto 1 — DECIDIDO (sesión 9): se mantiene la regla dura para PDFs de ISO
Con el modelo granular, `puedeEliminar=true` en `AccesoISO` **no alcanza** para borrar un archivo tipo PDF dentro de ISO. Es una regla fija en código, sin excepción, salvo para `esAdmin` (que ya tiene bypass total). Motivo: los PDF de ISO son la versión oficial/vigente de los documentos de calidad (procedimientos, instructivos, formatos ya aprobados), a diferencia de Word/Excel que suelen ser borradores de trabajo — borrar uno por error de un click en el panel de admin es un riesgo real (documentación de auditoría), no un archivo cualquiera. Es la misma lógica que ya se aplicó con `esAdminKpis` sin bypass propio (sección 1.1): no confiar ciegamente en quien administra accesos para acciones irreversibles.

No hace falta un flag nuevo en el schema. Se implementa como una condición explícita en el guard/service, antes de aplicar el flag `puedeEliminar`:
```ts
puedeEliminar(usuario, archivo, carpeta) {
  if (usuario.esAdmin) return true;
  if (carpeta.modulo === 'ISO' && archivo.tipo === 'PDF') return false; // regla dura, sin excepción
  return accesoIso.puedeEliminar; // o accesoIndicador según corresponda
}
```
Esta misma condición tiene que existir **también en el backend** (no solo ocultar el botón en frontend), siguiendo la regla de disciplina de la sección 1.2, punto 2.

### ✅ Punto 2 — DECIDIDO (sesión 9): "solo ver PDFs" en ISO no es un flag nuevo
`puedeVer=true` en `AccesoISO` alcanza para ver los PDF de esa carpeta. Para ver además Word/Excel/PowerPoint hace falta `puedeEditar=true`. No se agrega un 6º flag (`puedeVerSoloPdf`) — es una condición en el mismo check de visibilidad por tipo de archivo, simétrica a la regla dura de PDFs del punto 1: el PDF es el documento oficial ya aprobado (para todos los que tienen acceso), Word/Excel son el borrador de trabajo (solo para quien lo edita).

```ts
puedeVerArchivo(usuario, archivo, accesoIso) {
  if (usuario.esAdmin) return true;
  if (!accesoIso.puedeVer) return false;
  if (archivo.tipo === 'PDF') return true;
  return accesoIso.puedeEditar; // Word/Excel/PowerPoint solo si además edita
}
```

### ✅ Punto 3 — DECIDIDO (sesión 9): `Obsoleto` se deja como está
`gestionaObsoleto` sigue acoplando ver+editar en un solo flag booleano, **no se desglosa** en los 5 permisos del resto de ISO. Es una carpeta de archivo histórico, de uso poco frecuente — no hay caso de negocio real hoy que necesite separar "puede ver lo obsoleto" de "puede gestionarlo". Desglosarlo sería agregar complejidad para un caso sin necesidad real (mismo criterio de la sección 1.2, punto 3: no crear flags de más para casos especiales).

### ✅ Punto 4 — DECIDIDO (sesión 9): `esAdminKpis` tiene una vista reducida de usuarios, no el `GET /usuarios` completo
Se crea un endpoint propio, ej. `GET /usuarios/lista-basica` (protegido por `esAdmin || esAdminKpis`), que devuelve solo lo mínimo para asignar accesos: `id`, `nombre`, `avatarUrl`. El `GET /usuarios` completo (que expone también permisos de otros módulos como Lotes/Productos) sigue exclusivo de `EsAdminGuard` (`esAdmin` únicamente). Motivo: es el mismo principio de acceso mínimo con el que se definió el rol desde el inicio — la Admin de KPIs se encarga *exclusivamente* de KPIs/ISO, no tiene por qué ver permisos de otros módulos.

### ✅ Punto 5 (1.1) — DECIDIDO (sesión 10, encontrado durante prueba manual): ninguna acción de eliminar procede sin visibilidad
Se detectó que `puedeEliminarArchivo` no chequeaba `puedeVerArchivo` antes de evaluar la regla dura de PDF y el flag `puedeEliminar` — permitía borrar un archivo que el usuario no puede ver (ej. Word en ISO con `puedeEditar=false` pero `puedeEliminar=true`). Regla cerrada: ninguna acción de eliminar procede si `puedeVerArchivo()` da false para ese archivo, evaluado después del bypass de `esAdmin` y antes de la regla dura de PDF y del flag `puedeEliminar`. Verificado con test unitario (`acceso-documentos.service.spec.ts`) confirmando el gap antes del fix y su cierre después, más caso de control en KPIS para confirmar que no sobre-bloquea donde no hay distinción por tipo.

---

## 1.2 SEGUNDA RONDA DE FEEDBACK — recomendaciones de arquitectura (sesión 8, NADA IMPLEMENTADO)

En la sesión 8 se revisó el diseño de la sección 1.1 con ojo crítico "de arquitectura general", no de la spec funcional. Son 6 recomendaciones, ninguna aplicada todavía. Ordenadas de mayor a menor impacto:

### ✅ Punto 1 — DECIDIDO (sesión 8): se mantienen tablas separadas
Se evaluó unificar `AccesoIndicador` + `AccesoISO` en una tabla genérica `AccesoDocumento` (campo `ambito: String`) vs. mantenerlas separadas como en la sección 1.1. **Decisión: tablas separadas**, por estas razones:
- La spec funcional (sección 1, ya aprobada por Alice) es un catálogo cerrado (8 procesos + ISO); no hay un tercer ámbito real en el roadmap que justifique generalizar ahora.
- ISO ya necesita columnas propias que Indicadores no tiene (`gestionaObsoleto`, y probablemente algo para filtrar por tipo de archivo — ver dudas abiertas #2 y #3 de la sección 1.1). Con una tabla genérica esas columnas quedarían sueltas en las filas de `"INDICADOR:*"`, o igual terminaría apareciendo una segunda tabla para lo específico de ISO.
- `proceso: ProcesoIndicador` (enum) da validación a nivel de base de datos; con `ambito: String` esa validación pasa a vivir en la aplicación (riesgo de typos en seed/frontend).
- El schema de tablas separadas ya está escrito en la sección 1.1 — no hay trabajo repetido, es la decisión final.
- Si en el futuro aparece de verdad un tercer módulo con la misma forma (5 booleanos por recurso), ahí sí conviene extraer el patrón común — en ese momento va a ser un refactor chico, no una reescritura, porque `AccesoIndicador`/`AccesoISO` ya comparten la misma forma de columnas.

El schema de la sección 1.1 (`AccesoIndicador` + `AccesoISO` separados) queda **confirmado como definitivo**, no como propuesta.

### 🟡 Impacto mediano — no cambian el schema, pero si no se deciden ahora se resuelven mal después
2. **Ningún permiso se declara solo en frontend.** Regla general: si `useAccesoKpisIso.ts` oculta un botón por un flag, el controller/guard equivalente en backend tiene que validar el mismo flag antes de tocar la BD, siempre — aunque sea "solo para ocultar un botón". Ya pasó con `esPdfIso` (frontend oculta, backend todavía no valida igual — ver sección 3, pendiente `GET /archivos/:id/url`). No es tabla ni endpoint nuevo, es disciplina a aplicar en cada guard que se escriba de ahora en más.
3. **No convertir cada caso especial en un flag booleano suelto.** `gestionaObsoleto` (sección 1.1) ya es una excepción hardcodeada dentro de `AccesoISO`. Si después aparece "en tal carpeta solo Excel para tal usuario", eso NO debería ser un flag más, sino una tabla de overrides puntuales (`usuarioId + carpetaId + permiso`), separada, solo si hace falta. No bloquea nada ahora, es una regla para el futuro.
4. **Cerrar de una vez la duda del visor de Word/Excel/PowerPoint** (ya estaba abierta en 1.1 y desde el inicio en "Pendiente de confirmar con Alice"). Es la única de las 6 que si se demora sí frena el resto del diseño, porque define si hace falta un "visor propio" tipo el de PDF o si esos 3 tipos solo se descargan.

### 🟢 Impacto pequeño / solo UX — no tocan el modelo de datos
5. **Presets en el frontend** ("Solo lectura" / "Editor" / "Gestor total") que marcan los 5 flags de golpe, dejando los checkboxes individuales como "modo avanzado". Es puramente UI sobre `Accesoskpisiso.vue`, no cambia schema ni DTO. Pensado para que la Admin de KPIs no tenga que marcar los 5×8 checkboxes uno por uno.

### ⚪ Fuera de alcance de esta fase — a futuro, no ahora
6. **Unificar todo esto con el sistema de `Permiso` normal** (Lotes, Productos, etc.), ya que conceptualmente son lo mismo (recurso + acciones booleanas). Dejaría un solo guard/service/grid reutilizable para cualquier módulo futuro. Es la recomendación de **mayor impacto de las 6**, pero también la de mayor alcance (toca módulos fuera de KPIs/ISO). Se sugiere NO mezclarla con el cierre de esta fase; evaluarla después como su propio proyecto.

### ¿Son cambios grandes? — respuesta directa
- De las 6, solo el punto 1 (ya **decidido**: tablas separadas) y el punto 6 (unificar con `Permiso` general) eran cambios grandes de schema/arquitectura. El 6 es el más grande de los dos, es opcional, y se recomienda dejarlo fuera de esta fase.
- Los puntos 2, 3 y 5 NO son cambios de arquitectura: son reglas de disciplina (2 y 3) o de UI (5) — se pueden aplicar sin rehacer nada de lo ya diseñado en 1.1.
- El punto 4 no es grande técnicamente, pero es el único que bloquea seguir — sigue sin respuesta de Alice.

### ✅ Punto 5 (1.2) — DECIDIDO (sesión 9): presets de UI se dejan para después
No se implementan en esta primera vuelta. Es pura UI sobre `Accesoskpisiso.vue`, no bloquea nada del modelo de datos ni del backend. Se prioriza tener el grid de 5×8 checkboxes funcionando primero y observar cómo lo usa la Admin de KPIs en la práctica, para armar los presets ("Solo lectura"/"Editor"/"Gestor total") en base a combinaciones de uso real, en vez de adivinarlas ahora.

---

## ✅ TODAS LAS DUDAS ABIERTAS CERRADAS (sesión 9)

Con esto, las 4 dudas originales de la sección 1.1 (más una quinta, encontrada y cerrada en sesión 10 durante la prueba manual) y la de presets de la sección 1.2 quedaron todas decididas. El diseño del rediseño de permisos está completo — **lo único que falta es implementarlo**: migración de Prisma, guard/service en backend, y grid/composable en frontend (ver sección 5, checklist actualizado).

---

## 2. Modelo de datos (al día — migración granular aplicada en sesión 10)

Migraciones `kpis_iso_module` y `20260905120422_accesos_kpis_iso_granulares` aplicadas con éxito. Modelos `Carpeta`, `Archivo`, `AccesoIndicador`, `AccesoISO`, estos 2 últimos ya con los **5 booleanos granulares** (los enums `TipoAccesoIndicador`/`TipoAccesoISO` fueron eliminados del schema).

Campos relevantes confirmados en `schema.prisma`:
- `Carpeta`: `id`, `nombre`, `carpetaPadreId`, `modulo` (`KPIS`|`ISO`), `tipo` (`TipoCarpeta?`: `ANIO`|`PROCESO`|`PERIODO`|`RI`|`DS`|`OBSOLETO`), `proceso` (`ProcesoIndicador?`, denormalizado en cada nodo del subárbol de un proceso).
- `Archivo`: `id`, `carpetaId`, `nombre`, `tipo` (`PDF`|`WORD`|`EXCEL`|`POWERPOINT`), `storagePath`, `subidoPorId`, `fechaSubida`.

### Datos reales en la base (post sesión 10)

El árbol 2026 está creado: **192 carpetas**, raíces `2026` (#1, KPIS) y `ISO-SGC-2026` (#191, ISO), con `Obsoleto` en #192.

Archivos en la base — **ojo: salvo la fixture marcada como tal, NO son descartables como los seeds, son data real subida por API**:

| id | nombre | tipo | carpeta | ubicación | nota |
|---|---|---|---|---|---|
| 1 | `CUADERNILLO DE DESARROLLO - NUDOS…pdf` | PDF | #167 `DS` | KPIS — Dirección y Planeamiento / 1er Trim. | data real |
| 7 | `Informe_TPOO_final.pdf` | PDF | #6 `DS` | KPIS — Comercial / 1.ENERO | data real |
| 9 | `boleta.pdf` | PDF | #192 | ISO / Obsoleto (PDF de ISO — regla dura) | data real |
| 13 | `fixture-visor-iso.pdf` | PDF | #191 | ISO-SGC-2026 (raíz) | **Fixture de prueba** — usar para validar el visor de PDF de ISO con solo `puedeVer`. **No borrar sin avisar antes.** |

Sobre la fixture **#13** (creada en sesión 11, se decidió conservarla): es un PDF mínimo de 601 bytes generado a mano, subido por el flujo real (`ArchivosService.subir()`), así que tiene `storagePath` canónico y objeto propio en Supabase Storage. Existe para poder probar la **exención `esPdfIso`** de la validación de descarga: con el `accesoIso` de willy (`puedeVer: true`, `puedeDescargar: false`) da `puedeVerArchivo=true`, `puedeDescargarArchivo=true` (por la exención) y `puedeEliminarArchivo=false` (regla dura). Es el único archivo del sistema que sirve para verificar que el visor de ISO sigue abriendo sin `puedeDescargar` — si se borra, esa rama queda sin cobertura hasta subir otro.

⚠️ El `boleta.pdf` original (**id 3**, que estaba en la raíz de ISO #191) **ya no existe**: se borró definitivamente de la base y del storage como parte del caso 5 de la prueba (bypass de `esAdmin`). Cualquier referencia a "archivo #3" en secciones anteriores es histórica.

⚠️ **Los ids 8, 10 y 11 tampoco existen más** (borrados en sesión 11, base + storage):
- **#8 `prueba.docx`** (WORD, ISO raíz #191) — el que se había subido en sesión 10 para la prueba 7.4.
- **#10** (WORD, ISO raíz #191) y **#11 `Consigna_TPOO_Presentacion_Final.pdf`** (PDF, ISO raíz #191) — nunca estuvieron documentados acá: aparecieron al contar filas y resultaron ser pruebas manuales por UI posteriores a la redacción de esta sección. El #10 además tenía el `nombre` corrupto (guardaba un `storagePath` previo en vez del `originalname`), probablemente por haber sido bajado del bucket y resubido tal cual.

Se borraron llamando a `ArchivosService.eliminar()` con el contexto de Nest levantado — el mismo método que invoca el controller, así que el objeto de Supabase Storage se eliminó junto con la fila y no quedó huérfano (verificado listando `iso/carpeta-191`, que quedó vacío). Lo que **no** se ejercitó por esa vía son los guards, que son de la capa HTTP: el #11 es un PDF de ISO y se borró salteando la regla dura, no satisfaciéndola.

⚠️ **Hoy no queda ningún archivo WORD / EXCEL / POWERPOINT en el sistema** — los 3 restantes son todos PDF. Para re-testear la regla del punto 2 (en ISO, Word/Excel/PowerPoint exigen `puedeEditar` además de `puedeVer`) hay que **subir uno nuevo primero**. Mismo problema que había antes de la sesión 10, cuando se subieron el #8 y el #9 justamente para poder probar esa regla y `gestionaObsoleto`.

---

## 3. Backend

### Resuelto y confirmado funcionando (sigue vigente)
- `CarpetasModule`, `SupabaseStorageService`, `AccesoDocumentosService` end-to-end.
- `PATCH /usuarios/:id/accesos-kpis-iso` — desde sesión 10 usa `SupabaseAuthGuard` + `EsAdminKpisGuard` (acepta `esAdmin || esAdminKpis`).
- `common/guards/supabase-auth.guard.ts` corregido en sesión 8: ya incluye `permisos`, `accesosIndicador`, `accesoIso` en el `findUnique`. **Sobrevivió la migración al modelo granular sin cambios** (el `include` no cambió, solo los campos internos de esos modelos).

### Implementado en sesión 10
- Migración `20260905120422_accesos_kpis_iso_granulares` corrida.
- `EsAdminKpisGuard` nuevo (archivo aparte, no se modificó `EsAdminGuard`), aplicado solo en `PATCH /usuarios/:id/accesos-kpis-iso` y `GET /usuarios/lista-basica`. Se decidió NO aplicarlo en `GET /usuarios`, que sigue exclusivo de `esAdmin` (punto 4 de la sección 1.1).
- `actualizar-accesos-kpis-iso.dto.ts` con los 5 booleanos por proceso + los de ISO con `gestionaObsoleto`.
- `usuarios.service.ts` (`actualizarAccesosKpisIso`) al nuevo shape, más `listarBasico()` y `actualizarRolKpis()`.
- `GET /usuarios/lista-basica` (`id`, `nombre`, `avatarUrl`) y `PATCH /usuarios/:id/rol-kpis` (exclusivo de `EsAdminGuard`).
- Reglas de archivo en `acceso-documentos.service.ts` + `acceso-carpeta.guard.ts`: regla dura de PDFs (punto 1), visibilidad por tipo (punto 2) y visibilidad previa a eliminar (punto 5 de 1.1). `carpetas.service.ts` filtra archivos al listar; `archivos.service.ts` acepta PowerPoint.
- Test unitario `acceso-documentos.service.spec.ts` (7 casos).

### ✅ Validación end-to-end por HTTP (sesión 10) — los 6 casos pasaron

Corrida contra los endpoints reales, no solo el test unitario. Con **willy** (`puedeVer` + `puedeDescargar` en ISO, sin `puedeEditar`) y **Jheremy** (`esAdmin`):

| # | Request | Resultado | Qué confirma |
|---|---|---|---|
| 1 | `GET /carpetas/191` (willy) | lista `boleta.pdf`, oculta `prueba.docx` | visibilidad por tipo aplicada **en el listado** (`carpetas.service.listarContenido`) |
| 2 | `GET /archivos/3/url` PDF (willy) | **200** + signed URL | punto 2: el PDF alcanza con `puedeVer` |
| 3 | `GET /archivos/8/url` WORD (willy) | **403** | punto 2: Word exige `puedeEditar` |
| 4 | `DELETE /archivos/3` PDF en ISO (willy, con `puedeEliminar=true` forzado) | **403** | **punto 1**, regla dura — ver abajo por qué NO prueba el punto 5 |
| 5 | `DELETE /archivos/3` (Jheremy, `esAdmin`) | **200** | bypass de admin sobre la regla dura |
| 6 | `DELETE /archivos/8` WORD en ISO (willy, con `puedeEliminar=true` forzado) | **403** | **punto 5**, aislado: el 403 sale de la rama de visibilidad |

**Los casos 4 y 6 llegan al mismo 403 por caminos distintos, y esa es la gracia:**

- En el **caso 4** el archivo es un PDF, así que `puedeVerArchivo` da `true` y la ejecución pasa de largo el chequeo de visibilidad; el rechazo lo produce `esPdfIso`. Prueba el punto 1, pero del punto 5 no dice nada.
- En el **caso 6** el archivo es un Word que willy no puede ver: `puedeVerArchivo` da `false` y corta **antes** de llegar a la regla dura del PDF. Es el único caso donde el 403 proviene exclusivamente del fix del punto 5 — y es exactamente el que antes del fix devolvía **200**.

En ambos el flag `puedeEliminar` estaba forzado en `true`, así que ninguno de los dos rechazos vino de la comprobación común.

El caso 5 **borró definitivamente** el archivo id 3 (base + storage) — ver sección 2. El caso 6 dejó `prueba.docx` (id 8) intacto, que es la evidencia material del 403: si el fix hubiera fallado, el archivo ya no estaría.

> **Nota (sesión 11):** la matriz de arriba es el registro histórico de la corrida de sesión 10 y se deja tal cual. Los archivos que usó ya no existen: el id 3 se borró en el propio caso 5, y el id 8 (`prueba.docx`) se borró en sesión 11 junto con el #10 y el #11 — ver sección 2. Para reproducir los casos 1, 3 y 6 hay que volver a subir un Word a la raíz de ISO.

El `puedeEliminar=true` de willy fue temporal en ambas pruebas y **quedó revertido a `false`** (verificado en la BD después del caso 6).

### Pendiente en backend

**Nada.** El rediseño de permisos está completo e implementado. El último ítem que quedaba —el flag `esPdfIso` en `GET /archivos/:id/url`— se cerró también en sesión 10:

```jsonc
// GET /api/archivos/:id/url  →  antes: { url }
{ "url": "https://…signed…", "esPdfIso": true }
```

El valor lo calcula `AccesoCarpetaGuard` al resolver el acceso y lo deja en `request.esPdfIso`, así que el controller lo lee de ahí sin consultar de nuevo la BD. **No cumple función de autorización** (para cuando el frontend lo recibe, el guard ya bloqueó lo que no correspondía): existe para que el frontend sepa que ese archivo va por el visor propio de ISO y no por descarga directa. Da `true` solo para archivos tipo `PDF` dentro del módulo `ISO`; en KPIS y para Word/Excel/PowerPoint da `false`.

**Verificado por HTTP** (sesión 10, después de la matriz de 6 casos):

| Request | `esPdfIso` | Por qué |
|---|---|---|
| `GET /archivos/9/url` — `boleta.pdf` en ISO/Obsoleto | `true` | PDF dentro del módulo ISO |
| `GET /archivos/1/url` — PDF en KPIS (`DS`, Dirección y Planeamiento) | `false` | PDF, pero fuera de ISO |
| `GET /archivos/7/url` — PDF en KPIS (`DS`, Comercial) | `false` | ídem |

Con esto el backend del rediseño queda **100% validado**: reglas de acceso probadas por unit test y por HTTP, y el flag del visor confirmado en sus dos ramas.

---

## 4. Frontend

### Resuelto y confirmado funcionando (sigue vigente)
- `composables/useCarpetas.ts` (+ `useArchivos()`), `pages/kpis/index.vue`, `pages/kpis/[id].vue` con control de permisos vía `composables/useAccesoKpisIso.ts` (creado en sesión 6).
- Visor de PDF propio (`usePdfViewer.ts` + `VisorPdf.vue`) fase 1, integrado en `pages/kpis/[id].vue`.
- Panel de accesos actual: `Editarpermisos.vue` + `Accesoskpisiso.vue` + `utils/permisos.ts`, con niveles enum (a reemplazar).

### Pendiente de implementar (definido en sesión 7, nada hecho todavía)
> ⚠️ El backend ya migró al modelo granular en sesión 10, así que el frontend está **desincronizado**: sigue mandando/leyendo los enums viejos, que ya no existen en la BD.

- `utils/permisos.ts`: reemplazar `AccesosKpisIsoState` (basado en `NivelAccesoIndicador`/`NivelAccesoISO`) por un estado con los 5 booleanos por proceso y para ISO.
- `Accesoskpisiso.vue`: rehacer el grid para mostrar checkboxes de los 5 permisos por proceso + los 5 de ISO (+ `gestionaObsoleto`), en vez de selects de nivel.
- `Editarpermisos.vue`: decidir si el bloque de KPIs/ISO se separa en su propia sección/tab visible también para `esAdminKpis` (que no es `esAdmin` general y hoy no tiene acceso a esta página en absoluto, según el middleware).
- `composables/useAccesoKpisIso.ts`: reescribir para leer los 5 flags en vez de comparar contra `'ESCRITURA'`/`'EDICION_TOTAL'`.
- `AppSidebar.vue`: condicionar el ítem "KPIs / ISO" a `puedeVer` (en cualquier proceso o en ISO) en vez de `esAdmin` — sigue pendiente de antes, ahora con el modelo nuevo.
- Middleware de rutas (`auth.global.ts` o `permisos.global.ts`, sin confirmar cuál): permitir entrada de `esAdminKpis` a la gestión de accesos KPIs/ISO sin ser `esAdmin` general.

---

## 5. Qué falta (orden sugerido, actualizado)

### ✅ Hecho en sesión 10 (backend completo)

- ✅ ~~Cerrar las dudas abiertas~~ — las 4 originales en sesión 9, la quinta (punto 5 de 1.1) en sesión 10.
- ✅ ~~Migración de Prisma con el modelo granular~~ — `20260905120422_accesos_kpis_iso_granulares`: los 5 booleanos + `gestionaObsoleto`, `esAdminKpis`, `POWERPOINT`, enums viejos eliminados.
- ✅ ~~Backend: guard, DTO y service actualizados~~ — `acceso-documentos.service.ts`, `actualizar-accesos-kpis-iso.dto.ts`, `usuarios.service.ts`, `acceso-carpeta.guard.ts`, con la regla dura de PDFs (punto 1), la visibilidad por tipo (punto 2) y la visibilidad previa a eliminar (punto 5). Además `carpetas.service.ts` filtra archivos por tipo al listar y `archivos.service.ts` acepta PowerPoint.
- ✅ ~~`EsAdminKpisGuard`~~ — aplicado solo en `PATCH /usuarios/:id/accesos-kpis-iso` y `GET /usuarios/lista-basica`; el resto de los endpoints de usuarios sigue con `EsAdminGuard`.
- ✅ ~~`GET /usuarios/lista-basica`~~ (punto 4) — devuelve `id`, `nombre`, `avatarUrl` vía `select`, sin exponer permisos de otros módulos.
- ✅ `PATCH /usuarios/:id/rol-kpis` — asigna/quita `esAdminKpis`, exclusivo de `EsAdminGuard` (no estaba en la lista original; sin esto el flag solo se podía setear a mano en la BD).
- ✅ ~~Seeds al nuevo shape~~ — `accesos-kpis-iso.seed.ts` migrado a los 5 booleanos, sin nombres hardcodeados, y **corrido** (24 accesos de indicador + 3 de ISO). `kpis-iso-2026.seed.ts` estaba pisado por una copia del otro seed: reconstruido y ahora idempotente. Script `seed:accesos` agregado.
- ✅ Primer test unitario del módulo — `acceso-documentos.service.spec.ts`, 7 casos sobre las reglas de archivo, incluyendo la verificación del gap del punto 5 antes y después del fix.
- ✅ **`GET /archivos/:id/url` devuelve `esPdfIso`** junto con la `url` — último ítem pendiente del backend. Lo toma de `request.esPdfIso` (que ya calculó el guard), sin consulta extra. Detalle en la sección 3.
- ✅ **Validación end-to-end por HTTP** — los 6 casos corrieron contra los endpoints reales, todos con el resultado esperado: el listado oculta el Word de ISO, el PDF se sirve con solo `puedeVer`, el Word da 403 sin `puedeEditar`, el `DELETE` de un PDF de ISO da 403 incluso con `puedeEliminar=true` forzado (punto 1), el `DELETE` del Word invisible también da 403 por la rama de visibilidad (punto 5, aislado), y `esAdmin` saltea la regla dura con 200. Detalle de la matriz en la sección 3. Efectos colaterales sobre los datos (archivos #8 y #9 nuevos, #3 borrado) en la sección 2.

### Qué falta

1. **Frontend**: `utils/permisos.ts`, `Accesoskpisiso.vue`, `Editarpermisos.vue`, `useAccesoKpisIso.ts` (ver sección 4).
2. `AppSidebar.vue` con visibilidad real basada en `puedeVer`.
3. Middleware de rutas actualizado para `esAdminKpis`.
4. Fase 2 del visor de PDF (bloquear clic derecho/Ctrl+P/Ctrl+S). El backend ya le pasa lo que necesita: `GET /archivos/:id/url` devuelve `esPdfIso` para decidir entre visor y descarga.
5. Endpoint de transferencia de documentos al clonar año + clonado de año 2027 (el seed del árbol ya es idempotente y toma el año de una constante, así que está listo para reusarse).
6. Confirmar con Alice naming de subcarpetas y decisión sobre visor de Word/Excel/PowerPoint (única pregunta externa sin responder — no bloquea el rediseño de permisos, sí el módulo de visor).
7. Conectar el contexto en el repo de **frontend** con Claude Code (el backend ya está — ver sección 0).

---

## 6. Archivos que hacen falta si se retoma esto en otro chat

Para avanzar con el rediseño (prioridad ahora), pedidos y aún no recibidos:
1. `common/guards/es-admin.guard.ts`
2. `components/admin/Editarpermisos.vue` completo
3. `AppSidebar.vue`
4. El middleware que protege `/usuarios` (`auth.global.ts` o `permisos.global.ts`, confirmar cuál es)
5. `usuarios.service.ts` — método `actualizarAccesosKpisIso` actual
6. `actualizar-accesos-kpis-iso.dto.ts` actual

Ya no hacen falta (ya compartidos y con contenido conocido): `schema.prisma` (modelos Carpeta/Archivo/AccesoIndicador/AccesoISO/Usuario), `useCarpetas.ts`, `usePermiso.ts`, `utils/permisos.ts` (versión vieja, antes del rediseño), `usuarios.controller.ts`, `supabase-auth.guard.ts` (ya corregido), `pages/kpis/[id].vue` (ya con permisos integrados), `composables/useAccesoKpisIso.ts` (versión vieja, antes del rediseño).
