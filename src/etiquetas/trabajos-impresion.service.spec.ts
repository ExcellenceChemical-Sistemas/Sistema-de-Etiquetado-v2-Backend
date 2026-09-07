import { NotFoundException } from '@nestjs/common';
import { TrabajosImpresionService } from './trabajos-impresion.service';

/**
 * Cobertura del chequeo de pertenencia de `obtenerEstado` (fix del IDOR):
 * el endpoint solo tiene `SupabaseAuthGuard`, asi que cualquier autenticado
 * llegaba al service con el id que quisiera.
 */

// Trabajo #50 lo creo el usuario 6 (willy); no hay ningun trabajo #999.
const TRABAJOS: Record<number, any> = {
  50: { id: 50, estado: 'PENDIENTE', mensajeError: null, creadoPorId: 6 },
};

const WILLY = { id: 6, esAdmin: false };
const OTRO = { id: 7, esAdmin: false };
const ADMIN = { id: 1, esAdmin: true };

function crearServicio() {
  const prisma: any = {
    trabajoImpresion: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(TRABAJOS[where.id] ?? null),
      ),
    },
  };
  return new TrabajosImpresionService(prisma);
}

describe('obtenerEstado — pertenencia del trabajo de impresion', () => {
  it('el creador consulta su propio trabajo', async () => {
    await expect(crearServicio().obtenerEstado(50, WILLY)).resolves.toEqual({
      id: 50,
      estado: 'PENDIENTE',
      mensajeError: null,
    });
  });

  it('no expone `creadoPorId`: la forma de la respuesta no cambia', async () => {
    const estado = await crearServicio().obtenerEstado(50, WILLY);
    expect(estado).not.toHaveProperty('creadoPorId');
  });

  it('un trabajo ajeno da 404 (no 403, que confirmaria que el id existe)', async () => {
    await expect(
      crearServicio().obtenerEstado(50, OTRO),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('el trabajo ajeno y el inexistente son indistinguibles desde afuera', async () => {
    const servicio = crearServicio();
    const capturar = async (id: number): Promise<NotFoundException> => {
      try {
        await servicio.obtenerEstado(id, OTRO);
        throw new Error(`obtenerEstado(${id}) tenia que rechazar`);
      } catch (e) {
        return e as NotFoundException;
      }
    };
    const ajeno = await capturar(50);
    const inexistente = await capturar(999);

    // Mismo status y misma plantilla de mensaje. El id propio de cada uno si
    // difiere, pero eso no filtra nada: es el que mando el que llama.
    expect(ajeno.getStatus()).toBe(404);
    expect(inexistente.getStatus()).toBe(404);
    expect(ajeno.message).toBe('Trabajo 50 no encontrado');
    expect(inexistente.message).toBe('Trabajo 999 no encontrado');
  });

  it('esAdmin consulta el trabajo de cualquiera', async () => {
    await expect(
      crearServicio().obtenerEstado(50, ADMIN),
    ).resolves.toMatchObject({ id: 50 });
  });

  it('un trabajo inexistente sigue dando 404 para su propio duenio', async () => {
    await expect(
      crearServicio().obtenerEstado(999, WILLY),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
