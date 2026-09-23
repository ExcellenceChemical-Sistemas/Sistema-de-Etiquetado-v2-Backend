// `usuarios.service` importa el cliente de Supabase, que se instancia al cargar
// el modulo y necesita SUPABASE_URL/KEY. Nada de lo que se prueba aca lo usa.
const mockDeleteUser = jest.fn();
jest.mock('../infrastructure/supabase/supabase-admin.client', () => ({
  supabaseAdmin: { auth: { admin: { deleteUser: (...a: unknown[]) => mockDeleteUser(...a) } } },
}));

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { UsuariosService } from './usuarios.service';

/**
 * Regresion del over-fetch: los endpoints de este service devolvian la fila
 * entera del usuario (`include: { permisos, accesosIndicador, accesoIso }` mas
 * `supabaseUserId`) aunque solo cambiaran un campo. Ya paso una vez con
 * `PATCH /usuarios/:id/accesos-kpis-iso`, donde ademas si era una fuga real
 * (lo llama un `esAdminKpis` que no es `esAdmin`). Estos tests fijan que la
 * respuesta se limite a lo que el endpoint toca.
 */

const USUARIO = { id: 6, nombre: 'willy', esAdmin: false, esAdminKpis: false };

function crearServicio() {
  const update = jest.fn(() => Promise.resolve(USUARIO));
  const prisma: any = {
    usuario: {
      findUnique: jest.fn(() => Promise.resolve(USUARIO)),
      update,
    },
  };
  return { servicio: new UsuariosService(prisma), update };
}

describe('actualizarRolKpis — acceso minimo en la respuesta', () => {
  it('no usa include: no arrastra permisos, accesosIndicador ni accesoIso', async () => {
    const { servicio, update } = crearServicio();
    await servicio.actualizarRolKpis(6, { esAdminKpis: true });

    const args = update.mock.calls[0][0] as any;
    expect(args.include).toBeUndefined();
    expect(args.select).toBeDefined();
  });

  it('el select no expone permisos, accesos ni supabaseUserId', async () => {
    const { servicio, update } = crearServicio();
    await servicio.actualizarRolKpis(6, { esAdminKpis: true });

    const campos = Object.keys((update.mock.calls[0][0] as any).select);
    expect(campos).not.toContain('permisos');
    expect(campos).not.toContain('accesosIndicador');
    expect(campos).not.toContain('accesoIso');
    expect(campos).not.toContain('supabaseUserId');
  });

  it('devuelve lo necesario para refrescar la lista de usuarios', async () => {
    const { servicio, update } = crearServicio();
    await servicio.actualizarRolKpis(6, { esAdminKpis: true });

    const campos = Object.keys((update.mock.calls[0][0] as any).select);
    expect(campos.sort()).toEqual([
      'avatarUrl',
      'esAdmin',
      'esAdminKpis',
      'id',
      'nombre',
    ]);
  });
});

describe('eliminar', () => {
  const OBJETIVO = { id: 6, supabaseUserId: 'sb-6' };

  function crear(opciones: { existe?: boolean; errorDelete?: unknown } = {}) {
    const remove = jest.fn(() =>
      opciones.errorDelete ? Promise.reject(opciones.errorDelete) : Promise.resolve(OBJETIVO),
    );
    const prisma: any = {
      usuario: {
        findUnique: jest.fn(() => Promise.resolve(opciones.existe === false ? null : OBJETIVO)),
        delete: remove,
      },
    };
    return { servicio: new UsuariosService(prisma), remove };
  }

  beforeEach(() => mockDeleteUser.mockReset().mockResolvedValue({ error: null }));

  it('borra la fila y la cuenta de Supabase', async () => {
    const { servicio, remove } = crear();
    await servicio.eliminar(6, 1);

    expect(remove).toHaveBeenCalledWith({ where: { id: 6 } });
    expect(mockDeleteUser).toHaveBeenCalledWith('sb-6');
  });

  it('no deja que un admin se elimine a sí mismo', async () => {
    const { servicio, remove } = crear();
    await expect(servicio.eliminar(6, 6)).rejects.toBeInstanceOf(BadRequestException);
    expect(remove).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('404 si el usuario no existe', async () => {
    const { servicio } = crear({ existe: false });
    await expect(servicio.eliminar(99, 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409 si tiene historial, y NO toca Supabase (la cuenta sigue pudiendo entrar)', async () => {
    const fk = new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' });
    const { servicio } = crear({ errorDelete: fk });

    await expect(servicio.eliminar(6, 1)).rejects.toBeInstanceOf(ConflictException);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });
});

describe('actualizarActivo', () => {
  it('desactiva la cuenta y no toca Supabase ni borra la fila', async () => {
    const { servicio, update } = crearServicio();
    await servicio.actualizarActivo(6, false, 1);

    expect((update.mock.calls[0][0] as any).data).toEqual({ activo: false });
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('reactiva la cuenta', async () => {
    const { servicio, update } = crearServicio();
    await servicio.actualizarActivo(6, true, 1);

    expect((update.mock.calls[0][0] as any).data).toEqual({ activo: true });
  });

  it('un admin no puede desactivarse a sí mismo', async () => {
    const { servicio, update } = crearServicio();

    await expect(servicio.actualizarActivo(1, false, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('usuario inexistente → NotFound', async () => {
    const { servicio, update } = crearServicio();
    (servicio as any).prisma.usuario.findUnique.mockResolvedValueOnce(null);

    await expect(servicio.actualizarActivo(99, false, 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });
});
