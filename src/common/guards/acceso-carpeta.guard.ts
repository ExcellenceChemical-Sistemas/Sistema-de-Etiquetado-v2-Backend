// src/common/guards/acceso-carpeta.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ACCESO_CARPETA_KEY,
  AccesoCarpetaRequerido,
  AccionCarpeta,
} from '../decorators/requiere-acceso-carpeta.decorator';
import {
  AccesoDocumentosService,
  AccesoEfectivo,
} from '../../carpetas/acceso-documentos.service';

type UsuarioReq = { id: number; esAdmin: boolean };

/**
 * Debe ir SIEMPRE después de SupabaseAuthGuard en la cadena de guards
 * (depende de request.usuario ya cargado, igual que EsAdminGuard/PermisosGuard).
 */
@Injectable()
export class AccesoCarpetaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accesoDocumentos: AccesoDocumentosService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requerido = this.reflector.getAllAndOverride<AccesoCarpetaRequerido>(ACCESO_CARPETA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requerido) return true; // endpoint sin @RequiereAccesoCarpeta (ej. GET /carpetas/raiz)

    const request = context.switchToHttp().getRequest();
    const usuario: UsuarioReq = request.usuario;
    const idParam = Number(request.params[requerido.paramCarpetaId ?? 'id']);

    if (requerido.esArchivo) {
      const resultado = await this.accesoDocumentos.resolverAccesoArchivo(usuario, idParam);
      if (!resultado) throw new NotFoundException('Archivo no encontrado');

      request.accesoCarpeta = resultado.acceso;
      request.esPdfIso = resultado.esPdfIso;

      const permitido = await this.verificarAccionArchivo(
        usuario,
        idParam,
        requerido.accion,
        resultado.acceso,
      );
      if (!permitido) {
        throw new ForbiddenException('No tienes permiso para esta acción sobre este archivo');
      }
      return true;
    }

    const acceso = await this.accesoDocumentos.resolverAccesoCarpeta(usuario, idParam);
    request.accesoCarpeta = acceso;
    this.verificarAccionCarpeta(acceso, requerido.accion);
    return true;
  }

  /**
   * Acciones sobre un archivo puntual. `ver` y `eliminar` delegan en el service,
   * que aplica las reglas cerradas de §1.1:
   * - punto 1: un PDF dentro de ISO no se elimina ni con `puedeEliminar=true` (salvo esAdmin).
   * - punto 2: en ISO, Word/Excel/PowerPoint solo se ven con `puedeEditar`; el PDF alcanza con `puedeVer`.
   * `descargar` aplica el flag `puedeDescargar`, con la excepción del PDF de ISO
   * (su signed URL alimenta el visor propio, no una descarga — ver el service).
   */
  private async verificarAccionArchivo(
    usuario: UsuarioReq,
    archivoId: number,
    accion: AccionCarpeta,
    acceso: AccesoEfectivo,
  ): Promise<boolean> {
    switch (accion) {
      case 'ver':
        return this.accesoDocumentos.puedeVerArchivo(usuario, archivoId);
      case 'descargar':
        return this.accesoDocumentos.puedeDescargarArchivo(usuario, archivoId);
      case 'eliminar':
        return this.accesoDocumentos.puedeEliminarArchivo(usuario, archivoId);
      case 'crear':
        return acceso.puedeCrear;
      case 'editar':
        return acceso.puedeEditar;
    }
  }

  private verificarAccionCarpeta(acceso: AccesoEfectivo, accion: AccionCarpeta) {
    const mapa: Record<AccionCarpeta, boolean> = {
      ver: acceso.puedeVer,
      descargar: acceso.puedeDescargar,
      crear: acceso.puedeCrear,
      editar: acceso.puedeEditar,
      eliminar: acceso.puedeEliminar,
    };

    if (!mapa[accion]) {
      throw new ForbiddenException('No tienes permiso para esta acción sobre esta carpeta');
    }
  }
}
