const mockGetUser = jest.fn();
jest.mock('../../infrastructure/supabase/supabase-admin.client', () => ({
  supabaseAdmin: { auth: { getUser: (...a: unknown[]) => mockGetUser(...a) } },
}));

import { ForbiddenException } from '@nestjs/common';
import { SupabaseAuthGuard } from './supabase-auth.guard';

function contexto(request: any): any {
  return { switchToHttp: () => ({ getRequest: () => request }) };
}

function crearGuard(usuario: any, factors?: unknown[]) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'sb-1', email: 'a@b.c', factors } }, error: null });
  const prisma: any = { usuario: { findUnique: jest.fn(() => Promise.resolve(usuario)) } };
  return new SupabaseAuthGuard(prisma);
}

// JWT con el nivel de sesión dado; el guard solo lee el claim `aal` (la firma ya la validó getUser).
function tokenAal(aal: 'aal1' | 'aal2'): string {
  const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${parte({ alg: 'ES256' })}.${parte({ aal })}.firma`;
}

describe('SupabaseAuthGuard — cuentas desactivadas', () => {
  it('rechaza con 403 a un usuario con activo=false', async () => {
    const guard = crearGuard({ id: 2, activo: false, permisos: [] });
    const request = { headers: { authorization: 'Bearer t' } };

    const rechazo = guard.canActivate(contexto(request));
    await expect(rechazo).rejects.toBeInstanceOf(ForbiddenException);
    // el frontend se apoya en este código para cerrar la sesión
    await expect(rechazo).rejects.toMatchObject({ response: { code: 'CUENTA_DESACTIVADA' } });
  });

  it('deja pasar a un usuario activo y llena request.usuario', async () => {
    const guard = crearGuard({ id: 2, activo: true, permisos: [] });
    const request: any = { headers: { authorization: 'Bearer t' } };

    await expect(guard.canActivate(contexto(request))).resolves.toBe(true);
    expect(request.usuario.id).toBe(2);
  });
});

describe('SupabaseAuthGuard — segundo factor', () => {
  const verificado = [{ factor_type: 'totp', status: 'verified' }];
  const admin = { id: 1, activo: true, esAdmin: true, esAdminKpis: false, permisos: [] };

  afterEach(() => {
    delete process.env.EXIGIR_MFA_ADMIN;
  });

  it('con el factor activado, una sesión de solo contraseña (aal1) se rechaza', async () => {
    const guard = crearGuard(admin, verificado);
    const request = { headers: { authorization: `Bearer ${tokenAal('aal1')}` } };

    const rechazo = guard.canActivate(contexto(request));
    await expect(rechazo).rejects.toBeInstanceOf(ForbiddenException);
    await expect(rechazo).rejects.toMatchObject({ response: { code: 'MFA_REQUERIDO' } });
  });

  it('con el factor activado, la sesión ya verificada (aal2) pasa', async () => {
    const guard = crearGuard(admin, verificado);
    const request: any = { headers: { authorization: `Bearer ${tokenAal('aal2')}` } };

    await expect(guard.canActivate(contexto(request))).resolves.toBe(true);
  });

  it('sin factor y sin exigencia el administrador entra igual (es opcional)', async () => {
    const guard = crearGuard(admin, undefined);
    const request: any = { headers: { authorization: `Bearer ${tokenAal('aal1')}` } };

    await expect(guard.canActivate(contexto(request))).resolves.toBe(true);
  });

  it('con EXIGIR_MFA_ADMIN un administrador sin factor queda bloqueado…', async () => {
    process.env.EXIGIR_MFA_ADMIN = 'true';
    const guard = crearGuard(admin, undefined);
    const request = { method: 'GET', path: '/api/productos', headers: { authorization: `Bearer ${tokenAal('aal1')}` } };

    const rechazo = guard.canActivate(contexto(request));
    await expect(rechazo).rejects.toMatchObject({ response: { code: 'MFA_ENROLAR' } });
  });

  it('…salvo para leer su propio perfil, que el frontend necesita para llevarlo a activarlo', async () => {
    process.env.EXIGIR_MFA_ADMIN = 'true';
    const guard = crearGuard(admin, undefined);
    const request: any = { method: 'GET', path: '/api/usuarios/me', headers: { authorization: `Bearer ${tokenAal('aal1')}` } };

    await expect(guard.canActivate(contexto(request))).resolves.toBe(true);
  });

  it('la excepción de /usuarios/me no aplica a otros métodos ni a otras rutas parecidas', async () => {
    process.env.EXIGIR_MFA_ADMIN = 'true';
    const guard = crearGuard(admin, undefined);
    for (const [method, path] of [['PATCH', '/api/usuarios/me'], ['GET', '/api/usuarios/me/avatar'], ['GET', '/api/usuarios']]) {
      const request = { method, path, headers: { authorization: `Bearer ${tokenAal('aal1')}` } };
      await expect(guard.canActivate(contexto(request))).rejects.toMatchObject({ response: { code: 'MFA_ENROLAR' } });
    }
  });

  it('con EXIGIR_MFA_ADMIN un usuario común sin factor no se ve afectado', async () => {
    process.env.EXIGIR_MFA_ADMIN = 'true';
    const guard = crearGuard({ id: 3, activo: true, esAdmin: false, esAdminKpis: false, permisos: [] }, undefined);
    const request: any = { method: 'GET', path: '/api/productos', headers: { authorization: `Bearer ${tokenAal('aal1')}` } };

    await expect(guard.canActivate(contexto(request))).resolves.toBe(true);
  });
});
