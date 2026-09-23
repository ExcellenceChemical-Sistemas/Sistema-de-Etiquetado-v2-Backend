const mockGetUser = jest.fn();
jest.mock('../../infrastructure/supabase/supabase-admin.client', () => ({
  supabaseAdmin: { auth: { getUser: (...a: unknown[]) => mockGetUser(...a) } },
}));

import { ForbiddenException } from '@nestjs/common';
import { SupabaseAuthGuard } from './supabase-auth.guard';

function contexto(request: any): any {
  return { switchToHttp: () => ({ getRequest: () => request }) };
}

function crearGuard(usuario: any) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'sb-1', email: 'a@b.c' } }, error: null });
  const prisma: any = { usuario: { findUnique: jest.fn(() => Promise.resolve(usuario)) } };
  return new SupabaseAuthGuard(prisma);
}

describe('SupabaseAuthGuard — cuentas desactivadas', () => {
  it('rechaza con 403 a un usuario con activo=false', async () => {
    const guard = crearGuard({ id: 2, activo: false, permisos: [] });
    const request = { headers: { authorization: 'Bearer t' } };

    await expect(guard.canActivate(contexto(request))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deja pasar a un usuario activo y llena request.usuario', async () => {
    const guard = crearGuard({ id: 2, activo: true, permisos: [] });
    const request: any = { headers: { authorization: 'Bearer t' } };

    await expect(guard.canActivate(contexto(request))).resolves.toBe(true);
    expect(request.usuario.id).toBe(2);
  });
});
