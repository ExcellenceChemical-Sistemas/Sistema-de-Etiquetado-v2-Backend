import { NotFoundException } from '@nestjs/common';
import { PedidosService } from './pedidos.service';

/**
 * El pedido no tiene columna `estado`: se deriva de qué fechas están
 * seteadas. Estos tests fijan esa regla (la etapa más avanzada gana) y que
 * el filtro por estado de findAll coincida con ella.
 */

const F = new Date('2026-09-01T10:00:00Z');
const PEDIDO_VACIO = {
  id: 1,
  inicioPreparacionEn: null,
  preparadoEn: null,
  salioEn: null,
  entregadoEn: null,
};

function crearServicio(pedidos: any[]) {
  const prisma: any = {
    pedido: {
      findMany: jest.fn(() => Promise.resolve(pedidos)),
      findUnique: jest.fn(() => Promise.resolve(pedidos[0] ?? null)),
      update: jest.fn(({ data }: any) => Promise.resolve({ ...pedidos[0], ...data })),
    },
  };
  return { servicio: new PedidosService(prisma), prisma };
}

describe('estado derivado del pedido', () => {
  const casos: [string, object, string][] = [
    ['sin ninguna etapa → RECIBIDO', {}, 'RECIBIDO'],
    ['con inicio de preparación → EN_PREPARACION', { inicioPreparacionEn: F }, 'EN_PREPARACION'],
    ['con preparado → PREPARADO', { inicioPreparacionEn: F, preparadoEn: F }, 'PREPARADO'],
    ['con salida → SALIO', { preparadoEn: F, salioEn: F }, 'SALIO'],
    ['con entrega → ENTREGADO', { salioEn: F, entregadoEn: F }, 'ENTREGADO'],
    // La etapa más avanzada manda aunque falten las anteriores (se cargan a mano, fuera de orden).
    ['entregado sin haber marcado las anteriores → ENTREGADO', { entregadoEn: F }, 'ENTREGADO'],
    ['salió sin marcar preparado → SALIO', { salioEn: F }, 'SALIO'],
  ];

  it.each(casos)('%s', async (_nombre, fechas, esperado) => {
    const { servicio } = crearServicio([{ ...PEDIDO_VACIO, ...fechas }]);
    const [pedido] = await servicio.findAll();
    expect(pedido.estado).toBe(esperado);
  });

  it('findOne también lo deriva', async () => {
    const { servicio } = crearServicio([{ ...PEDIDO_VACIO, preparadoEn: F }]);
    expect((await servicio.findOne(1)).estado).toBe('PREPARADO');
  });

  it('findOne de un pedido inexistente → NotFound', async () => {
    const { servicio } = crearServicio([]);
    await expect(servicio.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('filtro por estado en findAll', () => {
  it('sin estado no filtra', async () => {
    const { servicio, prisma } = crearServicio([]);
    await servicio.findAll();
    expect(prisma.pedido.findMany.mock.calls[0][0].where).toBeUndefined();
  });

  it('cada estado filtra por la misma regla con la que se deriva', async () => {
    const { servicio, prisma } = crearServicio([]);
    const esperados: Record<string, object> = {
      RECIBIDO: { inicioPreparacionEn: null },
      EN_PREPARACION: { inicioPreparacionEn: { not: null }, preparadoEn: null },
      PREPARADO: { preparadoEn: { not: null }, salioEn: null },
      SALIO: { salioEn: { not: null }, entregadoEn: null },
      ENTREGADO: { entregadoEn: { not: null } },
    };
    for (const [estado, where] of Object.entries(esperados)) {
      await servicio.findAll(estado as any);
      const llamada = prisma.pedido.findMany.mock.calls.at(-1)[0];
      expect(llamada.where).toEqual(where);
    }
  });
});

describe('update', () => {
  it('registra quién editó y solo escribe las fechas que llegaron', async () => {
    const { servicio, prisma } = crearServicio([{ ...PEDIDO_VACIO }]);
    await servicio.update(1, { salioEn: '2026-09-02T08:00:00.000Z' } as any, 7);

    const data = prisma.pedido.update.mock.calls[0][0].data;
    expect(data.ultimoEditadoPorId).toBe(7);
    expect(data.salioEn).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty('entregadoEn');
    expect(data).not.toHaveProperty('recibidoEn');
  });

  it('un pedido inexistente → NotFound y no escribe', async () => {
    const { servicio, prisma } = crearServicio([]);
    await expect(servicio.update(99, {} as any, 7)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.pedido.update).not.toHaveBeenCalled();
  });
});
