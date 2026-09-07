// src/carpetas/acceso-documentos.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Archivo,
  Carpeta,
  ModuloDocumentos,
  TipoArchivoDocumento,
  TipoCarpeta,
} from '../generated/prisma';

export interface AccesoEfectivo {
  puedeVer: boolean;
  puedeDescargar: boolean;
  /** = puedeAdjuntar en el modelo granular (subir archivos / crear subcarpetas). */
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  /** true si el acceso equivale a la vieja EDICION_TOTAL / ESCRITURA (hoy: puede editar). */
  esEdicionTotal: boolean;
}

const SIN_ACCESO: AccesoEfectivo = {
  puedeVer: false,
  puedeDescargar: false,
  puedeCrear: false,
  puedeEditar: false,
  puedeEliminar: false,
  esEdicionTotal: false,
};

const ACCESO_TOTAL: AccesoEfectivo = {
  puedeVer: true,
  puedeDescargar: true,
  puedeCrear: true,
  puedeEditar: true,
  puedeEliminar: true,
  esEdicionTotal: true,
};

/** Columnas booleanas de AccesoIndicador / AccesoISO. */
interface FlagsDocumento {
  puedeVer: boolean;
  puedeDescargar: boolean;
  puedeAdjuntar: boolean;
  puedeEditar: boolean;
  puedeEliminar: boolean;
}

/** Traduce las 5 columnas granulares al shape que consumen los guards/servicios. */
function aAccesoEfectivo(flags: FlagsDocumento): AccesoEfectivo {
  return {
    puedeVer: flags.puedeVer,
    puedeDescargar: flags.puedeDescargar,
    puedeCrear: flags.puedeAdjuntar,
    puedeEditar: flags.puedeEditar,
    puedeEliminar: flags.puedeEliminar,
    esEdicionTotal: flags.puedeEditar,
  };
}

type UsuarioReq = { id: number; esAdmin: boolean };

@Injectable()
export class AccesoDocumentosService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cadena desde `carpetaId` (índice 0) hasta la raíz (último elemento). */
  private async obtenerCadena(carpetaId: number): Promise<Carpeta[]> {
    const cadena: Carpeta[] = [];
    let actualId: number | null = carpetaId;
    while (actualId !== null) {
      const carpeta = await this.prisma.carpeta.findUnique({ where: { id: actualId } });
      if (!carpeta) break;
      cadena.push(carpeta);
      actualId = carpeta.carpetaPadreId;
    }
    return cadena;
  }

  /**
   * Resuelve el acceso efectivo de `usuario` sobre `carpetaId`.
   * Regla general: la carpeta más específica (más cerca de la hoja) manda.
   * - ISO: acceso atado al concepto "ISO" completo (AccesoISO). La carpeta
   *   Obsoleto sigue acoplada a un único flag `gestionaObsoleto` (§1.1 punto 3):
   *   con el flag da control total sobre esa rama, sin el flag no se ve.
   * - KPIS: acceso atado al `proceso` del ancestro más cercano que lo tenga
   *   (AccesoIndicador). Las carpetas contenedoras sin proceso (raíz KPIS,
   *   "INDICADORES") son visibles con solo-ver si el usuario tiene `puedeVer`
   *   en algún proceso — el detalle se filtra al listar hijos.
   */
  async resolverAccesoCarpeta(
    usuario: UsuarioReq,
    carpetaId: number,
  ): Promise<AccesoEfectivo> {
    if (usuario.esAdmin) return ACCESO_TOTAL;

    const cadena = await this.obtenerCadena(carpetaId);
    if (cadena.length === 0) return SIN_ACCESO;

    const modulo = cadena[0].modulo;
    const tieneObsoleto = cadena.some((c) => c.tipo === TipoCarpeta.OBSOLETO);

    if (modulo === ModuloDocumentos.ISO) {
      const acceso = await this.prisma.accesoISO.findUnique({
        where: { usuarioId: usuario.id },
      });
      if (!acceso) return SIN_ACCESO;

      if (tieneObsoleto) return acceso.gestionaObsoleto ? ACCESO_TOTAL : SIN_ACCESO;
      return aAccesoEfectivo(acceso);
    }

    if (modulo === ModuloDocumentos.KPIS) {
      const nodoProceso = cadena.find((c) => c.proceso !== null);

      if (!nodoProceso) {
        // Carpeta contenedora (raíz KPIS, "INDICADORES"): solo-ver si tiene
        // `puedeVer` en al menos un proceso.
        const conVer = await this.prisma.accesoIndicador.count({
          where: { usuarioId: usuario.id, puedeVer: true },
        });
        return conVer > 0 ? { ...SIN_ACCESO, puedeVer: true } : SIN_ACCESO;
      }

      const acceso = await this.prisma.accesoIndicador.findUnique({
        where: {
          usuarioId_proceso: { usuarioId: usuario.id, proceso: nodoProceso.proceso! },
        },
      });
      if (!acceso) return SIN_ACCESO;

      return aAccesoEfectivo(acceso);
    }

    return SIN_ACCESO;
  }

  /** Trae archivo + carpeta + acceso efectivo sobre la carpeta contenedora. */
  private async resolverArchivo(
    usuario: UsuarioReq,
    archivoId: number,
  ): Promise<{
    archivo: Archivo;
    carpeta: Carpeta;
    acceso: AccesoEfectivo;
    esPdfIso: boolean;
  } | null> {
    const archivo = await this.prisma.archivo.findUnique({
      where: { id: archivoId },
      include: { carpeta: true },
    });
    if (!archivo) return null;

    const acceso = await this.resolverAccesoCarpeta(usuario, archivo.carpetaId);
    const esPdfIso =
      archivo.carpeta.modulo === ModuloDocumentos.ISO &&
      archivo.tipo === TipoArchivoDocumento.PDF;

    return { archivo, carpeta: archivo.carpeta, acceso, esPdfIso };
  }

  /**
   * Compat: forma que hoy consume AccesoCarpetaGuard. Preferir `puedeVerArchivo`
   * / `puedeEliminarArchivo` para decisiones a nivel de archivo (aplican §1.1
   * puntos 1 y 2).
   */
  async resolverAccesoArchivo(
    usuario: UsuarioReq,
    archivoId: number,
  ): Promise<{ acceso: AccesoEfectivo; esPdfIso: boolean; carpetaId: number } | null> {
    const r = await this.resolverArchivo(usuario, archivoId);
    if (!r) return null;
    return { acceso: r.acceso, esPdfIso: r.esPdfIso, carpetaId: r.archivo.carpetaId };
  }

  /**
   * Visibilidad por tipo de archivo (§1.1 punto 2). En ISO:
   * - PDF (documento oficial aprobado): alcanza con `puedeVer`.
   * - Word / Excel / PowerPoint (borrador de trabajo): hace falta además `puedeEditar`.
   * En KPIS no hay distinción por tipo: vale el `puedeVer` de la carpeta.
   */
  async puedeVerArchivo(usuario: UsuarioReq, archivoId: number): Promise<boolean> {
    if (usuario.esAdmin) return true;

    const r = await this.resolverArchivo(usuario, archivoId);
    if (!r) return false;

    if (!r.acceso.puedeVer) return false;
    if (r.carpeta.modulo !== ModuloDocumentos.ISO) return true;
    if (r.archivo.tipo === TipoArchivoDocumento.PDF) return true;
    return r.acceso.puedeEditar;
  }

  /**
   * Reglas de descarga, en orden:
   * 1. `esAdmin` puede siempre.
   * 2. No se descarga lo que no se puede ver — misma disciplina que eliminar
   *    (§1.1 punto 5): `puedeVerArchivo` primero, así un Word de ISO invisible
   *    no se baja ni con `puedeDescargar=true`.
   * 3. Excepción del PDF de ISO: da true con solo `puedeVer`. NO es un permiso
   *    de descarga — es que `GET /archivos/:id/url` es la única fuente de la
   *    signed URL que alimenta el visor propio de ISO, y §1.1 punto 2 dice que
   *    el PDF (documento oficial aprobado) se ve con `puedeVer`. Exigir
   *    `puedeDescargar` acá dejaría a esos usuarios sin poder ABRIR el PDF.
   *    Ojo: una signed URL es una signed URL, así que para estos archivos la
   *    protección real contra "guardar" es la fase 2 del visor (bloquear
   *    Ctrl+S / clic derecho), no este guard.
   * 4. Recién ahí manda el flag `puedeDescargar`.
   */
  async puedeDescargarArchivo(usuario: UsuarioReq, archivoId: number): Promise<boolean> {
    if (usuario.esAdmin) return true;

    if (!(await this.puedeVerArchivo(usuario, archivoId))) return false;

    const r = await this.resolverArchivo(usuario, archivoId);
    if (!r) return false;

    if (r.esPdfIso) return true; // visor de ISO, ver arriba
    return r.acceso.puedeDescargar;
  }

  /**
   * Reglas de eliminación, en orden:
   * 1. `esAdmin` puede siempre.
   * 2. No se elimina lo que no se puede ver: si `puedeVerArchivo` da false, no
   *    procede. Sin esto, `puedeEliminar=true` + `puedeEditar=false` dejaba
   *    borrar un Word/Excel/PowerPoint de ISO que ni siquiera aparece en el
   *    listado del usuario.
   * 3. Regla dura de PDFs en ISO (§1.1 punto 1): `puedeEliminar=true` NO alcanza
   *    para borrar un archivo tipo PDF dentro de ISO. Sin excepción salvo `esAdmin`.
   * 4. Recién ahí manda el flag `puedeEliminar`.
   */
  async puedeEliminarArchivo(usuario: UsuarioReq, archivoId: number): Promise<boolean> {
    if (usuario.esAdmin) return true;

    if (!(await this.puedeVerArchivo(usuario, archivoId))) return false;

    const r = await this.resolverArchivo(usuario, archivoId);
    if (!r) return false;

    if (r.esPdfIso) return false; // regla dura, sin excepción
    return r.acceso.puedeEliminar;
  }

  /** Para filtrar listados: ¿el usuario tiene al menos "ver" en esta carpeta? */
  async puedeVer(usuario: UsuarioReq, carpetaId: number): Promise<boolean> {
    const acceso = await this.resolverAccesoCarpeta(usuario, carpetaId);
    return acceso.puedeVer;
  }

  /** Para el listado de raíces: ¿tiene `puedeVer` en algún proceso o en ISO? */
  async tieneAccesoModulo(
    usuario: UsuarioReq,
    modulo: ModuloDocumentos,
  ): Promise<boolean> {
    if (usuario.esAdmin) return true;

    if (modulo === ModuloDocumentos.ISO) {
      const acceso = await this.prisma.accesoISO.findUnique({
        where: { usuarioId: usuario.id },
      });
      return !!acceso && acceso.puedeVer;
    }

    const total = await this.prisma.accesoIndicador.count({
      where: { usuarioId: usuario.id, puedeVer: true },
    });
    return total > 0;
  }
}
