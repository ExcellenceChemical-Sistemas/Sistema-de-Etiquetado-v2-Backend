// src/common/guards/supabase-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { supabaseAdmin } from '../../infrastructure/supabase/supabase-admin.client';
import { evaluarMfa, leerAal } from '../auth/mfa';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el token de autenticación');
    }

    const token = authHeader.slice('Bearer '.length);
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { supabaseUserId: data.user.id },
      // clave: traemos permisos normales + accesos de KPIs/ISO,
      // porque request.usuario alimenta tanto usePermiso() como
      // useAccesoKpisIso() en el frontend (vía GET /usuarios/me)
      include: { permisos: true, accesosIndicador: true, accesoIso: true },
    });

    if (!usuario) {
      throw new UnauthorizedException('Usuario no registrado en el sistema');
    }

    // Cuenta desactivada: el login de Supabase sigue funcionando, pero el
    // sistema la rechaza acá. Se conserva el historial (etiquetas, pedidos).
    if (!usuario.activo) {
      // `code` deja al frontend distinguir este 403 de uno por falta de permiso
      // y cerrar la sesión al instante en vez de dejarla navegando a ciegas.
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Tu cuenta está desactivada. Contactá a un administrador.',
        code: 'CUENTA_DESACTIVADA',
      });
    }

    // Segundo factor: la contraseña sola (sesión aal1) no alcanza si la cuenta lo
    // tiene activado. Va después de validar la cuenta para no dar pistas de
    // estados a quien no está autenticado.
    const mfa = evaluarMfa({
      aal: leerAal(token),
      factors: data.user.factors,
      esAdmin: usuario.esAdmin,
      esAdminKpis: usuario.esAdminKpis,
      exigirAdmin: process.env.EXIGIR_MFA_ADMIN === 'true',
    });
    if (mfa === 'MFA_REQUERIDO') {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Falta verificar el código de tu app autenticadora.',
        code: 'MFA_REQUERIDO',
      });
    }
    // Un administrador que aún no lo configuró solo puede leer su propio perfil,
    // lo justo para que el frontend cargue y lo lleve a activarlo en Mi cuenta.
    if (mfa === 'MFA_ENROLAR' && !(request.method === 'GET' && /\/usuarios\/me\/?$/.test(request.path ?? ''))) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Los administradores deben activar la verificación en dos pasos en Mi cuenta.',
        code: 'MFA_ENROLAR',
      });
    }

    request.usuario = { ...usuario, email: data.user.email };
    return true;
  }
}