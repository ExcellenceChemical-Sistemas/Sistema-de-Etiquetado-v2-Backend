// src/common/decorators/requiere-acceso-carpeta.decorator.ts
import { SetMetadata } from '@nestjs/common';

export type AccionCarpeta = 'ver' | 'descargar' | 'crear' | 'editar' | 'eliminar';

export const ACCESO_CARPETA_KEY = 'accesoCarpetaRequerido';

export interface AccesoCarpetaRequerido {
  accion: AccionCarpeta;
  /** true si el :id de la ruta es un archivoId en vez de un carpetaId. */
  esArchivo?: boolean;
  /** nombre del param de ruta a usar como id, si no es "id" (default). */
  paramCarpetaId?: string;
}

export const RequiereAccesoCarpeta = (opciones: AccesoCarpetaRequerido) =>
  SetMetadata(ACCESO_CARPETA_KEY, opciones);