// src/usuario/dto/actualizar-accesos-kpis-iso.dto.ts
import { z } from 'zod';
import { ProcesoIndicador } from '../../generated/prisma';

// Los 5 permisos granulares que comparten AccesoIndicador y AccesoISO (§1.1 del
// contexto). Reemplazan a los enums TipoAccesoIndicador / TipoAccesoISO.
const permisosDocumentoSchema = z.object({
  puedeVer: z.boolean().default(false),
  puedeDescargar: z.boolean().default(false),
  puedeAdjuntar: z.boolean().default(false),
  puedeEditar: z.boolean().default(false),
  puedeEliminar: z.boolean().default(false),
});

const accesoIndicadorItemSchema = permisosDocumentoSchema.extend({
  proceso: z.nativeEnum(ProcesoIndicador),
});

// ISO suma gestionaObsoleto: acopla ver+editar sobre la carpeta Obsoleto en un
// solo flag, no se desglosa en los 5 (§1.1 punto 3).
const accesoIsoSchema = permisosDocumentoSchema.extend({
  gestionaObsoleto: z.boolean().default(false),
});

export const actualizarAccesosKpisIsoSchema = z.object({
  accesosIndicador: z.array(accesoIndicadorItemSchema).default([]),
  // null = quitarle el acceso a ISO por completo
  accesoIso: accesoIsoSchema.nullable(),
});

export type ActualizarAccesosKpisIsoDto = z.infer<
  typeof actualizarAccesosKpisIsoSchema
>;
