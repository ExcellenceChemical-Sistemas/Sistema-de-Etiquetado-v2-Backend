// src/common/guards/es-admin-kpis.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Exige `esAdmin` O `esAdminKpis`. Debe usarse SIEMPRE después de
 * SupabaseAuthGuard (depende de `request.usuario`, igual que EsAdminGuard).
 *
 * Alcance deliberadamente acotado (§1.1 punto 4): solo la gestión de accesos de
 * KPIs/ISO. El resto de los endpoints de administración de usuarios siguen
 * exclusivos de `esAdmin` vía EsAdminGuard — el Admin de KPIs no tiene por qué
 * ver ni tocar permisos de otros módulos (Lotes, Productos, etc.).
 *
 * OJO: esto habilita a GESTIONAR accesos de otros, no da acceso propio al
 * contenido de KPIs/ISO. Para ver o hacer algo dentro del módulo, el Admin de
 * KPIs necesita que a él mismo se le asignen accesos, igual que a cualquiera.
 */
@Injectable()
export class EsAdminKpisGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const usuario = request.usuario;

    if (!usuario?.esAdmin && !usuario?.esAdminKpis) {
      throw new ForbiddenException(
        'Esta acción requiere permisos de administrador o de administrador de KPIs/ISO',
      );
    }

    return true;
  }
}
