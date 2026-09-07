// `usuarios.service` importa el cliente de Supabase, que se instancia al cargar
// el modulo y necesita SUPABASE_URL/KEY. Nada de lo que se prueba aca lo usa.
jest.mock('../infrastructure/supabase/supabase-admin.client', () => ({
  supabaseAdmin: { auth: { admin: {} } },
}));

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
